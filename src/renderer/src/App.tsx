import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertCircle, ArrowDownToLine, ArrowUpRight, BookOpen, Bot, BrainCircuit, Check, ChevronDown, CircleHelp, Command, Cpu, Download, FileCode2, FileText, Folder, FolderOpen, HardDrive, History, Keyboard, Layers, LoaderCircle, LockKeyhole, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';

type Result = { id: string; path: string; relativePath: string; name: string; text: string; score: number; semantic: boolean };
type Info = { platform: string; roots: string[]; status: { files: number; chunks: number; errors: number; lastIndexedAt: number | null }; modelStatus: string; indexedChunks: number };

function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [aiAnswer, setAiAnswer] = useState('');
  const [aiSources, setAiSources] = useState<{ id: number; path: string }[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [modelsData, setModelsData] = useState<{
    ollamaRunning: boolean;
    activeModel: string;
    installedModels: Array<{ name: string; sizeBytes: number; sizeFormatted: string; modifiedAt: string }>;
    recommendedModels: Array<{ id: string; name: string; size: string; desc: string }>;
    error?: string;
  } | null>(null);
  const [pullingModel, setPullingModel] = useState<string | null>(null);
  const [pullProgress, setPullProgress] = useState<{
    model: string;
    status: string;
    percent: number;
    completed?: number;
    total?: number;
    done?: boolean;
    error?: string;
  } | null>(null);
  const [customModelInput, setCustomModelInput] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [view, setView] = useState<'search' | 'library' | 'settings'>('search');
  const [filter, setFilter] = useState<'all' | 'code' | 'docs'>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const refreshModels = useCallback(async () => {
    try {
      setLoadingModels(true);
      if (window.recallDesk?.listModels) {
        const data = await window.recallDesk.listModels();
        setModelsData(data);
      }
    } catch (e) {
      console.error('Failed to list models:', e);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  const handleSetActiveModel = async (model: string) => {
    try {
      setError('');
      await window.recallDesk.setActiveModel(model);
      await refreshModels();
      setNotice(`Active model set to ${model}`);
    } catch (e) {
      setError(String(e));
    }
  };

  const handlePullModel = async (modelName: string) => {
    const target = modelName.trim();
    if (!target) return;
    setError('');
    setNotice('');
    setPullingModel(target);
    setPullProgress({ model: target, status: 'Connecting to Ollama...', percent: 0 });
    try {
      await window.recallDesk.pullModel(target);
      await refreshModels();
      setNotice(`${target} downloaded and activated!`);
      setCustomModelInput('');
    } catch (e: any) {
      setError(`Download failed: ${e.message || String(e)}`);
    } finally {
      setPullingModel(null);
      setPullProgress(null);
    }
  };

  const handleDeleteModel = async (modelName: string) => {
    if (!confirm(`Delete ${modelName} from local storage?`)) return;
    try {
      setError('');
      await window.recallDesk.deleteModel(modelName);
      await refreshModels();
      setNotice(`Deleted ${modelName}`);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleClearEmbeddings = async () => {
    if (!confirm('Clear semantic embeddings? Text passages remain indexed, but vector search will be cleared.')) return;
    try {
      setError('');
      await window.recallDesk.clearEmbeddings();
      await refreshInfo();
      setNotice('Semantic embeddings cleared.');
    } catch (e) {
      setError(String(e));
    }
  };

  const refreshInfo = useCallback(async () => {
    try {
      if (window.recallDesk?.info) {
        setInfo(await window.recallDesk.info());
      }
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    if (!window.recallDesk) {
      setError("Desktop API (preload) was not detected. Please verify Electron preload initialization.");
      return;
    }
    refreshInfo();
    refreshModels();
    const offProgress = window.recallDesk.onProgress?.(p => {
      setProgress(p);
      if (p.done) {
        setBusy(false);
        refreshInfo();
        setNotice(`Index updated · ${p.files} files · ${p.chunks} passages`);
      }
    });
    const offModel = window.recallDesk.onModelStatus?.(s => {
      setInfo(old => (old ? { ...old, modelStatus: s } : old));
    });
    const offFocus = window.recallDesk.onFocusSearch?.(() => {
      setView("search");
      inputRef.current?.focus();
    });
    const offPull = window.recallDesk.onPullProgress?.(p => {
      setPullProgress(p);
      if (p.done) {
        refreshModels();
        if (p.error) setError(`Download error: ${p.error}`);
      }
    });
    return () => {
      offProgress?.();
      offModel?.();
      offFocus?.();
      offPull?.();
    };
  }, [refreshInfo, refreshModels]);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      if (!query.trim()) { setResults([]); setError(''); return; }
      try { setError(''); setResults(await window.recallDesk.search(query)); }
      catch (e) { setError(String(e)); }
    }, 180);
    return () => window.clearTimeout(handle);
  }, [query, info?.indexedChunks]);

  const filtered = useMemo(() => results.filter(r => filter === 'all' || (filter === 'code' ? /\.(js|jsx|ts|tsx|py|rs|go|java|c|h|cpp|sql|sh)$/i.test(r.name) : /\.(md|mdx|txt|pdf|json|yml|yaml|toml|log)$/i.test(r.name))), [results, filter]);
  const chooseAndIndex = async () => {
    setError(''); setNotice('');
    try {
      const roots = await window.recallDesk.chooseFolders(); if (!roots.length) return;
      setBusy(true); setProgress({ done: false, files: 0, chunks: 0, stage: 'reading' });
      const result = await window.recallDesk.startIndex(roots);
      setInfo(await window.recallDesk.info()); setNotice(`Indexed ${result.files} files and ${result.chunks} passages.`);
    } catch (e) { setError(String(e)); setBusy(false); }
  };
  const openResult = async (r: Result) => { try { await window.recallDesk.openFile(r.path); } catch (e) { setError(String(e)); } };
  const clearIndex = async () => { if (!confirm('Remove the local index and saved embeddings? Original files will not be deleted.')) return; await window.recallDesk.clearIndex(); setResults([]); setQuery(''); await refreshInfo(); setNotice('Local index cleared. Your original files were not changed.'); };
  const loadModel = async () => { setError(''); setNotice('Loading the local embedding model. First run may download model files.'); try { await window.recallDesk.loadModel(); setNotice('Local embedding model is ready.'); await refreshInfo(); } catch (e) { setError(String(e)); } };
  const askAI = async () => {
    if (!query.trim() || aiBusy) return;
    setAiBusy(true);
    setAiAnswer('');
    setAiSources([]);
    setError('');
    try {
      if (!window.recallDesk?.ask) {
        throw new Error('Ask AI is not supported by the desktop runtime.');
      }
      const result = await window.recallDesk.ask(query);
      setAiAnswer(result.answer);
      setAiSources(result.sources);
    } catch (e) {
      setError(String(e));
    } finally {
      setAiBusy(false);
    }
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><BrainCircuit size={21}/></div><div><div className="brand-name">OpenSearch</div><div className="brand-sub">LOCAL MEMORY ENGINE</div></div></div>
      <button className={`nav-item ${view === 'search' ? 'active' : ''}`} onClick={() => setView('search')}><Search size={17}/> Search memory <span className="nav-shortcut">⌘ K</span></button>
      <button className={`nav-item ${view === 'library' ? 'active' : ''}`} onClick={() => setView('library')}><BookOpen size={17}/> Indexed library</button>
      <button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => setView('settings')}><Settings2 size={17}/> Settings</button>
      <div className="sidebar-bottom">
        <div className="privacy-card"><div className="privacy-icon"><ShieldCheck size={16}/></div><div><div className="privacy-title">Your data stays here</div><div className="privacy-desc">Local index · No account</div></div><span className="green-dot"/></div>
        <div className="user-chip"><div className="avatar">RD</div><div className="user-copy"><div className="user-name">Personal workspace</div><div className="user-plan">Local-first edition</div></div><ChevronDown size={15} className="muted"/></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><span className="slash">/</span><strong>{view === 'search' ? 'Search memory' : view === 'library' ? 'Indexed library' : 'Settings'}</strong></div><div className="top-actions"><span className="local-pill"><span className="green-dot"/> LOCAL MODE</span><button className="icon-btn" title="Help" onClick={() => setNotice('Choose a folder, index it, then search in natural language. The first model load requires internet access to download weights.')}><CircleHelp size={17}/></button></div></header>
      <div className="content">
        {view === 'search' && <>
          <div className="hero"><div className="eyebrow"><Sparkles size={13}/> PERSONAL KNOWLEDGE, RECONNECTED</div><h1>Find what you <span>remember.</span></h1><p className="hero-copy">Search your files by meaning, not by filename. Your memory stays on your machine.</p></div>
          <div className="search-wrap"><Search size={20} className="search-icon"/><input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Ask anything in your files… e.g. how I fixed the Docker port issue" autoComplete="off"/><div className="search-right"><kbd>↵</kbd></div></div>
          <div className="search-meta"><div className="search-hint"><span className="keycap"><Command size={11}/></span><span className="keycap">K</span> to search <span className="dot-sep">·</span> <span>Search runs locally</span></div><button className="text-button" onClick={chooseAndIndex} disabled={busy}><Plus size={14}/> Add folders</button></div>
          <div style={{ margin: '14px 0', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <button
              className="primary-btn"
              onClick={askAI}
              disabled={!query.trim() || aiBusy}
            >
              {aiBusy ? 'Thinking locally…' : 'Ask local AI'}
            </button>
            <div className="model-chip" onClick={() => { setView('settings'); refreshModels(); }} title="Manage and change local models in Settings">
              <Bot size={13}/>
              <span>{modelsData?.activeModel || 'smollm2:360m-instruct-q4_0'}</span>
              <span className="chip-action">Change model</span>
            </div>
          </div>
          {aiAnswer && (
            <section className="welcome-card" style={{ marginBottom: 20 }}>
              <h2>OpenSearch answer</h2>
              <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                {aiAnswer}
              </p>
              {aiSources.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <strong>Retrieved sources</strong>
                  {aiSources.map(source => (
                    <p key={source.id} style={{ overflowWrap: 'anywhere' }}>
                      [{source.id}] {source.path}
                    </p>
                  ))}
                </div>
              )}
            </section>
          )}
          {error && <div className="alert error"><X size={16}/><span>{error}</span></div>}
          {notice && <div className="alert notice"><Check size={16}/><span>{notice}</span><button onClick={() => setNotice('')}><X size={14}/></button></div>}
          {busy && <div className="progress-card"><div className="progress-top"><div className="spinner-label"><LoaderCircle className="spin" size={17}/><span>{progress?.stage === 'embedding' ? 'Creating local semantic index…' : 'Reading your files…'}</span></div><span>{progress?.files || 0} files</span></div><div className="progress-track"><div className="progress-fill" style={{width: `${Math.min(95, ((progress?.files || 0) / Math.max(1, (progress?.files || 0) + 15)) * 100)}%`}}/></div><div className="progress-note">Keep the app open while indexing. Unsupported and oversized files are skipped.</div></div>}
          {query.trim() ? <section className="results-section"><div className="section-heading"><div><h2>Search results</h2><p>{filtered.length} matching passages {results.some(r => r.semantic) ? '· semantic + keyword search' : '· keyword search'}</p></div><div className="filter-tabs"><button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>All</button><button className={filter === 'docs' ? 'selected' : ''} onClick={() => setFilter('docs')}>Documents</button><button className={filter === 'code' ? 'selected' : ''} onClick={() => setFilter('code')}>Code</button></div></div>
            {filtered.length ? <div className="result-list">{filtered.map((r, i) => <article className="result-card" key={r.id} onClick={() => openResult(r)}><div className="result-icon">{/\.(js|jsx|ts|tsx|py|rs|go|java|c|h|cpp|sql|sh)$/i.test(r.name) ? <FileCode2 size={18}/> : <FileText size={18}/>}</div><div className="result-main"><div className="result-title-row"><h3>{r.name}</h3><span className="match-score">{Math.round(Math.max(0, Math.min(1, r.score)) * 100)}% match</span></div><div className="result-path"><Folder size={12}/>{r.path}</div><p className="result-snippet">{r.text.length > 320 ? `${r.text.slice(0, 320)}…` : r.text}</p><div className="result-footer"><span className="source-tag">{r.semantic ? 'SEMANTIC MATCH' : 'TEXT MATCH'}</span><button className="open-link" onClick={e => { e.stopPropagation(); openResult(r); }}>Open source <ArrowUpRight size={13}/></button></div></div></article>)}</div> : <div className="empty-results"><div className="empty-icon"><Search size={23}/></div><h3>No matching passages yet</h3><p>{info?.indexedChunks ? 'Try different words or check the Documents / Code filters.' : 'Add a folder to build your private search index.'}</p>{!info?.indexedChunks && <button className="primary-btn" onClick={chooseAndIndex}><Plus size={15}/> Choose folders</button>}</div>}
          </section> : <div className="home-grid"><section className="welcome-card"><div className="welcome-top"><div className="welcome-icon"><History size={19}/></div><span className="subtle-badge">GET STARTED</span></div><h2>Your work, remembered.</h2><p>Index the folders you work in. OpenSearch builds a private, searchable memory from supported files and code.</p><button className="primary-btn" onClick={chooseAndIndex} disabled={busy}><FolderOpen size={15}/> {busy ? 'Indexing…' : info?.roots?.length ? 'Index more folders' : 'Choose folders'} <ArrowDownToLine size={14}/></button><div className="supported-types"><span>SUPPORTED FIRST</span><div><span>.md</span><span>.txt</span><span>.json</span><span>.ts</span><span>.py</span><span>.log</span></div></div></section>
            <section className="stats-card"><div className="card-title"><span>Memory status</span><Activity size={16}/></div><div className="stat-row"><div className="stat-icon"><FileText size={16}/></div><div className="stat-label"><strong>{info?.status?.files || 0}</strong><span>Files indexed</span></div></div><div className="stat-row"><div className="stat-icon"><BookOpen size={16}/></div><div className="stat-label"><strong>{info?.indexedChunks || 0}</strong><span>Searchable passages</span></div></div><div className="stat-row"><div className="stat-icon"><BrainCircuit size={16}/></div><div className="stat-label"><strong>{info?.modelStatus === 'ready' ? 'Ready' : info?.modelStatus === 'loading' ? 'Loading…' : 'Not loaded'}</strong><span>Local embedding model</span></div></div><div className="card-bottom"><button className="secondary-btn" onClick={loadModel} disabled={info?.modelStatus === 'loading'}><BrainCircuit size={14}/> Load semantic model</button></div></section>
          </div>}
          <div className="bottom-note"><LockKeyhole size={13}/><span>Files are read-only. OpenSearch stores extracted text and embeddings in your local app data folder.</span></div>
        </>}

        {view === 'library' && <div className="page-panel"><div className="page-heading"><div><div className="eyebrow">YOUR SOURCES</div><h1>Indexed library</h1><p>Folders currently included in your local memory index.</p></div><button className="primary-btn" onClick={chooseAndIndex} disabled={busy}><Plus size={15}/> Add folders</button></div><div className="library-stats"><div><span>Indexed files</span><strong>{info?.status?.files || 0}</strong></div><div><span>Passages</span><strong>{info?.indexedChunks || 0}</strong></div><div><span>Folders</span><strong>{info?.roots?.length || 0}</strong></div></div><div className="source-list">{info?.roots?.length ? info.roots.map((r: string) => <div className="source-row" key={r}><div className="source-folder"><Folder size={17}/></div><div className="source-info"><strong>{r.split(/[\\/]/).filter(Boolean).pop()}</strong><span>{r}</span></div><span className="source-state"><span className="green-dot"/> Indexed</span></div>) : <div className="empty-results"><div className="empty-icon"><FolderOpen size={23}/></div><h3>No folders indexed</h3><p>Choose a folder to begin building your local memory.</p><button className="primary-btn" onClick={chooseAndIndex}><Plus size={15}/> Choose folders</button></div>}</div><div className="danger-zone"><div><strong>Clear local index</strong><p>Removes extracted text and embeddings. Original files remain untouched.</p></div><button className="danger-btn" onClick={clearIndex}><Trash2 size={14}/> Clear index</button></div></div>}

        {view === 'settings' && (
          <div className="page-panel">
            <div className="page-heading">
              <div>
                <div className="eyebrow">MODELS & STORAGE</div>
                <h1>Settings & AI Models</h1>
                <p>Download and switch local LLM models, control semantic embeddings, and manage index storage.</p>
              </div>
              <button className="secondary-btn" onClick={() => { refreshInfo(); refreshModels(); }} disabled={loadingModels}>
                <RefreshCw size={13} className={loadingModels ? "spin" : ""}/> Refresh status
              </button>
            </div>

            {pullProgress && (
              <div className="progress-card" style={{ marginBottom: 24, border: "1px solid #3d6c52" }}>
                <div className="progress-top">
                  <div className="spinner-label">
                    <LoaderCircle className="spin" size={17}/>
                    <strong>Downloading {pullProgress.model}…</strong>
                  </div>
                  <span>{pullProgress.percent}%</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${Math.max(5, pullProgress.percent)}%` }}/>
                </div>
                <div className="progress-note">{pullProgress.status}</div>
              </div>
            )}

            <div className="settings-section">
              <div className="section-title-row">
                <div className="section-title-icon"><Bot size={17}/></div>
                <div>
                  <h3>Local LLM Models (Ollama)</h3>
                  <p>Inference runs 100% on your machine. No API keys or external servers required.</p>
                </div>
                <div className="service-status">
                  <span className={modelsData?.ollamaRunning ? "green-dot" : "gray-dot"}/>
                  <span>{modelsData?.ollamaRunning ? "Ollama Connected" : "Ollama Offline"}</span>
                </div>
              </div>

              {!modelsData?.ollamaRunning && (
                <div className="alert error" style={{ margin: "14px 0" }}>
                  <AlertCircle size={16}/>
                  <span>Ollama is not running on <code>127.0.0.1:11434</code>. Please launch Ollama on your Mac to download and run models.</span>
                  <button className="secondary-btn" onClick={refreshModels} style={{ padding: "4px 8px", fontSize: 10 }}>Retry</button>
                </div>
              )}

              <div className="models-catalog">
                <h4>Recommended Lightweight Models</h4>
                <div className="models-grid">
                  {modelsData?.recommendedModels?.map(m => {
                    const isInstalled = modelsData.installedModels.some(inst => inst.name === m.id || inst.name.startsWith(m.id));
                    const isActive = modelsData.activeModel === m.id || modelsData.activeModel.startsWith(m.id);
                    const isPulling = pullingModel === m.id;

                    return (
                      <div className={`model-card ${isActive ? "active" : ""}`} key={m.id}>
                        <div className="model-card-top">
                          <strong>{m.name}</strong>
                          <span className="size-badge">{m.size}</span>
                        </div>
                        <p className="model-desc">{m.desc}</p>
                        <div className="model-actions">
                          {isActive ? (
                            <span className="source-state"><span className="green-dot"/> Active Model</span>
                          ) : isInstalled ? (
                            <button className="secondary-btn" onClick={() => handleSetActiveModel(m.id)}>
                              Use this model
                            </button>
                          ) : (
                            <button
                              className="primary-btn"
                              onClick={() => handlePullModel(m.id)}
                              disabled={isPulling || !!pullingModel || !modelsData?.ollamaRunning}
                            >
                              <Download size={13}/> {isPulling ? "Downloading…" : "Download in App"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="custom-pull-box">
                <h4>Download Any Model from Ollama</h4>
                <p>Enter any model tag from the Ollama library (e.g. <code>mistral</code>, <code>gemma2:2b</code>, <code>phi3:mini</code>, <code>deepseek-coder:1.3b</code>).</p>
                <div className="custom-pull-form">
                  <input
                    value={customModelInput}
                    onChange={e => setCustomModelInput(e.target.value)}
                    placeholder="e.g. llama3.2:1b"
                    disabled={!!pullingModel || !modelsData?.ollamaRunning}
                  />
                  <button
                    className="primary-btn"
                    onClick={() => handlePullModel(customModelInput)}
                    disabled={!customModelInput.trim() || !!pullingModel || !modelsData?.ollamaRunning}
                  >
                    <Download size={14}/> Download Model
                  </button>
                </div>
              </div>

              {modelsData?.installedModels && modelsData.installedModels.length > 0 && (
                <div className="installed-models-box">
                  <h4>Installed Models on Disk ({modelsData.installedModels.length})</h4>
                  <div className="installed-list">
                    {modelsData.installedModels.map(m => {
                      const isActive = modelsData.activeModel === m.name;
                      return (
                        <div className="installed-row" key={m.name}>
                          <div className="installed-meta">
                            <Bot size={15}/>
                            <strong className="installed-name">{m.name}</strong>
                            <span className="installed-size">{m.sizeFormatted}</span>
                          </div>
                          <div className="installed-ctrls">
                            {isActive ? (
                              <span className="active-pill"><Check size={12}/> Active</span>
                            ) : (
                              <button className="secondary-btn" onClick={() => handleSetActiveModel(m.name)}>
                                Set Active
                              </button>
                            )}
                            <button
                              className="icon-btn-danger"
                              title="Delete model from disk"
                              onClick={() => handleDeleteModel(m.name)}
                              disabled={!!pullingModel}
                            >
                              <Trash2 size={14}/>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="settings-section" style={{ marginTop: 24 }}>
              <div className="section-title-row">
                <div className="section-title-icon"><BrainCircuit size={17}/></div>
                <div>
                  <h3>Semantic Embedding Model</h3>
                  <p>Hugging Face <code>all-MiniLM-L6-v2</code> converts documents into dense vectors for meaning-based search.</p>
                </div>
              </div>
              <div className="settings-group">
                <div className="settings-row">
                  <div className="settings-icon"><Cpu size={18}/></div>
                  <div className="settings-copy">
                    <strong>Local embedding engine</strong>
                    <p>Model: Xenova/all-MiniLM-L6-v2 · Quantized Q8 · Runs locally in Node.</p>
                    <span className="setting-state">
                      <span className={info?.modelStatus === "ready" ? "green-dot" : "gray-dot"}/>
                      {info?.modelStatus === "ready" ? "Loaded & Ready" : info?.modelStatus === "loading" ? "Loading…" : "Not Loaded"}
                    </span>
                  </div>
                  <button className="secondary-btn" onClick={loadModel} disabled={info?.modelStatus === "loading"}>
                    {info?.modelStatus === "ready" ? "Reload Model" : "Load Model"}
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-section" style={{ marginTop: 24 }}>
              <div className="section-title-row">
                <div className="section-title-icon"><HardDrive size={17}/></div>
                <div>
                  <h3>Index Storage & Clean Up</h3>
                  <p>Manage your local search index and embeddings storage.</p>
                </div>
              </div>
              <div className="settings-group">
                <div className="settings-row">
                  <div className="settings-icon"><Layers size={18}/></div>
                  <div className="settings-copy">
                    <strong>Semantic vector embeddings</strong>
                    <p>Delete generated vectors to save memory. Extracted text passages remain intact for keyword search.</p>
                  </div>
                  <button className="secondary-btn" onClick={handleClearEmbeddings}>
                    Clear Embeddings
                  </button>
                </div>
                <div className="settings-row">
                  <div className="settings-icon"><Trash2 size={18}/></div>
                  <div className="settings-copy">
                    <strong>Entire search index</strong>
                    <p>Clear all indexed files, passages, and embeddings. Source files remain untouched.</p>
                  </div>
                  <button className="danger-btn" onClick={clearIndex}>
                    Clear Entire Index
                  </button>
                </div>
              </div>
            </div>

            <div className="settings-footnote" style={{ marginTop: 20 }}>
              <LockKeyhole size={14}/>
              <span>Everything runs strictly on your machine. Documents and prompts never leave your local environment.</span>
            </div>
          </div>
        )}
      </div>
      <footer className="statusbar"><div className="status-left"><span className="green-dot"/> Local engine <span className="status-sep">/</span><span>{info?.platform || 'desktop'}</span><span className="status-sep">/</span><span>{info?.indexedChunks || 0} passages</span></div><div className="status-right"><span>v0.1.0 · Early build</span><span className="status-sep">·</span><span>Made for your machine</span></div></footer>
    </main>
  </div>;
}

export default App;
