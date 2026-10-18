import { clipboard, ipcMain } from 'electron';
import { ClipboardStore } from './store.ts';
import { ClipboardService } from './service.ts';
import type { ClipboardContentType, ClipboardFilter, ClipboardSettings } from './types.ts';

export class ClipboardController {
  private store: ClipboardStore;
  private service: ClipboardService;
  private getEmbedder?: () => Promise<any>;
  private broadcast: (channel: string, payload: unknown) => void;

  constructor(
    storageDir: string,
    broadcast: (channel: string, payload: unknown) => void,
    getEmbedder?: () => Promise<any>
  ) {
    this.store = new ClipboardStore(storageDir);
    this.broadcast = broadcast;
    this.getEmbedder = getEmbedder;
    this.service = new ClipboardService(
      this.store,
      (item, status) => {
        this.broadcast('clipboard:item-captured', { item, status });
        // Background embedding generation if embedder is available
        this.maybeEmbedItem(item.id, item.text).catch(() => {});
      },
      clipboard
    );
  }

  public async init(): Promise<void> {
    await this.store.load();
    const settings = this.store.getSettings();
    if (settings.enabled && !settings.paused) {
      this.service.start();
    }
  }

  public stopService(): void {
    this.service.stop();
  }

  public getStore(): ClipboardStore {
    return this.store;
  }

  private async maybeEmbedItem(id: string, text: string): Promise<void> {
    if (!this.getEmbedder) return;
    try {
      const model = await this.getEmbedder();
      if (!model) return;
      const snippet = text.slice(0, 500); // Embed first 500 characters
      const out = await model(snippet, { pooling: 'mean', normalize: true });
      const embedding = Array.from(out.data as Float32Array);
      await this.store.setItemEmbedding(id, embedding);
    } catch {
      // Embedding failure is non-fatal; keyword search remains active
    }
  }

  public registerIpcHandlers(): void {
    ipcMain.handle('clipboard:get-settings', async () => {
      return this.store.getSettings();
    });

    ipcMain.handle('clipboard:update-settings', async (_event, updates: Partial<ClipboardSettings>) => {
      if (!updates || typeof updates !== 'object') {
        throw new Error('Invalid clipboard settings updates.');
      }
      const updated = await this.store.updateSettings(updates);
      if (updated.enabled && !updated.paused) {
        this.service.start();
      } else {
        this.service.stop();
      }
      return updated;
    });

    ipcMain.handle('clipboard:list-items', async (_event, filter?: ClipboardFilter) => {
      return this.store.listItems(filter);
    });

    ipcMain.handle('clipboard:search', async (_event, query: string, options?: {
      pinnedOnly?: boolean;
      contentType?: ClipboardContentType | 'all';
      limit?: number;
    }) => {
      if (typeof query !== 'string') query = '';

      let queryEmbedding: number[] | undefined;
      if (query.trim() && this.getEmbedder) {
        try {
          const model = await this.getEmbedder();
          if (model) {
            const out = await model(query.trim(), { pooling: 'mean', normalize: true });
            queryEmbedding = Array.from(out.data as Float32Array);
          }
        } catch {
          // Fall back gracefully to keyword search
        }
      }

      return this.store.search(query, {
        ...options,
        queryEmbedding
      });
    });

    ipcMain.handle('clipboard:copy-item', async (_event, id: string) => {
      if (typeof id !== 'string') throw new Error('Invalid item ID.');
      const item = this.store.getItem(id);
      if (!item) throw new Error('Clipboard entry not found.');
      this.service.copyToClipboard(item.text);
      return { success: true };
    });

    ipcMain.handle('clipboard:pin-item', async (_event, id: string, isPinned: boolean) => {
      if (typeof id !== 'string') throw new Error('Invalid item ID.');
      const updated = await this.store.pinItem(id, Boolean(isPinned));
      if (!updated) throw new Error('Clipboard entry not found.');
      return updated;
    });

    ipcMain.handle('clipboard:set-label', async (_event, id: string, label: string) => {
      if (typeof id !== 'string') throw new Error('Invalid item ID.');
      const updated = await this.store.setLabel(id, typeof label === 'string' ? label : '');
      if (!updated) throw new Error('Clipboard entry not found.');
      return updated;
    });

    ipcMain.handle('clipboard:delete-item', async (_event, id: string) => {
      if (typeof id !== 'string') throw new Error('Invalid item ID.');
      return this.store.deleteItem(id);
    });

    ipcMain.handle('clipboard:clear-history', async (_event, preservePinned?: boolean) => {
      return this.store.clearHistory(preservePinned !== false);
    });
  }
}
