/// <reference types="vite/client" />

export type MemoryType = 'task' | 'decision';
export type MemoryStatus = 'suggested' | 'open' | 'completed' | 'dismissed';

export interface MemoryItem {
  id: string;
  type: MemoryType;
  title: string;
  details?: string;
  sourcePath: string;
  relativePath: string;
  sourceExcerpt: string;
  status: MemoryStatus;
  confidence?: number;
  confidenceReason?: string;
  dueDate?: string;
  createdAt: number;
  updatedAt: number;
  contentHash: string;
  chunkId?: string;
}

export interface ExtractionProgress {
  stage: 'idle' | 'extracting' | 'completed' | 'cancelled' | 'error';
  currentChunk: number;
  totalChunks: number;
  extractedCount: number;
  newCount: number;
  message: string;
  done: boolean;
  error?: string;
}

export interface MemorySearchResult {
  item: MemoryItem;
  score: number;
}

export interface ActionPlanTask {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  completed: boolean;
  sourceExcerpt?: string;
  memoryItemId?: string;
  points?: string;
}

export interface ActionPlanPhase {
  id: string;
  phaseName: string;
  targetTimeline?: string;
  description?: string;
  tasks: ActionPlanTask[];
}

export interface ActionPlan {
  id: string;
  title: string;
  sourcePath: string;
  sourceName: string;
  createdAt: string;
  updatedAt: string;
  summary: string;
  rawNotes: string;
  phases: ActionPlanPhase[];
  deadlines: Array<{ title: string; date: string; description?: string }>;
  targetDeadline?: string;
}

// Universal Project Intelligence Types
export type SourceType =
  | 'text'
  | 'markdown'
  | 'code'
  | 'pdf'
  | 'image'
  | 'folder'
  | 'indexed'
  | 'unsupported';

export type AnalysisGoal =
  | 'overview'
  | 'next_actions'
  | 'tasks'
  | 'decisions'
  | 'issues'
  | 'images'
  | 'custom';

export type EvidenceClassification =
  | 'explicitly_stated'
  | 'directly_observed'
  | 'inferred'
  | 'suggested';

export type FindingType =
  | 'task'
  | 'decision'
  | 'issue'
  | 'recommendation'
  | 'question'
  | 'overview';

export type FindingStatus = 'suggested' | 'accepted' | 'dismissed';

export interface SourceItem {
  id: string;
  path: string;
  name: string;
  type: SourceType;
  sizeBytes: number;
  sizeFormatted: string;
  isFolder?: boolean;
  isIndexed?: boolean;
  status: 'ready' | 'error' | 'unsupported';
  warning?: string;
}

export interface EvidenceLocation {
  lineStart?: number;
  lineEnd?: number;
  page?: number;
  region?: string;
}

export interface Finding {
  id: string;
  type: FindingType;
  title: string;
  description: string;
  reason?: string;
  sourcePath: string;
  sourceName: string;
  sourceExcerpt: string;
  evidenceClassification: EvidenceClassification;
  confidence?: number;
  evidenceLocation?: EvidenceLocation;
  status: FindingStatus;
  targetMemoryType?: 'task' | 'decision';
  dueDate?: string;
  createdAt: number;
  updatedAt: number;
}

export interface IntelligenceAnalysisResult {
  overview: string;
  goal: AnalysisGoal;
  customInstructions?: string;
  findings: Finding[];
  sourcesAnalyzed: {
    total: number;
    successful: number;
    failed: number;
    unsupported: number;
    details: Array<{ path: string; name: string; type: SourceType; status: string }>;
  };
  warnings: string[];
  modelUsed: string;
  completedAt: number;
}

export interface IntelligenceProgress {
  stage: 'inspecting' | 'ingesting' | 'analyzing' | 'completed' | 'cancelled' | 'error';
  percent: number;
  currentSource?: string;
  sourcesProcessed: number;
  totalSources: number;
  findingsCount: number;
  message: string;
  done: boolean;
  error?: string;
}

export interface IntelligenceRunOptions {
  sources: Array<{ path: string; isFolder?: boolean; isIndexed?: boolean }>;
  goal: AnalysisGoal;
  customInstructions?: string;
}

export interface RecallDeskAPI {
  info: () => Promise<any>;
  chooseFolders: () => Promise<string[]>;
  startIndex: (roots: string[]) => Promise<any>;
  search: (query: string) => Promise<any[]>;
  ask: (question: string) => Promise<{
    answer: string;
    sources: { id: number; path: string }[];
  }>;
  listModels: () => Promise<{
    ollamaRunning: boolean;
    activeModel: string;
    installedModels: Array<{ name: string; sizeBytes: number; sizeFormatted: string; modifiedAt: string }>;
    recommendedModels: Array<{ id: string; name: string; size: string; desc: string }>;
    error?: string;
  }>;
  setActiveModel: (model: string) => Promise<{ success: boolean; activeModel: string }>;
  pullModel: (model: string) => Promise<{ success: boolean; activeModel: string }>;
  deleteModel: (model: string) => Promise<{ success: boolean; activeModel: string }>;
  clearEmbeddings: () => Promise<boolean>;
  onPullProgress: (callback: (data: any) => void) => () => void;
  openFile: (path: string) => Promise<string>;
  clearIndex: () => Promise<boolean>;
  loadModel: () => Promise<string>;
  onProgress: (callback: (payload: any) => void) => () => void;
  onModelStatus: (callback: (status: string) => void) => () => void;
  onFocusSearch: (callback: () => void) => () => void;

  // Decision & Task Memory API
  listMemory: (filter?: { type?: MemoryType; status?: MemoryStatus; query?: string }) => Promise<MemoryItem[]>;
  chooseMemoryFiles: () => Promise<string[]>;
  chooseMemoryFolders: () => Promise<string[]>;
  extractMemory: (options?: { targetPaths?: string[] }) => Promise<{ extractedCount: number; newCount: number; totalProcessed: number }>;
  cancelExtractMemory: () => Promise<boolean>;
  confirmMemory: (id: string) => Promise<MemoryItem>;
  updateMemory: (payload: { id: string; updates: { title?: string; details?: string; dueDate?: string; status?: MemoryStatus } }) => Promise<MemoryItem>;
  dismissMemory: (id: string) => Promise<MemoryItem>;
  completeMemory: (id: string) => Promise<MemoryItem>;
  reopenMemory: (id: string) => Promise<MemoryItem>;
  deleteMemory: (id: string) => Promise<boolean>;
  createMemory: (payload: {
    type: MemoryType;
    title: string;
    details?: string;
    sourcePath?: string;
    relativePath?: string;
    sourceExcerpt?: string;
    dueDate?: string;
    status?: MemoryStatus;
  }) => Promise<MemoryItem>;
  searchMemory: (query: string, options?: { includeSuggested?: boolean; status?: MemoryStatus; type?: MemoryType }) => Promise<MemorySearchResult[]>;
  openSourceFile: (path: string) => Promise<string>;
  onExtractionProgress: (callback: (data: ExtractionProgress) => void) => () => void;
  generateActionPlan: (filePath: string) => Promise<ActionPlan>;
  listActionPlans: () => Promise<ActionPlan[]>;
  toggleActionPlanStep: (payload: { planId: string; taskId: string; completed: boolean }) => Promise<ActionPlan | null>;
  saveActionPlanNotes: (payload: { planId: string; notes: string }) => Promise<ActionPlan | null>;
  deleteActionPlan: (planId: string) => Promise<boolean>;

  // Universal Project Intelligence API
  chooseFilesToAnalyze: () => Promise<string[]>;
  chooseFoldersToAnalyze: () => Promise<string[]>;
  inspectSources: (paths: string[]) => Promise<SourceItem[]>;
  runIntelligenceAnalysis: (options: IntelligenceRunOptions) => Promise<IntelligenceAnalysisResult>;
  cancelIntelligenceAnalysis: () => Promise<boolean>;
  acceptFinding: (payload: {
    finding: Finding;
    targetType: 'task' | 'decision';
    editedTitle?: string;
    editedDetails?: string;
    dueDate?: string;
  }) => Promise<{ success: boolean; memoryItem: MemoryItem }>;
  onIntelligenceProgress: (callback: (data: IntelligenceProgress) => void) => () => void;

  // Searchable Clipboard Memory API
  getClipboardSettings: () => Promise<ClipboardSettings>;
  updateClipboardSettings: (updates: Partial<ClipboardSettings>) => Promise<ClipboardSettings>;
  listClipboardItems: (filter?: ClipboardFilter) => Promise<ClipboardItem[]>;
  searchClipboard: (query: string, options?: { pinnedOnly?: boolean; contentType?: ClipboardContentType | 'all'; limit?: number }) => Promise<ClipboardSearchResult[]>;
  copyClipboardItem: (id: string) => Promise<{ success: boolean }>;
  pinClipboardItem: (id: string, isPinned: boolean) => Promise<ClipboardItem>;
  setClipboardLabel: (id: string, label: string) => Promise<ClipboardItem>;
  deleteClipboardItem: (id: string) => Promise<boolean>;
  clearClipboardHistory: (preservePinned?: boolean) => Promise<number>;
  onClipboardItemCaptured: (callback: (data: { item: ClipboardItem; status: 'added' | 'duplicate_updated' }) => void) => () => void;
  onFocusClipboard: (callback: () => void) => () => void;

  // Daily Memory Briefing API
  getTodayBriefing: (scope?: string) => Promise<DailyBriefing | null>;
  generateBriefing: (options?: BriefingGenerateOptions) => Promise<DailyBriefing>;
  listBriefingHistory: (limit?: number) => Promise<DailyBriefing[]>;
  deleteBriefing: (id: string) => Promise<boolean>;
  getBriefingSettings: () => Promise<BriefingSettings>;
  updateBriefingSettings: (updates: Partial<BriefingSettings>) => Promise<BriefingSettings>;
  getBriefingActivityLog: (limit?: number, scope?: string) => Promise<BriefingActivityItem[]>;
  onNavigateBriefing: (callback: () => void) => () => void;
}

export type BriefingScope = 'all' | string;

export interface BriefingFocusItem {
  id: string;
  title: string;
  rationale: string;
  priority: 'high' | 'medium' | 'low';
  relatedTaskId?: string;
  relatedSource?: string;
  isCompleted?: boolean;
}

export interface BriefingTaskItem {
  id: string;
  title: string;
  details?: string;
  dueDate?: string;
  sourcePath?: string;
  relativePath?: string;
  status: 'open' | 'completed';
}

export interface BriefingDecisionItem {
  id: string;
  title: string;
  details?: string;
  sourcePath?: string;
  relativePath?: string;
  updatedAt: number;
}

export interface BriefingActivityItem {
  id: string;
  type: 'indexing' | 'task' | 'decision' | 'intelligence' | 'file_change';
  description: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface DailyBriefing {
  id: string;
  date: string;
  createdAt: number;
  scope: BriefingScope;
  scopeName: string;
  summary: string;
  focusItems: BriefingFocusItem[];
  openTasks: BriefingTaskItem[];
  completedRecently: BriefingTaskItem[];
  keyDecisions: BriefingDecisionItem[];
  recentActivity: BriefingActivityItem[];
  insufficientData: boolean;
  generationType: 'ai' | 'deterministic';
  modelUsed?: string;
}

export interface BriefingSettings {
  enabled: boolean;
  includeClipboard: boolean;
  notificationsEnabled: boolean;
  preferredTime: string;
  lastNotifiedDate?: string;
  defaultScope: BriefingScope;
}

export interface BriefingGenerateOptions {
  scope?: BriefingScope;
  includeClipboard?: boolean;
  forceRegenerate?: boolean;
}

export type ClipboardContentType = 'code' | 'command' | 'url' | 'json' | 'text';

export interface ClipboardItem {
  id: string;
  text: string;
  capturedAt: number;
  contentHash: string;
  charCount: number;
  lineCount: number;
  contentType: ClipboardContentType;
  isPinned: boolean;
  label?: string;
  sourceApp?: string;
  embedding?: number[];
}

export interface ClipboardSettings {
  enabled: boolean;
  paused: boolean;
  pollIntervalMs: number;
  minCharLength: number;
  maxCharLength: number;
  retentionLimit: number;
  ignoredApps: string[];
  filterSensitiveData: boolean;
}

export interface ClipboardFilter {
  query?: string;
  pinnedOnly?: boolean;
  contentType?: ClipboardContentType | 'all';
  limit?: number;
}

export interface ClipboardSearchResult {
  item: ClipboardItem;
  score: number;
  matchReason: 'exact' | 'keyword' | 'semantic';
}

declare global {
  interface Window {
    recallDesk: RecallDeskAPI;
    openSearch: RecallDeskAPI;
  }
}
