import type { ClipboardItem, ClipboardSettings } from './types.ts';
import { ClipboardStore } from './store.ts';
import { createClipboardHash } from './sensitive.ts';

export interface ClipboardAdapter {
  readText(): string;
  writeText(text: string): void;
}

export class ClipboardService {
  private store: ClipboardStore;
  private pollTimer: NodeJS.Timeout | null = null;
  private lastCapturedHash: string | null = null;
  private isPolling = false;
  private adapter: ClipboardAdapter;
  private onCaptured?: (item: ClipboardItem, status: 'added' | 'duplicate_updated') => void;

  constructor(
    store: ClipboardStore,
    onCaptured?: (item: ClipboardItem, status: 'added' | 'duplicate_updated') => void,
    adapter?: ClipboardAdapter
  ) {
    this.store = store;
    this.onCaptured = onCaptured;
    this.adapter = adapter || {
      readText: () => '',
      writeText: () => {}
    };
  }

  public get isRunning(): boolean {
    return this.pollTimer !== null;
  }

  public start(): void {
    const settings = this.store.getSettings();
    if (!settings.enabled || settings.paused) {
      return;
    }

    if (this.pollTimer) {
      return; // Already polling
    }

    // Initialize lastCapturedHash with current clipboard text so we don't retroactively
    // capture text that was in the clipboard before enabling the feature!
    try {
      const initialText = this.adapter.readText();
      if (initialText && initialText.trim()) {
        this.lastCapturedHash = createClipboardHash(initialText);
      }
    } catch {
      this.lastCapturedHash = null;
    }

    const interval = Math.max(500, settings.pollIntervalMs || 1000);
    this.pollTimer = setInterval(() => this.poll(), interval);
  }

  public stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.lastCapturedHash = null;
  }

  public pause(): void {
    this.stop();
  }

  public resume(): void {
    this.start();
  }

  public async pollOnce(): Promise<{ item: ClipboardItem | null; status: 'added' | 'duplicate_updated' | 'filtered' | 'unchanged' | 'empty' }> {
    try {
      const text = this.adapter.readText();
      if (!text || text.trim().length === 0) {
        return { item: null, status: 'empty' };
      }

      const currentHash = createClipboardHash(text);
      if (currentHash === this.lastCapturedHash) {
        return { item: null, status: 'unchanged' };
      }

      this.lastCapturedHash = currentHash;

      const res = await this.store.addItem(text);
      if (res.item && (res.status === 'added' || res.status === 'duplicate_updated')) {
        this.onCaptured?.(res.item, res.status);
      }
      return res;
    } catch (err: any) {
      console.warn('Clipboard read error in monitoring service:', err?.message || String(err));
      return { item: null, status: 'empty' };
    }
  }

  private async poll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      await this.pollOnce();
    } finally {
      this.isPolling = false;
    }
  }

  public copyToClipboard(text: string): void {
    try {
      // Temporarily mark this hash as seen so we don't re-capture text
      // that was copied FROM RecallDesk itself!
      this.lastCapturedHash = createClipboardHash(text);
      this.adapter.writeText(text);
    } catch (err: any) {
      console.error('Failed to write to clipboard:', err?.message || String(err));
      throw new Error('Failed to copy text to system clipboard.');
    }
  }
}
