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
      <div className="auth-overlay">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="auth-card"
        >
          <div className="strivers-logo-placeholder" style={{ margin: '0 auto 1.5rem', width: 60, height: 60, fontSize: '1.8rem' }}>S</div>
          <h1 style={{ fontSize: '1.5rem' }}>Protected Access</h1>
          <p className="subtitle" style={{ marginBottom: '2rem' }}>Enter the credential key provided by the Strivers internal team.</p>
          
          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
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
              style={{ color: 'var(--error)', marginTop: '1.25rem', fontSize: '0.875rem', fontWeight: '600' }}
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
    <div>
      <header className="app-header">
        <div className="brand-container">
          <div className="strivers-logo-placeholder">S</div>
          <div>
            <span className="brand-name">Strivers</span>
            <span className="brand-tag">Studio</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          <ShieldCheck size={18} style={{ color: 'var(--success)' }} />
          <span>Internal Access Active</span>
        </div>
      </header>

      <div className="main-layout">
        <aside className="sidebar-left">
          <div className="sidebar-section">
            <h3 className="sidebar-title">How it works</h3>
            <div className="tip-card">
              <span className="tip-label">PRO TIP</span>
              <p>Paste raw text directly from your PDFs or word docs. The AI will automatically clean up the formatting.</p>
            </div>
            <div className="tip-card">
              <span className="tip-label">BILINGUAL</span>
              <p>The engine handles both English and Bengali translations simultaneously to keep your slides consistent.</p>
            </div>
          </div>

          <div className="sidebar-section">
            <h3 className="sidebar-title">Formatting Rules</h3>
            <ul style={{ paddingLeft: '1.2rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <li style={{ marginBottom: '0.5rem' }}>Options should start with A, B, C, D or 1, 2, 3, 4.</li>
              <li style={{ marginBottom: '0.5rem' }}>Template images are automatically centered.</li>
              <li style={{ marginBottom: '0.5rem' }}>Max 10 questions per batch recommended.</li>
            </ul>
          </div>
        </aside>

        <main className="content-area">
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="pro-card"
          >
            <div>
              <h1>Generator</h1>
              <p className="subtitle">AI-powered Quiz PPTX creation tool.</p>
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
                      <div style={{ fontSize: '0.7rem', opacity: 0.8, fontWeight: '800' }}>STYLE</div>
                      <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>Template {t.number}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>2. Quiz Questions (Raw Text)</label>
                <textarea 
                  rows="8"
                  placeholder="Paste your raw content...&#10;1. First Question?&#10;A) Option 1..."
                  value={questions}
                  onChange={(e) => setQuestions(e.target.value)}
                  required
                ></textarea>
              </div>

              <div className="form-group">
                <label>3. Title Slide Image (Optional)</label>
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
                      border: '1.5px dashed var(--border-rich)', 
                      borderRadius: '10px', 
                      cursor: 'pointer',
                      justifyContent: 'center',
                      color: 'var(--text-muted)',
                      background: '#fff',
                      fontSize: '0.9rem'
                    }}
                  >
                    <Upload size={18} />
                    {thumbnail ? <span style={{ color: 'var(--text-dark)' }}>{thumbnail.name}</span> : 'Select custom cover image'}
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
                    Engine Running...
                  </>
                ) : (
                  <>
                    <Play size={18} fill="currentColor" />
                    Process & Generate
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-dark)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Engine Runtime</h2>
              {isGenerating && <div className="loader" style={{ width: 16, height: 16, borderTopColor: 'var(--primary)', borderLeftColor: 'var(--border-rich)', borderRightColor: 'var(--border-rich)', borderBottomColor: 'var(--border-rich)' }}></div>}
            </div>

            <div className="log-container">
              {logs.length === 0 && (
                <div style={{ color: '#64748b', textAlign: 'center', marginTop: '25%', fontSize: '0.9rem' }}>
                  Ready to process batch.
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
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{ textAlign: 'center' }}
                >
                  <a href={downloadUrl} className="download-link" download>
                    <FileDown size={20} />
                    Download Final PPTX
                  </a>
                </motion.div>
              )}
            </AnimatePresence>

            {error && !isGenerating && (
              <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#fef2f2', borderRadius: '10px', border: '1px solid #fee2e2', color: 'var(--error)', fontSize: '0.85rem', fontWeight: '600' }}>
                <AlertCircle size={16} style={{ display: 'inline', marginRight: 8, transform: 'translateY(3px)' }} />
                RUNTIME ERROR: {error}
              </div>
            )}
          </motion.div>
        </main>
      </div>
    </div>
  );
}

export default App;
