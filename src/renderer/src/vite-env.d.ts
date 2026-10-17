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
  extractMemory: () => Promise<{ extractedCount: number; newCount: number; totalProcessed: number }>;
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
}

declare global {
  interface Window {
    recallDesk: RecallDeskAPI;
    openSearch: RecallDeskAPI;
  }
}
