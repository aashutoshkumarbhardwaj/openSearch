import { ipcMain, shell } from 'electron';
import { existsSync } from 'node:fs';
import { MemoryStore } from './store.ts';
import { MemoryExtractor } from './extractor.ts';
import type { MemoryFilter, MemoryItem, MemorySearchResult, MemoryStatus, MemoryType } from './types.ts';

export * from './types.ts';
export * from './store.ts';
export * from './extractor.ts';
export * from './search.ts';
import { searchMemoryItems } from './search.ts';

export class MemoryController {
  private store: MemoryStore;
  private extractor: MemoryExtractor;
  private getChunks: () => Array<{ id: string; path: string; relativePath: string; name: string; text: string }>;
  private getActiveModel: () => string;
  private broadcast: (channel: string, payload: unknown) => void;

  constructor(
    storageDir: string,
    getChunks: () => Array<{ id: string; path: string; relativePath: string; name: string; text: string }>,
    getActiveModel: () => string,
    broadcast: (channel: string, payload: unknown) => void
  ) {
    this.store = new MemoryStore(storageDir);
    this.extractor = new MemoryExtractor();
    this.getChunks = getChunks;
    this.getActiveModel = getActiveModel;
    this.broadcast = broadcast;
  }

  public async init(): Promise<void> {
    await this.store.load();
    this.registerIpcHandlers();
  }

  public getStore(): MemoryStore {
    return this.store;
  }

  public getExtractor(): MemoryExtractor {
    return this.extractor;
  }

  public registerIpcHandlers(): void {
    ipcMain.handle('memory:list', async (_event, filter?: MemoryFilter) => {
      // Validate filter inputs
      if (filter && typeof filter !== 'object') {
        throw new Error('Invalid filter format.');
      }
      return this.store.getItems(filter);
    });

    ipcMain.handle('memory:extract', async () => {
      if (this.extractor.running) {
        throw new Error('Task & decision extraction is already running.');
      }

      const chunks = this.getChunks();
      if (!chunks.length) {
        throw new Error('No indexed files found. Index at least one folder before extracting tasks and decisions.');
      }

      return this.extractor.extractFromChunks(chunks, this.store, {
        activeModel: this.getActiveModel(),
        onProgress: p => {
          this.broadcast('memory:extraction-progress', p);
        }
      });
    });

    ipcMain.handle('memory:cancel-extract', async () => {
      this.extractor.cancel();
      return true;
    });

    ipcMain.handle('memory:confirm', async (_event, id: string) => {
      if (typeof id !== 'string' || !id.trim()) {
        throw new Error('Invalid item ID.');
      }
      return this.store.confirmItem(id.trim());
    });

    ipcMain.handle('memory:update', async (_event, payload: {
      id: string;
      updates: { title?: string; details?: string; dueDate?: string; status?: MemoryStatus };
    }) => {
      if (!payload || typeof payload !== 'object' || typeof payload.id !== 'string') {
        throw new Error('Invalid update parameters.');
      }
      return this.store.updateItem(payload.id.trim(), payload.updates || {});
    });

    ipcMain.handle('memory:dismiss', async (_event, id: string) => {
      if (typeof id !== 'string' || !id.trim()) {
        throw new Error('Invalid item ID.');
      }
      return this.store.dismissItem(id.trim());
    });

    ipcMain.handle('memory:complete', async (_event, id: string) => {
      if (typeof id !== 'string' || !id.trim()) {
        throw new Error('Invalid item ID.');
      }
      return this.store.completeItem(id.trim());
    });

    ipcMain.handle('memory:reopen', async (_event, id: string) => {
      if (typeof id !== 'string' || !id.trim()) {
        throw new Error('Invalid item ID.');
      }
      return this.store.reopenItem(id.trim());
    });

    ipcMain.handle('memory:delete', async (_event, id: string) => {
      if (typeof id !== 'string' || !id.trim()) {
        throw new Error('Invalid item ID.');
      }
      return this.store.deleteItem(id.trim());
    });

    ipcMain.handle('memory:create', async (_event, payload: {
      type: MemoryType;
      title: string;
      details?: string;
      sourcePath?: string;
      relativePath?: string;
      sourceExcerpt?: string;
      dueDate?: string;
      status?: MemoryStatus;
    }) => {
      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid creation parameters.');
      }
      return this.store.createManualItem(payload);
    });

    ipcMain.handle('memory:search', async (_event, query: string, options?: { includeSuggested?: boolean }) => {
      if (typeof query !== 'string') {
        throw new Error('Query must be a string.');
      }
      const allItems = this.store.getItems();
      return searchMemoryItems(allItems, query, options);
    });

    ipcMain.handle('memory:open-source', async (_event, filePath: string) => {
      if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new Error('Invalid file path.');
      }
      if (!existsSync(filePath)) {
        throw new Error(`File does not exist on disk: ${filePath}. It may have been moved, renamed, or deleted.`);
      }
      return shell.openPath(filePath);
    });
  }
}
