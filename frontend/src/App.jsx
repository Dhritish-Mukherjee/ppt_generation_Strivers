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
      <>
        <div className="dynamic-bg">
          <div className="blob blob-1"></div>
          <div className="blob blob-2"></div>
          <div className="blob blob-3"></div>
        </div>
        <div className="auth-overlay">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel auth-card"
          >
            <img 
              src="https://striver.careers/wp-content/uploads/2023/12/Striver_Logo_Horizontal_Dark.png" 
              alt="Strivers"
              style={{ width: '100%', maxWidth: '280px', margin: '0 auto 2.5rem', objectFit: 'contain', filter: 'drop-shadow(0 0 15px rgba(255,255,255,0.2)) invert(1) brightness(2)' }}
              onError={(e) => {
                e.target.onerror = null; 
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'block';
              }}
            />
            <h1 style={{ display: 'none', margin: '0 auto 2rem', fontSize: '2.5rem' }}>STRIVERS</h1>
            <p className="subtitle" style={{ marginBottom: '2.5rem', fontSize: '1.1rem' }}>Enter the master key to access your internal AI workspace.</p>
            
            <div className="form-group" style={{ marginBottom: '2rem' }}>
              <input 
                type="password" 
                placeholder="Secure Access Key" 
                value={authKey}
                onChange={(e) => setAuthKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && verifyAuth(authKey)}
                style={{ textAlign: 'center', fontSize: '1.2rem', letterSpacing: '2px', padding: '1.25rem' }}
              />
            </div>

            <button 
              className="generate-btn" 
              onClick={() => verifyAuth(authKey)}
              disabled={isVerifying || !authKey}
              style={{ padding: '1.25rem' }}
            >
              <ShieldCheck size={20} />
              {isVerifying ? 'Authenticating...' : 'Unlock Workspace'}
            </button>

            {authError && (
              <motion.p 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }}
                style={{ color: 'var(--error)', marginTop: '1.5rem', fontSize: '1rem', fontWeight: '500' }}
              >
                <AlertCircle size={16} style={{ display: 'inline', marginRight: 6, transform: 'translateY(2px)' }} />
                {authError}
              </motion.p>
            )}
          </motion.div>
        </div>
      </>
    );
  }

  // ── Render Main App ──
  return (
    <>
      <div className="dynamic-bg">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <header className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <img 
              src="https://striver.careers/wp-content/uploads/2023/12/Striver_Logo_Horizontal_Dark.png" 
              alt="Strivers Logo" 
              style={{ height: '36px', objectFit: 'contain', filter: 'invert(1) brightness(1.5)', margin: '0px 10px'}}
              onError={(e) => {
                e.target.onerror = null; 
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'block';
              }}
            />
            <span style={{ display: 'none', fontWeight: '800', fontSize: '1.5rem' }}>STRIVERS</span>
            <div style={{ padding: '0.4rem 1rem', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '2rem', color: '#60a5fa', fontSize: '0.8rem', fontWeight: '700', letterSpacing: '0.1em' }}>
              INTERNAL TOOL
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--success)', fontSize: '0.9rem', fontWeight: '500' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 10px var(--success)' }}></div>
            System Online
          </div>
        </header>

        <main className="main-wrapper">
          <div className="content-grid">
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="glass-panel"
            >
              <div>
                <h1>Generator AI</h1>
                <p className="subtitle">Compile automated PowerPoint materials perfectly styled for Strivers content.</p>
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
                        <div style={{ fontSize: '0.7rem', opacity: 0.6, letterSpacing: '1px' }}>TEMPLATE</div>
                        <div style={{ fontWeight: '700', fontSize: '1.1rem', marginTop: '0.2rem' }}>{t.number}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>2. Paste Raw Content</label>
                  <textarea 
                    rows="8"
                    placeholder="Drop your raw test questions in here...&#10;1. What is the powerhouse of the cell?&#10;A) Nucleus&#10;B) Mitochondria..."
                    value={questions}
                    onChange={(e) => setQuestions(e.target.value)}
                    required
                  ></textarea>
                </div>

                <div className="form-group">
                  <label>3. Custom Wrapper (Optional)</label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type="file" 
                      id="thumb-upload"
                      accept="image/*"
                      onChange={(e) => setThumbnail(e.target.files[0])}
                      style={{ display: 'none' }}
                    />
                    <label htmlFor="thumb-upload" className="file-upload-label">
                      <Upload size={20} />
                      {thumbnail ? <span style={{ color: '#fff', fontWeight: '500' }}>{thumbnail.name}</span> : 'Attach alternative cover image'}
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
                      Processing Content...
                    </>
                  ) : (
                    <>
                      <Play size={20} fill="currentColor" />
                      Run Generator Pipeline
                    </>
                  )}
                </button>
              </form>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="glass-panel"
              style={{ display: 'flex', flexDirection: 'column' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ color: 'var(--primary)' }}>//</span> Active Console
                </h2>
              </div>

              <div className="log-container">
                {logs.length === 0 && (
                  <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: '25%', fontSize: '0.9rem' }}>
                    Awaiting commands...
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
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    style={{ textAlign: 'center' }}
                  >
                    <a href={downloadUrl} className="download-link" download>
                      <FileDown size={20} />
                      Download Final Output
                    </a>
                  </motion.div>
                )}
              </AnimatePresence>

              {error && !isGenerating && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.15)', borderRadius: '0.75rem', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#fca5a5', fontSize: '0.9rem' }}>
                  <AlertCircle size={16} style={{ display: 'inline', marginRight: 8, transform: 'translateY(3px)' }} />
                  {error}
                </div>
              )}
            </motion.div>
          </div>
        </main>

        <footer className="app-footer">
          <div style={{ fontWeight: '500', color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} Strivers EdTech.
          </div>
          <div className="developer-credits">
            Developed and maintained by <a href="https://github.com/503error-humannotfound" target="_blank" rel="noreferrer" style={{color: 'rgba(255,255,255,0.6)', textDecoration: 'none', borderBottom: '1px dotted rgba(255,255,255,0.3)'}}>@503error_humannotfound</a>
          </div>
        </footer>
      </div>
    </>
  );
}

export default App;
