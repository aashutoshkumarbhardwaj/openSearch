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

