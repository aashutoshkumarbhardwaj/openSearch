import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertCircle, ArrowDownToLine, ArrowUpRight, BookOpen, Bot,
  Braces, BrainCircuit, Calendar, CalendarDays, Check, CheckCheck, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, CircleHelp,
  ClipboardList, Clock, Command, Copy, Cpu, Download, Edit3, FileCode2, FileStack, FileText, Flame, Folder,
  FolderOpen, Gauge, HardDrive, HelpCircle, History, Keyboard, Layers, Lightbulb, Link,
  ListTodo, LoaderCircle, LockKeyhole, Pause, Pin, Play, Plus, RefreshCw, RotateCcw, Save, Search,
  Settings2, Share2, ShieldCheck, Sparkles, Square, Tag, Terminal, Timer, Trash2, Volume2, VolumeX, X
} from 'lucide-react';
import type {
  MemoryItem, MemoryStatus, MemoryType, ExtractionProgress, MemorySearchResult,
  SourceItem, AnalysisGoal, Finding, FindingType, IntelligenceAnalysisResult,
  IntelligenceProgress, ClipboardItem, ClipboardSettings, ClipboardContentType,
  ClipboardSearchResult, DailyBriefing, BriefingFocusItem, BriefingTaskItem,
  BriefingDecisionItem, BriefingActivityItem, BriefingSettings, BriefingScope,
  ActionPlan, ActionPlanPhase, ActionPlanTask
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
  const [view, setView] = useState<'briefing' | 'search' | 'clipboard' | 'intelligence' | 'memory' | 'library' | 'settings'>('search');
  const [filter, setFilter] = useState<'all' | 'code' | 'docs'>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const clipboardInputRef = useRef<HTMLInputElement>(null);

  // Daily Memory Briefing State
  const [todayBriefing, setTodayBriefing] = useState<DailyBriefing | null>(null);
  const [activeBriefing, setActiveBriefing] = useState<DailyBriefing | null>(null);
  const [briefingHistory, setBriefingHistory] = useState<DailyBriefing[]>([]);
  const [briefingSettings, setBriefingSettings] = useState<BriefingSettings | null>(null);
  const [briefingActivity, setBriefingActivity] = useState<BriefingActivityItem[]>([]);
  const [loadingBriefing, setLoadingBriefing] = useState(false);
  const [generatingBriefing, setGeneratingBriefing] = useState(false);
  const [briefingScope, setBriefingScope] = useState<string>('all');
  const [briefingError, setBriefingError] = useState<string>('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [audioPlaybackRate, setAudioPlaybackRate] = useState<number>(1.0);
  const [audioProgressText, setAudioProgressText] = useState<string>('');
  const [activeFocusSession, setActiveFocusSession] = useState<{
    taskTitle: string;
    sourcePath?: string;
    totalSeconds: number;
    secondsLeft: number;
    isRunning: boolean;
  } | null>(null);
  const [dailyIntent, setDailyIntent] = useState<string>('');
  const [briefingTab, setBriefingTab] = useState<'overview' | 'deadlines' | 'focus' | 'decisions' | 'activity'>('overview');

  // Searchable Clipboard Memory State
  const [clipboardSettings, setClipboardSettings] = useState<ClipboardSettings | null>(null);
  const [clipboardItems, setClipboardItems] = useState<ClipboardItem[]>([]);
  const [clipboardQuery, setClipboardQuery] = useState('');
  const [clipboardFilter, setClipboardFilter] = useState<'all' | 'pinned' | 'code' | 'command' | 'url' | 'text' | 'json'>('all');
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);
  const [editingLabelItem, setEditingLabelItem] = useState<ClipboardItem | null>(null);
  const [labelInput, setLabelInput] = useState('');
  const [confirmClearModal, setConfirmClearModal] = useState(false);
  const [preservePinnedOnClear, setPreservePinnedOnClear] = useState(true);
  const [loadingClipboard, setLoadingClipboard] = useState(false);
  const [expandedSnippetIds, setExpandedSnippetIds] = useState<Set<string>>(new Set());

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

  // Scope, Subview, Calendar & Action Plan State
  const [memoryScopePaths, setMemoryScopePaths] = useState<string[]>([]);
  const [memorySubView, setMemorySubView] = useState<'list' | 'calendar' | 'timeline' | 'plan'>('list');
  const [actionPlans, setActionPlans] = useState<ActionPlan[]>([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [calendarNewTaskInput, setCalendarNewTaskInput] = useState<string>('');
  const [activePlanNotes, setActivePlanNotes] = useState<string>('');
  const [generatingPlan, setGeneratingPlan] = useState<boolean>(false);

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

  const refreshClipboardSettings = useCallback(async () => {
    try {
      if (window.recallDesk?.getClipboardSettings) {
        const s = await window.recallDesk.getClipboardSettings();
        setClipboardSettings(s);
      }
    } catch (e) {
      console.error('Failed to load clipboard settings:', e);
    }
  }, []);

  const refreshClipboardItems = useCallback(async () => {
    try {
      setLoadingClipboard(true);
      if (window.recallDesk?.listClipboardItems) {
        const items = await window.recallDesk.listClipboardItems();
        setClipboardItems(items);
      }
    } catch (e) {
      console.error('Failed to list clipboard items:', e);
    } finally {
      setLoadingClipboard(false);
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

  const loadBriefingData = useCallback(async (scope = briefingScope) => {
    try {
      setLoadingBriefing(true);
      if (window.recallDesk?.getBriefingSettings) {
        const s = await window.recallDesk.getBriefingSettings();
        setBriefingSettings(s);
      }
      if (window.recallDesk?.getTodayBriefing) {
        const today = await window.recallDesk.getTodayBriefing(scope);
        setTodayBriefing(today);
        setActiveBriefing(today);
      }
      if (window.recallDesk?.listBriefingHistory) {
        const history = await window.recallDesk.listBriefingHistory(30);
        setBriefingHistory(history);
      }
      if (window.recallDesk?.getBriefingActivityLog) {
        const act = await window.recallDesk.getBriefingActivityLog(15, scope);
        setBriefingActivity(act);
      }
    } catch (e: any) {
      console.warn('Failed to load briefing data:', e);
    } finally {
      setLoadingBriefing(false);
    }
  }, [briefingScope]);

  const handleGenerateBriefing = async (force = false) => {
    try {
      setGeneratingBriefing(true);
      setBriefingError('');
      if (window.recallDesk?.generateBriefing) {
        const briefing = await window.recallDesk.generateBriefing({
          scope: briefingScope,
          includeClipboard: briefingSettings?.includeClipboard || false,
          forceRegenerate: force
        });
        setTodayBriefing(briefing);
        setActiveBriefing(briefing);
        const [hist, act] = await Promise.all([
          window.recallDesk.listBriefingHistory(30),
          window.recallDesk.getBriefingActivityLog(15, briefingScope)
        ]);
        setBriefingHistory(hist);
        setBriefingActivity(act);
        setNotice(force ? "Regenerated today's briefing." : "Daily memory briefing generated.");
      }
    } catch (e: any) {
      setBriefingError(e?.message || 'Failed to generate briefing.');
    } finally {
      setGeneratingBriefing(false);
    }
  };

  const handleDeleteBriefing = async (id: string) => {
    if (!confirm('Delete this daily briefing from history? (Original tasks, decisions, and files are never touched.)')) return;
    try {
      if (window.recallDesk?.deleteBriefing) {
        await window.recallDesk.deleteBriefing(id);
        const hist = await window.recallDesk.listBriefingHistory(30);
        setBriefingHistory(hist);
        if (activeBriefing?.id === id) {
          const todayDate = new Date().toISOString().slice(0, 10);
          const next = hist.find(b => b.date === todayDate) || hist[0] || null;
          setActiveBriefing(next);
        }
        setNotice('Saved briefing removed from history.');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to delete briefing.');
    }
  };

  const handleUpdateBriefingSettings = async (updates: Partial<BriefingSettings>) => {
    try {
      if (window.recallDesk?.updateBriefingSettings) {
        const updated = await window.recallDesk.updateBriefingSettings(updates);
        setBriefingSettings(updated);
        setNotice('Briefing preferences saved.');
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to update briefing settings.');
    }
  };

  const handleCompleteTaskFromBriefing = async (taskId: string) => {
    try {
      if (window.recallDesk?.completeMemory) {
        await window.recallDesk.completeMemory(taskId);
        setNotice('Task marked as completed.');
        await refreshMemory();
        await loadBriefingData();
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to complete task.');
    }
  };

  const handleSaveDailyIntent = (text: string) => {
    setDailyIntent(text);
    if (activeBriefing?.id) {
      localStorage.setItem(`daily-intent-${activeBriefing.id}`, text);
    }
  };

  useEffect(() => {
    if (activeBriefing?.id) {
      const saved = localStorage.getItem(`daily-intent-${activeBriefing.id}`) || '';
      setDailyIntent(saved);
    }
  }, [activeBriefing?.id]);

  const stopAudioBriefing = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlayingAudio(false);
    setAudioProgressText('');
  }, []);

  const playAudioBriefing = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setError('Audio speech readout is not supported on this device.');
      return;
    }
    if (!activeBriefing) return;

    window.speechSynthesis.cancel();

    const scriptParts: string[] = [];
    scriptParts.push(`Here is your daily memory briefing for ${activeBriefing.scopeName}.`);
    scriptParts.push(activeBriefing.summary);

    if (activeBriefing.focusItems.length > 0) {
      scriptParts.push(`Top recommended priorities for today:`);
      activeBriefing.focusItems.forEach((f, idx) => {
        scriptParts.push(`Priority ${idx + 1}: ${f.title}. ${f.rationale}.`);
      });
    }

    const urgentDeadlines = activeBriefing.openTasks.filter(t => Boolean(t.dueDate));
    if (urgentDeadlines.length > 0) {
      scriptParts.push(`Recorded deadlines:`);
      urgentDeadlines.slice(0, 3).forEach(t => {
        scriptParts.push(`${t.title}, scheduled for ${t.dueDate}.`);
      });
    }

    if (activeBriefing.keyDecisions.length > 0) {
      scriptParts.push(`Key active decision: ${activeBriefing.keyDecisions[0].title}.`);
    }

    const fullScript = scriptParts.join(' ');
    const utterance = new SpeechSynthesisUtterance(fullScript);
    utterance.rate = audioPlaybackRate;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      setIsPlayingAudio(true);
      setAudioProgressText('Voice briefing playing…');
    };

    utterance.onend = () => {
      setIsPlayingAudio(false);
      setAudioProgressText('');
    };

    utterance.onerror = (e) => {
      console.warn('Speech synthesis error:', e);
      setIsPlayingAudio(false);
      setAudioProgressText('');
    };

    window.speechSynthesis.speak(utterance);
  }, [activeBriefing, audioPlaybackRate]);

  const startFocusSession = useCallback((taskTitle: string, sourcePath?: string) => {
    setActiveFocusSession({
      taskTitle,
      sourcePath,
      totalSeconds: 1500, // 25 min Pomodoro
      secondsLeft: 1500,
      isRunning: true
    });
    setNotice(`Focus session started for: "${taskTitle}". 25-minute timer running.`);
  }, []);

  const toggleFocusSession = useCallback(() => {
    setActiveFocusSession(prev => prev ? { ...prev, isRunning: !prev.isRunning } : null);
  }, []);

  const resetFocusSession = useCallback(() => {
    setActiveFocusSession(prev => prev ? { ...prev, secondsLeft: prev.totalSeconds, isRunning: false } : null);
  }, []);

  const closeFocusSession = useCallback(() => {
    setActiveFocusSession(null);
  }, []);

  useEffect(() => {
    if (!activeFocusSession || !activeFocusSession.isRunning) return;
    const interval = setInterval(() => {
      setActiveFocusSession(prev => {
        if (!prev || !prev.isRunning) return prev;
        if (prev.secondsLeft <= 1) {
          setNotice(`Focus session complete for "${prev.taskTitle}"! Great work.`);
          return { ...prev, secondsLeft: 0, isRunning: false };
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeFocusSession?.isRunning]);

  const handleCopyStandup = useCallback(() => {
    if (!activeBriefing) return;
    const lines: string[] = [];
    lines.push(`📋 *Daily Standup Update — ${activeBriefing.date}* (${activeBriefing.scopeName})`);
    lines.push(`\n*Summary:* ${activeBriefing.summary}`);

    if (activeBriefing.focusItems.length > 0) {
      lines.push(`\n🎯 *Today's Focus Priorities:*`);
      activeBriefing.focusItems.forEach(f => {
        lines.push(`• [${f.priority.toUpperCase()}] ${f.title} — ${f.rationale}`);
      });
    }

    const deadlines = activeBriefing.openTasks.filter(t => Boolean(t.dueDate));
    if (deadlines.length > 0) {
      lines.push(`\n⏳ *Imminent Deadlines:*`);
      deadlines.forEach(t => {
        lines.push(`• ${t.title} (Due: ${t.dueDate})`);
      });
    }

    if (activeBriefing.completedRecently.length > 0) {
      lines.push(`\n✅ *Recently Completed:*`);
      activeBriefing.completedRecently.forEach(c => {
        lines.push(`• ${c.title}`);
      });
    }

    if (activeBriefing.keyDecisions.length > 0) {
      lines.push(`\n💡 *Active Architectural Decisions:*`);
      activeBriefing.keyDecisions.forEach(d => {
        lines.push(`• ${d.title}`);
      });
    }

    const payload = lines.join('\n');
    navigator.clipboard.writeText(payload);
    setNotice('Standup update copied to clipboard in Markdown format!');
  }, [activeBriefing]);

  const readinessMetrics = useMemo(() => {
    if (!activeBriefing) {
      return {
        score: 0,
        label: 'No Data',
        overdueCount: 0,
        dueTodayCount: 0,
        completedCount: 0,
        activeTasksCount: 0
      };
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    const overdueCount = activeBriefing.openTasks.filter(t => t.dueDate && t.dueDate < todayStr).length;
    const dueTodayCount = activeBriefing.openTasks.filter(t => t.dueDate && t.dueDate === todayStr).length;
    const completedCount = activeBriefing.completedRecently.length;
    const activeTasksCount = activeBriefing.openTasks.length;

    let base = 65;
    if (completedCount > 0) base += Math.min(25, completedCount * 8);
    if (overdueCount > 0) base -= overdueCount * 12;
    if (dueTodayCount > 0) base -= dueTodayCount * 5;
    if (activeTasksCount > 0) base += 5;
    if (activeBriefing.recentActivity.length > 0) base += 5;

    const score = Math.max(15, Math.min(100, Math.round(base)));
    const label = score >= 80 ? 'Peak Velocity' : score >= 60 ? 'Steady Progress' : 'Action Required';

    return {
      score,
      label,
      overdueCount,
      dueTodayCount,
      completedCount,
      activeTasksCount
    };
  }, [activeBriefing]);

  useEffect(() => {
    if (!window.recallDesk) {
      setError("Desktop API (preload) was not detected. Please verify Electron preload initialization.");
      return;
    }
    refreshInfo();
    refreshModels();
    refreshMemory();
    refreshClipboardSettings();
    refreshClipboardItems();
    loadBriefingData();
    loadActionPlans();

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
    const offClipboardCaptured = window.recallDesk.onClipboardItemCaptured?.(({ item }) => {
      setClipboardItems(prev => {
        const idx = prev.findIndex(i => i.id === item.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = item;
          return next;
        }
        return [item, ...prev];
      });
    });
    const offFocusClipboard = window.recallDesk.onFocusClipboard?.(() => {
      setView('clipboard');
      setTimeout(() => clipboardInputRef.current?.focus(), 50);
    });
    const offBriefing = window.recallDesk.onNavigateBriefing?.(() => {
      setView('briefing');
      loadBriefingData();
    });

    return () => {
      offProgress?.();
      offModel?.();
      offFocus?.();
      offPull?.();
      offExtract?.();
      offIntel?.();
      offClipboardCaptured?.();
      offFocusClipboard?.();
      offBriefing?.();
    };
  }, [refreshInfo, refreshModels, refreshMemory, refreshClipboardSettings, refreshClipboardItems, loadBriefingData]);

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

  // Action Plans & Targeted Memory Scope Handlers
  const loadActionPlans = useCallback(async () => {
    try {
      if (window.recallDesk?.listActionPlans) {
        const plans = await window.recallDesk.listActionPlans();
        setActionPlans(plans);
        if (plans.length > 0 && !activePlanId) {
          setActivePlanId(plans[0].id);
          setActivePlanNotes(plans[0].rawNotes);
        }
      }
    } catch (e) {
      console.warn('Failed to load action plans:', e);
    }
  }, [activePlanId]);

  const handleChooseMemoryFiles = async () => {
    try {
      if (window.recallDesk?.chooseMemoryFiles) {
        const files = await window.recallDesk.chooseMemoryFiles();
        if (files && files.length > 0) {
          setMemoryScopePaths(prev => Array.from(new Set([...prev, ...files])));
          setNotice(`Target scope updated with ${files.length} selected file(s).`);
        }
      }
    } catch (e: any) {
      setError(`Failed to select files: ${e.message || String(e)}`);
    }
  };

  const handleChooseMemoryFolders = async () => {
    try {
      if (window.recallDesk?.chooseMemoryFolders) {
        const folders = await window.recallDesk.chooseMemoryFolders();
        if (folders && folders.length > 0) {
          setMemoryScopePaths(prev => Array.from(new Set([...prev, ...folders])));
          setNotice(`Target scope updated with ${folders.length} selected folder(s).`);
        }
      }
    } catch (e: any) {
      setError(`Failed to select folders: ${e.message || String(e)}`);
    }
  };

  const handleRemoveMemoryScopePath = (p: string) => {
    setMemoryScopePaths(prev => prev.filter(x => x !== p));
  };

  const handleClearMemoryScope = () => {
    setMemoryScopePaths([]);
    setNotice('Scope reset to all indexed library files.');
  };

  const handleGenerateActionPlan = async (filePath?: string) => {
    let target = filePath;
    if (!target) {
      if (memoryScopePaths.length > 0) {
        target = memoryScopePaths[0];
      } else {
        const files = await window.recallDesk.chooseMemoryFiles();
        if (!files || !files.length) return;
        target = files[0];
      }
    }
    if (!target) return;

    try {
      setGeneratingPlan(true);
      setError('');
      setNotice(`Analyzing "${target.split(/[/\\]/).pop()}" and generating action plan with timeline & tick marks...`);
      const plan = await window.recallDesk.generateActionPlan(target);
      await loadActionPlans();
      await refreshMemory();
      setActivePlanId(plan.id);
      setActivePlanNotes(plan.rawNotes);
      setMemorySubView('plan');
      setNotice(`Generated Action Plan: "${plan.title}" with ${plan.phases.flatMap(p => p.tasks).length} actionable steps.`);
    } catch (e: any) {
      setError(`Plan generation failed: ${e.message || String(e)}`);
    } finally {
      setGeneratingPlan(false);
    }
  };

  const handleTogglePlanStep = async (planId: string, taskId: string, completed: boolean) => {
    try {
      const updated = await window.recallDesk.toggleActionPlanStep({ planId, taskId, completed });
      if (updated) {
        setActionPlans(prev => prev.map(p => p.id === planId ? updated : p));
        await refreshMemory();
      }
    } catch (e: any) {
      setError(`Failed to update step: ${e.message || String(e)}`);
    }
  };

  const handleSavePlanNotes = async (planId: string) => {
    try {
      const updated = await window.recallDesk.saveActionPlanNotes({ planId, notes: activePlanNotes });
      if (updated) {
        setActionPlans(prev => prev.map(p => p.id === planId ? updated : p));
        setNotice('Action plan notes saved.');
      }
    } catch (e: any) {
      setError(`Failed to save notes: ${e.message || String(e)}`);
    }
  };

  const handleDeletePlan = async (planId: string) => {
    if (!confirm('Delete this action plan from memory? (Tasks already tracked in memory remain).')) return;
    try {
      await window.recallDesk.deleteActionPlan(planId);
      const remaining = actionPlans.filter(p => p.id !== planId);
      setActionPlans(remaining);
      if (activePlanId === planId) {
        setActivePlanId(remaining[0]?.id || null);
        setActivePlanNotes(remaining[0]?.rawNotes || '');
      }
      setNotice('Action plan deleted.');
    } catch (e: any) {
      setError(`Failed to delete plan: ${e.message || String(e)}`);
    }
  };

  const calendarMonthYearStr = useMemo(() => {
    return calendarDate.toLocaleDateString([], { month: 'long', year: 'numeric' });
  }, [calendarDate]);

  const calendarDays = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const todayStr = new Date().toISOString().slice(0, 10);
    const cells: Array<{
      dayNum: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      tasks: MemoryItem[];
    }> = [];

    // Prev month days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevDate = new Date(year, month - 1, d);
      const dateStr = prevDate.toISOString().slice(0, 10);
      cells.push({
        dayNum: d,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        tasks: memoryItems.filter(m => m.type === 'task' && m.dueDate && m.dueDate.includes(dateStr))
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const curDate = new Date(year, month, d);
      const dateStr = curDate.toISOString().slice(0, 10);
      cells.push({
        dayNum: d,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        tasks: memoryItems.filter(m => m.type === 'task' && m.dueDate && m.dueDate.includes(dateStr))
      });
    }

    // Next month padding to complete weeks
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(year, month + 1, d);
      const dateStr = nextDate.toISOString().slice(0, 10);
      cells.push({
        dayNum: d,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        tasks: memoryItems.filter(m => m.type === 'task' && m.dueDate && m.dueDate.includes(dateStr))
      });
    }

    return cells;
  }, [calendarDate, memoryItems]);

  const selectedDateTasks = useMemo(() => {
    return memoryItems.filter(m => m.type === 'task' && m.dueDate && m.dueDate.includes(selectedCalendarDate));
  }, [memoryItems, selectedCalendarDate]);

  const handleQuickAddCalendarTask = async () => {
    const title = calendarNewTaskInput.trim();
    if (!title) return;
    try {
      await window.recallDesk.createMemory({
        type: 'task',
        title,
        dueDate: selectedCalendarDate,
        status: 'open'
      });
      setCalendarNewTaskInput('');
      await refreshMemory();
      setNotice(`Scheduled task for ${selectedCalendarDate}`);
    } catch (e: any) {
      setError(`Failed to add task: ${e.message || String(e)}`);
    }
  };

  const timelineData = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const weekAhead = new Date();
    weekAhead.setDate(weekAhead.getDate() + 7);
    const weekAheadStr = weekAhead.toISOString().slice(0, 10);

    const monthAhead = new Date();
    monthAhead.setDate(monthAhead.getDate() + 30);
    const monthAheadStr = monthAhead.toISOString().slice(0, 10);

    const allTasks = memoryItems.filter(m => m.type === 'task');
    const totalCount = allTasks.length;
    const completedTasks = allTasks.filter(m => m.status === 'completed');
    const percentDone = totalCount > 0 ? Math.round((completedTasks.length / totalCount) * 100) : 0;

    const overdue = allTasks.filter(m => m.status === 'open' && m.dueDate && m.dueDate < todayStr);
    const today = allTasks.filter(m => m.status === 'open' && m.dueDate && m.dueDate === todayStr);
    const thisWeek = allTasks.filter(m => m.status === 'open' && m.dueDate && m.dueDate > todayStr && m.dueDate <= weekAheadStr);
    const upcoming = allTasks.filter(m => m.status === 'open' && m.dueDate && m.dueDate > weekAheadStr && m.dueDate <= monthAheadStr);
    const backlog = allTasks.filter(m => m.status === 'open' && !m.dueDate);

    return {
      totalCount,
      completedCount: completedTasks.length,
      percentDone,
      overdue,
      today,
      thisWeek,
      upcoming,
      backlog,
      completed: completedTasks
    };
  }, [memoryItems]);

  const activePlan = useMemo(() => {
    if (!actionPlans.length) return null;
    return actionPlans.find(p => p.id === activePlanId) || actionPlans[0];
  }, [actionPlans, activePlanId]);

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
      message: memoryScopePaths.length > 0
        ? `Scanning selected ${memoryScopePaths.length} target(s) for tasks & decisions...`
        : 'Scanning passages for candidate tasks & decisions...',
      done: false
    });
    try {
      const res = await window.recallDesk.extractMemory({
        targetPaths: memoryScopePaths.length > 0 ? memoryScopePaths : undefined
      });
      await refreshMemory();
      setNotice(`Extraction complete: found ${res.newCount} new candidate tasks and decisions.`);
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

  // Clipboard Action Handlers
  const handleToggleClipboardEnabled = async () => {
    try {
      const nextEnabled = !clipboardSettings?.enabled;
      const updated = await window.recallDesk.updateClipboardSettings({ enabled: nextEnabled });
      setClipboardSettings(updated);
      setNotice(nextEnabled ? 'Clipboard Memory enabled. Automatically capturing copied snippets.' : 'Clipboard Memory disabled.');
      if (nextEnabled) await refreshClipboardItems();
    } catch (e: any) {
      setError(`Failed to update clipboard settings: ${e.message || String(e)}`);
    }
  };

  const handleToggleClipboardPaused = async () => {
    try {
      const nextPaused = !clipboardSettings?.paused;
      const updated = await window.recallDesk.updateClipboardSettings({ paused: nextPaused });
      setClipboardSettings(updated);
      setNotice(nextPaused ? 'Clipboard monitoring paused.' : 'Clipboard monitoring resumed.');
    } catch (e: any) {
      setError(`Failed to pause/resume clipboard: ${e.message || String(e)}`);
    }
  };

  const handleCopyClipboardItem = async (item: ClipboardItem) => {
    try {
      await window.recallDesk.copyClipboardItem(item.id);
      setCopiedItemId(item.id);
      setNotice('Copied snippet to clipboard!');
      setTimeout(() => {
        setCopiedItemId(prev => prev === item.id ? null : prev);
      }, 2000);
    } catch (e: any) {
      setError(`Failed to copy: ${e.message || String(e)}`);
    }
  };

  const handleTogglePinClipboardItem = async (item: ClipboardItem) => {
    try {
      const updated = await window.recallDesk.pinClipboardItem(item.id, !item.isPinned);
      setClipboardItems(prev => prev.map(i => i.id === item.id ? updated : i));
      setNotice(updated.isPinned ? 'Snippet pinned to top.' : 'Snippet unpinned.');
    } catch (e: any) {
      setError(`Failed to pin: ${e.message || String(e)}`);
    }
  };

  const handleDeleteClipboardItem = async (id: string) => {
    try {
      await window.recallDesk.deleteClipboardItem(id);
      setClipboardItems(prev => prev.filter(i => i.id !== id));
      setNotice('Clipboard entry deleted.');
    } catch (e: any) {
      setError(`Failed to delete: ${e.message || String(e)}`);
    }
  };

  const handleStartLabelItem = (item: ClipboardItem) => {
    setEditingLabelItem(item);
    setLabelInput(item.label || '');
  };

  const handleSaveLabel = async () => {
    if (!editingLabelItem) return;
    try {
      const updated = await window.recallDesk.setClipboardLabel(editingLabelItem.id, labelInput);
      setClipboardItems(prev => prev.map(i => i.id === editingLabelItem.id ? updated : i));
      setEditingLabelItem(null);
      setLabelInput('');
      setNotice('Label saved.');
    } catch (e: any) {
      setError(`Failed to set label: ${e.message || String(e)}`);
    }
  };

  const handleClearClipboardHistory = async () => {
    try {
      const cleared = await window.recallDesk.clearClipboardHistory(preservePinnedOnClear);
      await refreshClipboardItems();
      setConfirmClearModal(false);
      setNotice(`Cleared ${cleared} clipboard entries.`);
    } catch (e: any) {
      setError(`Failed to clear history: ${e.message || String(e)}`);
    }
  };

  const toggleExpandSnippet = (id: string) => {
    setExpandedSnippetIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredClipboardItems = useMemo(() => {
    let list = clipboardItems;
    if (clipboardFilter === 'pinned') {
      list = list.filter(i => i.isPinned);
    } else if (clipboardFilter !== 'all') {
      list = list.filter(i => i.contentType === clipboardFilter);
    }

    if (clipboardQuery.trim()) {
      const q = clipboardQuery.toLowerCase().trim();
      const words = q.split(/\s+/).filter(w => w.length > 0);
      list = list.filter(i => {
        const text = i.text.toLowerCase();
        const label = (i.label || '').toLowerCase();
        return words.every(w => text.includes(w) || label.includes(w));
      });
    }

    return list;
  }, [clipboardItems, clipboardFilter, clipboardQuery]);

  const clipboardCounts = useMemo(() => {
    return {
      all: clipboardItems.length,
      pinned: clipboardItems.filter(i => i.isPinned).length,
      code: clipboardItems.filter(i => i.contentType === 'code').length,
      command: clipboardItems.filter(i => i.contentType === 'command').length,
      url: clipboardItems.filter(i => i.contentType === 'url').length,
      text: clipboardItems.filter(i => i.contentType === 'text').length,
      json: clipboardItems.filter(i => i.contentType === 'json').length
    };
  }, [clipboardItems]);

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><BrainCircuit size={21}/></div><div><div className="brand-name">RecallDesk</div><div className="brand-sub">LOCAL MEMORY ENGINE</div></div></div>
      <button className={`nav-item ${view === 'search' ? 'active' : ''}`} onClick={() => setView('search')}><Search size={17}/> Search memory <span className="nav-shortcut">⌘ K</span></button>
      <button className={`nav-item ${view === 'clipboard' ? 'active' : ''}`} onClick={() => setView('clipboard')}>
        <ClipboardList size={17}/> Clipboard Memory
        {clipboardSettings?.enabled && !clipboardSettings?.paused && (
          <span className="clipboard-nav-dot" title="Monitoring active" />
        )}
      </button>
      <button className={`nav-item ${view === 'intelligence' ? 'active' : ''}`} onClick={() => setView('intelligence')}>
        <Sparkles size={17}/> Project Intelligence
      </button>
      <button className={`nav-item ${view === 'memory' ? 'active' : ''}`} onClick={() => setView('memory')}>
        <ListTodo size={17}/> Tasks & Decisions
        {suggestedCount > 0 && <span className="memory-nav-badge">{suggestedCount}</span>}
      </button>

      <div className="nav-section-label">WORKSPACE DOCK</div>
      <button className={`nav-item ${view === 'briefing' ? 'active' : ''}`} onClick={() => { setView('briefing'); loadBriefingData(); }}>
        <Calendar size={17}/> Daily Briefing
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
            {view === 'briefing' ? 'Daily Memory Briefing' : view === 'search' ? 'Search memory' : view === 'clipboard' ? 'Clipboard Memory' : view === 'intelligence' ? 'Project Intelligence' : view === 'memory' ? 'Decision & Task Memory' : view === 'library' ? 'Indexed library' : 'Settings'}
          </strong>
        </div>
        <div className="top-actions">
          <span className="local-pill"><span className="green-dot"/> LOCAL MODE</span>
          <button className="icon-btn" title="Help" onClick={() => setNotice('Select files, folders, or indexed content. RecallDesk runs local intelligence to extract actionable findings and answer: What should I do next?')}><CircleHelp size={17}/></button>
        </div>
      </header>
      <div className="content">
        {/* VIEW 0: DAILY MEMORY BRIEFING VIEW */}
        {view === 'briefing' && (
          <div className="page-panel">
            <div className="briefing-topbar">
              <div>
                <div className="eyebrow"><Sparkles size={13}/> DAILY INTELLIGENCE · LOCAL SYNTHESIS</div>
                <h1 style={{ font: '700 28px Manrope, sans-serif', margin: '8px 0 4px', color: '#f1f3f8' }}>Daily Memory Briefing</h1>
                <p style={{ color: '#8b94a5', fontSize: '13px', margin: 0 }}>
                  A grounded daily synthesis of verified project activity, open tasks, explicit deadlines, and saved decisions.
                </p>
              </div>
              <div className="briefing-actions">
                <div className="briefing-scope-select">
                  <Folder size={14} style={{ color: '#9ce8bd' }} />
                  <select
                    value={briefingScope}
                    onChange={e => {
                      const newScope = e.target.value;
                      setBriefingScope(newScope);
                      loadBriefingData(newScope);
                    }}
                  >
                    <option value="all">All Projects (Global Scope)</option>
                    {info?.roots?.map(r => (
                      <option key={r} value={r}>
                        Project: {r.split(/[/\\]/).filter(Boolean).pop()}
                      </option>
                    ))}
                  </select>
                </div>

                {activeBriefing && (
                  <>
                    <button
                      className="secondary-btn"
                      onClick={isPlayingAudio ? stopAudioBriefing : playAudioBriefing}
                      title="Audio voice readout of daily briefing"
                      style={isPlayingAudio ? { borderColor: '#7fdfa5', color: '#7fdfa5' } : {}}
                    >
                      {isPlayingAudio ? <VolumeX size={14} /> : <Volume2 size={14} />}
                      {isPlayingAudio ? 'Stop Voice' : 'Listen'}
                    </button>

                    <button
                      className="secondary-btn"
                      onClick={handleCopyStandup}
                      title="Copy formatted standup summary to clipboard"
                    >
                      <Share2 size={14} /> Copy Standup
                    </button>
                  </>
                )}

                <button
                  className="primary-btn"
                  onClick={() => handleGenerateBriefing(Boolean(todayBriefing))}
                  disabled={generatingBriefing}
                >
                  <Sparkles size={14} className={generatingBriefing ? 'spin' : ''} />
                  {generatingBriefing
                    ? 'Synthesizing...'
                    : todayBriefing
                    ? 'Regenerate Briefing'
                    : "Generate Today's Briefing"}
                </button>

                <button
                  className="secondary-btn"
                  onClick={() => setShowHistoryModal(true)}
                  title="View saved past briefings"
                >
                  <History size={14} /> History ({briefingHistory.length})
                </button>
              </div>
            </div>

            {/* Error or Notice */}
            {briefingError && (
              <div className="alert error">
                <AlertCircle size={16} />
                <span>{briefingError}</span>
                <button onClick={() => setBriefingError('')}>×</button>
              </div>
            )}

            {/* Live Audio Briefing Bar */}
            {isPlayingAudio && (
              <div className="briefing-audio-bar">
                <div className="briefing-audio-left">
                  <div className="audio-wave">
                    <span className="wave-bar" />
                    <span className="wave-bar" />
                    <span className="wave-bar" />
                    <span className="wave-bar" />
                    <span className="wave-bar" />
                  </div>
                  <span className="audio-live-label">{audioProgressText || 'Voice briefing playing…'}</span>
                </div>
                <div className="briefing-audio-controls">
                  <span style={{ fontSize: 11, color: '#8b98ad', marginRight: 4 }}>Speed:</span>
                  {[1.0, 1.25, 1.5].map(rate => (
                    <button
                      key={rate}
                      className={`audio-rate-btn ${audioPlaybackRate === rate ? 'active' : ''}`}
                      onClick={() => {
                        setAudioPlaybackRate(rate);
                        stopAudioBriefing();
                        setTimeout(() => playAudioBriefing(), 100);
                      }}
                    >
                      {rate}x
                    </button>
                  ))}
                  <button className="secondary-btn" style={{ padding: '3px 8px', fontSize: 11 }} onClick={stopAudioBriefing}>
                    <VolumeX size={12} /> Stop
                  </button>
                </div>
              </div>
            )}

            {/* Active Deep Work Pomodoro Focus Session */}
            {activeFocusSession && (
              <div className="focus-session-card">
                <div className="focus-session-left">
                  <div className="focus-session-clock">
                    {Math.floor(activeFocusSession.secondsLeft / 60).toString().padStart(2, '0')}:{(activeFocusSession.secondsLeft % 60).toString().padStart(2, '0')}
                  </div>
                  <div className="focus-session-details">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span className="briefing-badge ai" style={{ fontSize: 10, padding: '2px 6px' }}>
                        <Timer size={10} /> DEEP WORK FOCUS
                      </span>
                      {activeFocusSession.isRunning ? (
                        <span style={{ fontSize: 11, color: '#9ce8bd' }}>● Timer Active</span>
                      ) : (
                        <span style={{ fontSize: 11, color: '#f6c466' }}>❚❚ Paused</span>
                      )}
                    </div>
                    <h4>{activeFocusSession.taskTitle}</h4>
                    {activeFocusSession.sourcePath && (
                      <p>File: {activeFocusSession.sourcePath.split(/[/\\]/).pop()}</p>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button className="secondary-btn" onClick={toggleFocusSession} title={activeFocusSession.isRunning ? 'Pause timer' : 'Resume timer'}>
                    {activeFocusSession.isRunning ? <Pause size={14} /> : <Play size={14} />}
                    {activeFocusSession.isRunning ? 'Pause' : 'Resume'}
                  </button>
                  <button className="secondary-btn" onClick={resetFocusSession} title="Reset 25 min">
                    <RotateCcw size={14} />
                  </button>
                  <button className="primary-btn" onClick={() => { setNotice(`Completed focus session for: ${activeFocusSession.taskTitle}`); closeFocusSession(); }}>
                    <Check size={14} /> Complete Task
                  </button>
                  <button className="icon-btn" onClick={closeFocusSession} title="Dismiss focus timer">
                    <X size={16} />
                  </button>
                </div>
              </div>
            )}

            {/* Historical banner if viewing past briefing */}
            {activeBriefing && todayBriefing && activeBriefing.id !== todayBriefing.id && (
              <div className="alert notice" style={{ background: '#1c2233', borderColor: '#344365', color: '#c1d4ff' }}>
                <Clock size={15} />
                <span>
                  Viewing historical briefing from <strong>{activeBriefing.date}</strong> ({activeBriefing.scopeName}).
                </span>
                <button
                  className="secondary-btn"
                  style={{ marginLeft: 'auto', padding: '3px 9px', fontSize: '10px' }}
                  onClick={() => setActiveBriefing(todayBriefing)}
                >
                  Return to Today's Briefing
                </button>
              </div>
            )}

            {/* Empty State when no briefing yet generated */}
            {!activeBriefing && !generatingBriefing && (
              <div className="empty-results" style={{ padding: '50px 24px' }}>
                <div className="empty-icon" style={{ width: 56, height: 56, borderRadius: 16 }}>
                  <Calendar size={28} style={{ color: '#9ce8bd' }} />
                </div>
                <h3 style={{ fontSize: 17, margin: '18px 0 6px' }}>No Briefing Generated for Today</h3>
                <p style={{ maxWidth: 460 }}>
                  RecallDesk can inspect your verified local tasks, scheduled deadlines, decisions, and recent file changes to build today's memory briefing.
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                  <button
                    className="primary-btn"
                    onClick={() => handleGenerateBriefing(false)}
                    disabled={generatingBriefing}
                  >
                    <Sparkles size={14} /> Generate Briefing Now
                  </button>
                </div>
                <div className="bottom-note" style={{ marginTop: 28 }}>
                  <ShieldCheck size={14} /> 100% local synthesis. Zero telemetry or external cloud transfers.
                </div>
              </div>
            )}

            {/* Generating Skeleton / Progress Card */}
            {generatingBriefing && (
              <div className="progress-card" style={{ marginBottom: 24, border: '1px solid #2e4d3a' }}>
                <div className="progress-top">
                  <div className="spinner-label">
                    <LoaderCircle className="spin" size={17} />
                    <strong>Synthesizing Daily Memory Briefing for {briefingScope === 'all' ? 'All Projects' : briefingScope.split(/[/\\]/).filter(Boolean).pop()}…</strong>
                  </div>
                  <span>Local Processing</span>
                </div>
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: '85%' }} />
                </div>
                <div className="progress-note">
                  Gathering verified tasks, ranking explicit deadlines, and extracting grounded focus items…
                </div>
              </div>
            )}

            {/* Active Briefing Display */}
            {activeBriefing && (
              <>
                {/* Meta Bar */}
                <div className="briefing-meta-bar">
                  <div className="briefing-meta-left">
                    <span className="briefing-meta-date">
                      <Calendar size={14} style={{ color: '#9ce8bd' }} />
                      {activeBriefing.date}
                    </span>
                    <span className="dot-sep">·</span>
                    <span>Scope: <strong style={{ color: '#c5d0e2' }}>{activeBriefing.scopeName}</strong></span>
                    <span className="dot-sep">·</span>
                    <span>
                      Generated at {new Date(activeBriefing.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div>
                    {activeBriefing.generationType === 'ai' ? (
                      <span className="briefing-badge ai">
                        <Sparkles size={12} /> Local AI ({activeBriefing.modelUsed || 'Ollama'})
                      </span>
                    ) : (
                      <span className="briefing-badge deterministic">
                        <ShieldCheck size={12} /> Deterministic Local Synthesis
                      </span>
                    )}
                  </div>
                </div>

                {/* Readiness & Momentum 4-Card Dashboard */}
                <div className="momentum-dashboard">
                  <div className="momentum-card">
                    <div className="momentum-icon score">
                      <Flame size={20} />
                    </div>
                    <div className="momentum-info">
                      <strong>{readinessMetrics.score}% Momentum</strong>
                      <span>{readinessMetrics.label}</span>
                    </div>
                  </div>

                  <div className="momentum-card">
                    <div className="momentum-icon deadlines">
                      <Calendar size={20} />
                    </div>
                    <div className="momentum-info">
                      <strong>
                        {readinessMetrics.overdueCount > 0
                          ? `${readinessMetrics.overdueCount} Overdue`
                          : readinessMetrics.dueTodayCount > 0
                          ? `${readinessMetrics.dueTodayCount} Due Today`
                          : 'Deadlines Clear'}
                      </strong>
                      <span>
                        {readinessMetrics.overdueCount + readinessMetrics.dueTodayCount > 0
                          ? 'Action required on deadlines'
                          : 'No urgent deadlines today'}
                      </span>
                    </div>
                  </div>

                  <div className="momentum-card">
                    <div className="momentum-icon focus">
                      <Sparkles size={20} />
                    </div>
                    <div className="momentum-info">
                      <strong>{activeBriefing.focusItems.length} Focus Items</strong>
                      <span>Recommended priorities</span>
                    </div>
                  </div>

                  <div className="momentum-card">
                    <div className="momentum-icon activity">
                      <Activity size={20} />
                    </div>
                    <div className="momentum-info">
                      <strong>{activeBriefing.recentActivity.length} Events</strong>
                      <span>Verified local project activity</span>
                    </div>
                  </div>
                </div>

                {/* Daily Intent Scratchpad Card */}
                <div className="daily-intent-card">
                  <div className="daily-intent-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Edit3 size={13} style={{ color: '#9ce8bd' }} />
                      <span>Today's Core Intention & Milestone Target</span>
                    </div>
                    <span style={{ fontSize: 10, color: '#768396' }}>Autosaved locally</span>
                  </div>
                  <input
                    type="text"
                    className="daily-intent-input"
                    value={dailyIntent}
                    onChange={e => handleSaveDailyIntent(e.target.value)}
                    placeholder="What is your primary milestone to ship or verify today? (e.g., Complete memory briefings, verify unit tests)"
                  />
                </div>

                {/* Briefing Section Navigation Tabs */}
                <div className="briefing-tabs-bar">
                  <button
                    className={`briefing-tab-btn ${briefingTab === 'overview' ? 'active' : ''}`}
                    onClick={() => setBriefingTab('overview')}
                  >
                    Overview
                  </button>
                  <button
                    className={`briefing-tab-btn ${briefingTab === 'focus' ? 'active' : ''}`}
                    onClick={() => setBriefingTab('focus')}
                  >
                    🎯 Focus Priorities ({activeBriefing.focusItems.length})
                  </button>
                  <button
                    className={`briefing-tab-btn ${briefingTab === 'deadlines' ? 'active' : ''}`}
                    onClick={() => setBriefingTab('deadlines')}
                  >
                    ⏳ Deadlines & Tasks ({activeBriefing.openTasks.length})
                  </button>
                  <button
                    className={`briefing-tab-btn ${briefingTab === 'decisions' ? 'active' : ''}`}
                    onClick={() => setBriefingTab('decisions')}
                  >
                    📝 Decisions & Notes ({activeBriefing.keyDecisions.length})
                  </button>
                  <button
                    className={`briefing-tab-btn ${briefingTab === 'activity' ? 'active' : ''}`}
                    onClick={() => setBriefingTab('activity')}
                  >
                    📈 Activity Log ({activeBriefing.recentActivity.length})
                  </button>
                </div>

                {/* Executive Summary Card (Shown in Overview, Focus, or Deadlines) */}
                {(briefingTab === 'overview' || briefingTab === 'focus') && (
                  <div className="briefing-summary-card">
                    <div className="briefing-summary-header">
                      <FileText size={14} /> Executive Daily Summary
                    </div>
                    <p className="briefing-summary-text">{activeBriefing.summary}</p>

                    {activeBriefing.insufficientData && (
                      <div className="briefing-insufficient-banner">
                        <AlertCircle size={15} />
                        <span>
                          Notice: Insufficient local activity records found. Add folders to your library or record tasks & decisions to enrich daily synthesis.
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Suggested Focus Items (Shown in Overview or Focus tab) */}
                {(briefingTab === 'overview' || briefingTab === 'focus') && (
                  <div className="briefing-focus-section">
                    <div className="briefing-section-heading">
                      <h3>
                        <Sparkles size={16} style={{ color: '#9ce8bd' }} />
                        Suggested Focus Items
                      </h3>
                      <span>Prioritized from deadlines, open tasks & recent activity</span>
                    </div>
                    <div className="focus-grid">
                      {activeBriefing.focusItems.map(f => (
                        <div className={`focus-card priority-${f.priority}`} key={f.id}>
                          <div className="focus-top">
                            <span className="focus-priority-pill">{f.priority} priority</span>
                          </div>
                          <h4>{f.title}</h4>
                          <p className="focus-rationale">{f.rationale}</p>
                          <div className="focus-footer">
                            <button
                              className="focus-btn"
                              onClick={() => startFocusSession(f.title, f.relatedSource)}
                              title="Start 25-minute Pomodoro focus timer on this item"
                              style={{ background: '#1c2e28', color: '#9ce8bd', borderColor: '#2e5a47' }}
                            >
                              <Timer size={12} /> Focus 25m
                            </button>
                            {f.relatedTaskId && (
                              <button
                                className="focus-btn"
                                onClick={() => {
                                  setView('memory');
                                  setMemorySearch(f.title);
                                }}
                                title="Jump to this task in Tasks & Decisions"
                              >
                                <ListTodo size={12} /> View in Tasks
                              </button>
                            )}
                            {f.relatedSource && (
                              <button
                                className="focus-btn"
                                onClick={async () => {
                                  try {
                                    await window.recallDesk.openFile(f.relatedSource!);
                                  } catch (e: any) {
                                    setError(e?.message || 'Failed to open source file.');
                                  }
                                }}
                                title={f.relatedSource}
                              >
                                <FileText size={12} /> Open Source
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Two-Column Structured Section */}
                <div className="briefing-columns">
                  {/* Left Column: Tasks, Deadlines, Decisions */}
                  {(briefingTab === 'overview' || briefingTab === 'deadlines' || briefingTab === 'decisions') && (
                    <div className="briefing-column">
                      {/* Open Tasks Block */}
                      {(briefingTab === 'overview' || briefingTab === 'deadlines') && (
                        <div className="briefing-block">
                          <div className="briefing-block-header">
                            <h4>
                              <CheckSquare size={16} style={{ color: '#9ce8bd' }} />
                              Open Tasks & Scheduled Deadlines
                            </h4>
                            <span className="briefing-count">{activeBriefing.openTasks.length}</span>
                          </div>
                          <div className="briefing-task-list">
                            {activeBriefing.openTasks.length === 0 ? (
                              <div style={{ fontSize: 11, color: '#7a8597', padding: '10px 0' }}>
                                No open tasks recorded in this scope.
                              </div>
                            ) : (
                              activeBriefing.openTasks.map(task => {
                                const todayStr = new Date().toISOString().slice(0, 10);
                                const isOverdue = task.dueDate && task.dueDate < todayStr;
                                const isDueToday = task.dueDate && task.dueDate === todayStr;

                                return (
                                  <div className="briefing-task-item" key={task.id}>
                                    <button
                                      className="briefing-task-check"
                                      onClick={() => handleCompleteTaskFromBriefing(task.id)}
                                      title="Mark completed"
                                    >
                                      <Check size={12} />
                                    </button>
                                    <div className="briefing-task-content">
                                      <div className="briefing-task-title-row">
                                        <span className="briefing-task-title">{task.title}</span>
                                        {task.dueDate && (
                                          <span className={`deadline-pill ${isOverdue ? 'overdue' : isDueToday ? 'today' : ''}`}>
                                            <Calendar size={10} /> {isOverdue ? 'Overdue: ' : isDueToday ? 'Due Today: ' : 'Due '} {task.dueDate}
                                          </span>
                                        )}
                                      </div>
                                      {task.details && (
                                        <p className="briefing-task-details">{task.details}</p>
                                      )}
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                        <button
                                          className="focus-btn"
                                          style={{ padding: '2px 7px', fontSize: 10 }}
                                          onClick={() => startFocusSession(task.title, task.sourcePath)}
                                          title="Start 25-min focus timer on this task"
                                        >
                                          <Timer size={10} /> Focus
                                        </button>
                                        {(task.relativePath || task.sourcePath) && (
                                          <div
                                            className="briefing-task-source"
                                            onClick={async () => {
                                              if (task.sourcePath) {
                                                try {
                                                  await window.recallDesk.openFile(task.sourcePath);
                                                } catch (e: any) {
                                                  setError(e?.message || 'Could not open file.');
                                                }
                                              }
                                            }}
                                          >
                                            <FileCode2 size={11} />
                                            <span>{task.relativePath || task.sourcePath}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}

                      {/* Recently Completed Block */}
                      {(briefingTab === 'overview' || briefingTab === 'deadlines') && activeBriefing.completedRecently.length > 0 && (
                        <div className="briefing-block">
                          <div className="briefing-block-header">
                            <h4>
                              <CheckSquare size={16} style={{ color: '#7fdfa5' }} />
                              Completed Recently (Past 48 Hours)
                            </h4>
                            <span className="briefing-count">{activeBriefing.completedRecently.length}</span>
                          </div>
                          <div className="briefing-task-list">
                            {activeBriefing.completedRecently.map(c => (
                              <div className="briefing-task-item" key={c.id} style={{ opacity: 0.8 }}>
                                <span style={{ color: '#7fdfa5', marginTop: 2 }}><Check size={14} /></span>
                                <div className="briefing-task-content">
                                  <span className="briefing-task-title" style={{ textDecoration: 'line-through', color: '#97a3b7' }}>
                                    {c.title}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Key Decisions Block */}
                      {(briefingTab === 'overview' || briefingTab === 'decisions') && (
                        <div className="briefing-block">
                          <div className="briefing-block-header">
                            <h4>
                              <ShieldCheck size={16} style={{ color: '#a6b9ff' }} />
                              Key Saved Decisions & Notes
                            </h4>
                            <span className="briefing-count">{activeBriefing.keyDecisions.length}</span>
                          </div>
                          <div className="briefing-decision-list">
                            {activeBriefing.keyDecisions.length === 0 ? (
                              <div style={{ fontSize: 11, color: '#7a8597', padding: '10px 0' }}>
                                No active decisions recorded in this scope.
                              </div>
                            ) : (
                              activeBriefing.keyDecisions.map(d => (
                                <div className="briefing-decision-item" key={d.id}>
                                  <div className="briefing-decision-title">{d.title}</div>
                                  {d.details && (
                                    <p className="briefing-decision-details">{d.details}</p>
                                  )}
                                  {(d.relativePath || d.sourcePath) && (
                                    <div
                                      className="briefing-task-source"
                                      onClick={async () => {
                                        if (d.sourcePath) {
                                          try {
                                            await window.recallDesk.openFile(d.sourcePath);
                                          } catch (e: any) {
                                            setError(e?.message || 'Could not open file.');
                                          }
                                        }
                                      }}
                                    >
                                      <FileText size={11} />
                                      <span>{d.relativePath || d.sourcePath}</span>
                                    </div>
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Right Column: Verified Activity & Briefing Preferences */}
                  {(briefingTab === 'overview' || briefingTab === 'activity') && (
                    <div className="briefing-column">
                      {/* Activity Feed Block */}
                      <div className="briefing-block">
                        <div className="briefing-block-header">
                          <h4>
                            <Activity size={16} style={{ color: '#9ce8bd' }} />
                            Verified Project Activity
                          </h4>
                          <span className="briefing-count">{activeBriefing.recentActivity.length}</span>
                        </div>
                        <div className="briefing-activity-timeline">
                          {activeBriefing.recentActivity.length === 0 ? (
                            <div style={{ fontSize: 11, color: '#7a8597', padding: '10px 0' }}>
                              No activity logged yet. Runs upon folder indexing, task changes, and analysis runs.
                            </div>
                          ) : (
                            activeBriefing.recentActivity.map(act => (
                              <div className="briefing-activity-row" key={act.id}>
                                <div className="briefing-activity-desc">{act.description}</div>
                                <div className="briefing-activity-time">
                                  {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(act.timestamp).toLocaleDateString()}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Briefing Settings & Local Reminder Panel */}
                      <div className="briefing-block">
                        <div className="briefing-block-header">
                          <h4>
                            <Settings2 size={16} style={{ color: '#c9d2e2' }} />
                            Briefing Preferences
                          </h4>
                        </div>
                        <div className="briefing-settings-panel">
                          <div className="briefing-pref-row">
                            <div className="briefing-pref-copy">
                              <strong>Daily Reminder Notification</strong>
                              <span>Show local desktop reminder when briefing is ready</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={briefingSettings?.notificationsEnabled || false}
                              onChange={e => handleUpdateBriefingSettings({ notificationsEnabled: e.target.checked })}
                            />
                          </div>

                          {briefingSettings?.notificationsEnabled && (
                            <div className="briefing-pref-row">
                              <div className="briefing-pref-copy">
                                <strong>Preferred Reminder Time</strong>
                                <span>Scheduled local time for daily notification</span>
                              </div>
                              <input
                                type="time"
                                className="briefing-pref-time"
                                value={briefingSettings?.preferredTime || '09:00'}
                                onChange={e => handleUpdateBriefingSettings({ preferredTime: e.target.value })}
                              />
                            </div>
                          )}

                          <div className="briefing-pref-row">
                            <div className="briefing-pref-copy">
                              <strong>Include Clipboard Memory</strong>
                              <span>Opt-in to summarize non-sensitive copied items</span>
                            </div>
                            <input
                              type="checkbox"
                              checked={briefingSettings?.includeClipboard || false}
                              onChange={e => handleUpdateBriefingSettings({ includeClipboard: e.target.checked })}
                            />
                          </div>

                          <div className="briefing-pref-note">
                            🔒 <strong>Privacy guarantee:</strong> All processing is 100% local. Desktop reminders trigger only while RecallDesk is running. Sensitive text excerpts and clipboard contents are never exposed on the system lock screen.
                          </div>

                          <div style={{ paddingTop: 10, borderTop: '1px solid #1f2533', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                              className="danger-btn"
                              style={{ fontSize: 11, padding: '6px 10px' }}
                              onClick={() => handleDeleteBriefing(activeBriefing.id)}
                            >
                              <Trash2 size={12} /> Delete this briefing
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* History Modal */}
            {showHistoryModal && (
              <div className="briefing-modal-overlay" onClick={() => setShowHistoryModal(false)}>
                <div className="briefing-modal" onClick={e => e.stopPropagation()}>
                  <div className="briefing-modal-header">
                    <h3>Saved Briefing History</h3>
                    <button className="icon-btn" onClick={() => setShowHistoryModal(false)}>
                      <X size={18} />
                    </button>
                  </div>
                  <div className="briefing-modal-body">
                    {briefingHistory.length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#828e9e', padding: '30px 0', fontSize: 12 }}>
                        No saved briefings in history yet.
                      </div>
                    ) : (
                      briefingHistory.map(b => (
                        <div className="history-item-card" key={b.id}>
                          <div className="history-item-top">
                            <span className="history-item-date">{b.date}</span>
                            <span className={`briefing-badge ${b.generationType}`}>
                              {b.generationType === 'ai' ? 'AI' : 'Deterministic'} · {b.scopeName}
                            </span>
                          </div>
                          <p className="history-item-summary">{b.summary}</p>
                          <div className="history-item-actions">
                            <span style={{ fontSize: 10, color: '#6d788b' }}>
                              {new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button
                                className="secondary-btn"
                                style={{ padding: '4px 8px', fontSize: 10 }}
                                onClick={() => {
                                  setActiveBriefing(b);
                                  setShowHistoryModal(false);
                                }}
                              >
                                View
                              </button>
                              <button
                                className="danger-btn"
                                style={{ padding: '4px 8px', fontSize: 10 }}
                                onClick={() => handleDeleteBriefing(b.id)}
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

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

        {/* VIEW: SEARCHABLE CLIPBOARD MEMORY */}
        {view === 'clipboard' && (
          <div className="page-panel">
            <div className="page-heading">
              <div>
                <div className="eyebrow"><ClipboardList size={13}/> RECALL YOUR COPIED KNOWLEDGE</div>
                <h1>Clipboard Memory</h1>
                <p>Remember useful code snippets, terminal commands, URLs, error messages, and notes you copy across any application.</p>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {clipboardSettings?.enabled ? (
                  <>
                    <button
                      className="secondary-btn"
                      onClick={handleToggleClipboardPaused}
                      title={clipboardSettings.paused ? "Resume capturing new clipboard items" : "Temporarily pause clipboard capture"}
                    >
                      {clipboardSettings.paused ? <Play size={14}/> : <Pause size={14}/>}
                      {clipboardSettings.paused ? 'Resume Monitoring' : 'Pause Monitoring'}
                    </button>
                    <button
                      className="danger-btn"
                      onClick={() => setConfirmClearModal(true)}
                      title="Clear clipboard history"
                      style={{ padding: '8px 12px' }}
                    >
                      <Trash2 size={14}/> Clear History
                    </button>
                    <button
                      className="secondary-btn"
                      onClick={handleToggleClipboardEnabled}
                      title="Disable clipboard memory"
                      style={{ color: '#8892a4' }}
                    >
                      Turn Off
                    </button>
                  </>
                ) : (
                  <button className="primary-btn" onClick={handleToggleClipboardEnabled}>
                    <ShieldCheck size={14}/> Turn On Clipboard Memory
                  </button>
                )}
              </div>
            </div>

            {error && <div className="alert error"><X size={16}/><span>{error}</span></div>}
            {notice && <div className="alert notice"><Check size={16}/><span>{notice}</span><button onClick={() => setNotice('')}><X size={14}/></button></div>}

            {!clipboardSettings?.enabled ? (
              /* ONBOARDING & PRIVACY HERO CARD */
              <div className="clipboard-privacy-hero">
                <div className="clipboard-hero-top">
                  <div className="clipboard-hero-icon"><LockKeyhole size={24}/></div>
                  <div className="clipboard-hero-title">
                    <h2>Private, Local-First Clipboard Knowledge</h2>
                    <p>RecallDesk's Clipboard Memory is disabled by default to protect your privacy. Turn it on when you want to retain and search text you copy.</p>
                  </div>
                </div>

                <div className="clipboard-features-grid">
                  <div className="clipboard-feature-item">
                    <div className="clipboard-feature-icon"><ShieldCheck size={16}/></div>
                    <div className="clipboard-feature-copy">
                      <strong>100% Local & On-Device</strong>
                      <p>Your clipboard data never touches any remote server, cloud API, or external analytics. Everything resides safely in your user data directory.</p>
                    </div>
                  </div>
                  <div className="clipboard-feature-item">
                    <div className="clipboard-feature-icon"><LockKeyhole size={16}/></div>
                    <div className="clipboard-feature-copy">
                      <strong>Automated Secret Protection</strong>
                      <p>Conservative filters actively ignore private keys, tokens, OpenAI/AWS/GitHub API keys, database connection strings, and passwords.</p>
                    </div>
                  </div>
                  <div className="clipboard-feature-item">
                    <div className="clipboard-feature-icon"><Cpu size={16}/></div>
                    <div className="clipboard-feature-copy">
                      <strong>Zero Overhead & Deduplication</strong>
                      <p>Lightweight bounded polling checks for text changes and computes SHA-256 hashes to prevent redundant entries and save disk space.</p>
                    </div>
                  </div>
                  <div className="clipboard-feature-item">
                    <div className="clipboard-feature-icon"><Command size={16}/></div>
                    <div className="clipboard-feature-copy">
                      <strong>Instant Global Shortcut</strong>
                      <p>Press <code>Alt+Shift+C</code> from any application to bring RecallDesk forward and instantly search past snippets and terminal commands.</p>
                    </div>
                  </div>
                </div>

                <div className="clipboard-disclaimer-box">
                  <AlertCircle size={17}/>
                  <div>
                    <strong>Privacy Notice & Secret Detection Transparency:</strong>
                    While RecallDesk employs conservative pattern matching to filter out common API keys, passwords, and private keys, automated detection cannot catch every proprietary or unknown secret format. You can pause monitoring anytime, delete individual entries permanently, or purge history.
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <button className="primary-btn" onClick={handleToggleClipboardEnabled} style={{ padding: '11px 20px', fontSize: 13 }}>
                    <Check size={16}/> Enable Clipboard Memory
                  </button>
                  <span style={{ fontSize: 11, color: '#7a8596' }}>You can pause or disable this feature at any time.</span>
                </div>
              </div>
            ) : (
              /* ACTIVE CLIPBOARD WORKSPACE */
              <div className="clipboard-container">
                {/* Status Bar */}
                <div className="clipboard-status-bar">
                  <div className="clipboard-status-left">
                    <span className={`clipboard-state-badge ${clipboardSettings.paused ? 'paused' : 'active'}`}>
                      <span className={clipboardSettings.paused ? 'gray-dot' : 'green-dot'}/>
                      {clipboardSettings.paused ? 'MONITORING PAUSED' : 'MONITORING ACTIVE'}
                    </span>
                    <span style={{ fontSize: 11, color: '#7e8a9d' }}>
                      {clipboardItems.length} items captured · Retention limit: {clipboardSettings.retentionLimit || 200}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 10, color: '#6e798c' }}>
                    <span>Global shortcut:</span>
                    <kbd className="keycap">Alt</kbd> + <kbd className="keycap">Shift</kbd> + <kbd className="keycap">C</kbd>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="clipboard-search-bar">
                  <Search size={16} style={{ color: '#88e4af', flexShrink: 0 }}/>
                  <input
                    ref={clipboardInputRef}
                    value={clipboardQuery}
                    onChange={e => setClipboardQuery(e.target.value)}
                    placeholder="Search copied code, commands, URLs, error messages, or custom labels…"
                  />
                  {clipboardQuery && (
                    <button className="icon-btn" onClick={() => setClipboardQuery('')} title="Clear search">
                      <X size={14}/>
                    </button>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span className="keycap">ESC</span> to clear
                  </div>
                </div>

                {/* Filter Tabs */}
                <div className="clipboard-filter-tabs">
                  <button
                    className={`clipboard-tab-btn ${clipboardFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setClipboardFilter('all')}
                  >
                    All <span className="tab-badge">{clipboardCounts.all}</span>
                  </button>
                  <button
                    className={`clipboard-tab-btn ${clipboardFilter === 'pinned' ? 'active' : ''}`}
                    onClick={() => setClipboardFilter('pinned')}
                  >
                    <Pin size={12}/> Pinned <span className="tab-badge">{clipboardCounts.pinned}</span>
                  </button>
                  <button
                    className={`clipboard-tab-btn ${clipboardFilter === 'code' ? 'active' : ''}`}
                    onClick={() => setClipboardFilter('code')}
                  >
                    <Terminal size={12}/> Code <span className="tab-badge">{clipboardCounts.code}</span>
                  </button>
                  <button
                    className={`clipboard-tab-btn ${clipboardFilter === 'command' ? 'active' : ''}`}
                    onClick={() => setClipboardFilter('command')}
                  >
                    <Command size={12}/> Commands <span className="tab-badge">{clipboardCounts.command}</span>
                  </button>
                  <button
                    className={`clipboard-tab-btn ${clipboardFilter === 'url' ? 'active' : ''}`}
                    onClick={() => setClipboardFilter('url')}
                  >
                    <Link size={12}/> URLs <span className="tab-badge">{clipboardCounts.url}</span>
                  </button>
                  <button
                    className={`clipboard-tab-btn ${clipboardFilter === 'text' ? 'active' : ''}`}
                    onClick={() => setClipboardFilter('text')}
                  >
                    <FileText size={12}/> Text <span className="tab-badge">{clipboardCounts.text}</span>
                  </button>
                  {clipboardCounts.json > 0 && (
                    <button
                      className={`clipboard-tab-btn ${clipboardFilter === 'json' ? 'active' : ''}`}
                      onClick={() => setClipboardFilter('json')}
                    >
                      <Braces size={12}/> JSON <span className="tab-badge">{clipboardCounts.json}</span>
                    </button>
                  )}
                </div>

                {/* Items List */}
                {filteredClipboardItems.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {filteredClipboardItems.map(item => {
                      const isExpanded = expandedSnippetIds.has(item.id);
                      const isLong = item.lineCount > 5 || item.charCount > 280;
                      const isJustCopied = copiedItemId === item.id;

                      return (
                        <div className={`clipboard-card ${item.isPinned ? 'pinned' : ''}`} key={item.id}>
                          <div className="clipboard-card-header">
                            <div className="clipboard-header-left">
                              <span className={`clipboard-type-pill ${item.contentType}`}>
                                {item.contentType === 'code' ? <Terminal size={10}/> :
                                 item.contentType === 'command' ? <Command size={10}/> :
                                 item.contentType === 'url' ? <Link size={10}/> :
                                 item.contentType === 'json' ? <Braces size={10}/> :
                                 <FileText size={10}/>}
                                {item.contentType}
                              </span>

                              {item.isPinned && (
                                <span className="clipboard-pinned-pill">
                                  <Pin size={10}/> PINNED
                                </span>
                              )}

                              {item.label && (
                                <span className="clipboard-label-pill">
                                  <Tag size={10}/> {item.label}
                                </span>
                              )}
                            </div>

                            <div className="clipboard-header-right">
                              <span>{item.charCount} chars · {item.lineCount} {item.lineCount === 1 ? 'line' : 'lines'}</span>
                              <span>{new Date(item.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(item.capturedAt).toLocaleDateString()}</span>
                            </div>
                          </div>

                          <div className="clipboard-snippet-box">
                            <pre className={`clipboard-snippet-code ${isExpanded ? 'expanded' : ''}`}>
                              <code>{item.text}</code>
                            </pre>
                            {isLong && (
                              <button
                                className="clipboard-expand-toggle"
                                onClick={() => toggleExpandSnippet(item.id)}
                              >
                                {isExpanded ? 'Collapse snippet' : `Expand full snippet (${item.lineCount} lines)`}
                              </button>
                            )}
                          </div>

                          <div className="clipboard-actions-bar">
                            <div className="clipboard-actions-left">
                              <button
                                className={`clipboard-copy-btn ${isJustCopied ? 'copied' : ''}`}
                                onClick={() => handleCopyClipboardItem(item)}
                                title="Copy snippet to clipboard"
                              >
                                {isJustCopied ? <Check size={13}/> : <Copy size={13}/>}
                                {isJustCopied ? 'Copied!' : 'Copy'}
                              </button>
                              <button
                                className="secondary-btn"
                                onClick={() => handleTogglePinClipboardItem(item)}
                                title={item.isPinned ? "Unpin from top" : "Pin to top (protects from retention limit)"}
                                style={{ padding: '6px 10px', fontSize: 11 }}
                              >
                                <Pin size={12}/> {item.isPinned ? 'Unpin' : 'Pin'}
                              </button>
                              <button
                                className="secondary-btn"
                                onClick={() => handleStartLabelItem(item)}
                                title="Add a descriptive label or note to this snippet"
                                style={{ padding: '6px 10px', fontSize: 11 }}
                              >
                                <Tag size={12}/> {item.label ? 'Edit Label' : 'Label'}
                              </button>
                            </div>

                            <button
                              className="icon-btn-danger"
                              onClick={() => handleDeleteClipboardItem(item.id)}
                              title="Delete permanently from clipboard history"
                            >
                              <Trash2 size={14}/>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-results" style={{ marginTop: 20 }}>
                    <div className="empty-icon"><ClipboardList size={24}/></div>
                    <h3>
                      {clipboardQuery.trim()
                        ? `No clipboard items match "${clipboardQuery}"`
                        : clipboardFilter === 'pinned'
                        ? 'No pinned clipboard entries'
                        : 'No clipboard entries yet'}
                    </h3>
                    <p>
                      {clipboardQuery.trim()
                        ? 'Try searching with different keywords or switch the filter tab.'
                        : 'Copy code snippets, terminal commands, or documentation in your editor or browser to see them automatically indexed here.'}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Modal for Label / Rename */}
            {editingLabelItem && (
              <div className="modal-overlay" onClick={() => setEditingLabelItem(null)}>
                <div className="modal-dialog" onClick={e => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3>Set Label for Snippet</h3>
                    <button className="icon-btn" onClick={() => setEditingLabelItem(null)}><X size={16}/></button>
                  </div>
                  <div className="modal-form-group">
                    <label>Custom Label / Title</label>
                    <input
                      className="modal-input"
                      value={labelInput}
                      onChange={e => setLabelInput(e.target.value)}
                      placeholder="e.g. Docker Compose Production Config, OAuth Callback URL"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveLabel(); }}
                    />
                  </div>
                  <div className="modal-footer">
                    <button className="secondary-btn" onClick={() => setEditingLabelItem(null)}>Cancel</button>
                    <button className="primary-btn" onClick={handleSaveLabel}>Save Label</button>
                  </div>
                </div>
              </div>
            )}

            {/* Modal for Clear History Confirmation */}
            {confirmClearModal && (
              <div className="modal-overlay" onClick={() => setConfirmClearModal(false)}>
                <div className="modal-dialog" onClick={e => e.stopPropagation()}>
                  <div className="modal-header">
                    <h3>Clear Clipboard History</h3>
                    <button className="icon-btn" onClick={() => setConfirmClearModal(false)}><X size={16}/></button>
                  </div>
                  <p style={{ fontSize: 12, color: '#97a3b6', lineHeight: 1.6, margin: '10px 0 16px' }}>
                    Are you sure you want to clear your clipboard memory history? This will permanently delete captured text snippets.
                  </p>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#c7d2e4', cursor: 'pointer', marginBottom: 20 }}>
                    <input
                      type="checkbox"
                      checked={preservePinnedOnClear}
                      onChange={e => setPreservePinnedOnClear(e.target.checked)}
                    />
                    <strong>Keep pinned items safe (recommended)</strong>
                  </label>
                  <div className="modal-footer">
                    <button className="secondary-btn" onClick={() => setConfirmClearModal(false)}>Cancel</button>
                    <button className="danger-btn" onClick={handleClearClipboardHistory} style={{ padding: '8px 14px' }}>
                      <Trash2 size={13}/> Yes, Clear History
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

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
                <p>Discover unfinished work, generate actionable assessment plans with timelines & tick marks, and track decisions grounded in your local files.</p>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <button
                  className="primary-btn"
                  onClick={handleExtractMemory}
                  disabled={extractingMemory || busy}
                  title="Scan selected target files/folders or entire library"
                >
                  <Sparkles size={14}/> {extractingMemory ? 'Scanning…' : memoryScopePaths.length > 0 ? `Extract (${memoryScopePaths.length} targets)` : 'Find tasks & decisions'}
                </button>
                <button
                  className="secondary-btn"
                  onClick={() => handleGenerateActionPlan()}
                  disabled={generatingPlan}
                  title="Generate structured Assessment or Project Action Plan with timeline milestones and tick marks"
                >
                  <FileStack size={14}/> {generatingPlan ? 'Analyzing…' : 'Plan from File…'}
                </button>
                <button className="secondary-btn" onClick={handleStartCreate}>
                  <Plus size={14}/> New item
                </button>
              </div>
            </div>

            {error && <div className="alert error"><X size={16}/><span>{error}</span></div>}
            {notice && <div className="alert notice"><Check size={16}/><span>{notice}</span><button onClick={() => setNotice('')}><X size={14}/></button></div>}

            {/* Target Scope Selection Bar */}
            <div className="memory-scope-bar">
              <div className="memory-scope-row">
                <div className="memory-scope-left">
                  <span className="memory-scope-label">Target Scope:</span>
                  <span className={`memory-scope-pill ${memoryScopePaths.length > 0 ? 'targeted' : ''}`}>
                    {memoryScopePaths.length > 0 ? (
                      <>
                        <FileCode2 size={12} /> Targeted ({memoryScopePaths.length} custom file/folder targets)
                      </>
                    ) : (
                      <>
                        <FolderOpen size={12} /> All Indexed Files (Global Library)
                      </>
                    )}
                  </span>
                </div>
                <div className="memory-scope-actions">
                  <button className="secondary-btn" style={{ padding: '4px 10px', fontSize: 11 }} onClick={handleChooseMemoryFiles} title="Select specific files (PDF, Markdown, code, notes) to extract from">
                    <FileText size={12} /> Select Files…
                  </button>
                  <button className="secondary-btn" style={{ padding: '4px 10px', fontSize: 11 }} onClick={handleChooseMemoryFolders} title="Select specific folder to extract from">
                    <Folder size={12} /> Select Folder…
                  </button>
                  {memoryScopePaths.length > 0 && (
                    <button className="secondary-btn" style={{ padding: '4px 10px', fontSize: 11 }} onClick={handleClearMemoryScope} title="Reset scope to entire indexed library">
                      <X size={12} /> Clear (Use All)
                    </button>
                  )}
                </div>
              </div>

              {memoryScopePaths.length > 0 && (
                <div className="memory-scope-chips">
                  {memoryScopePaths.map(p => (
                    <div className="memory-scope-chip" key={p} title={p}>
                      <FileCode2 size={11} style={{ color: '#9ce8bd' }} />
                      <span>{p.split(/[/\\]/).pop()}</span>
                      <button onClick={() => handleRemoveMemoryScopePath(p)} title="Remove from target scope">
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Subview Switcher: List, Calendar, Timeline, Action Plan */}
            <div className="memory-subview-tabs">
              <button
                className={`memory-subview-tab ${memorySubView === 'list' ? 'active' : ''}`}
                onClick={() => setMemorySubView('list')}
              >
                <ListTodo size={14} /> Tasks & Decisions List
              </button>
              <button
                className={`memory-subview-tab ${memorySubView === 'calendar' ? 'active' : ''}`}
                onClick={() => setMemorySubView('calendar')}
              >
                <Calendar size={14} /> Calendar & Schedule
              </button>
              <button
                className={`memory-subview-tab ${memorySubView === 'timeline' ? 'active' : ''}`}
                onClick={() => setMemorySubView('timeline')}
              >
                <Clock size={14} /> Milestone Timeline
              </button>
              <button
                className={`memory-subview-tab ${memorySubView === 'plan' ? 'active' : ''}`}
                onClick={() => setMemorySubView('plan')}
              >
                <FileStack size={14} /> Action Plan & Notepad {actionPlans.length > 0 && <span className="tab-badge blue" style={{ marginLeft: 4 }}>{actionPlans.length}</span>}
              </button>
            </div>

            {/* Extraction Progress Card */}
            {(extractingMemory || extractProgress) && (
              <div className="progress-card" style={{ marginBottom: 20, border: '1px solid #3d6c52' }}>
                <div className="progress-top">
                  <div className="spinner-label">
                    <LoaderCircle className="spin" size={17}/>
                    <strong>{extractProgress?.message || 'Analyzing documents for tasks and decisions...'}</strong>
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

            {/* SUB-VIEW 1: Standard List View */}
            {memorySubView === 'list' && (
              <>

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
              </>
            )}

            {/* SUB-VIEW 2: Interactive Calendar View */}
            {memorySubView === 'calendar' && (
              <div className="calendar-layout">
                <div className="calendar-main">
                  <div className="calendar-nav-bar">
                    <div className="calendar-month-title">
                      <CalendarDays size={16} style={{ color: '#82b1ff' }} />
                      <h3>{calendarMonthYearStr}</h3>
                    </div>
                    <div className="calendar-nav-actions">
                      <button
                        className="calendar-nav-btn"
                        onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
                        title="Previous Month"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button
                        className="calendar-today-btn"
                        onClick={() => {
                          const today = new Date();
                          setCalendarDate(today);
                          setSelectedCalendarDate(today.toISOString().slice(0, 10));
                        }}
                      >
                        Today
                      </button>
                      <button
                        className="calendar-nav-btn"
                        onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
                        title="Next Month"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="calendar-weekdays">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                      <div key={d} className="calendar-weekday-header">{d}</div>
                    ))}
                  </div>

                  <div className="calendar-grid">
                    {calendarDays.map((cell, idx) => (
                      <div
                        key={idx}
                        className={`calendar-day-cell ${cell.isCurrentMonth ? '' : 'other-month'} ${cell.isToday ? 'today' : ''} ${cell.dateStr === selectedCalendarDate ? 'selected' : ''}`}
                        onClick={() => setSelectedCalendarDate(cell.dateStr)}
                      >
                        <div className="calendar-cell-top">
                          <span className="calendar-day-num">{cell.dayNum}</span>
                          {cell.tasks.length > 0 && (
                            <div className="calendar-tasks-indicator">
                              {cell.tasks.slice(0, 3).map(t => (
                                <span
                                  key={t.id}
                                  className={`calendar-task-dot ${t.status === 'completed' ? 'completed' : t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10) ? 'overdue' : t.dueDate === new Date().toISOString().slice(0, 10) ? 'today' : 'scheduled'}`}
                                  title={`${t.status.toUpperCase()}: ${t.title}`}
                                />
                              ))}
                              {cell.tasks.length > 3 && (
                                <span style={{ fontSize: 9, color: '#9bb1d3', fontWeight: 600 }}>+{cell.tasks.length - 3}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Day Schedule & Task Completion Inspector */}
                <div className="calendar-day-schedule">
                  <div className="schedule-header">
                    <h4>Schedule: {selectedCalendarDate}</h4>
                    <span className="tab-badge blue">{selectedDateTasks.length}</span>
                  </div>

                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="memory-search-input"
                      style={{ flex: 1, padding: '7px 10px', fontSize: 12 }}
                      value={calendarNewTaskInput}
                      onChange={e => setCalendarNewTaskInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleQuickAddCalendarTask(); }}
                      placeholder="Add task for this date..."
                    />
                    <button
                      className="primary-btn"
                      style={{ padding: '6px 12px' }}
                      onClick={handleQuickAddCalendarTask}
                      title="Quick schedule task"
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  <div className="schedule-list">
                    {selectedDateTasks.length > 0 ? (
                      selectedDateTasks.map(task => (
                        <div key={task.id} className="schedule-task-item">
                          <button
                            className={`schedule-check-btn ${task.status === 'completed' ? 'checked' : ''}`}
                            onClick={() => task.status === 'completed' ? handleReopenMemory(task.id) : handleCompleteMemory(task.id)}
                            title={task.status === 'completed' ? 'Mark task open' : 'Mark task completed [x]'}
                          >
                            {task.status === 'completed' && <Check size={12} />}
                          </button>
                          <div className="schedule-task-content">
                            <div className={`schedule-task-title ${task.status === 'completed' ? 'done' : ''}`}>
                              {task.title}
                            </div>
                            <div className="schedule-task-meta">
                              {task.relativePath && (
                                <button
                                  className="source-file-link"
                                  onClick={() => handleOpenSourceFile(task.sourcePath)}
                                  style={{ fontSize: 10, padding: 0 }}
                                >
                                  <Folder size={10} /> {task.relativePath}
                                </button>
                              )}
                              <button
                                className="action-btn-secondary"
                                style={{ padding: '1px 6px', fontSize: 10 }}
                                onClick={() => handleStartEdit(task)}
                              >
                                <Edit3 size={10} /> Edit
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: 11, color: '#778498', padding: '16px 0', textAlign: 'center' }}>
                        No tasks scheduled for {selectedCalendarDate}. Type above to add one.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* SUB-VIEW 3: Milestone Timeline & Roadmap View */}
            {memorySubView === 'timeline' && (
              <div className="timeline-layout">
                {/* Overall Velocity & Progress Bar */}
                <div className="timeline-progress-bar">
                  <div className="timeline-progress-labels">
                    <span>
                      <strong style={{ color: '#f0f4fc' }}>Milestone Execution Progress:</strong>{' '}
                      {timelineData.completedCount} of {timelineData.totalCount} tasks completed
                    </span>
                    <span>
                      <strong style={{ color: '#8fe0b2' }}>{timelineData.percentDone}%</strong> Complete
                    </span>
                  </div>
                  <div className="timeline-track">
                    <div className="timeline-fill" style={{ width: `${timelineData.percentDone}%` }} />
                  </div>
                </div>

                {/* Overdue Lane */}
                {timelineData.overdue.length > 0 && (
                  <div className="timeline-lane" style={{ borderColor: '#5e2329', background: '#171114' }}>
                    <div className="timeline-lane-title overdue">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AlertCircle size={15} /> Overdue Tasks ({timelineData.overdue.length})
                      </span>
                      <span className="tab-badge" style={{ background: '#4d1e23', color: '#ff8a94' }}>URGENT</span>
                    </div>
                    <div className="timeline-lane-cards">
                      {timelineData.overdue.map(task => (
                        <div key={task.id} className="timeline-card" style={{ borderColor: '#482025' }}>
                          <div className="timeline-card-left">
                            <button
                              className="schedule-check-btn"
                              onClick={() => handleCompleteMemory(task.id)}
                              title="Mark completed"
                            >
                              <Check size={12} />
                            </button>
                            <div>
                              <div className="timeline-card-title">{task.title}</div>
                              <div className="timeline-card-meta">
                                <span className="due-badge" style={{ color: '#ff7f8a', borderColor: '#5e252c' }}>
                                  <Calendar size={10} /> Due {task.dueDate}
                                </span>
                                {task.relativePath && (
                                  <button className="source-file-link" onClick={() => handleOpenSourceFile(task.sourcePath)} style={{ fontSize: 10, padding: 0 }}>
                                    <Folder size={10} /> {task.relativePath}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          <button className="action-btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => handleStartEdit(task)}>
                            <Edit3 size={11} /> Edit
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Due Today Lane */}
                <div className="timeline-lane">
                  <div className="timeline-lane-title today">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Clock size={15} /> Due Today ({timelineData.today.length})
                    </span>
                    <span className="tab-badge" style={{ background: '#392e17', color: '#f6c466' }}>TODAY</span>
                  </div>
                  <div className="timeline-lane-cards">
                    {timelineData.today.length > 0 ? (
                      timelineData.today.map(task => (
                        <div key={task.id} className="timeline-card">
                          <div className="timeline-card-left">
                            <button
                              className="schedule-check-btn"
                              onClick={() => handleCompleteMemory(task.id)}
                              title="Mark completed"
                            >
                              <Check size={12} />
                            </button>
                            <div>
                              <div className="timeline-card-title">{task.title}</div>
                              <div className="timeline-card-meta">
                                <span className="due-badge" style={{ color: '#f6c466', borderColor: '#4d3d19' }}>
                                  <Calendar size={10} /> Today
                                </span>
                                {task.relativePath && (
                                  <button className="source-file-link" onClick={() => handleOpenSourceFile(task.sourcePath)} style={{ fontSize: 10, padding: 0 }}>
                                    <Folder size={10} /> {task.relativePath}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          <button className="action-btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => handleStartEdit(task)}>
                            <Edit3 size={11} /> Edit
                          </button>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: 11, color: '#68778f', padding: '6px 0' }}>No tasks scheduled for today.</div>
                    )}
                  </div>
                </div>

                {/* This Week Lane */}
                <div className="timeline-lane">
                  <div className="timeline-lane-title week">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CalendarDays size={15} /> This Week ({timelineData.thisWeek.length})
                    </span>
                    <span className="tab-badge blue">NEXT 7 DAYS</span>
                  </div>
                  <div className="timeline-lane-cards">
                    {timelineData.thisWeek.length > 0 ? (
                      timelineData.thisWeek.map(task => (
                        <div key={task.id} className="timeline-card">
                          <div className="timeline-card-left">
                            <button
                              className="schedule-check-btn"
                              onClick={() => handleCompleteMemory(task.id)}
                              title="Mark completed"
                            >
                              <Check size={12} />
                            </button>
                            <div>
                              <div className="timeline-card-title">{task.title}</div>
                              <div className="timeline-card-meta">
                                <span className="due-badge">
                                  <Calendar size={10} /> {task.dueDate}
                                </span>
                                {task.relativePath && (
                                  <button className="source-file-link" onClick={() => handleOpenSourceFile(task.sourcePath)} style={{ fontSize: 10, padding: 0 }}>
                                    <Folder size={10} /> {task.relativePath}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          <button className="action-btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => handleStartEdit(task)}>
                            <Edit3 size={11} /> Edit
                          </button>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: 11, color: '#68778f', padding: '6px 0' }}>No tasks due in the next 7 days.</div>
                    )}
                  </div>
                </div>

                {/* Upcoming (30 Days) Lane */}
                <div className="timeline-lane">
                  <div className="timeline-lane-title">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={15} style={{ color: '#7fdfa5' }} /> Upcoming 30 Days ({timelineData.upcoming.length})
                    </span>
                    <span className="tab-badge green">SCHEDULED</span>
                  </div>
                  <div className="timeline-lane-cards">
                    {timelineData.upcoming.length > 0 ? (
                      timelineData.upcoming.map(task => (
                        <div key={task.id} className="timeline-card">
                          <div className="timeline-card-left">
                            <button
                              className="schedule-check-btn"
                              onClick={() => handleCompleteMemory(task.id)}
                              title="Mark completed"
                            >
                              <Check size={12} />
                            </button>
                            <div>
                              <div className="timeline-card-title">{task.title}</div>
                              <div className="timeline-card-meta">
                                <span className="due-badge">
                                  <Calendar size={10} /> {task.dueDate}
                                </span>
                                {task.relativePath && (
                                  <button className="source-file-link" onClick={() => handleOpenSourceFile(task.sourcePath)} style={{ fontSize: 10, padding: 0 }}>
                                    <Folder size={10} /> {task.relativePath}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          <button className="action-btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => handleStartEdit(task)}>
                            <Edit3 size={11} /> Edit
                          </button>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: 11, color: '#68778f', padding: '6px 0' }}>No upcoming tasks scheduled in the next 30 days.</div>
                    )}
                  </div>
                </div>

                {/* Unscheduled Backlog Lane */}
                <div className="timeline-lane">
                  <div className="timeline-lane-title">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ListTodo size={15} style={{ color: '#a0aec0' }} /> Unscheduled Backlog ({timelineData.backlog.length})
                    </span>
                    <span className="tab-badge">NO DEADLINE</span>
                  </div>
                  <div className="timeline-lane-cards">
                    {timelineData.backlog.length > 0 ? (
                      timelineData.backlog.map(task => (
                        <div key={task.id} className="timeline-card">
                          <div className="timeline-card-left">
                            <button
                              className="schedule-check-btn"
                              onClick={() => handleCompleteMemory(task.id)}
                              title="Mark completed"
                            >
                              <Check size={12} />
                            </button>
                            <div>
                              <div className="timeline-card-title">{task.title}</div>
                              <div className="timeline-card-meta">
                                {task.relativePath && (
                                  <button className="source-file-link" onClick={() => handleOpenSourceFile(task.sourcePath)} style={{ fontSize: 10, padding: 0 }}>
                                    <Folder size={10} /> {task.relativePath}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          <button className="action-btn-secondary" style={{ padding: '3px 8px', fontSize: 11 }} onClick={() => handleStartEdit(task)}>
                            <Edit3 size={11} /> Schedule Date
                          </button>
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: 11, color: '#68778f', padding: '6px 0' }}>All active tasks have scheduled deadlines.</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* SUB-VIEW 4: Action Plan & Interactive Assessment Notepad */}
            {memorySubView === 'plan' && (
              <div className="action-plan-layout">
                {/* Plan Selector & Generator Bar */}
                <div className="action-plan-selector-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <label style={{ fontSize: 12, color: '#9bb1d3', fontWeight: 600 }}>Active Plan:</label>
                    <select
                      className="modal-select"
                      style={{ minWidth: 260, padding: '5px 10px', fontSize: 12 }}
                      value={activePlanId || ''}
                      onChange={e => {
                        const selId = e.target.value;
                        setActivePlanId(selId);
                        const p = actionPlans.find(x => x.id === selId);
                        if (p) setActivePlanNotes(p.rawNotes || '');
                      }}
                    >
                      {actionPlans.length === 0 && <option value="">No plans generated yet</option>}
                      {actionPlans.map(p => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      className="primary-btn"
                      onClick={() => handleGenerateActionPlan()}
                      disabled={generatingPlan}
                      title="Select assessment file, rubric, or specification to generate structured action plan"
                    >
                      <Sparkles size={13} /> {generatingPlan ? 'Generating Plan...' : 'Generate New Plan from Document'}
                    </button>
                    {activePlan && (
                      <button
                        className="danger-btn"
                        style={{ padding: '6px 10px' }}
                        onClick={() => handleDeletePlan(activePlan.id)}
                        title="Delete this plan"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {!activePlan ? (
                  <div className="empty-results" style={{ marginTop: 20 }}>
                    <div className="empty-icon"><FileStack size={26} /></div>
                    <h3>No Action Plan Selected</h3>
                    <p>
                      Generate an actionable to-do breakdown and timeline from any assessment, course rubric, or specification document.
                      It extracts milestones, timeline targets, actionable tick marks, and an interactive notepad.
                    </p>
                    <button
                      className="primary-btn"
                      onClick={() => handleGenerateActionPlan()}
                      disabled={generatingPlan}
                    >
                      <Sparkles size={14} /> {generatingPlan ? 'Analyzing Document...' : 'Choose File & Generate Plan'}
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Summary Header Card */}
                    <div className="action-plan-summary-card">
                      <div>
                        <div className="eyebrow" style={{ color: '#82b1ff' }}>ACTION PLAN & TIMELINE BREAKDOWN</div>
                        <h3 style={{ marginTop: 4 }}>{activePlan.title}</h3>
                      </div>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 11, color: '#9cb1d4' }}>
                        <span>
                          <strong>Source:</strong>{' '}
                          <button
                            className="source-file-link"
                            onClick={() => handleOpenSourceFile(activePlan.sourcePath)}
                            style={{ display: 'inline-flex', padding: 0 }}
                          >
                            <Folder size={11} /> {activePlan.sourceName || activePlan.sourcePath.split(/[/\\]/).pop()}
                          </button>
                        </span>
                        <span><strong>Summary:</strong> {activePlan.summary}</span>
                        {(activePlan.targetDeadline || activePlan.deadlines?.[0]?.date) && (
                          <span className="due-badge">
                            <Calendar size={11} /> Target Deadline: {activePlan.targetDeadline || activePlan.deadlines[0].date}
                          </span>
                        )}
                        <span style={{ color: '#8fe0b2' }}>
                          <strong>Checklist:</strong>{' '}
                          {activePlan.phases.flatMap(p => p.tasks).filter(t => t.completed).length} /{' '}
                          {activePlan.phases.flatMap(p => p.tasks).length} Tasks Done
                        </span>
                      </div>
                    </div>

                    {/* Action Plan Phases with Tick Marks */}
                    <div className="action-plan-phases">
                      {activePlan.phases.map(phase => (
                        <div key={phase.id} className="action-plan-phase-card">
                          <div className="action-plan-phase-header">
                            <h4>{phase.phaseName}</h4>
                            <span className="action-plan-phase-timeline">{phase.targetTimeline}</span>
                          </div>
                          {phase.description && (
                            <div style={{ fontSize: 11, color: '#8b97a8' }}>{phase.description}</div>
                          )}
                          <div className="action-plan-tasks-list">
                            {phase.tasks.map(task => (
                              <div key={task.id} className="plan-task-row">
                                <button
                                  className={`plan-tick-btn ${task.completed ? 'checked' : ''}`}
                                  onClick={() => handleTogglePlanStep(activePlan.id, task.id, !task.completed)}
                                  title={task.completed ? 'Mark incomplete' : 'Mark task complete [x]'}
                                >
                                  {task.completed ? <Check size={12} /> : null}
                                </button>
                                <div className="plan-task-info">
                                  <div className={`plan-task-title ${task.completed ? 'checked' : ''}`}>
                                    {task.title}
                                  </div>
                                  {task.description && (
                                    <div className="plan-task-desc">{task.description}</div>
                                  )}
                                  <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', fontSize: 10, color: '#7e8b9f' }}>
                                    {task.dueDate && (
                                      <span className="due-badge">
                                        <Calendar size={10} /> {task.dueDate}
                                      </span>
                                    )}
                                    {task.points && (
                                      <span style={{ background: '#1c2637', color: '#9cb3d8', padding: '1px 6px', borderRadius: 3, border: '1px solid #283952' }}>
                                        Weight: {task.points}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Interactive Plan Notepad */}
                    <div className="plan-notepad-panel">
                      <div className="plan-notepad-header">
                        <h4>
                          <Edit3 size={14} style={{ color: '#8fe0b2' }} /> Assessment Notes & Scratchpad
                        </h4>
                        <button
                          className="secondary-btn"
                          style={{ padding: '4px 10px', fontSize: 11 }}
                          onClick={() => handleSavePlanNotes(activePlan.id)}
                        >
                          <Save size={12} /> Save Notes
                        </button>
                      </div>
                      <div style={{ fontSize: 11, color: '#7a889e' }}>
                        Live scratchpad for notes, rubric checklist, and implementation reminders for this plan. Automatically persisted.
                      </div>
                      <textarea
                        className="plan-notepad-textarea"
                        value={activePlanNotes}
                        onChange={e => setActivePlanNotes(e.target.value)}
                        placeholder="Type implementation notes, assignment criteria checklist, scratchpad thoughts..."
                      />
                    </div>
                  </>
                )}
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

            <div className="settings-section" style={{ marginTop: 24 }}>
              <div className="section-title-row">
                <div className="section-title-icon"><Calendar size={17}/></div>
                <div>
                  <h3>Daily Memory Briefing</h3>
                  <p>Configure local notification reminders, preferred scheduling time, and clipboard inclusion.</p>
                </div>
              </div>
              <div className="settings-group">
                <div className="settings-row">
                  <div className="settings-icon"><Clock size={18}/></div>
                  <div className="settings-copy">
                    <strong>Daily Desktop Reminder</strong>
                    <p>Trigger a private local notification when today's briefing is ready. Runs while RecallDesk is active.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={briefingSettings?.notificationsEnabled || false}
                    onChange={e => handleUpdateBriefingSettings({ notificationsEnabled: e.target.checked })}
                  />
                </div>
                {briefingSettings?.notificationsEnabled && (
                  <div className="settings-row">
                    <div className="settings-icon"><Calendar size={18}/></div>
                    <div className="settings-copy">
                      <strong>Scheduled Reminder Time</strong>
                      <p>Time of day for the local notification reminder.</p>
                    </div>
                    <input
                      type="time"
                      className="briefing-pref-time"
                      value={briefingSettings?.preferredTime || '09:00'}
                      onChange={e => handleUpdateBriefingSettings({ preferredTime: e.target.value })}
                    />
                  </div>
                )}
                <div className="settings-row">
                  <div className="settings-icon"><ClipboardList size={18}/></div>
                  <div className="settings-copy">
                    <strong>Include Clipboard Memory</strong>
                    <p>Summarize non-sensitive copied commands, code, and notes in the briefing (disabled by default).</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={briefingSettings?.includeClipboard || false}
                    onChange={e => handleUpdateBriefingSettings({ includeClipboard: e.target.checked })}
                  />
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
