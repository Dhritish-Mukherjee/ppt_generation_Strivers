const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ── Multer config: store thumbnail in /outputs with a temp name ───────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'outputs');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `thumb_${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) return cb(null, true);
    cb(new Error('Only image files are allowed for thumbnail'));
  },
});

// ── Gemini setup ──────────────────────────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Gemini: format raw questions into structured JSON ─────────────────────
async function formatQuestionsWithGemini(rawQuestions, onProgress) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

  onProgress({ step: 'formatting', message: 'Gemini is structuring & translating questions...' });

  const prompt = `
You are a bilingual quiz formatter for Bengali and English. 
Convert the following raw quiz questions into a valid JSON array.

RULES:
1. Each question MUST have both English and Bengali versions.
2. Each option MUST have an English ("en") version.
3. If the option is a universal symbol, chemical formula (like H2O), number (like 100°C), or word that is identical in both languages, leave the Bengali ("bn") field EMPTY ("").
4. If Bengali is missing for any other text, translate it accurately from English.
5. If English is missing for any field, translate it accurately from Bengali.
6. If Bengali is already present but seems incorrect, improve it.
7. Remove any option prefixes like "A.", "B.", "1." from the text.
8. Output ONLY the raw JSON array — no markdown.

OUTPUT FORMAT (strict):
[
  {
    "question_en": "English question text here",
    "question_bn": "বাংলা প্রশ্ন এখানে",
    "options": [
      { "en": "Option 1 English", "bn": "অপশন ১ বাংলা" },
      { "en": "H2O", "bn": "" }
    ]
  }
]

RAW QUESTIONS INPUT:
${rawQuestions}
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Strip markdown fences if Gemini adds them anyway
  const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  try {
    const parsed = JSON.parse(clean);
    if (!Array.isArray(parsed)) throw new Error('Response is not a JSON array');
    onProgress({ step: 'formatting_complete', message: `Gemini successfully formatted ${parsed.length} questions.` });
    return parsed;
  } catch (err) {
    throw new Error(`Gemini returned invalid JSON: ${err.message}\n\nRaw response:\n${text}`);
  }
}

// ── Run Python script with streaming output ───────────────────────────────
function runPythonScriptStreaming({ templatePath, questionsPath, outputPath, imagePath }, onProgress) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'generate_pptx.py');
    const pythonBin = process.platform === 'win32' ? 'python' : 'python3';

    const args = [
      scriptPath,
      '--template', templatePath,
      '--questions', questionsPath,
      '--output', outputPath,
    ];

    if (imagePath) {
      args.push('--image', imagePath);
    }

    onProgress({ step: 'python_start', message: 'Starting PowerPoint engine...' });

    const pyProcess = spawn(pythonBin, args);

    pyProcess.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          // Send raw python logs to frontend
          onProgress({ step: 'python_log', message: line.trim() });
        }
      });
    });

    pyProcess.stderr.on('data', (data) => {
      console.error(`Python Stderr: ${data}`);
    });

    pyProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Python script exited with code ${code}`));
      }
    });
  });
}

const APP_SECRET = 'STRIVERS-QUIZ-2024';

// ── Auth helper ───────────────────────────────────────────────────────────
const checkAuth = (req) => {
  return req.headers['x-auth-key'] === APP_SECRET;
};

// ── GET /api/auth/verify ──────────────────────────────────────────────────
router.post('/auth/verify', (req, res) => {
  const { key } = req.body;
  if (key === APP_SECRET) {
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Invalid access key' });
  }
});

// ── SSE /api/generate ────────────────────────────────────────────────────
router.post('/generate', upload.single('thumbnail'), async (req, res) => {
  // Check auth first
  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized. Please provide a valid access key.' });
  }

  // Use unique ID for session
  const sessionId = uuidv4();
// ... (rest of the code)
  let thumbnailPath = null;
  let questionsFilePath = null;
  let outputFilePath = null;

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Prevents Render/Nginx from buffering the stream
  });

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { templateNumber, questions: rawQuestions } = req.body;

    // ── Validate inputs ──
    if (!templateNumber) {
      return sendEvent({ error: 'templateNumber is required' });
    }
    if (!rawQuestions || rawQuestions.trim().length === 0) {
      return sendEvent({ error: 'questions field is required' });
    }

    // ── Resolve template path ──
    const templateFileName = `template${templateNumber}.pptx`;
    const templatePath = path.join(__dirname, '..', 'templates', templateFileName);

    if (!fs.existsSync(templatePath)) {
      return sendEvent({ error: `Template ${templateNumber} not found.` });
    }

    // ── Thumbnail path ──
    if (req.file) {
      thumbnailPath = req.file.path;
    }

    // ── Step 1: Gemini ──
    const formattedQuestions = await formatQuestionsWithGemini(rawQuestions, sendEvent);

    // ── Step 2: Write JSON ──
    questionsFilePath = path.join(__dirname, '..', 'outputs', `questions_${sessionId}.json`);
    fs.writeFileSync(questionsFilePath, JSON.stringify(formattedQuestions, null, 2), 'utf-8');

    // ── Step 3: Run Python ──
    outputFilePath = path.join(__dirname, '..', 'outputs', `quiz_${sessionId}.pptx`);
    await runPythonScriptStreaming({
      templatePath,
      questionsPath: questionsFilePath,
      outputPath: outputFilePath,
      imagePath: thumbnailPath || null,
    }, sendEvent);

    // ── Step 4: Finalize ──
    if (!fs.existsSync(outputFilePath)) {
      throw new Error('Output file was not generated.');
    }

    // We don't delete the output file immediately because the user needs to download it via the URL
    // We'll return the filename so frontend can construct the download link
    const downloadUrl = `/outputs/quiz_${sessionId}.pptx`;
    sendEvent({ step: 'complete', message: 'Generation successful!', downloadUrl });

    // Cleanup temp input files
    cleanup([thumbnailPath, questionsFilePath]);
    
    // Note: in a real app, we'd have a cron job to clean up /outputs after an hour.
    // For now we leave it so the link works.
    
    res.end();

  } catch (err) {
    console.error('Generation Error:', err);
    sendEvent({ error: err.message || 'Internal server error' });
    cleanup([thumbnailPath, questionsFilePath, outputFilePath]);
    res.end();
  }
});

// ── Cleanup helper ────────────────────────────────────────────────────────
function cleanup(paths) {
  for (const p of paths) {
    if (p && fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch (_) {}
    }
  }
}

// ── GET /api/templates ────────────────────────────────────────────────────
router.get('/templates', (req, res) => {
  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const templatesDir = path.join(__dirname, '..', 'templates');
  if (!fs.existsSync(templatesDir)) return res.json({ templates: [] });

  const files = fs.readdirSync(templatesDir)
    .filter(f => f.match(/^template\d*\.pptx$/i))
    .map(f => {
      const match = f.match(/^template(\d+)\.pptx$/i);
      const num = match ? match[1] : '1';
      return { number: num, filename: f };
    });

  res.json({ templates: files });
});

module.exports = router;