import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileDown, Play, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [questions, setQuestions] = useState('');
  const [thumbnail, setThumbnail] = useState(null);
  const [template, setTemplate] = useState('1');
  const [templates, setTemplates] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [logs, setLogs] = useState([]);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [error, setError] = useState(null);
  
  const logEndRef = useRef(null);

  useEffect(() => {
    fetch('/api/templates')
      .then(res => res.json())
      .then(data => setTemplates(data.templates || []))
      .catch(err => console.error('Failed to fetch templates:', err));
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (msg, step = 'info') => {
    setLogs(prev => [...prev, {
      id: Date.now() + Math.random(),
      time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      message: msg,
      step
    }]);
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    setIsGenerating(true);
    setLogs([]);
    setDownloadUrl(null);
    setError(null);
    addLog('Initializing request...', 'info');

    const formData = new FormData();
    formData.append('questions', questions);
    formData.append('templateNumber', template);
    if (thumbnail) {
      formData.append('thumbnail', thumbnail);
    }

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        lines.forEach(line => {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              if (data.error) {
                setError(data.error);
                addLog(data.error, 'error');
                setIsGenerating(false);
              } else if (data.step === 'complete') {
                addLog(data.message, 'complete');
                setDownloadUrl(data.downloadUrl);
                setIsGenerating(false);
              } else {
                addLog(data.message, data.step);
              }
            } catch (e) {
              console.error('Failed to parse SSE line:', line);
            }
          }
        });
      }
    } catch (err) {
      setError(err.message);
      addLog(`Error: ${err.message}`, 'error');
      setIsGenerating(false);
    }
  };

  return (
    <div className="app-container">
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="glass-card"
      >
        <h1>Quiz Studio</h1>
        <p className="subtitle">Transform your raw questions into premium Strivers-style PPTX in seconds.</p>

        <form onSubmit={handleGenerate}>
          <div className="form-group">
            <label>1. SELECT TEMPLATE</label>
            <div className="template-grid">
              {templates.map((t) => (
                <div 
                  key={t.number}
                  className={`template-item ${template === t.number ? 'active' : ''}`}
                  onClick={() => setTemplate(t.number)}
                >
                  <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>T-{t.number}</div>
                  <div style={{ fontWeight: 'bold' }}>Style {t.number}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>2. PASTE QUESTIONS (RAW TEXT)</label>
            <textarea 
              rows="8"
              placeholder="Question 1... A) Option A..."
              value={questions}
              onChange={(e) => setQuestions(e.target.value)}
              required
            ></textarea>
          </div>

          <div className="form-group">
            <label>3. TITLE IMAGE (OPTIONAL)</label>
            <div style={{ position: 'relative' }}>
              <input 
                type="file" 
                className="custom-file-input"
                id="thumb-upload"
                accept="image/*"
                onChange={(e) => setThumbnail(e.target.files[0])}
                style={{ display: 'none' }}
              />
              <label 
                htmlFor="thumb-upload" 
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem', 
                  padding: '1rem', 
                  border: '2px dashed rgba(255,255,255,0.1)', 
                  borderRadius: '0.75rem', 
                  cursor: 'pointer',
                  justifyContent: 'center',
                  color: 'var(--text-main)',
                  background: 'rgba(255,255,255,0.02)'
                }}
              >
                <Upload size={20} />
                {thumbnail ? thumbnail.name : 'Upload Thumbnail (JPG/PNG)'}
              </label>
            </div>
          </div>

          <button 
            type="submit" 
            className="generate-btn" 
            disabled={isGenerating || !questions}
          >
            {isGenerating ? (
              <>
                <div className="loader"></div>
                Generating...
              </>
            ) : (
              <>
                <Play size={20} fill="currentColor" />
                Generate Now
              </>
            )}
          </button>
        </form>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="glass-card"
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem' }}>Live Console</h2>
          {isGenerating && <div className="loader" style={{ width: 16, height: 16 }}></div>}
        </div>

        <div className="log-container">
          {logs.length === 0 && (
            <div style={{ color: '#475569', textAlign: 'center', marginTop: '20%' }}>
              Ready to generate...
            </div>
          )}
          {logs.map(log => (
            <div key={log.id} className="log-entry">
              <span className="log-time">[{log.time}]</span>
              <span className={`log-msg log-step-${log.step}`}>
                {log.step === 'complete' && <CheckCircle2 size={14} style={{ display: 'inline', marginRight: 4 }} />}
                {log.step === 'error' && <AlertCircle size={14} style={{ display: 'inline', marginRight: 4 }} />}
                {log.message}
              </span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>

        <AnimatePresence>
          {downloadUrl && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{ textAlign: 'center' }}
            >
              <a href={downloadUrl} className="download-link" download>
                <FileDown size={20} />
                Download Presentation
              </a>
              <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Your file is ready. Click above to save it.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {error && !isGenerating && (
          <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '0.75rem', border: '1px solid var(--error)', color: 'var(--error)', fontSize: '0.9rem' }}>
            <strong>Error:</strong> {error}
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default App;
