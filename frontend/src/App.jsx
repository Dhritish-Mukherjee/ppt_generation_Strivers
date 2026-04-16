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
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="pro-card" 
          style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}
        >
          <div className="auth-lock-icon">
            <Lock size={28} />
          </div>
          <h1>Protected Access</h1>
          <p className="subtitle" style={{ marginBottom: '1.5rem' }}>Enter your credential key to access Strivers Quiz Studio.</p>
          
          <div className="form-group" style={{ marginBottom: '1rem' }}>
            <input 
              type="password" 
              placeholder="••••••••" 
              value={authKey}
              onChange={(e) => setAuthKey(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && verifyAuth(authKey)}
              style={{ textAlign: 'center', fontSize: '1.2rem' }}
            />
          </div>

          <button 
            className="generate-btn" 
            onClick={() => verifyAuth(authKey)}
            disabled={isVerifying || !authKey}
          >
            {isVerifying ? 'Verifying...' : 'Unlock Workspace'}
          </button>

          {authError && (
            <motion.p 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }}
              style={{ color: 'var(--error)', marginTop: '1.25rem', fontSize: '0.875rem', fontWeight: '500' }}
            >
              <AlertCircle size={14} style={{ display: 'inline', marginRight: 6, transform: 'translateY(2px)' }} />
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
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="pro-card"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1>Quiz Studio</h1>
            <p className="subtitle">AI-powered PPTX generator for Strivers educators.</p>
          </div>
          <div title="AuthenticatedSession" style={{ color: 'var(--primary)', opacity: 0.9 }}>
            <ShieldCheck size={28} />
          </div>
        </div>

        <form onSubmit={handleGenerate}>
          <div className="form-group">
            <label>1. Select Style Template</label>
            <div className="template-grid">
              {templates.map((t) => (
                <div 
                  key={t.number}
                  className={`template-item ${template === t.number ? 'active' : ''}`}
                  onClick={() => setTemplate(t.number)}
                >
                  <div style={{ fontSize: '0.7rem', opacity: 0.7, fontWeight: '700' }}>T-{t.number}</div>
                  <div style={{ fontWeight: '500', fontSize: '0.9rem' }}>Template {t.number}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label>2. Quiz Questions (Raw Text)</label>
            <textarea 
              rows="8"
              placeholder="Paste your questions here...&#10;1. What is React?&#10;A) Library&#10;B) Framework..."
              value={questions}
              onChange={(e) => setQuestions(e.target.value)}
              required
            ></textarea>
          </div>

          <div className="form-group">
            <label>3. Branding Image (Optional)</label>
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
                  gap: '0.75rem', 
                  padding: '0.875rem', 
                  border: '1.5px dashed var(--border)', 
                  borderRadius: '0.6rem', 
                  cursor: 'pointer',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                  background: '#fcfcfc',
                  fontSize: '0.9rem'
                }}
              >
                <Upload size={18} />
                {thumbnail ? <span style={{ color: 'var(--text-main)' }}>{thumbnail.name}</span> : 'Upload cover or watermark'}
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
                Processing...
              </>
            ) : (
              <>
                <Play size={18} fill="currentColor" />
                Generate Presentation
              </>
            )}
          </button>
        </form>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="pro-card"
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-main)' }}>Generation Status</h2>
          {isGenerating && <div className="loader" style={{ width: 16, height: 16, borderTopColor: 'var(--primary)', borderLeftColor: 'rgba(0,0,0,0.1)', borderRightColor: 'rgba(0,0,0,0.1)', borderBottomColor: 'rgba(0,0,0,0.1)' }}></div>}
        </div>

        <div className="log-container">
          {logs.length === 0 && (
            <div style={{ color: '#64748b', textAlign: 'center', marginTop: '25%', fontSize: '0.9rem' }}>
              System idle. Waiting for input...
            </div>
          )}
          {logs.map(log => (
            <div key={log.id} className="log-entry">
              <span className="log-time">{log.time}</span>
              <span className={`log-msg log-step-${log.step}`}>
                {log.step === 'complete' && <CheckCircle2 size={14} style={{ display: 'inline', marginRight: 6, transform: 'translateY(2px)' }} />}
                {log.step === 'error' && <AlertCircle size={14} style={{ display: 'inline', marginRight: 6, transform: 'translateY(2px)' }} />}
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
                Download Final .pptx
              </a>
              <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Generation complete. Click above to save the file.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {error && !isGenerating && (
          <div style={{ marginTop: '1.25rem', padding: '1rem', background: '#fef2f2', borderRadius: '0.6rem', border: '1px solid #fee2e2', color: 'var(--error)', fontSize: '0.9rem', fontWeight: '500' }}>
            <AlertCircle size={16} style={{ display: 'inline', marginRight: 8, transform: 'translateY(3px)' }} />
            {error}
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default App;
