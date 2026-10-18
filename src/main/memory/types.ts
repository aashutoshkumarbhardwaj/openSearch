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
  confidence?: number; // 0.0 to 1.0
  confidenceReason?: string;
  dueDate?: string; // Explicit date string if present in source or provided by user
  createdAt: number;
  updatedAt: number;
  contentHash: string; // Stable deduplication key
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

export interface ExtractionOptions {
  forceAll?: boolean;
  chunkBatchSize?: number;
  targetPaths?: string[];
}

export interface MemoryFilter {
  type?: MemoryType;
  status?: MemoryStatus;
  query?: string;
}

export interface MemorySearchResult {
  item: MemoryItem;
  score: number;
}

export interface SourceChunk {
  id: string;
  path: string;
  relativePath: string;
  name: string;
  text: string;
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
