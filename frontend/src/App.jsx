import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileDown, Play, AlertCircle, CheckCircle2, Lock, ShieldCheck, Zap, Sparkles, Terminal, Layers, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

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
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#0A66C2', '#ffffff'] });
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
    if (authKey) verifyAuth(authKey);
    console.log("%cDeveloped and maintained by @503error_humannotfound", "color: #0A66C2; font-weight: bold; font-size: 12px;");
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetch('/api/templates', { headers: { 'x-auth-key': authKey } })
        .then(res => res.json())
        .then(data => setTemplates(data.templates || []))
        .catch(err => { if (err.message.includes('401')) setIsAuthenticated(false); });
    }
  }, [isAuthenticated]);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

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
    addLog('Initializing Strivers Core Engine...', 'info');

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

      if (response.status === 401) { setIsAuthenticated(false); throw new Error('Session expired'); }
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
                addLog(data.message, 'complete');
                setDownloadUrl(data.downloadUrl);
                setIsGenerating(false);
                confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
              } else { addLog(data.message, data.step); }
            } catch (e) {}
          }
        });
      }
    } catch (err) { setError(err.message); addLog(`Error: ${err.message}`, 'error'); setIsGenerating(false); }
  };

  if (!isAuthenticated) {
    return (
      <div className="auth-overlay">
        <div className="mesh-bg" />
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="auth-card">
          <img src="https://striver.careers/wp-content/uploads/2023/12/Striver_Logo_Horizontal_Dark.png" alt="Strivers" style={{ height: '50px', margin: '0 auto 2.5rem', display: 'block' }} />
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900 }}>Internal Access</h1>
          <p className="subtitle">Secure workspace for Strivers Content Engineers.</p>
          <div className="form-group"><input type="password" placeholder="••••••••" value={authKey} onChange={(e) => setAuthKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && verifyAuth(authKey)} style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.2em' }} /></div>
          <button className="btn-primary" onClick={() => verifyAuth(authKey)} disabled={isVerifying || !authKey}>{isVerifying ? 'Validating...' : 'Unlock Workspace'}</button>
          {authError && <p style={{ color: 'var(--error)', marginTop: '1rem', fontWeight: 600 }}>{authError}</p>}
        </motion.div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="mesh-bg" /><div className="noise" />
      <header className="app-header">
        <div className="header-logo-container">
          <img src="https://striver.careers/wp-content/uploads/2023/12/Striver_Logo_Horizontal_Dark.png" alt="Strivers" style={{ height: '36px' }} />
        </div>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#0A66C2', fontWeight: 700, fontSize: '0.9rem' }}>
            <Zap size={16} /> STUDIO v2.0
          </div>
          <div style={{ height: '24px', width: '1px', background: '#e2e8f0' }} />
          <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>Internal Session <ShieldCheck size={14} style={{ display: 'inline', color: '#10b981', marginLeft: '4px' }} /></div>
        </div>
      </header>

      <main className="main-layout">
        <div className="bento-grid">
          {/* Info Card */}
          <div className="bento-card info-section">
            <div className="card-gradient-overlay" />
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: '#0A66C2', marginBottom: '1.5rem' }}>
              <Info size={18} /> OPERATIONAL GUIDE
            </h3>
            <div className="tip-card" style={{ border: 'none', background: '#f8fafc', marginBottom: '1rem' }}>
              <p style={{ fontWeight: 600, fontSize: '0.8rem' }}>AI FORMATTING</p>
              <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>Engine automatically handles bilingual translations and option cleaning.</p>
            </div>
            <div className="tip-card" style={{ border: 'none', background: '#f8fafc' }}>
              <p style={{ fontWeight: 600, fontSize: '0.8rem' }}>BATCH MODE</p>
              <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>Processed in high-concurrency mode. Max 10 slides per PPT recommended.</p>
            </div>
          </div>

          {/* Template Card */}
          <div className="bento-card templates-section">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: '#0A66C2', marginBottom: '1.5rem' }}>
              <Layers size={18} /> ASSET TEMPLATES
            </h3>
            <div className="template-flex">
              {templates.map((t) => (
                <div key={t.number} className={`template-btn ${template === t.number ? 'active' : ''}`} onClick={() => setTemplate(t.number)}>
                  <Sparkles size={20} color={template === t.number ? '#0A66C2' : '#94a3b8'} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Style {t.number}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Generator Card */}
          <div className="bento-card generator-section shimmer-bg">
            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Zap fill="#0A66C2" color="#0A66C2" /> GENERATOR CORE
            </h2>
            <form onSubmit={handleGenerate}>
              <div className="form-group">
                <label>QUIZ CONTENT BUFFER</label>
                <textarea rows="10" placeholder="Paste raw content here..." value={questions} onChange={(e) => setQuestions(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>CUSTOM BRANDING (OPTIONAL)</label>
                <input type="file" id="thumb-upload" hidden onChange={(e) => setThumbnail(e.target.files[0])} />
                <label htmlFor="thumb-upload" style={{ border: '2px dashed #e2e8f0', borderRadius: '16px', padding: '1.5rem', cursor: 'pointer', textAlign: 'center', display: 'block', background: '#fcfcfc' }}>
                  <Upload size={24} style={{ marginBottom: '0.5rem' }} />
                  <p style={{ fontSize: '0.85rem' }}>{thumbnail ? thumbnail.name : 'Upload Custom Cover'}</p>
                </label>
              </div>
              <button type="submit" className="btn-primary" disabled={isGenerating || !questions}>
                {isGenerating ? <div className="loader" /> : <><Play size={20} fill="white" /> INITIALIZE BUILD</>}
              </button>
            </form>
          </div>

          {/* Runtime Card */}
          <div className="bento-card runtime-section">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: '#0A66C2', marginBottom: '1.5rem' }}>
              <Terminal size={18} /> RUNTIME ENVIRONMENT
            </h3>
            <div className="modern-console">
              {logs.length === 0 && <div style={{ color: '#475569' }}>SYSTEM_IDLE: Awaiting input buffer<span className="cursor" /></div>}
              {logs.map(log => (
                <div key={log.id} style={{ marginBottom: '0.5rem' }}>
                  <span style={{ color: '#475569', fontSize: '0.7rem' }}>[{log.time}]</span>{' '}
                  <span className={`log-step-${log.step}`}>{log.message}</span>
                </div>
              ))}
              {isGenerating && <div className="cursor" />}
              <div ref={logEndRef} />
            </div>
            <AnimatePresence>
              {downloadUrl && (
                <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} style={{ marginTop: '1.5rem' }}>
                  <a href={downloadUrl} className="btn-primary" style={{ background: '#10b981', boxShadow: 'none' }} download>
                    <FileDown size={20} /> RETRIEVE PPTX
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      <footer className="modern-footer">
        <img src="https://striver.careers/wp-content/uploads/2023/12/Striver_Logo_Horizontal_Dark.png" alt="Strivers" style={{ height: '30px', opacity: 0.5, marginBottom: '1rem' }} />
        <p style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>© {new Date().getFullYear()} Strivers EdTech. Core Engine v2.0.4. All systems operational.</p>
        <div className="dev-badge">
          developed and maintained by @503error_humannotfound
        </div>
      </footer>
    </div>
  );
}

export default App;
