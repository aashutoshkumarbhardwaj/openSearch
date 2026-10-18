import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ClipboardContentType,
  ClipboardFilter,
  ClipboardItem,
  ClipboardSearchResult,
  ClipboardSettings
} from './types.ts';
import {
  createClipboardHash,
  detectContentType,
  isSensitiveText
} from './sensitive.ts';

const DEFAULT_SETTINGS: ClipboardSettings = {
  enabled: false,
  paused: false,
  pollIntervalMs: 1000,
  minCharLength: 4,
  maxCharLength: 50000,
  retentionLimit: 200,
  ignoredApps: ['1Password', 'Bitwarden', 'KeePassXC', 'LastPass'],
  filterSensitiveData: true
};

function cosine(a: number[], b: number[]): number {
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? dot / (Math.sqrt(aa) * Math.sqrt(bb)) : 0;
}

export class ClipboardStore {
  private itemsFilePath: string;
  private settingsFilePath: string;
  private items: Map<string, ClipboardItem> = new Map();
  private hashes: Map<string, string> = new Map(); // contentHash -> item.id
  private settings: ClipboardSettings = { ...DEFAULT_SETTINGS };
  private loaded = false;

  constructor(storageDir: string) {
    this.itemsFilePath = join(storageDir, 'clipboard-memory-v1.json');
    this.settingsFilePath = join(storageDir, 'clipboard-settings-v1.json');
  }

  public async load(): Promise<void> {
    this.items.clear();
    this.hashes.clear();

    // 1. Load settings
    try {
      const rawSettings = await fs.readFile(this.settingsFilePath, 'utf8');
      const parsedSettings = JSON.parse(rawSettings);
      this.settings = { ...DEFAULT_SETTINGS, ...parsedSettings };
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }

    // 2. Load items
    try {
      const raw = await fs.readFile(this.itemsFilePath, 'utf8');
      const data = JSON.parse(raw);
      const list: ClipboardItem[] = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);

      for (const item of list) {
        if (item && typeof item.id === 'string' && typeof item.text === 'string') {
          const hash = item.contentHash || createClipboardHash(item.text);
          const validItem: ClipboardItem = {
            id: item.id,
            text: item.text,
            capturedAt: item.capturedAt || Date.now(),
            contentHash: hash,
            charCount: item.charCount || item.text.length,
            lineCount: item.lineCount || item.text.split('\n').length,
            contentType: item.contentType || detectContentType(item.text),
            isPinned: Boolean(item.isPinned),
            label: item.label,
            sourceApp: item.sourceApp,
            embedding: item.embedding
          };
          this.items.set(validItem.id, validItem);
          this.hashes.set(hash, validItem.id);
        }
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.warn('Failed to load clipboard store; starting empty:', err);
      }
    }

    this.loaded = true;
  }

  public async save(): Promise<void> {
    const list = Array.from(this.items.values()).sort((a, b) => {
      // Pinned first, then newest capturedAt
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.capturedAt - a.capturedAt;
    });

    const tempItems = `${this.itemsFilePath}.tmp.${Date.now()}`;
    await fs.writeFile(tempItems, JSON.stringify({ version: 1, items: list }, null, 2), 'utf8');
    await fs.rename(tempItems, this.itemsFilePath);

    const tempSettings = `${this.settingsFilePath}.tmp.${Date.now()}`;
    await fs.writeFile(tempSettings, JSON.stringify(this.settings, null, 2), 'utf8');
    await fs.rename(tempSettings, this.settingsFilePath);
  }

  public getSettings(): ClipboardSettings {
    return { ...this.settings };
  }

  public async updateSettings(updates: Partial<ClipboardSettings>): Promise<ClipboardSettings> {
    this.settings = { ...this.settings, ...updates };
    await this.save();
    return { ...this.settings };
  }

  public async addItem(
    text: string,
    metadata?: { sourceApp?: string; label?: string }
  ): Promise<{ item: ClipboardItem | null; status: 'added' | 'duplicate_updated' | 'filtered' }> {
    const trimmed = text.trim();
    if (trimmed.length < this.settings.minCharLength || text.length > this.settings.maxCharLength) {
      return { item: null, status: 'filtered' };
    }

    if (this.settings.filterSensitiveData) {
      const { isSensitive } = isSensitiveText(text);
      if (isSensitive) {
        return { item: null, status: 'filtered' };
      }
    }

    const hash = createClipboardHash(text);
    const existingId = this.hashes.get(hash);

    if (existingId && this.items.has(existingId)) {
      const existing = this.items.get(existingId)!;
      existing.capturedAt = Date.now();
      if (metadata?.sourceApp) existing.sourceApp = metadata.sourceApp;
      if (metadata?.label) existing.label = metadata.label;
      await this.save();
      return { item: { ...existing }, status: 'duplicate_updated' };
    }

    const lines = text.split('\n');
    const newItem: ClipboardItem = {
      id: randomUUID(),
      text,
      capturedAt: Date.now(),
      contentHash: hash,
      charCount: text.length,
      lineCount: lines.length,
      contentType: detectContentType(text),
      isPinned: false,
      label: metadata?.label,
      sourceApp: metadata?.sourceApp
    };

    this.items.set(newItem.id, newItem);
    this.hashes.set(hash, newItem.id);

    // Enforce retention limit (pinned items are protected from eviction)
    this.enforceRetentionLimit();

    await this.save();
    return { item: { ...newItem }, status: 'added' };
  }

  private enforceRetentionLimit(): void {
    const limit = Math.max(1, this.settings.retentionLimit || 200);
    const total = this.items.size;
    if (total <= limit) return;

    // Separate pinned from unpinned
    const unpinned: ClipboardItem[] = [];
    for (const item of this.items.values()) {
      if (!item.isPinned) unpinned.push(item);
    }

    // Sort unpinned by capturedAt ascending (oldest first)
    unpinned.sort((a, b) => a.capturedAt - b.capturedAt);

    const toRemoveCount = total - limit;
    for (let i = 0; i < Math.min(toRemoveCount, unpinned.length); i++) {
      const target = unpinned[i];
      this.items.delete(target.id);
      this.hashes.delete(target.contentHash);
    }
  }

  public listItems(filter?: ClipboardFilter): ClipboardItem[] {
    let list = Array.from(this.items.values());

    if (filter?.pinnedOnly) {
      list = list.filter(i => i.isPinned);
    }

    if (filter?.contentType && filter.contentType !== 'all') {
      list = list.filter(i => i.contentType === filter.contentType);
    }

    list.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.capturedAt - a.capturedAt;
    });

    if (filter?.limit && filter.limit > 0) {
      return list.slice(0, filter.limit);
    }

    return list;
  }

  public search(
    query: string,
    options?: {
      pinnedOnly?: boolean;
      contentType?: ClipboardContentType | 'all';
      queryEmbedding?: number[];
      limit?: number;
    }
  ): ClipboardSearchResult[] {
    const q = (query || '').trim().toLowerCase();
    const queryWords = q.split(/\s+/).filter(w => w.length > 1);
    const maxResults = options?.limit || 50;

    let candidates = Array.from(this.items.values());

    if (options?.pinnedOnly) {
      candidates = candidates.filter(i => i.isPinned);
    }

    if (options?.contentType && options.contentType !== 'all') {
      candidates = candidates.filter(i => i.contentType === options.contentType);
    }

    // If query is empty, return recent items
    if (!q) {
      return candidates
        .sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return b.capturedAt - a.capturedAt;
        })
        .slice(0, maxResults)
        .map(item => ({ item, score: 1, matchReason: 'exact' }));
    }

    const scored: ClipboardSearchResult[] = [];

    for (const item of candidates) {
      const textLower = item.text.toLowerCase();
      const labelLower = (item.label || '').toLowerCase();
      let lexicalScore = 0;
      let matchReason: 'exact' | 'keyword' | 'semantic' = 'keyword';

      // Exact substring match has high priority
      if (textLower.includes(q) || labelLower.includes(q)) {
        lexicalScore += 2.0;
        matchReason = 'exact';
      }

      // Individual keyword match
      if (queryWords.length > 0) {
        let matchedWords = 0;
        for (const w of queryWords) {
          if (textLower.includes(w) || labelLower.includes(w)) {
            matchedWords++;
          }
        }
        lexicalScore += (matchedWords / queryWords.length);
      }

      // Optional semantic score if embeddings are available
      let semanticScore = 0;
      if (options?.queryEmbedding && item.embedding && item.embedding.length > 0) {
        semanticScore = cosine(options.queryEmbedding, item.embedding);
        if (semanticScore > 0.65 && matchReason !== 'exact') {
          matchReason = 'semantic';
        }
      }

      // Combined score: lexical weighted + semantic weighted
      const combinedScore = (lexicalScore * 0.7) + (semanticScore * 0.3);

      if (lexicalScore > 0 || semanticScore > 0.6) {
        scored.push({
          item,
          score: combinedScore,
          matchReason
        });
      }
    }

    // Sort by score descending; if tied, pinned items first, then newer items
    scored.sort((a, b) => {
      if (Math.abs(a.score - b.score) > 0.05) return b.score - a.score;
      if (a.item.isPinned !== b.item.isPinned) return a.item.isPinned ? -1 : 1;
      return b.item.capturedAt - a.item.capturedAt;
    });

    return scored.slice(0, maxResults);
  }

  public async pinItem(id: string, isPinned: boolean): Promise<ClipboardItem | null> {
    const item = this.items.get(id);
    if (!item) return null;
    item.isPinned = isPinned;
    await this.save();
    return { ...item };
  }

  public async setLabel(id: string, label: string): Promise<ClipboardItem | null> {
    const item = this.items.get(id);
    if (!item) return null;
    item.label = label.trim() || undefined;
    await this.save();
    return { ...item };
  }

  public async deleteItem(id: string): Promise<boolean> {
    const item = this.items.get(id);
    if (!item) return false;
    this.items.delete(id);
    this.hashes.delete(item.contentHash);
    await this.save();
    return true;
  }

  public async clearHistory(preservePinned = true): Promise<number> {
    let clearedCount = 0;
    const toDelete: string[] = [];

    for (const [id, item] of this.items.entries()) {
      if (preservePinned && item.isPinned) continue;
      toDelete.push(id);
    }

    for (const id of toDelete) {
      const item = this.items.get(id);
      if (item) {
        this.hashes.delete(item.contentHash);
        this.items.delete(id);
        clearedCount++;
      }
    }

    await this.save();
    return clearedCount;
  }

  public getItem(id: string): ClipboardItem | null {
    const item = this.items.get(id);
    return item ? { ...item } : null;
  }

  public getUnembeddedItems(limit = 20): ClipboardItem[] {
    const result: ClipboardItem[] = [];
    for (const item of this.items.values()) {
      if (!item.embedding || item.embedding.length === 0) {
        result.push(item);
        if (result.length >= limit) break;
      }
    }
    return result;
  }

  public async setItemEmbedding(id: string, embedding: number[]): Promise<void> {
    const item = this.items.get(id);
    if (item) {
      item.embedding = embedding;
      await this.save();
    }
  }
}
