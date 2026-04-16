const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
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
async function formatQuestionsWithGemini(rawQuestions) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

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
    return parsed;
  } catch (err) {
    throw new Error(`Gemini returned invalid JSON: ${err.message}\n\nRaw response:\n${text}`);
  }
}

// ── Run Python script ─────────────────────────────────────────────────────
function runPythonScript({ templatePath, questionsPath, outputPath, imagePath }) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'generate_pptx.py');

    const args = [
      scriptPath,
      '--template', templatePath,
      '--questions', questionsPath,
      '--output', outputPath,
    ];

    if (imagePath) {
      args.push('--image', imagePath);
    }

    // Try 'python3' first, fall back to 'python'
    const pythonBin = process.platform === 'win32' ? 'python' : 'python3';

    execFile(pythonBin, args, { timeout: 120000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('Python stderr:', stderr);
        console.error('Python error:', error.message);
        return reject(new Error(`Python script failed: ${stderr || error.message}`));
      }
      console.log('Python stdout:', stdout);
      resolve(stdout);
    });
  });
}

// ── POST /api/generate ────────────────────────────────────────────────────
router.post('/generate', upload.single('thumbnail'), async (req, res) => {
  const sessionId = uuidv4();
  let thumbnailPath = null;
  let questionsFilePath = null;
  let outputFilePath = null;

  try {
    const { templateNumber, questions: rawQuestions } = req.body;

    // ── Validate inputs ──
    if (!templateNumber) {
      return res.status(400).json({ error: 'templateNumber is required' });
    }
    if (!rawQuestions || rawQuestions.trim().length === 0) {
      return res.status(400).json({ error: 'questions field is required' });
    }

    // ── Resolve template path ──
    const templateFileName = `template${templateNumber}.pptx`;
    const templatePath = path.join(__dirname, '..', 'templates', templateFileName);

    if (!fs.existsSync(templatePath)) {
      return res.status(404).json({
        error: `Template ${templateNumber} not found. Available templates should be placed in the /templates folder as template1.pptx, template2.pptx, etc.`
      });
    }

    // ── Thumbnail path (if uploaded) ──
    if (req.file) {
      thumbnailPath = req.file.path;
    }

    // ── Step 1: Format questions with Gemini ──
    console.log(`[${sessionId}] Calling Gemini to format ${rawQuestions.length} chars of raw questions...`);
    let formattedQuestions;
    try {
      formattedQuestions = await formatQuestionsWithGemini(rawQuestions);
    } catch (geminiErr) {
      return res.status(500).json({ error: `Gemini formatting failed: ${geminiErr.message}` });
    }
    console.log(`[${sessionId}] Gemini returned ${formattedQuestions.length} questions.`);

    // ── Step 2: Write questions.json to disk ──
    questionsFilePath = path.join(__dirname, '..', 'outputs', `questions_${sessionId}.json`);
    fs.writeFileSync(questionsFilePath, JSON.stringify(formattedQuestions, null, 2), 'utf-8');

    // ── Step 3: Run Python script ──
    outputFilePath = path.join(__dirname, '..', 'outputs', `quiz_${sessionId}.pptx`);

    console.log(`[${sessionId}] Running Python script...`);
    await runPythonScript({
      templatePath,
      questionsPath: questionsFilePath,
      outputPath: outputFilePath,
      imagePath: thumbnailPath || null,
    });

    // ── Step 4: Stream file back as download ──
    if (!fs.existsSync(outputFilePath)) {
      return res.status(500).json({ error: 'Output file was not generated by the Python script.' });
    }

    const fileName = `quiz_output_${Date.now()}.pptx`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');

    const fileStream = fs.createReadStream(outputFilePath);
    fileStream.pipe(res);

    fileStream.on('end', () => {
      // Cleanup temp files after sending
      cleanup([thumbnailPath, questionsFilePath, outputFilePath]);
    });

    fileStream.on('error', (err) => {
      console.error('Stream error:', err);
      cleanup([thumbnailPath, questionsFilePath, outputFilePath]);
    });

  } catch (err) {
    console.error('Unexpected error:', err);
    cleanup([thumbnailPath, questionsFilePath, outputFilePath]);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
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
  const templatesDir = path.join(__dirname, '..', 'templates');
  if (!fs.existsSync(templatesDir)) return res.json({ templates: [] });

  const files = fs.readdirSync(templatesDir)
    .filter(f => f.match(/^template\d+\.pptx$/i))
    .map(f => {
      const num = f.match(/^template(\d+)\.pptx$/i)[1];
      return { number: num, filename: f };
    });

  res.json({ templates: files });
});

module.exports = router;