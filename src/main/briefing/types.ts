export type BriefingScope = 'all' | string; // 'all' or specific project root path

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
  date: string; // YYYY-MM-DD
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
  preferredTime: string; // "HH:MM" e.g. "09:00"
  lastNotifiedDate?: string; // "YYYY-MM-DD"
  defaultScope: BriefingScope;
}

export interface BriefingGenerateOptions {
  scope?: BriefingScope;
  includeClipboard?: boolean;
  forceRegenerate?: boolean;
}
