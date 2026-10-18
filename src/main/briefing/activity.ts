import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BriefingActivityItem } from './types.ts';

const MAX_ACTIVITIES = 100;

export class ActivityTracker {
  private filePath: string;
  private activities: BriefingActivityItem[] = [];
  private loaded = false;

  constructor(storageDir: string) {
    this.filePath = join(storageDir, 'activity-log-v1.json');
  }

  public async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        this.activities = data;
      } else if (Array.isArray(data?.items)) {
        this.activities = data.items;
      } else {
        this.activities = [];
      }
    } catch {
      this.activities = [];
    }
    this.loaded = true;
  }

  public async save(): Promise<void> {
    const temp = `${this.filePath}.tmp.${Date.now()}`;
    const payload = JSON.stringify({ version: 1, items: this.activities.slice(0, MAX_ACTIVITIES) }, null, 2);
    await fs.writeFile(temp, payload, 'utf8');
    await fs.rename(temp, this.filePath);
  }

  public async logActivity(
    type: BriefingActivityItem['type'],
    description: string,
    metadata?: Record<string, any>
  ): Promise<BriefingActivityItem> {
    if (!this.loaded) {
      await this.load();
    }

    const item: BriefingActivityItem = {
      id: randomUUID(),
      type,
      description,
      timestamp: Date.now(),
      metadata
    };

    // Prepend newer items first
    this.activities.unshift(item);
    if (this.activities.length > MAX_ACTIVITIES) {
      this.activities = this.activities.slice(0, MAX_ACTIVITIES);
    }

    await this.save().catch(err => {
      console.warn('Failed to save activity log:', err);
    });

    return item;
  }

  public getRecentActivities(
    limit = 15,
    sinceTimestamp?: number,
    scopeRoot?: string
  ): BriefingActivityItem[] {
    let list = this.activities;

    if (sinceTimestamp && sinceTimestamp > 0) {
      list = list.filter(a => a.timestamp >= sinceTimestamp);
    }

    if (scopeRoot && scopeRoot !== 'all') {
      const normScope = scopeRoot.toLowerCase();
      list = list.filter(a => {
        const root = a.metadata?.root?.toLowerCase();
        const path = a.metadata?.path?.toLowerCase();
        return (root && root.includes(normScope)) || (path && path.includes(normScope));
      });
    }

    return list.slice(0, limit);
  }

  public clear(): void {
    this.activities = [];
  }
}
