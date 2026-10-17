import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import type { MemoryItem, MemoryFilter, MemoryStatus, MemoryType } from './types.ts';

export function createContentHash(
  type: MemoryType,
  sourcePath: string,
  title: string,
  sourceExcerpt: string
): string {
  const normType = type.trim().toLowerCase();
  const normPath = (sourcePath || '').trim().toLowerCase();
  const normTitle = (title || '').trim().toLowerCase().replace(/\s+/g, ' ');
  // Use first 150 chars of normalized excerpt for robust deduplication across slight spacing differences
  const normExcerpt = (sourceExcerpt || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 150);

  return createHash('sha256')
    .update(`${normType}:${normPath}:${normTitle}:${normExcerpt}`)
    .digest('hex');
}

export function isValidMemoryItem(item: any): item is MemoryItem {
  if (!item || typeof item !== 'object') return false;
  if (typeof item.id !== 'string' || !item.id.trim()) return false;
  if (item.type !== 'task' && item.type !== 'decision') return false;
  if (typeof item.title !== 'string' || !item.title.trim()) return false;
  if (typeof item.sourcePath !== 'string') return false;
  if (typeof item.sourceExcerpt !== 'string') return false;
  if (!['suggested', 'open', 'completed', 'dismissed'].includes(item.status)) return false;
  if (typeof item.createdAt !== 'number' || typeof item.updatedAt !== 'number') return false;
  return true;
}

export class MemoryStore {
  private filePath: string;
  private items: Map<string, MemoryItem> = new Map();
  private hashes: Map<string, string> = new Map(); // contentHash -> item.id
  private loaded = false;

  constructor(storageDir: string) {
    this.filePath = join(storageDir, 'memory-items-v1.json');
  }

  public async load(): Promise<void> {
    this.items.clear();
    this.hashes.clear();

    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const data = JSON.parse(raw);
      const list = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);

      for (const rawItem of list) {
        if (isValidMemoryItem(rawItem)) {
          // Ensure contentHash is present
          const hash = rawItem.contentHash || createContentHash(
            rawItem.type,
            rawItem.sourcePath,
            rawItem.title,
            rawItem.sourceExcerpt
          );
          const item: MemoryItem = { ...rawItem, contentHash: hash };
          this.items.set(item.id, item);
          this.hashes.set(hash, item.id);
        }
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        console.warn('Failed to load memory store from disk; starting with empty store:', err);
      }
    }

    this.loaded = true;
  }

  public async save(): Promise<void> {
    const list = Array.from(this.items.values());
    const tempFile = `${this.filePath}.tmp.${Date.now()}`;
    const payload = JSON.stringify({ version: 1, items: list }, null, 2);

    await fs.writeFile(tempFile, payload, 'utf8');
    await fs.rename(tempFile, this.filePath);
  }

  public getItems(filter?: MemoryFilter): MemoryItem[] {
    let list = Array.from(this.items.values());

    if (filter) {
      if (filter.type) {
        list = list.filter(i => i.type === filter.type);
      }
      if (filter.status) {
        list = list.filter(i => i.status === filter.status);
      }
      if (filter.query && filter.query.trim()) {
        const q = filter.query.toLowerCase().trim();
        list = list.filter(i =>
          i.title.toLowerCase().includes(q) ||
          (i.details && i.details.toLowerCase().includes(q)) ||
          i.sourceExcerpt.toLowerCase().includes(q) ||
          i.sourcePath.toLowerCase().includes(q)
        );
      }
    }

    // Sort: suggestions & open first, then completed, then dismissed; newest first within status
    const statusOrder: Record<MemoryStatus, number> = {
      suggested: 0,
      open: 1,
      completed: 2,
      dismissed: 3
    };

    return list.sort((a, b) => {
      const orderDiff = statusOrder[a.status] - statusOrder[b.status];
      if (orderDiff !== 0) return orderDiff;
      return b.updatedAt - a.updatedAt;
    });
  }

  public getItem(id: string): MemoryItem | null {
    return this.items.get(id) || null;
  }

  public findByHash(hash: string): MemoryItem | null {
    const id = this.hashes.get(hash);
    if (!id) return null;
    return this.items.get(id) || null;
  }

  public async addSuggestions(
    candidates: Array<{
      type: MemoryType;
      title: string;
      details?: string;
      sourcePath: string;
      relativePath?: string;
      sourceExcerpt: string;
      confidence?: number;
      confidenceReason?: string;
      dueDate?: string;
      chunkId?: string;
    }>
  ): Promise<MemoryItem[]> {
    const added: MemoryItem[] = [];
    const now = Date.now();

    for (const c of candidates) {
      if (!c.title || !c.title.trim()) continue;
      if (!c.sourceExcerpt || !c.sourceExcerpt.trim()) continue;
      if (c.type !== 'task' && c.type !== 'decision') continue;

      const hash = createContentHash(c.type, c.sourcePath, c.title, c.sourceExcerpt);

      // Duplicate prevention: if already exists (suggested, open, completed, or dismissed), do not re-add
      if (this.hashes.has(hash)) {
        continue;
      }

      // Also check if an item with the same normalized title and source file already exists
      const existingSameTitle = Array.from(this.items.values()).find(
        existing =>
          existing.type === c.type &&
          existing.sourcePath === c.sourcePath &&
          existing.title.trim().toLowerCase() === c.title.trim().toLowerCase()
      );
      if (existingSameTitle) {
        continue;
      }

      const item: MemoryItem = {
        id: randomUUID(),
        type: c.type,
        title: c.title.trim(),
        details: c.details ? c.details.trim() : undefined,
        sourcePath: c.sourcePath,
        relativePath: c.relativePath || '',
        sourceExcerpt: c.sourceExcerpt.trim(),
        status: 'suggested',
        confidence: typeof c.confidence === 'number' ? Math.max(0, Math.min(1, c.confidence)) : 0.8,
        confidenceReason: c.confidenceReason?.trim(),
        dueDate: c.dueDate?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
        contentHash: hash,
        chunkId: c.chunkId
      };

      this.items.set(item.id, item);
      this.hashes.set(hash, item.id);
      added.push(item);
    }

    if (added.length > 0) {
      await this.save();
    }

    return added;
  }

  public async confirmItem(id: string): Promise<MemoryItem> {
    const item = this.items.get(id);
    if (!item) throw new Error(`Memory item not found: ${id}`);
    if (item.status !== 'suggested') {
      throw new Error(`Cannot confirm item with status: ${item.status}`);
    }

    item.status = 'open';
    item.updatedAt = Date.now();
    await this.save();
    return item;
  }

  public async updateItem(
    id: string,
    updates: {
      title?: string;
      details?: string;
      dueDate?: string;
      status?: MemoryStatus;
    }
  ): Promise<MemoryItem> {
    const item = this.items.get(id);
    if (!item) throw new Error(`Memory item not found: ${id}`);

    if (updates.title !== undefined) {
      const trimmed = updates.title.trim();
      if (!trimmed) throw new Error('Title cannot be empty');
      item.title = trimmed;
    }

    if (updates.details !== undefined) {
      item.details = updates.details.trim() || undefined;
    }

    if (updates.dueDate !== undefined) {
      item.dueDate = updates.dueDate.trim() || undefined;
    }

    if (updates.status !== undefined) {
      if (!['suggested', 'open', 'completed', 'dismissed'].includes(updates.status)) {
        throw new Error(`Invalid status: ${updates.status}`);
      }
      item.status = updates.status;
    }

    item.updatedAt = Date.now();
    await this.save();
    return item;
  }

  public async dismissItem(id: string): Promise<MemoryItem> {
    const item = this.items.get(id);
    if (!item) throw new Error(`Memory item not found: ${id}`);

    item.status = 'dismissed';
    item.updatedAt = Date.now();
    await this.save();
    return item;
  }

  public async completeItem(id: string): Promise<MemoryItem> {
    const item = this.items.get(id);
    if (!item) throw new Error(`Memory item not found: ${id}`);
    if (item.type !== 'task') {
      throw new Error('Only tasks can be marked as completed.');
    }

    item.status = 'completed';
    item.updatedAt = Date.now();
    await this.save();
    return item;
  }

  public async reopenItem(id: string): Promise<MemoryItem> {
    const item = this.items.get(id);
    if (!item) throw new Error(`Memory item not found: ${id}`);

    item.status = 'open';
    item.updatedAt = Date.now();
    await this.save();
    return item;
  }

  public async deleteItem(id: string): Promise<boolean> {
    const item = this.items.get(id);
    if (!item) return false;

    this.items.delete(id);
    this.hashes.delete(item.contentHash);
    await this.save();
    return true;
  }

  public async createManualItem(data: {
    type: MemoryType;
    title: string;
    details?: string;
    sourcePath?: string;
    relativePath?: string;
    sourceExcerpt?: string;
    dueDate?: string;
    status?: MemoryStatus;
  }): Promise<MemoryItem> {
    const title = (data.title || '').trim();
    if (!title) throw new Error('Title cannot be empty');
    if (data.type !== 'task' && data.type !== 'decision') {
      throw new Error('Type must be task or decision');
    }

    const sourcePath = data.sourcePath || 'Manual entry';
    const sourceExcerpt = data.sourceExcerpt || title;
    const hash = createContentHash(data.type, sourcePath, title, sourceExcerpt);
    const now = Date.now();

    const item: MemoryItem = {
      id: randomUUID(),
      type: data.type,
      title,
      details: data.details ? data.details.trim() : undefined,
      sourcePath,
      relativePath: data.relativePath || '',
      sourceExcerpt,
      status: data.status || 'open',
      confidence: 1.0,
      confidenceReason: 'Manually entered by user',
      dueDate: data.dueDate?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      contentHash: hash
    };

    this.items.set(item.id, item);
    this.hashes.set(hash, item.id);
    await this.save();
    return item;
  }

  public async clear(): Promise<void> {
    this.items.clear();
    this.hashes.clear();
    await this.save();
  }
}
