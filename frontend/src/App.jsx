import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileDown, Play, AlertCircle, CheckCircle2, Lock, ShieldCheck, Zap, Layers, Terminal as ConsoleIcon, Info, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

function App() {
  const [authKey, setAuthKey] = useState(localStorage.getItem('striver_auth_key') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [authError, setAuthError] = useState(null);

  const [questions, setQuestions] = useState('');
  const [thumbnail, setThumbnail] = useState(null);
  const [template, setTemplate] = useState('master');
  const [templates, setTemplates] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [logs, setLogs] = useState([]);
  const [downloadUrl, setDownloadUrl] = useState(null);
  const [error, setError] = useState(null);
  
  const logEndRef = useRef(null);

  // ── Auth Logic ──
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
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#0A66C2', '#22d3ee'] });
      } else {
        setAuthError('Access Denied: Invalid Key');
      }
    } catch (err) {
      setAuthError('Network Error: Check connectivity');
    } finally {
      setIsVerifying(false);
    }
  };

  useEffect(() => {
    if (authKey) verifyAuth(authKey);
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetch('/api/templates', { headers: { 'x-auth-key': authKey } })
        .then(res => res.json())
        .then(data => setTemplates(data.templates || []))
        .catch(() => setIsAuthenticated(false));
    }
  }, [isAuthenticated]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // ── Generation Logic ──
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
    addLog('Establishing link to Strivers Core...', 'info');

    const formData = new FormData();
    formData.append('questions', questions);
    formData.append('templateNumber', template);
    if (thumbnail) formData.append('thumbnail', thumbnail);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'x-auth-key': authKey },
        body: formData,
      });

      if (response.status === 401) { setIsAuthenticated(false); throw new Error('Unauthorized'); }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        chunk.split('\n').forEach(line => {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.error) { setError(data.error); addLog(data.error, 'error'); setIsGenerating(false); }
              else if (data.step === 'complete') {
                addLog('Success: Assets generated successfully.', 'complete');
                setDownloadUrl(data.downloadUrl);
                setIsGenerating(false);
                confetti({ particleCount: 150, spread: 100, origin: { y: 0.8 } });
              } else { addLog(data.message, data.step); }
            } catch (e) {}
          }
        });
      }
    } catch (err) {
      setError(err.message);
      addLog(`Failure: ${err.message}`, 'error');
      setIsGenerating(false);
    }
  };

  // ── Auth UI ──
  if (!isAuthenticated) {
    return (
      <div className="auth-overlay">
        <div className="midnight-bg" />
        <div className="grid-overlay" />
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="auth-card">
          <img src="https://striver.careers/wp-content/uploads/2023/12/Striver_Logo_Horizontal_Dark.png" alt="Strivers" style={{ height: '40px', filter: 'brightness(0) invert(1)', marginBottom: '2rem' }} />
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Protected Access</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem' }}>This studio is restricted to Strivers Content Team.</p>
          <div style={{ marginBottom: '1.5rem' }}>
            <input type="password" placeholder="••••••••" value={authKey} onChange={(e) => setAuthKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && verifyAuth(authKey)} style={{ textAlign: 'center', fontSize: '1.2rem', letterSpacing: '0.3em' }} />
          </div>
          <button className="btn-primary" onClick={() => verifyAuth(authKey)} disabled={isVerifying || !authKey}>
            {isVerifying ? <div className="loader" /> : 'Decrypt & Enter'}
          </button>
          {authError && <p style={{ color: 'var(--error)', marginTop: '1.25rem', fontSize: '0.8rem', fontWeight: 600 }}>{authError}</p>}
        </motion.div>
      </div>
    );
  }

  // ── Main UI ──
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="midnight-bg" />
      <div className="grid-overlay" />
      
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img src="https://striver.careers/wp-content/uploads/2023/12/Striver_Logo_Horizontal_Dark.png" alt="Strivers" className="logo-img" />
          <div className="nav-tag">STUDIO PRO</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <ShieldCheck size={14} style={{ color: '#22c55e' }} />
          <span className="hide-mobile">Authenticated Session</span>
        </div>
      </header>

      <main className="main-content">
        {/* Generator Section */}
        <section className="span-8">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card">
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Zap size={18} fill="currentColor" /> Content Engine</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Convert raw educational text into high-engagement slides.</p>
            </div>

            <form onSubmit={handleGenerate}>
              <div style={{ marginBottom: '1.5rem' }}>
                <label>1. Design Template</label>
                <div className="template-scroll">
                  {templates.length > 0 ? (
                    templates.map(t => (
                      <div key={t.number} className={`template-item ${template === t.number ? 'active' : ''}`} onClick={() => setTemplate(t.number)}>
                        <Layers size={16} style={{ marginBottom: '0.5rem', opacity: 0.6 }} />
                        <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>{t.label || `Style ${t.number}`}</div>
                      </div>
                    ))
                  ) : (
                    <div className="template-item active">
                      <Layers size={16} style={{ marginBottom: '0.5rem', opacity: 0.6 }} />
                      <div style={{ fontSize: '0.75rem', fontWeight: 700 }}>Slide Master</div>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label>2. Quiz Data (Markdown or Text)</label>
                <textarea rows="11" placeholder="Paste your questions here... (e.g. 1. What is JVM? A. B. C. D.)" value={questions} onChange={(e) => setQuestions(e.target.value)} required />
              </div>

              <div style={{ marginBottom: '2rem' }}>
                <label>3. Cover Image (Optional)</label>
                <input type="file" id="thumb" hidden onChange={(e) => setThumbnail(e.target.files[0])} accept="image/*" />
                <label htmlFor="thumb" style={{ border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '1.5rem', cursor: 'pointer', textAlign: 'center', background: 'rgba(255,255,255,0.02)', display: 'block' }}>
                  <Upload size={20} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
                  <p style={{ fontSize: '0.8rem', margin: 0 }}>{thumbnail ? thumbnail.name : 'Drop cover image here — replaces slide 1 picture'}</p>
                </label>
              </div>

              <button type="submit" className="btn-primary" disabled={isGenerating || !questions}>
                {isGenerating ? <div className="loader" /> : <><Play size={18} fill="white" /> Execute Production</>}
              </button>
            </form>
          </motion.div>
        </section>

        {/* Console Section */}
        <section className="span-4">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card">
            <h3 style={{ fontSize: '0.9rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)' }}><ConsoleIcon size={16} /> Runtime Console</h3>
            <div className="console-box">
              {logs.length === 0 && <div style={{ color: '#475569' }}>READY: Waiting for buffer instruction...</div>}
              {logs.map(log => (
                <div key={log.id} className="console-line">
                  <span className="line-time">[{log.time}]</span>
                  <span className={`line-msg msg-${log.step}`}>{log.message}</span>
                </div>
              ))}
              {isGenerating && <div style={{ width: '8px', height: '15px', background: 'var(--primary)', animation: 'spin 1s infinite' }} />}
              <div ref={logEndRef} />
            </div>

            <AnimatePresence>
              {downloadUrl && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ marginTop: '1.5rem' }}>
                  <a href={downloadUrl} className="btn-primary" style={{ background: '#10b981', boxShadow: 'none' }} download>
                    <FileDown size={18} /> Retrieve PPTX
                  </a>
                </motion.div>
              )}
            </AnimatePresence>

            {error && !isGenerating && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '12px', color: '#f87171', fontSize: '0.8rem' }}>
                <strong>CRITICAL_ERROR:</strong> {error}
              </div>
            )}

            <div style={{ marginTop: '2rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '1rem' }}>Guidelines</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}><Info size={12} style={{ flexShrink: 0 }} /> PPTX will be generated based on Strivers theme.</div>
                <div style={{ display: 'flex', gap: '0.5rem' }}><Info size={12} style={{ flexShrink: 0 }} /> AI optimizes for readable text density automatically.</div>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="footer">
        <img src="https://striver.careers/wp-content/uploads/2023/12/Striver_Logo_Horizontal_Dark.png" alt="Strivers" className="footer-logo" />
        <p style={{ fontSize: '0.8rem', color: '#475569' }}>© {new Date().getFullYear()} Strivers EdTech Internal Portal. Proprietary Tools.</p>
        <div className="credits-badge">
          developed and maintained by @503error_humannotfound
        </div>
      </footer>
    </div>
  );
}

export default App;
