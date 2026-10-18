import type { MemoryStore } from '../memory/store.ts';
import { ActivityTracker } from './activity.ts';
import { BriefingStore } from './store.ts';
import { BriefingGenerator } from './generator.ts';
import { BriefingNotifier, type NotificationSender } from './notifier.ts';
import type {
  DailyBriefing,
  BriefingSettings,
  BriefingGenerateOptions,
  BriefingScope,
  BriefingActivityItem
} from './types.ts';

export * from './types.ts';
export * from './activity.ts';
export * from './store.ts';
export * from './generator.ts';
export * from './notifier.ts';

export interface BriefingControllerOptions {
  storageDir: string;
  memoryStore: MemoryStore;
  getRecentClipboard?: (limit: number) => Promise<Array<{ text: string; contentType: string; capturedAt: number }>>;
  activeModel?: string;
  notificationSender?: NotificationSender;
}

export class BriefingController {
  private store: BriefingStore;
  private tracker: ActivityTracker;
  private generator: BriefingGenerator;
  private notifier: BriefingNotifier;

  constructor(options: BriefingControllerOptions) {
    this.store = new BriefingStore(options.storageDir);
    this.tracker = new ActivityTracker(options.storageDir);
    this.generator = new BriefingGenerator({
      memoryStore: options.memoryStore,
      activityTracker: this.tracker,
      getRecentClipboard: options.getRecentClipboard,
      activeModel: options.activeModel
    });
    this.notifier = new BriefingNotifier(this.store, options.notificationSender);

    // When notifier triggers at scheduled time, auto-generate today's briefing if not already present
    this.notifier.setOnTrigger(async () => {
      const todayDate = new Date().toISOString().slice(0, 10);
      const settings = await this.store.getSettings();
      const existing = await this.store.getTodayBriefing(todayDate, settings.defaultScope || 'all');
      if (!existing) {
        await this.generateBriefing({
          scope: settings.defaultScope || 'all',
          includeClipboard: settings.includeClipboard
        });
      }
    });
  }

  public async initialize(): Promise<void> {
    await this.store.load();
    await this.tracker.load();
    this.notifier.start();
  }

  public shutdown(): void {
    this.notifier.stop();
  }

  public setActiveModel(model: string): void {
    this.generator.setActiveModel(model);
  }

  public setNotificationSender(sender: NotificationSender): void {
    this.notifier.setSender(sender);
  }

  public async getTodayBriefing(scope: BriefingScope = 'all'): Promise<DailyBriefing | null> {
    const todayDate = new Date().toISOString().slice(0, 10);
    return this.store.getTodayBriefing(todayDate, scope);
  }

  public async generateBriefing(
    options: BriefingGenerateOptions = {},
    signal?: AbortSignal
  ): Promise<DailyBriefing> {
    const settings = await this.store.getSettings();
    const effectiveScope = options.scope || settings.defaultScope || 'all';
    const effectiveIncludeClipboard =
      typeof options.includeClipboard === 'boolean'
        ? options.includeClipboard
        : settings.includeClipboard;

    const todayDate = new Date().toISOString().slice(0, 10);

    // If not forceRegenerate, check if today's briefing already exists
    if (!options.forceRegenerate) {
      const existing = await this.store.getTodayBriefing(todayDate, effectiveScope);
      if (existing) {
        return existing;
      }
    }

    const briefing = await this.generator.generate(
      {
        scope: effectiveScope,
        includeClipboard: effectiveIncludeClipboard,
        forceRegenerate: options.forceRegenerate
      },
      signal
    );

    // Persist briefing
    await this.store.saveBriefing(briefing);

    // Log the briefing generation as an activity
    await this.tracker.logActivity(
      'intelligence',
      `Generated daily memory briefing for ${briefing.scopeName} (${briefing.generationType === 'ai' ? 'AI-synthesized' : 'deterministic'})`,
      { briefingId: briefing.id, scope: briefing.scope }
    );

    return briefing;
  }

  public async listBriefings(limit?: number): Promise<DailyBriefing[]> {
    return this.store.listBriefings(limit);
  }

  public async deleteBriefing(id: string): Promise<boolean> {
    return this.store.deleteBriefing(id);
  }

  public async getSettings(): Promise<BriefingSettings> {
    return this.store.getSettings();
  }

  public async updateSettings(updates: Partial<BriefingSettings>): Promise<BriefingSettings> {
    return this.store.updateSettings(updates);
  }

  public async getActivityLog(limit?: number, scope?: string): Promise<BriefingActivityItem[]> {
    return this.tracker.getRecentActivities(limit || 20, undefined, scope);
  }

  public async logActivity(
    type: BriefingActivityItem['type'],
    description: string,
    metadata?: Record<string, any>
  ): Promise<BriefingActivityItem> {
    return this.tracker.logActivity(type, description, metadata);
  }

  public getTracker(): ActivityTracker {
    return this.tracker;
  }

  public getStore(): BriefingStore {
    return this.store;
  }
}
