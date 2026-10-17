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

export interface IngestedSource {
  id: string;
  originalPath: string;
  relativePath: string;
  displayName: string;
  sourceType: SourceType;
  mimeType: string;
  sizeBytes: number;
  extractedText: string;
  metadata: {
    lineCount?: number;
    pageCount?: number;
    extension?: string;
    hasImages?: boolean;
    imageDimensions?: { width: number; height: number };
    [key: string]: any;
  };
  evidenceLocations: EvidenceLocation[];
  status: 'ready' | 'error' | 'unsupported';
  error?: string;
  unsupportedReason?: string;
  imageDataBase64?: string; // If image source
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
  confidence?: number; // 0.0 - 1.0
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
