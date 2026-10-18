import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { DailyBriefing, BriefingSettings, BriefingScope } from './types.ts';

const DEFAULT_SETTINGS: BriefingSettings = {
  enabled: true,
  includeClipboard: false,
  notificationsEnabled: false,
  preferredTime: '09:00',
  defaultScope: 'all'
};

const MAX_SAVED_BRIEFINGS = 60;

export class BriefingStore {
  private briefingsPath: string;
  private settingsPath: string;
  private briefings: DailyBriefing[] = [];
  private settings: BriefingSettings = { ...DEFAULT_SETTINGS };
  private loaded = false;

  constructor(storageDir: string) {
    this.briefingsPath = join(storageDir, 'daily-briefings-v1.json');
    this.settingsPath = join(storageDir, 'briefing-settings-v1.json');
  }

  public async load(): Promise<void> {
    // Load Settings
    try {
      const rawSettings = await fs.readFile(this.settingsPath, 'utf8');
      const parsedSettings = JSON.parse(rawSettings);
      this.settings = { ...DEFAULT_SETTINGS, ...parsedSettings };
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }

    // Load Briefings
    try {
      const rawBriefings = await fs.readFile(this.briefingsPath, 'utf8');
      const parsedBriefings = JSON.parse(rawBriefings);
      if (Array.isArray(parsedBriefings)) {
        this.briefings = parsedBriefings;
      } else if (Array.isArray(parsedBriefings?.briefings)) {
        this.briefings = parsedBriefings.briefings;
      } else {
        this.briefings = [];
      }
    } catch {
      this.briefings = [];
    }

    this.loaded = true;
  }

  private async saveBriefings(): Promise<void> {
    const temp = `${this.briefingsPath}.tmp.${Date.now()}`;
    const payload = JSON.stringify({ version: 1, briefings: this.briefings.slice(0, MAX_SAVED_BRIEFINGS) }, null, 2);
    await fs.writeFile(temp, payload, 'utf8');
    await fs.rename(temp, this.briefingsPath);
  }

  private async saveSettings(): Promise<void> {
    const temp = `${this.settingsPath}.tmp.${Date.now()}`;
    const payload = JSON.stringify(this.settings, null, 2);
    await fs.writeFile(temp, payload, 'utf8');
    await fs.rename(temp, this.settingsPath);
  }

  public async getSettings(): Promise<BriefingSettings> {
    if (!this.loaded) {
      await this.load();
    }
    return { ...this.settings };
  }

  public async updateSettings(updates: Partial<BriefingSettings>): Promise<BriefingSettings> {
    if (!this.loaded) {
      await this.load();
    }
    this.settings = {
      ...this.settings,
      ...updates
    };
    await this.saveSettings().catch(err => {
      console.warn('Failed to persist briefing settings:', err);
    });
    return { ...this.settings };
  }

  public async getTodayBriefing(date: string, scope: BriefingScope = 'all'): Promise<DailyBriefing | null> {
    if (!this.loaded) {
      await this.load();
    }
    const found = this.briefings.find(b => b.date === date && (b.scope ?? 'all') === scope);
    return found ? { ...found } : null;
  }

  public async getBriefingById(id: string): Promise<DailyBriefing | null> {
    if (!this.loaded) {
      await this.load();
    }
    const found = this.briefings.find(b => b.id === id);
    return found ? { ...found } : null;
  }

  public async listBriefings(limit = 30): Promise<DailyBriefing[]> {
    if (!this.loaded) {
      await this.load();
    }
    // Return copies sorted newest first
    return [...this.briefings]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }

  public async saveBriefing(briefing: DailyBriefing): Promise<void> {
    if (!this.loaded) {
      await this.load();
    }
    // Replace any existing briefing with same id or same date and scope
    const existingIndex = this.briefings.findIndex(
      b => b.id === briefing.id || (b.date === briefing.date && (b.scope ?? 'all') === (briefing.scope ?? 'all'))
    );

    if (existingIndex >= 0) {
      this.briefings[existingIndex] = briefing;
    } else {
      this.briefings.unshift(briefing);
    }

    if (this.briefings.length > MAX_SAVED_BRIEFINGS) {
      this.briefings = this.briefings.slice(0, MAX_SAVED_BRIEFINGS);
    }

    await this.saveBriefings().catch(err => {
      console.warn('Failed to persist daily briefings:', err);
    });
  }

  public async deleteBriefing(id: string): Promise<boolean> {
    if (!this.loaded) {
      await this.load();
    }
    const index = this.briefings.findIndex(b => b.id === id);
    if (index === -1) {
      return false;
    }
    this.briefings.splice(index, 1);
    await this.saveBriefings().catch(err => {
      console.warn('Failed to persist daily briefings after deletion:', err);
    });
    return true;
  }

  public async clearAllBriefings(): Promise<void> {
    this.briefings = [];
    await this.saveBriefings().catch(err => {
      console.warn('Failed to clear daily briefings:', err);
    });
  }
}
