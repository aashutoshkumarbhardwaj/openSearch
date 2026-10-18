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
