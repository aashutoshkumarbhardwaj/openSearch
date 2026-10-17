import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertCircle, ArrowDownToLine, ArrowUpRight, BookOpen, Bot,
  BrainCircuit, Calendar, Check, CheckSquare, ChevronDown, CircleHelp,
  Command, Cpu, Download, Edit3, FileCode2, FileStack, FileText, Folder,
  FolderOpen, HardDrive, HelpCircle, History, Keyboard, Layers, Lightbulb,
  ListTodo, LoaderCircle, LockKeyhole, Plus, RefreshCw, RotateCcw, Search,
  Settings2, ShieldCheck, Sparkles, Trash2, X
} from 'lucide-react';
import type {
  MemoryItem, MemoryStatus, MemoryType, ExtractionProgress, MemorySearchResult,
  SourceItem, AnalysisGoal, Finding, FindingType, IntelligenceAnalysisResult,
  IntelligenceProgress
} from './vite-env';

type Result = { id: string; path: string; relativePath: string; name: string; text: string; score: number; semantic: boolean };
type Info = { platform: string; roots: string[]; status: { files: number; chunks: number; errors: number; lastIndexedAt: number | null }; modelStatus: string; indexedChunks: number };

const GOALS: Array<{ id: AnalysisGoal; title: string; desc: string; icon: any }> = [
  { id: 'next_actions', title: 'What should I do next?', desc: 'Discover actionable next steps based on available project evidence', icon: ListTodo },
  { id: 'overview', title: 'Project Overview', desc: 'Synthesize project purpose, architecture, key components & status', icon: FileText },
  { id: 'tasks', title: 'Extract Tasks', desc: 'Find explicit TODOs, action items, acceptance criteria & deadlines', icon: CheckSquare },
  { id: 'decisions', title: 'Decisions & Questions', desc: 'Identify architectural choices, rationales & open questions', icon: ShieldCheck },
  { id: 'issues', title: 'Find Potential Issues', desc: 'Spot inconsistencies, incomplete requirements & evidence-backed risks', icon: AlertCircle },
  { id: 'images', title: 'Screenshots & Images', desc: 'Inspect visible UI, error dialogs, diagrams & visual context', icon: Layers },
  { id: 'custom', title: 'Custom Instructions', desc: 'Analyze project context tailored to your own custom prompt', icon: Sparkles }
];

function App() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [matchingMemories, setMatchingMemories] = useState<MemorySearchResult[]>([]);
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
  const [view, setView] = useState<'search' | 'intelligence' | 'memory' | 'library' | 'settings'>('search');
  const [filter, setFilter] = useState<'all' | 'code' | 'docs'>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  // Decision & Task Memory State
  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>([]);
  const [memoryFilter, setMemoryFilter] = useState<'suggested' | 'open' | 'decisions' | 'completed' | 'dismissed' | 'all'>('suggested');
  const [memorySearch, setMemorySearch] = useState('');
  const [extractingMemory, setExtractingMemory] = useState(false);
  const [extractProgress, setExtractProgress] = useState<ExtractionProgress | null>(null);
  const [editingItem, setEditingItem] = useState<MemoryItem | null>(null);
  const [creatingItem, setCreatingItem] = useState(false);
  const [modalForm, setModalForm] = useState<{
    type: MemoryType;
    title: string;
    details: string;
    dueDate: string;
  }>({ type: 'task', title: '', details: '', dueDate: '' });

  // Universal Project Intelligence State
  const [selectedSources, setSelectedSources] = useState<SourceItem[]>([]);
  const [intelGoal, setIntelGoal] = useState<AnalysisGoal>('next_actions');
  const [customInstructions, setCustomInstructions] = useState('');
  const [runningIntel, setRunningIntel] = useState(false);
  const [intelProgress, setIntelProgress] = useState<IntelligenceProgress | null>(null);
  const [intelResult, setIntelResult] = useState<IntelligenceAnalysisResult | null>(null);
  const [findingFilter, setFindingFilter] = useState<'all' | 'task' | 'decision' | 'issue' | 'recommendation' | 'question'>('all');
  const [editingFinding, setEditingFinding] = useState<Finding | null>(null);
  const [editFindingForm, setEditFindingForm] = useState<{
    title: string;
    details: string;
    dueDate: string;
    targetType: 'task' | 'decision';
  }>({ title: '', details: '', dueDate: '', targetType: 'task' });

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

  const refreshInfo = useCallback(async () => {
    try {
      if (window.recallDesk?.info) {
        setInfo(await window.recallDesk.info());
      }
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const refreshMemory = useCallback(async () => {
    try {
      if (window.recallDesk?.listMemory) {
        const items = await window.recallDesk.listMemory();
        setMemoryItems(items);
      }
    } catch (e) {
      console.error('Failed to load memory items:', e);
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

  useEffect(() => {
    if (!window.recallDesk) {
      setError("Desktop API (preload) was not detected. Please verify Electron preload initialization.");
      return;
    }
    refreshInfo();
    refreshModels();
    refreshMemory();

    const offProgress = window.recallDesk.onProgress?.(p => {
      setProgress(p);
      if (p.done) {
        setBusy(false);
        refreshInfo();
        refreshMemory();
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
    const offExtract = window.recallDesk.onExtractionProgress?.(p => {
      setExtractProgress(p);
      if (p.done) {
        setExtractingMemory(false);
        refreshMemory();
        if (p.error && p.stage === 'error') {
          setError(`Extraction error: ${p.error}`);
        } else if (p.stage === 'completed') {
          setNotice(p.message || 'Extraction complete.');
        }
      }
    });
    const offIntel = window.recallDesk.onIntelligenceProgress?.(p => {
      setIntelProgress(p);
      if (p.done) {
        setRunningIntel(false);
      }
    });

    return () => {
      offProgress?.();
      offModel?.();
      offFocus?.();
      offPull?.();
      offExtract?.();
      offIntel?.();
    };
  }, [refreshInfo, refreshModels, refreshMemory]);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        setMatchingMemories([]);
        setError('');
        return;
      }
      try {
        setError('');
        const [passages, memories] = await Promise.all([
          window.recallDesk.search(query),
          window.recallDesk.searchMemory ? window.recallDesk.searchMemory(query) : Promise.resolve([])
        ]);
        setResults(passages);
        setMatchingMemories(memories);
      } catch (e) {
        setError(String(e));
      }
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
      setInfo(await window.recallDesk.info());
      setNotice(`Indexed ${result.files} files and ${result.chunks} passages.`);
    } catch (e) { setError(String(e)); setBusy(false); }
  };

  const openResult = async (r: Result) => {
    try {
      await window.recallDesk.openFile(r.path);
    } catch (e: any) {
      setError(`Cannot open file: ${e.message || String(e)}`);
    }
  };

  const clearIndex = async () => {
    if (!confirm('Remove the local index and saved embeddings? Original files will not be deleted.')) return;
    await window.recallDesk.clearIndex();
    setResults([]);
    setMatchingMemories([]);
    setQuery('');
    await refreshInfo();
    setNotice('Local index cleared. Your original files were not changed.');
  };

  const loadModel = async () => {
    setError('');
    setNotice('Loading the local embedding model. First run may download model files.');
    try {
      await window.recallDesk.loadModel();
      setNotice('Local embedding model is ready.');
      await refreshInfo();
    } catch (e) {
      setError(String(e));
    }
  };

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

  // Memory Action Handlers
  const handleExtractMemory = async () => {
    if (extractingMemory || busy) return;
    setError('');
    setNotice('');
    setExtractingMemory(true);
    setExtractProgress({
      stage: 'extracting',
      currentChunk: 0,
      totalChunks: info?.indexedChunks || 0,
      extractedCount: 0,
      newCount: 0,
      message: 'Scanning passages for candidate tasks & decisions...',
      done: false
    });
    try {
      const res = await window.recallDesk.extractMemory();
      await refreshMemory();
      setNotice(`Scan complete: found ${res.newCount} new candidate tasks and decisions.`);
    } catch (e: any) {
      if (e.message && e.message.includes('cancelled')) {
        setNotice('Extraction scan cancelled.');
      } else {
        setError(`Extraction error: ${e.message || String(e)}`);
      }
    } finally {
      setExtractingMemory(false);
      setExtractProgress(null);
    }
  };

  const handleCancelExtract = async () => {
    try {
      await window.recallDesk.cancelExtractMemory();
      setExtractingMemory(false);
      setExtractProgress(null);
      setNotice('Scan cancelled.');
    } catch (e: any) {
      console.error('Cancel error:', e);
    }
  };

  const handleConfirmMemory = async (id: string) => {
    try {
      setError('');
      await window.recallDesk.confirmMemory(id);
      await refreshMemory();
      setNotice('Item confirmed and moved to active memory.');
    } catch (e: any) {
      setError(String(e));
    }
  };

  const handleDismissMemory = async (id: string) => {
    try {
      setError('');
      await window.recallDesk.dismissMemory(id);
      await refreshMemory();
      setNotice('Item dismissed.');
    } catch (e: any) {
      setError(String(e));
    }
  };

  const handleCompleteMemory = async (id: string) => {
    try {
      setError('');
      await window.recallDesk.completeMemory(id);
      await refreshMemory();
      setNotice('Task marked as completed.');
    } catch (e: any) {
      setError(String(e));
    }
  };

  const handleReopenMemory = async (id: string) => {
    try {
      setError('');
      await window.recallDesk.reopenMemory(id);
      await refreshMemory();
      setNotice('Item reopened.');
    } catch (e: any) {
      setError(String(e));
    }
  };

  const handleDeleteMemory = async (id: string) => {
    if (!confirm('Permanently delete this memory item?')) return;
    try {
      setError('');
      await window.recallDesk.deleteMemory(id);
      await refreshMemory();
      setNotice('Item deleted.');
    } catch (e: any) {
      setError(String(e));
    }
  };

  const handleOpenSourceFile = async (filePath: string) => {
    try {
      setError('');
      await window.recallDesk.openSourceFile(filePath);
    } catch (e: any) {
      setError(`Cannot open source file: ${e.message || String(e)}`);
    }
  };

  const handleStartEdit = (item: MemoryItem) => {
    setEditingItem(item);
    setCreatingItem(false);
    setModalForm({
      type: item.type,
      title: item.title,
      details: item.details || '',
      dueDate: item.dueDate || ''
    });
  };

  const handleStartCreate = () => {
    setEditingItem(null);
    setCreatingItem(true);
    setModalForm({
      type: 'task',
      title: '',
      details: '',
      dueDate: ''
    });
  };

  const handleSaveModal = async () => {
    if (!modalForm.title.trim()) {
      setError('Title cannot be empty.');
      return;
    }
    setError('');
    try {
      if (editingItem) {
        await window.recallDesk.updateMemory({
          id: editingItem.id,
          updates: {
            title: modalForm.title,
            details: modalForm.details,
            dueDate: modalForm.dueDate,
            status: editingItem.status === 'suggested' ? 'open' : undefined
          }
        });
        setEditingItem(null);
        setNotice('Memory item updated.');
      } else if (creatingItem) {
        await window.recallDesk.createMemory({
          type: modalForm.type,
          title: modalForm.title,
          details: modalForm.details,
          dueDate: modalForm.dueDate,
          status: 'open'
        });
        setCreatingItem(false);
        setNotice('New memory item created.');
      }
      await refreshMemory();
    } catch (e: any) {
      setError(e.message || String(e));
    }
  };

  // Universal Project Intelligence Handlers
  const handleAddFiles = async () => {
    try {
      setError('');
      const filePaths = await window.recallDesk.chooseFilesToAnalyze();
      if (!filePaths.length) return;
      const inspected = await window.recallDesk.inspectSources(filePaths);
      setSelectedSources(prev => {
        const existingPaths = new Set(prev.map(s => s.path));
        const newItems = inspected.filter(item => !existingPaths.has(item.path));
        return [...prev, ...newItems];
      });
    } catch (e: any) {
      setError(`Cannot add files: ${e.message || String(e)}`);
    }
  };

  const handleAddFolders = async () => {
    try {
      setError('');
      const folderPaths = await window.recallDesk.chooseFoldersToAnalyze();
      if (!folderPaths.length) return;
      const inspected = await window.recallDesk.inspectSources(folderPaths);
      setSelectedSources(prev => {
        const existingPaths = new Set(prev.map(s => s.path));
        const newItems = inspected.filter(item => !existingPaths.has(item.path));
        return [...prev, ...newItems];
      });
    } catch (e: any) {
      setError(`Cannot add folders: ${e.message || String(e)}`);
    }
  };

  const handleAddIndexedContent = () => {
    if (selectedSources.some(s => s.isIndexed)) return;
    const item: SourceItem = {
      id: 'indexed-corpus',
      path: 'Indexed Library',
      name: `Indexed Library (${info?.status?.files || 0} files)`,
      type: 'indexed',
      sizeBytes: 0,
      sizeFormatted: `${info?.indexedChunks || 0} passages`,
      isIndexed: true,
      status: 'ready'
    };
    setSelectedSources(prev => [item, ...prev]);
  };

  const handleRemoveSource = (id: string) => {
    setSelectedSources(prev => prev.filter(s => s.id !== id));
  };

  const handleClearSources = () => {
    setSelectedSources([]);
    setIntelResult(null);
  };

  const handleRunIntelligence = async () => {
    if (selectedSources.length === 0 || runningIntel) return;
    setError('');
    setNotice('');
    setRunningIntel(true);
    setIntelProgress({
      stage: 'inspecting',
      percent: 5,
      sourcesProcessed: 0,
      totalSources: selectedSources.length,
      findingsCount: 0,
      message: 'Preparing sources for Project Intelligence...',
      done: false
    });
    try {
      const res = await window.recallDesk.runIntelligenceAnalysis({
        sources: selectedSources.map(s => ({
          path: s.path,
          isFolder: s.isFolder,
          isIndexed: s.isIndexed
        })),
        goal: intelGoal,
        customInstructions: customInstructions.trim() || undefined
      });
      setIntelResult(res);
      setNotice(`Analysis complete: ${res.findings.length} findings discovered.`);
    } catch (e: any) {
      if (e.message && e.message.includes('cancelled')) {
        setNotice('Project intelligence analysis was cancelled.');
      } else {
        setError(`Intelligence analysis error: ${e.message || String(e)}`);
      }
    } finally {
      setRunningIntel(false);
      setIntelProgress(null);
    }
  };

  const handleCancelIntelligence = async () => {
    try {
      await window.recallDesk.cancelIntelligenceAnalysis();
      setRunningIntel(false);
      setIntelProgress(null);
      setNotice('Analysis cancelled.');
    } catch (e: any) {
      console.error('Cancel error:', e);
    }
  };

  const handleAcceptFinding = async (finding: Finding, targetType: 'task' | 'decision') => {
    try {
      setError('');
      await window.recallDesk.acceptFinding({
        finding,
        targetType
      });
      if (intelResult) {
        setIntelResult({
          ...intelResult,
          findings: intelResult.findings.map(f =>
            f.id === finding.id ? { ...f, status: 'accepted', targetMemoryType: targetType } : f
          )
        });
      }
      await refreshMemory();
      setNotice(`"${finding.title}" accepted into Tasks & Decisions as a confirmed ${targetType}!`);
    } catch (e: any) {
      setError(String(e));
    }
  };

  const handleStartEditFinding = (finding: Finding) => {
    setEditingFinding(finding);
    setEditFindingForm({
      title: finding.title,
      details: finding.description || finding.reason || '',
      dueDate: finding.dueDate || '',
      targetType: finding.type === 'decision' ? 'decision' : 'task'
    });
  };

  const handleSaveEditFinding = async () => {
    if (!editingFinding) return;
    if (!editFindingForm.title.trim()) {
      setError('Title cannot be empty.');
      return;
    }
    try {
      setError('');
      await window.recallDesk.acceptFinding({
        finding: editingFinding,
        targetType: editFindingForm.targetType,
        editedTitle: editFindingForm.title,
        editedDetails: editFindingForm.details,
        dueDate: editFindingForm.dueDate
      });
      if (intelResult) {
        setIntelResult({
          ...intelResult,
          findings: intelResult.findings.map(f =>
            f.id === editingFinding.id ? { ...f, status: 'accepted', title: editFindingForm.title, targetMemoryType: editFindingForm.targetType } : f
          )
        });
      }
      setEditingFinding(null);
      await refreshMemory();
      setNotice(`Finding saved into Tasks & Decisions!`);
    } catch (e: any) {
      setError(String(e));
    }
  };

  const handleDismissFinding = (findingId: string) => {
    if (intelResult) {
      setIntelResult({
        ...intelResult,
        findings: intelResult.findings.map(f =>
          f.id === findingId ? { ...f, status: 'dismissed' } : f
        )
      });
      setNotice('Finding dismissed.');
    }
  };

  // Counts for tabs
  const suggestedCount = useMemo(() => memoryItems.filter(i => i.status === 'suggested').length, [memoryItems]);
  const openTasksCount = useMemo(() => memoryItems.filter(i => i.status === 'open' && i.type === 'task').length, [memoryItems]);
  const decisionsCount = useMemo(() => memoryItems.filter(i => i.status === 'open' && i.type === 'decision').length, [memoryItems]);
  const completedCount = useMemo(() => memoryItems.filter(i => i.status === 'completed').length, [memoryItems]);
  const dismissedCount = useMemo(() => memoryItems.filter(i => i.status === 'dismissed').length, [memoryItems]);

  const filteredMemories = useMemo(() => {
    let list = memoryItems;
    if (memoryFilter === 'suggested') {
      list = list.filter(i => i.status === 'suggested');
    } else if (memoryFilter === 'open') {
      list = list.filter(i => i.status === 'open' && i.type === 'task');
    } else if (memoryFilter === 'decisions') {
      list = list.filter(i => i.type === 'decision' && i.status === 'open');
    } else if (memoryFilter === 'completed') {
      list = list.filter(i => i.status === 'completed');
    } else if (memoryFilter === 'dismissed') {
      list = list.filter(i => i.status === 'dismissed');
    }

    if (memorySearch.trim()) {
      const q = memorySearch.toLowerCase().trim();
      list = list.filter(i =>
        i.title.toLowerCase().includes(q) ||
        (i.details && i.details.toLowerCase().includes(q)) ||
        i.sourceExcerpt.toLowerCase().includes(q) ||
        i.sourcePath.toLowerCase().includes(q)
      );
    }
    return list;
  }, [memoryItems, memoryFilter, memorySearch]);

  const filteredFindings = useMemo(() => {
    if (!intelResult) return [];
    if (findingFilter === 'all') return intelResult.findings;
    return intelResult.findings.filter(f => f.type === findingFilter);
  }, [intelResult, findingFilter]);

  const findingCounts = useMemo(() => {
    if (!intelResult) return { all: 0, task: 0, decision: 0, issue: 0, recommendation: 0, question: 0 };
    return {
      all: intelResult.findings.length,
      task: intelResult.findings.filter(f => f.type === 'task').length,
      decision: intelResult.findings.filter(f => f.type === 'decision').length,
      issue: intelResult.findings.filter(f => f.type === 'issue').length,
      recommendation: intelResult.findings.filter(f => f.type === 'recommendation').length,
      question: intelResult.findings.filter(f => f.type === 'question').length
    };
  }, [intelResult]);

  const unsupportedSources = useMemo(() => {
    return selectedSources.filter(s => s.status === 'unsupported' || s.warning);
  }, [selectedSources]);

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><BrainCircuit size={21}/></div><div><div className="brand-name">OpenSearch</div><div className="brand-sub">LOCAL MEMORY ENGINE</div></div></div>
      <button className={`nav-item ${view === 'search' ? 'active' : ''}`} onClick={() => setView('search')}><Search size={17}/> Search memory <span className="nav-shortcut">⌘ K</span></button>
      <button className={`nav-item ${view === 'intelligence' ? 'active' : ''}`} onClick={() => setView('intelligence')}>
        <Sparkles size={17}/> Project Intelligence
      </button>
      <button className={`nav-item ${view === 'memory' ? 'active' : ''}`} onClick={() => setView('memory')}>
        <ListTodo size={17}/> Tasks & Decisions
        {suggestedCount > 0 && <span className="memory-nav-badge">{suggestedCount}</span>}
      </button>
      <button className={`nav-item ${view === 'library' ? 'active' : ''}`} onClick={() => setView('library')}><BookOpen size={17}/> Indexed library</button>
      <button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => setView('settings')}><Settings2 size={17}/> Settings</button>
      <div className="sidebar-bottom">
        <div className="privacy-card"><div className="privacy-icon"><ShieldCheck size={16}/></div><div><div className="privacy-title">Your data stays here</div><div className="privacy-desc">Local index · No account</div></div><span className="green-dot"/></div>
        <div className="user-chip"><div className="avatar">RD</div><div className="user-copy"><div className="user-name">Personal workspace</div><div className="user-plan">Local-first edition</div></div><ChevronDown size={15} className="muted"/></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="breadcrumb">
          <span>Workspace</span>
          <span className="slash">/</span>
          <strong>
            {view === 'search' ? 'Search memory' : view === 'intelligence' ? 'Project Intelligence' : view === 'memory' ? 'Decision & Task Memory' : view === 'library' ? 'Indexed library' : 'Settings'}
          </strong>
        </div>
        <div className="top-actions">
          <span className="local-pill"><span className="green-dot"/> LOCAL MODE</span>
          <button className="icon-btn" title="Help" onClick={() => setNotice('Select files, folders, or indexed content. RecallDesk runs local intelligence to extract actionable findings and answer: What should I do next?')}><CircleHelp size={17}/></button>
        </div>
      </header>
      <div className="content">
        {/* VIEW 1: SEARCH VIEW */}
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

          {/* Integrated Search: Matching Tasks & Decisions */}
          {query.trim() && matchingMemories.length > 0 && (
            <div className="search-memory-matches">
              <div className="search-memory-heading">
                <h3><BrainCircuit size={16}/> Matching Tasks & Decisions ({matchingMemories.length})</h3>
                <button className="text-button" onClick={() => setView('memory')}>View all in Memory tab <ArrowUpRight size={13}/></button>
              </div>
              <div className="search-memory-list">
                {matchingMemories.slice(0, 4).map(({ item }) => (
                  <div className="search-memory-card" key={item.id}>
                    <div className="memory-card-header">
                      <div className="memory-badges-left">
                        <span className={`type-badge ${item.type}`}>{item.type.toUpperCase()}</span>
                        <span className={`status-pill ${item.status}`}>{item.status.toUpperCase()}</span>
                        {item.dueDate && <span className="due-badge"><Calendar size={11}/> {item.dueDate}</span>}
                      </div>
                      <button className="source-file-link" onClick={() => handleOpenSourceFile(item.sourcePath)} title="Open source file">
                        <Folder size={11}/> {item.relativePath || item.sourcePath.split(/[/\\]/).pop()} <ArrowUpRight size={11}/>
                      </button>
                    </div>
                    <strong style={{ fontSize: 13, color: '#e5ebf5' }}>{item.title}</strong>
                    {item.sourceExcerpt && (
                      <p style={{ margin: 0, fontSize: 11, color: '#8893a7', fontStyle: 'italic', overflowWrap: 'anywhere' }}>
                        "{item.sourceExcerpt.length > 200 ? `${item.sourceExcerpt.slice(0, 200)}…` : item.sourceExcerpt}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {query.trim() ? <section className="results-section"><div className="section-heading"><div><h2>Search results</h2><p>{filtered.length} matching passages {results.some(r => r.semantic) ? '· semantic + keyword search' : '· keyword search'}</p></div><div className="filter-tabs"><button className={filter === 'all' ? 'selected' : ''} onClick={() => setFilter('all')}>All</button><button className={filter === 'docs' ? 'selected' : ''} onClick={() => setFilter('docs')}>Documents</button><button className={filter === 'code' ? 'selected' : ''} onClick={() => setFilter('code')}>Code</button></div></div>
            {filtered.length ? <div className="result-list">{filtered.map((r, i) => <article className="result-card" key={r.id} onClick={() => openResult(r)}><div className="result-icon">{/\.(js|jsx|ts|tsx|py|rs|go|java|c|h|cpp|sql|sh)$/i.test(r.name) ? <FileCode2 size={18}/> : <FileText size={18}/>}</div><div className="result-main"><div className="result-title-row"><h3>{r.name}</h3><span className="match-score">{Math.round(Math.max(0, Math.min(1, r.score)) * 100)}% match</span></div><div className="result-path"><Folder size={12}/>{r.path}</div><p className="result-snippet">{r.text.length > 320 ? `${r.text.slice(0, 320)}…` : r.text}</p><div className="result-footer"><span className="source-tag">{r.semantic ? 'SEMANTIC MATCH' : 'TEXT MATCH'}</span><button className="open-link" onClick={e => { e.stopPropagation(); openResult(r); }}>Open source <ArrowUpRight size={13}/></button></div></div></article>)}</div> : <div className="empty-results"><div className="empty-icon"><Search size={23}/></div><h3>No matching passages yet</h3><p>{info?.indexedChunks ? 'Try different words or check the Documents / Code filters.' : 'Add a folder to build your private search index.'}</p>{!info?.indexedChunks && <button className="primary-btn" onClick={chooseAndIndex}><Plus size={15}/> Choose folders</button>}</div>}
          </section> : <div className="home-grid"><section className="welcome-card"><div className="welcome-top"><div className="welcome-icon"><History size={19}/></div><span className="subtle-badge">GET STARTED</span></div><h2>Your work, remembered.</h2><p>Index the folders you work in. OpenSearch builds a private, searchable memory from supported files and code.</p><button className="primary-btn" onClick={chooseAndIndex} disabled={busy}><FolderOpen size={15}/> {busy ? 'Indexing…' : info?.roots?.length ? 'Index more folders' : 'Choose folders'} <ArrowDownToLine size={14}/></button><div className="supported-types"><span>SUPPORTED FIRST</span><div><span>.md</span><span>.txt</span><span>.json</span><span>.ts</span><span>.py</span><span>.log</span></div></div></section>
            <section className="stats-card"><div className="card-title"><span>Memory status</span><Activity size={16}/></div><div className="stat-row"><div className="stat-icon"><FileText size={16}/></div><div className="stat-label"><strong>{info?.status?.files || 0}</strong><span>Files indexed</span></div></div><div className="stat-row"><div className="stat-icon"><BookOpen size={16}/></div><div className="stat-label"><strong>{info?.indexedChunks || 0}</strong><span>Searchable passages</span></div></div><div className="stat-row"><div className="stat-icon"><BrainCircuit size={16}/></div><div className="stat-label"><strong>{info?.modelStatus === 'ready' ? 'Ready' : info?.modelStatus === 'loading' ? 'Loading…' : 'Not loaded'}</strong><span>Local embedding model</span></div></div><div className="card-bottom"><button className="secondary-btn" onClick={loadModel} disabled={info?.modelStatus === 'loading'}><BrainCircuit size={14}/> Load semantic model</button></div></section>
          </div>}
          <div className="bottom-note"><LockKeyhole size={13}/><span>Files are read-only. OpenSearch stores extracted text and embeddings in your local app data folder.</span></div>
        </>}

        {/* VIEW 2: UNIVERSAL PROJECT INTELLIGENCE */}
        {view === 'intelligence' && (
          <div className="page-panel">
            <div className="page-heading">
              <div>
                <div className="eyebrow"><Sparkles size={13}/> UNIVERSAL CONTEXT & REASONING</div>
                <h1>Project Intelligence</h1>
                <p>What am I working on, what matters most, and what should I do next? Select project documents, code, notes, or screenshots for synthesis.</p>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  className="primary-btn"
                  onClick={handleRunIntelligence}
                  disabled={runningIntel || selectedSources.length === 0}
                  title={selectedSources.length === 0 ? "Add at least one file, folder, or indexed library first" : "Analyze selected project context"}
                >
                  <Sparkles size={14}/> {runningIntel ? 'Synthesizing…' : 'Run Intelligence Analysis'}
                </button>
              </div>
            </div>

            {error && <div className="alert error"><X size={16}/><span>{error}</span></div>}
            {notice && <div className="alert notice"><Check size={16}/><span>{notice}</span><button onClick={() => setNotice('')}><X size={14}/></button></div>}

            {/* Analysis Progress Card */}
            {(runningIntel || intelProgress) && (
              <div className="progress-card" style={{ marginBottom: 20, border: '1px solid #3d6c52' }}>
                <div className="progress-top">
                  <div className="spinner-label">
                    <LoaderCircle className="spin" size={17}/>
                    <strong>{intelProgress?.message || 'Analyzing project context...'}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span>{intelProgress?.percent || 0}%</span>
                    <button className="secondary-btn" onClick={handleCancelIntelligence} style={{ padding: '3px 8px', fontSize: 10 }}>Cancel</button>
                  </div>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${Math.max(5, intelProgress?.percent || 10)}%`
                    }}
                  />
                </div>
                <div className="progress-note">
                  Processing locally on your device with Ollama ({modelsData?.activeModel || 'smollm2'}). No data leaves your machine.
                </div>
              </div>
            )}

            <div className="intel-workspace">
              {/* SECTION A: SOURCE SELECTION */}
              <div className="sources-panel">
                <div className="intel-section-title">
                  <h3><FileStack size={16}/> Selected Context Sources ({selectedSources.length})</h3>
                  <div className="sources-action-bar">
                    <button className="secondary-btn" onClick={handleAddFiles} disabled={runningIntel}>
                      <Plus size={13}/> Add Files
                    </button>
                    <button className="secondary-btn" onClick={handleAddFolders} disabled={runningIntel}>
                      <FolderOpen size={13}/> Add Folder
                    </button>
                    <button
                      className="secondary-btn"
                      onClick={handleAddIndexedContent}
                      disabled={runningIntel || selectedSources.some(s => s.isIndexed)}
                    >
                      <BookOpen size={13}/> Add Indexed Library
                    </button>
                    {selectedSources.length > 0 && (
                      <button className="danger-btn" onClick={handleClearSources} disabled={runningIntel} style={{ padding: '6px 10px', fontSize: 10 }}>
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {selectedSources.length > 0 ? (
                  <>
                    <div className="sources-chips-grid">
                      {selectedSources.map(s => (
                        <div className="source-chip" key={s.id} title={s.path}>
                          {s.isFolder ? <Folder size={14} style={{ color: '#bda9ff' }}/> :
                           s.isIndexed ? <BookOpen size={14} style={{ color: '#8ce4b7' }}/> :
                           s.type === 'image' ? <Layers size={14} style={{ color: '#90b8ff' }}/> :
                           s.type === 'pdf' ? <FileText size={14} style={{ color: '#f799aa' }}/> :
                           s.type === 'code' ? <FileCode2 size={14} style={{ color: '#8ce4b7' }}/> :
                           <FileText size={14}/>}
                          <span className="source-chip-name">{s.name}</span>
                          <span className={`source-type-pill ${s.type}`}>{s.type}</span>
                          <span style={{ fontSize: 9, color: '#79859b' }}>{s.sizeFormatted}</span>
                          <button
                            className="chip-remove-btn"
                            onClick={() => handleRemoveSource(s.id)}
                            disabled={runningIntel}
                            title="Remove source"
                          >
                            <X size={12}/>
                          </button>
                        </div>
                      ))}
                    </div>

                    {unsupportedSources.length > 0 && (
                      <div className="source-warning-box">
                        <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }}/>
                        <div>
                          <strong>Unsupported format notices:</strong>
                          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
                            {unsupportedSources.map(s => (
                              <li key={s.id}>
                                <code>{s.name}</code>: {s.warning || 'Format not directly readable'}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="sources-empty-box">
                    <p style={{ margin: 0 }}>
                      No sources selected. Click <strong>Add Files</strong>, <strong>Add Folder</strong>, or <strong>Add Indexed Library</strong> to assemble documents, notes, code, and screenshots for analysis.
                    </p>
                  </div>
                )}
              </div>

              {/* SECTION B: ANALYSIS GOALS */}
              <div>
                <div className="intel-section-title">
                  <h3><Lightbulb size={16}/> Analysis Goal</h3>
                </div>
                <div className="goals-grid">
                  {GOALS.map(g => {
                    const Icon = g.icon;
                    const isActive = intelGoal === g.id;
                    return (
                      <div
                        className={`goal-card ${isActive ? 'active' : ''}`}
                        key={g.id}
                        onClick={() => setIntelGoal(g.id)}
                      >
                        <div className="goal-card-top">
                          <div className="goal-card-icon"><Icon size={16}/></div>
                          <strong className="goal-card-title">{g.title}</strong>
                        </div>
                        <p className="goal-card-desc">{g.desc}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="custom-instructions-wrap">
                  <label>Additional instructions (optional)</label>
                  <textarea
                    value={customInstructions}
                    onChange={e => setCustomInstructions(e.target.value)}
                    placeholder="e.g. Focus on database migration risks and authentication acceptance criteria…"
                    disabled={runningIntel}
                  />
                </div>
              </div>

              {/* SECTION C: RESULTS DISPLAY */}
              {intelResult && (
                <div className="intel-results-wrap">
                  {/* Executive Overview */}
                  <div className="intel-overview-card">
                    <h3><Sparkles size={16}/> Executive Synthesis</h3>
                    <p>{intelResult.overview}</p>
                    <div className="intel-overview-meta">
                      <span>Goal: <strong>{intelResult.goal.replace('_', ' ').toUpperCase()}</strong></span>
                      <span>·</span>
                      <span>Analyzed: <strong>{intelResult.sourcesAnalyzed.successful} sources</strong></span>
                      <span>·</span>
                      <span>Engine: <strong>{intelResult.modelUsed}</strong></span>
                      <span>·</span>
                      <span>Completed: <strong>{new Date(intelResult.completedAt).toLocaleTimeString()}</strong></span>
                    </div>

                    {intelResult.warnings.length > 0 && (
                      <div className="source-warning-box" style={{ marginTop: 14 }}>
                        <AlertCircle size={15} style={{ flexShrink: 0 }}/>
                        <div>
                          {intelResult.warnings.map((w, idx) => (
                            <div key={idx}>{w}</div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Findings Filter Bar */}
                  <div>
                    <div className="intel-section-title">
                      <h3><CheckSquare size={16}/> Intelligence Findings ({intelResult.findings.length})</h3>
                      <div className="memory-tabs">
                        <button
                          className={`memory-tab-btn ${findingFilter === 'all' ? 'active' : ''}`}
                          onClick={() => setFindingFilter('all')}
                        >
                          All <span className="tab-badge">{findingCounts.all}</span>
                        </button>
                        <button
                          className={`memory-tab-btn ${findingFilter === 'task' ? 'active' : ''}`}
                          onClick={() => setFindingFilter('task')}
                        >
                          Tasks <span className="tab-badge blue">{findingCounts.task}</span>
                        </button>
                        <button
                          className={`memory-tab-btn ${findingFilter === 'decision' ? 'active' : ''}`}
                          onClick={() => setFindingFilter('decision')}
                        >
                          Decisions <span className="tab-badge purple">{findingCounts.decision}</span>
                        </button>
                        <button
                          className={`memory-tab-btn ${findingFilter === 'issue' ? 'active' : ''}`}
                          onClick={() => setFindingFilter('issue')}
                        >
                          Issues <span className="tab-badge amber">{findingCounts.issue}</span>
                        </button>
                        <button
                          className={`memory-tab-btn ${findingFilter === 'recommendation' ? 'active' : ''}`}
                          onClick={() => setFindingFilter('recommendation')}
                        >
                          Recommendations <span className="tab-badge green">{findingCounts.recommendation}</span>
                        </button>
                        <button
                          className={`memory-tab-btn ${findingFilter === 'question' ? 'active' : ''}`}
                          onClick={() => setFindingFilter('question')}
                        >
                          Questions <span className="tab-badge">{findingCounts.question}</span>
                        </button>
                      </div>
                    </div>

                    {filteredFindings.length > 0 ? (
                      <div className="memory-list">
                        {filteredFindings.map(f => (
                          <div className={`memory-card ${f.status}`} key={f.id}>
                            <div className="memory-card-header">
                              <div className="memory-badges-left">
                                <span className={`finding-type-pill ${f.type}`}>{f.type}</span>
                                <span className={`evidence-pill ${f.evidenceClassification}`}>
                                  {f.evidenceClassification.replace('_', ' ')}
                                </span>
                                {f.confidence !== undefined && (
                                  <span className="confidence-badge">
                                    {Math.round(f.confidence * 100)}% confidence
                                  </span>
                                )}
                                {f.dueDate && (
                                  <span className="due-badge">
                                    <Calendar size={11}/> Due: {f.dueDate}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="memory-card-body">
                              <div className="memory-title-row">
                                <h3 className="memory-card-title">{f.title}</h3>
                              </div>

                              <p className="memory-card-details">{f.description}</p>
                              {f.reason && (
                                <p style={{ fontSize: 11, color: '#8892a4', margin: '4px 0' }}>
                                  <strong>Impact:</strong> {f.reason}
                                </p>
                              )}

                              {f.sourceExcerpt && (
                                <div className="memory-excerpt-box">
                                  <div className="memory-excerpt-label">Supporting excerpt from source</div>
                                  "{f.sourceExcerpt}"
                                </div>
                              )}

                              <div className="memory-source-row">
                                <button
                                  className="source-file-link"
                                  onClick={() => handleOpenSourceFile(f.sourcePath)}
                                  title="Open original source file"
                                >
                                  <Folder size={12}/> {f.sourceName} <ArrowUpRight size={12}/>
                                </button>
                                <span>{f.sourcePath}</span>
                              </div>
                            </div>

                            <div className="memory-actions">
                              {f.status === 'accepted' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <span className="finding-accepted-pill">
                                    <Check size={12}/> Saved to Tasks & Decisions ({f.targetMemoryType || 'task'})
                                  </span>
                                  <button
                                    className="text-button"
                                    onClick={() => setView('memory')}
                                  >
                                    View in Memory tab <ArrowUpRight size={12}/>
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <button
                                    className="action-btn-confirm"
                                    onClick={() => handleAcceptFinding(f, 'task')}
                                    title="Accept this finding as a confirmed task in Tasks & Decisions"
                                  >
                                    <Check size={13}/> Accept as Task
                                  </button>
                                  <button
                                    className="action-btn-secondary"
                                    onClick={() => handleAcceptFinding(f, 'decision')}
                                    title="Accept this finding as a confirmed decision in Tasks & Decisions"
                                  >
                                    <ShieldCheck size={13}/> Accept as Decision
                                  </button>
                                  <button
                                    className="action-btn-secondary"
                                    onClick={() => handleStartEditFinding(f)}
                                    title="Edit title, details or deadline before accepting"
                                  >
                                    <Edit3 size={12}/> Edit & Accept
                                  </button>
                                  <button
                                    className="action-btn-secondary"
                                    onClick={() => handleDismissFinding(f.id)}
                                    title="Dismiss this finding"
                                  >
                                    <X size={12}/> Dismiss
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-results" style={{ marginTop: 14 }}>
                        <p style={{ margin: 0 }}>No findings in the <strong>{findingFilter}</strong> category.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal for Edit & Accept Finding */}
            {editingFinding && (
              <div className="modal-overlay" onClick={() => setEditingFinding(null)}>
                <div className="modal-dialog" onClick={e => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3>Edit & Accept Finding</h3>
                    <button className="icon-btn" onClick={() => setEditingFinding(null)}><X size={16}/></button>
                  </div>

                  <div className="modal-form-group">
                    <label>Save into Tasks & Decisions as</label>
                    <select
                      className="modal-select"
                      value={editFindingForm.targetType}
                      onChange={e => setEditFindingForm({ ...editFindingForm, targetType: e.target.value as 'task' | 'decision' })}
                    >
                      <option value="task">Confirmed Task (Actionable work)</option>
                      <option value="decision">Confirmed Decision (Architectural/design choice)</option>
                    </select>
                  </div>

                  <div className="modal-form-group">
                    <label>Title</label>
                    <input
                      className="modal-input"
                      value={editFindingForm.title}
                      onChange={e => setEditFindingForm({ ...editFindingForm, title: e.target.value })}
                      placeholder="Title"
                      autoFocus
                    />
                  </div>

                  <div className="modal-form-group">
                    <label>Details / Description</label>
                    <textarea
                      className="modal-textarea"
                      value={editFindingForm.details}
                      onChange={e => setEditFindingForm({ ...editFindingForm, details: e.target.value })}
                      placeholder="Details"
                    />
                  </div>

                  {editFindingForm.targetType === 'task' && (
                    <div className="modal-form-group">
                      <label>Due Date / Deadline (optional)</label>
                      <input
                        className="modal-input"
                        value={editFindingForm.dueDate}
                        onChange={e => setEditFindingForm({ ...editFindingForm, dueDate: e.target.value })}
                        placeholder="e.g. 2026-11-01 or Before Friday"
                      />
                    </div>
                  )}

                  <div className="modal-footer">
                    <button className="secondary-btn" onClick={() => setEditingFinding(null)}>
                      Cancel
                    </button>
                    <button className="primary-btn" onClick={handleSaveEditFinding}>
                      <Check size={14}/> Save to Tasks & Decisions
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 3: DECISION & TASK MEMORY VIEW */}
        {view === 'memory' && (
          <div className="page-panel">
            <div className="page-heading">
              <div>
                <div className="eyebrow"><Sparkles size={13}/> PERSONAL KNOWLEDGE ENGINE</div>
                <h1>Decision & Task Memory</h1>
                <p>Discover unfinished work and important decisions grounded in your indexed local notes, markdown files, and source code.</p>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  className="primary-btn"
                  onClick={handleExtractMemory}
                  disabled={extractingMemory || busy || !info?.indexedChunks}
                  title={!info?.indexedChunks ? "Index at least one folder first" : "Scan indexed files to discover tasks and decisions"}
                >
                  <Sparkles size={14}/> {extractingMemory ? 'Scanning…' : 'Find tasks & decisions'}
                </button>
                <button className="secondary-btn" onClick={handleStartCreate}>
                  <Plus size={14}/> New item
                </button>
              </div>
            </div>

            {error && <div className="alert error"><X size={16}/><span>{error}</span></div>}
            {notice && <div className="alert notice"><Check size={16}/><span>{notice}</span><button onClick={() => setNotice('')}><X size={14}/></button></div>}

            {/* Extraction Progress Card */}
            {(extractingMemory || extractProgress) && (
              <div className="progress-card" style={{ marginBottom: 20, border: '1px solid #3d6c52' }}>
                <div className="progress-top">
                  <div className="spinner-label">
                    <LoaderCircle className="spin" size={17}/>
                    <strong>{extractProgress?.message || 'Analyzing indexed documents for tasks and decisions...'}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span>{extractProgress ? `${extractProgress.currentChunk}/${extractProgress.totalChunks}` : ''} passages</span>
                    <button className="secondary-btn" onClick={handleCancelExtract} style={{ padding: '3px 8px', fontSize: 10 }}>Cancel</button>
                  </div>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${extractProgress?.totalChunks ? Math.min(100, Math.round((extractProgress.currentChunk / extractProgress.totalChunks) * 100)) : 10}%`
                    }}
                  />
                </div>
                <div className="progress-note">
                  {extractProgress?.newCount ? `${extractProgress.newCount} new candidate tasks/decisions found so far. ` : ''}
                  Runs locally on your device without sending documents externally.
                </div>
              </div>
            )}

            {/* Filters and search bar */}
            <div className="memory-filter-bar">
              <div className="memory-tabs">
                <button
                  className={`memory-tab-btn ${memoryFilter === 'suggested' ? 'active' : ''}`}
                  onClick={() => setMemoryFilter('suggested')}
                >
                  Suggestions <span className="tab-badge amber">{suggestedCount}</span>
                </button>
                <button
                  className={`memory-tab-btn ${memoryFilter === 'open' ? 'active' : ''}`}
                  onClick={() => setMemoryFilter('open')}
                >
                  Open Tasks <span className="tab-badge blue">{openTasksCount}</span>
                </button>
                <button
                  className={`memory-tab-btn ${memoryFilter === 'decisions' ? 'active' : ''}`}
                  onClick={() => setMemoryFilter('decisions')}
                >
                  Decisions <span className="tab-badge purple">{decisionsCount}</span>
                </button>
                <button
                  className={`memory-tab-btn ${memoryFilter === 'completed' ? 'active' : ''}`}
                  onClick={() => setMemoryFilter('completed')}
                >
                  Completed <span className="tab-badge green">{completedCount}</span>
                </button>
                <button
                  className={`memory-tab-btn ${memoryFilter === 'dismissed' ? 'active' : ''}`}
                  onClick={() => setMemoryFilter('dismissed')}
                >
                  Dismissed <span className="tab-badge">{dismissedCount}</span>
                </button>
                <button
                  className={`memory-tab-btn ${memoryFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setMemoryFilter('all')}
                >
                  All <span className="tab-badge">{memoryItems.length}</span>
                </button>
              </div>

              <input
                className="memory-search-input"
                value={memorySearch}
                onChange={e => setMemorySearch(e.target.value)}
                placeholder="Filter tasks, decisions, sources…"
              />
            </div>

            {/* Items List */}
            {filteredMemories.length > 0 ? (
              <div className="memory-list">
                {filteredMemories.map(item => (
                  <div className={`memory-card ${item.status}`} key={item.id}>
                    <div className="memory-card-header">
                      <div className="memory-badges-left">
                        <span className={`type-badge ${item.type}`}>{item.type.toUpperCase()}</span>
                        <span className={`status-pill ${item.status}`}>{item.status.toUpperCase()}</span>
                        {item.confidence !== undefined && (
                          <span className="confidence-badge" title={item.confidenceReason || 'Confidence based on source grounding'}>
                            {Math.round(item.confidence * 100)}% confidence
                          </span>
                        )}
                        {item.dueDate && (
                          <span className="due-badge">
                            <Calendar size={11}/> Due: {item.dueDate}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="memory-card-body">
                      <div className="memory-title-row">
                        <h3 className="memory-card-title">{item.title}</h3>
                      </div>

                      {item.details && (
                        <p className="memory-card-details">{item.details}</p>
                      )}

                      {item.sourceExcerpt && (
                        <div className="memory-excerpt-box">
                          <div className="memory-excerpt-label">Supporting excerpt from source</div>
                          "{item.sourceExcerpt}"
                        </div>
                      )}

                      <div className="memory-source-row">
                        <button
                          className="source-file-link"
                          onClick={() => handleOpenSourceFile(item.sourcePath)}
                          title="Click to open source file"
                        >
                          <Folder size={12}/> {item.relativePath || item.sourcePath} <ArrowUpRight size={12}/>
                        </button>
                        <span>{new Date(item.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="memory-actions">
                      {item.status === 'suggested' && (
                        <>
                          <button
                            className="action-btn-confirm"
                            onClick={() => handleConfirmMemory(item.id)}
                            title="Confirm this item into active memory"
                          >
                            <Check size={13}/> Confirm {item.type === 'task' ? 'Task' : 'Decision'}
                          </button>
                          <button
                            className="action-btn-secondary"
                            onClick={() => handleStartEdit(item)}
                            title="Edit details before confirming"
                          >
                            <Edit3 size={12}/> Edit & Confirm
                          </button>
                          <button
                            className="action-btn-secondary"
                            onClick={() => handleDismissMemory(item.id)}
                            title="Dismiss suggestion (will not be re-suggested)"
                          >
                            <X size={12}/> Dismiss
                          </button>
                        </>
                      )}

                      {item.status === 'open' && (
                        <>
                          {item.type === 'task' && (
                            <button
                              className="action-btn-confirm"
                              onClick={() => handleCompleteMemory(item.id)}
                              title="Mark task as completed"
                            >
                              <Check size={13}/> Mark Completed
                            </button>
                          )}
                          <button
                            className="action-btn-secondary"
                            onClick={() => handleStartEdit(item)}
                            title="Edit title, details, or deadline"
                          >
                            <Edit3 size={12}/> Edit
                          </button>
                          <button
                            className="action-btn-secondary"
                            onClick={() => handleDismissMemory(item.id)}
                            title="Archive / dismiss this item"
                          >
                            <X size={12}/> {item.type === 'task' ? 'Dismiss' : 'Archive'}
                          </button>
                        </>
                      )}

                      {item.status === 'completed' && (
                        <>
                          <button
                            className="action-btn-secondary"
                            onClick={() => handleReopenMemory(item.id)}
                            title="Reopen task"
                          >
                            <RotateCcw size={12}/> Reopen Task
                          </button>
                          <button
                            className="icon-btn-danger"
                            onClick={() => handleDeleteMemory(item.id)}
                            title="Delete permanently"
                          >
                            <Trash2 size={13}/>
                          </button>
                        </>
                      )}

                      {item.status === 'dismissed' && (
                        <>
                          <button
                            className="action-btn-secondary"
                            onClick={() => handleReopenMemory(item.id)}
                            title="Restore item to open state"
                          >
                            <RotateCcw size={12}/> Restore
                          </button>
                          <button
                            className="icon-btn-danger"
                            onClick={() => handleDeleteMemory(item.id)}
                            title="Delete permanently"
                          >
                            <Trash2 size={13}/>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-results" style={{ marginTop: 24 }}>
                <div className="empty-icon">
                  {memoryFilter === 'suggested' ? <Sparkles size={23}/> : <ListTodo size={23}/>}
                </div>
                <h3>
                  {memoryFilter === 'suggested' && 'No suggestions awaiting review'}
                  {memoryFilter === 'open' && 'No open tasks'}
                  {memoryFilter === 'decisions' && 'No confirmed decisions'}
                  {memoryFilter === 'completed' && 'No completed tasks'}
                  {memoryFilter === 'dismissed' && 'No dismissed items'}
                  {memoryFilter === 'all' && 'No memory items found'}
                </h3>
                <p>
                  {memoryFilter === 'suggested' && 'Scan your indexed project notes, Markdown files, and code to discover candidate tasks and architectural decisions.'}
                  {memoryFilter === 'open' && 'Review suggested tasks above, or create a new task manually.'}
                  {memoryFilter === 'decisions' && 'Review suggested architectural choices or record a decision manually.'}
                  {(memoryFilter === 'completed' || memoryFilter === 'dismissed' || memoryFilter === 'all') && 'Try changing your filter tab or search query.'}
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="primary-btn"
                    onClick={handleExtractMemory}
                    disabled={extractingMemory || busy || !info?.indexedChunks}
                  >
                    <Sparkles size={14}/> {extractingMemory ? 'Scanning…' : 'Find tasks & decisions'}
                  </button>
                  <button className="secondary-btn" onClick={handleStartCreate}>
                    <Plus size={14}/> New item
                  </button>
                </div>
              </div>
            )}

            {/* Modal for Edit or Manual Create */}
            {(editingItem || creatingItem) && (
              <div className="modal-overlay" onClick={() => { setEditingItem(null); setCreatingItem(false); }}>
                <div className="modal-dialog" onClick={e => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3>{editingItem ? 'Edit Task or Decision' : 'Create New Task or Decision'}</h3>
                    <button className="icon-btn" onClick={() => { setEditingItem(null); setCreatingItem(false); }}><X size={16}/></button>
                  </div>

                  <div className="modal-form-group">
                    <label>Type</label>
                    <select
                      className="modal-select"
                      value={modalForm.type}
                      onChange={e => setModalForm({ ...modalForm, type: e.target.value as MemoryType })}
                    >
                      <option value="task">Task (Actionable todo or unfinished work)</option>
                      <option value="decision">Decision (Architectural, technical, or design choice)</option>
                    </select>
                  </div>

                  <div className="modal-form-group">
                    <label>Title</label>
                    <input
                      className="modal-input"
                      value={modalForm.title}
                      onChange={e => setModalForm({ ...modalForm, title: e.target.value })}
                      placeholder="e.g. Finish the authentication flow before Friday"
                      autoFocus
                    />
                  </div>

                  <div className="modal-form-group">
                    <label>Details / Rationale (optional)</label>
                    <textarea
                      className="modal-textarea"
                      value={modalForm.details}
                      onChange={e => setModalForm({ ...modalForm, details: e.target.value })}
                      placeholder="Add supporting context, rationale, or instructions…"
                    />
                  </div>

                  {modalForm.type === 'task' && (
                    <div className="modal-form-group">
                      <label>Due Date / Deadline (optional)</label>
                      <input
                        className="modal-input"
                        value={modalForm.dueDate}
                        onChange={e => setModalForm({ ...modalForm, dueDate: e.target.value })}
                        placeholder="e.g. Before Friday, or 2026-11-01"
                      />
                    </div>
                  )}

                  <div className="modal-footer">
                    <button className="secondary-btn" onClick={() => { setEditingItem(null); setCreatingItem(false); }}>
                      Cancel
                    </button>
                    <button className="primary-btn" onClick={handleSaveModal}>
                      <Check size={14}/> {editingItem ? 'Save Changes' : 'Create Item'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW 4: LIBRARY VIEW */}
        {view === 'library' && <div className="page-panel"><div className="page-heading"><div><div className="eyebrow">YOUR SOURCES</div><h1>Indexed library</h1><p>Folders currently included in your local memory index.</p></div><button className="primary-btn" onClick={chooseAndIndex} disabled={busy}><Plus size={15}/> Add folders</button></div><div className="library-stats"><div><span>Indexed files</span><strong>{info?.status?.files || 0}</strong></div><div><span>Passages</span><strong>{info?.indexedChunks || 0}</strong></div><div><span>Folders</span><strong>{info?.roots?.length || 0}</strong></div></div><div className="source-list">{info?.roots?.length ? info.roots.map((r: string) => <div className="source-row" key={r}><div className="source-folder"><Folder size={17}/></div><div className="source-info"><strong>{r.split(/[\\/]/).filter(Boolean).pop()}</strong><span>{r}</span></div><span className="source-state"><span className="green-dot"/> Indexed</span></div>) : <div className="empty-results"><div className="empty-icon"><FolderOpen size={23}/></div><h3>No folders indexed</h3><p>Choose a folder to begin building your local memory.</p><button className="primary-btn" onClick={chooseAndIndex}><Plus size={15}/> Choose folders</button></div>}</div><div className="danger-zone"><div><strong>Clear local index</strong><p>Removes extracted text and embeddings. Original files remain untouched.</p></div><button className="danger-btn" onClick={clearIndex}><Trash2 size={14}/> Clear index</button></div></div>}

        {/* VIEW 5: SETTINGS VIEW */}
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
