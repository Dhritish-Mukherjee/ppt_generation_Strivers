import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileDown, Play, AlertCircle, CheckCircle2, Lock, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [authKey, setAuthKey] = useState(localStorage.getItem('striver_auth_key') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [authError, setAuthError] = useState(null);

  const [questions, setQuestions] = useState('');
  const [thumbnail, setThumbnail] = useState(null);
  const [template, setTemplate] = useState('1');
  const [templates, setTemplates] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [logs, setLogs] = useState([]);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [error, setError] = useState(null);
  
  const logEndRef = useRef(null);

  // ── Auth Verification ──
  const verifyAuth = async (key) => {
    if (!key) return;
    setIsVerifying(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });
      if (res.ok) {
        localStorage.setItem('striver_auth_key', key);
        setIsAuthenticated(true);
      } else {
        setAuthError('Invalid Access Key');
        localStorage.removeItem('striver_auth_key');
      }
    } catch (err) {
      setAuthError('Connection failed');
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    if (authKey) {
      verifyAuth(authKey);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetch('/api/templates', {
        headers: { 'x-auth-key': authKey }
      })
        .then(res => res.json())
        .then(data => setTemplates(data.templates || []))
        .catch(err => {
          if (err.message.includes('401')) setIsAuthenticated(false);
        });
    }
  }, [isAuthenticated]);

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
        headers: { 'x-auth-key': authKey },
        body: formData,
      });

      if (response.status === 401) {
        setIsAuthenticated(false);
        throw new Error('Session expired or invalid key');
      }

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

  // ── Render Unlock Screen ──
  if (!isAuthenticated) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card" 
          style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}
        >
          <div style={{ background: 'rgba(89, 0, 255, 0.1)', width: 60, height: 60, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
            <Lock className="text-primary" />
          </div>
          <h1>Protected</h1>
          <p className="subtitle" style={{ marginBottom: '1.5rem' }}>Enter the access key to unlock Strivers Quiz Studio.</p>
          
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <input 
              type="password" 
              placeholder="Enter access key..." 
              value={authKey}
              onChange={(e) => setAuthKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && verifyAuth(authKey)}
              style={{ textAlign: 'center', letterSpacing: '4px' }}
            />
          </div>

          <button 
            className="generate-btn" 
            onClick={() => verifyAuth(authKey)}
            disabled={isVerifying || !authKey}
          >
            {isVerifying ? 'Verifying...' : 'Unlock Now'}
          </button>

          {authError && (
            <motion.p 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }}
              style={{ color: 'var(--error)', marginTop: '1rem', fontSize: '0.875rem' }}
            >
              <AlertCircle size={14} style={{ display: 'inline', marginRight: 4, transform: 'translateY(2px)' }} />
              {authError}
            </motion.p>
          )}
        </motion.div>
      </div>
    );
  }

  // ── Render Main App ──
  return (
    <div className="app-container">
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="glass-card"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1>Quiz Studio</h1>
            <p className="subtitle">Transform your raw questions into premium Strivers-style PPTX.</p>
          </div>
          <div title="Authenticated" style={{ color: 'var(--success)', opacity: 0.8 }}>
            <ShieldCheck size={24} />
          </div>
        </div>

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
