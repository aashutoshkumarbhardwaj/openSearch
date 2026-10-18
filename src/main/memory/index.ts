import { ipcMain, shell, dialog } from 'electron';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MemoryStore } from './store.ts';
import { MemoryExtractor } from './extractor.ts';
import {
  ActionPlanStore,
  generateActionPlanFromSource,
  extractTextFromFile,
  chunkText
} from './planner.ts';
import type {
  MemoryFilter,
  MemoryItem,
  MemorySearchResult,
  MemoryStatus,
  MemoryType,
  ActionPlan
} from './types.ts';

export * from './types.ts';
export * from './store.ts';
export * from './extractor.ts';
export * from './search.ts';
export * from './planner.ts';
import { searchMemoryItems } from './search.ts';

export class MemoryController {
  private store: MemoryStore;
  private actionPlanStore: ActionPlanStore;
  private extractor: MemoryExtractor;
  private getChunks: () => Array<{ id: string; path: string; relativePath: string; name: string; text: string }>;
  private getActiveModel: () => string;
  private broadcast: (channel: string, payload: unknown) => void;
  private onActivity?: (type: 'task' | 'decision', description: string, metadata?: Record<string, any>) => void;

  constructor(
    storageDir: string,
    getChunks: () => Array<{ id: string; path: string; relativePath: string; name: string; text: string }>,
    getActiveModel: () => string,
    broadcast: (channel: string, payload: unknown) => void
  ) {
    this.store = new MemoryStore(storageDir);
    this.actionPlanStore = new ActionPlanStore(storageDir);
    this.extractor = new MemoryExtractor();
    this.getChunks = getChunks;
    this.getActiveModel = getActiveModel;
    this.broadcast = broadcast;
  }

  public setOnActivity(cb: (type: 'task' | 'decision', description: string, metadata?: Record<string, any>) => void): void {
    this.onActivity = cb;
  }

  public async init(): Promise<void> {
    await this.store.load();
    await this.actionPlanStore.load();
    this.registerIpcHandlers();
  }

  public getStore(): MemoryStore {
    return this.store;
  }

  public getActionPlanStore(): ActionPlanStore {
    return this.actionPlanStore;
  }

  public getExtractor(): MemoryExtractor {
    return this.extractor;
  }

  public registerIpcHandlers(): void {
    // 1. Choose specific files for Memory / Tasks & Decisions
    ipcMain.handle('memory:choose-files', async () => {
      const res = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        title: 'Select assessment, documents, code, or notes'
      });
      if (res.canceled) return [];
      return res.filePaths;
    });

    // 2. Choose specific folders for Memory / Tasks & Decisions
    ipcMain.handle('memory:choose-folders', async () => {
      const res = await dialog.showOpenDialog({
        properties: ['openDirectory', 'multiSelections'],
        title: 'Select folder or project directory'
      });
      if (res.canceled) return [];
      return res.filePaths;
    });

    // 3. Memory list
    ipcMain.handle('memory:list', async (_event, filter?: MemoryFilter) => {
      if (filter && typeof filter !== 'object') {
        throw new Error('Invalid filter format.');
      }
      return this.store.getItems(filter);
    });

    // 4. Extract tasks & decisions (supports target scope: specific files/folders)
    ipcMain.handle('memory:extract', async (_event, options?: { targetPaths?: string[] }) => {
      if (this.extractor.running) {
        throw new Error('Task & decision extraction is already running.');
      }

      let chunksToProcess: Array<{ id: string; path: string; relativePath: string; name: string; text: string }> = [];

      if (options?.targetPaths && options.targetPaths.length > 0) {
        const allChunks = this.getChunks();
        const targetSet = new Set(options.targetPaths.map(p => resolve(p)));

        // Match existing indexed chunks that belong to the selected targets
        for (const c of allChunks) {
          const cPath = resolve(c.path);
          if (targetSet.has(cPath)) {
            chunksToProcess.push(c);
          } else {
            for (const tp of targetSet) {
              if (cPath.startsWith(tp + '/') || cPath.startsWith(tp + '\\')) {
                chunksToProcess.push(c);
                break;
              }
            }
          }
        }

        // For target files/folders not yet indexed, dynamically ingest and chunk them
        const indexedPaths = new Set(allChunks.map(c => resolve(c.path)));
        for (const tp of targetSet) {
          if (!indexedPaths.has(tp) && existsSync(tp)) {
            try {
              const { text, name } = await extractTextFromFile(tp);
              if (text.trim()) {
                const pieces = chunkText(text);
                for (const p of pieces) {
                  chunksToProcess.push({
                    id: randomUUID(),
                    path: tp,
                    relativePath: name,
                    name,
                    text: p
                  });
                }
              }
            } catch (err) {
              console.warn(`Could not chunk target path ${tp}:`, err);
            }
          }
        }

        if (!chunksToProcess.length) {
          throw new Error('No readable text or document passages found in the selected files/folders.');
        }
      } else {
        chunksToProcess = this.getChunks();
        if (!chunksToProcess.length) {
          throw new Error('No indexed files found. Select files/folders or index a directory first.');
        }
      }

      return this.extractor.extractFromChunks(chunksToProcess, this.store, {
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

    // 5. Action Plans & Assessment Planner
    ipcMain.handle('memory:generate-plan', async (_event, filePath: string) => {
      if (typeof filePath !== 'string' || !filePath.trim()) {
        throw new Error('File path is required to generate an action plan.');
      }
      const plan = await generateActionPlanFromSource(filePath, this.getActiveModel(), this.store);
      await this.actionPlanStore.savePlan(plan);
      this.onActivity?.('task', `Generated action plan for "${plan.sourceName}": ${plan.title}`, { path: filePath });
      return plan;
    });

    ipcMain.handle('memory:list-plans', async () => {
      return this.actionPlanStore.listPlans();
    });

    ipcMain.handle('memory:toggle-plan-step', async (_event, payload: { planId: string; taskId: string; completed: boolean }) => {
      if (!payload || !payload.planId || !payload.taskId) {
        throw new Error('Invalid step toggle payload.');
      }
      return this.actionPlanStore.updateStep(payload.planId, payload.taskId, payload.completed, this.store);
    });

    ipcMain.handle('memory:save-plan-notes', async (_event, payload: { planId: string; notes: string }) => {
      if (!payload || !payload.planId) {
        throw new Error('Invalid notes update payload.');
      }
      return this.actionPlanStore.updateNotes(payload.planId, payload.notes || '');
    });

    ipcMain.handle('memory:delete-plan', async (_event, planId: string) => {
      if (typeof planId !== 'string' || !planId.trim()) {
        throw new Error('Invalid plan ID.');
      }
      return this.actionPlanStore.deletePlan(planId.trim());
    });

    // 6. Memory Item Status Actions
    ipcMain.handle('memory:confirm', async (_event, id: string) => {
      if (typeof id !== 'string' || !id.trim()) {
        throw new Error('Invalid item ID.');
      }
      const item = await this.store.confirmItem(id.trim());
      this.onActivity?.(item.type, `Confirmed ${item.type}: "${item.title}"`, { id: item.id, path: item.sourcePath });
      return item;
    });

    ipcMain.handle('memory:update', async (_event, payload: {
      id: string;
      updates: { title?: string; details?: string; dueDate?: string; status?: MemoryStatus };
    }) => {
      if (!payload || typeof payload !== 'object' || typeof payload.id !== 'string') {
        throw new Error('Invalid update parameters.');
      }
      const item = await this.store.updateItem(payload.id.trim(), payload.updates || {});
      this.onActivity?.(item.type, `Updated ${item.type}: "${item.title}"`, { id: item.id, path: item.sourcePath, updates: payload.updates });
      return item;
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
      const item = await this.store.completeItem(id.trim());
      this.onActivity?.('task', `Completed task: "${item.title}"`, { id: item.id, path: item.sourcePath });
      return item;
    });

    ipcMain.handle('memory:reopen', async (_event, id: string) => {
      if (typeof id !== 'string' || !id.trim()) {
        throw new Error('Invalid item ID.');
      }
      const item = await this.store.reopenItem(id.trim());
      this.onActivity?.('task', `Reopened task: "${item.title}"`, { id: item.id, path: item.sourcePath });
      return item;
    });

    ipcMain.handle('memory:delete', async (_event, id: string) => {
      if (typeof id !== 'string' || !id.trim()) {
        throw new Error('Invalid item ID.');
      }
      const existing = this.store.getItem(id.trim());
      const res = await this.store.deleteItem(id.trim());
      if (res && existing) {
        this.onActivity?.(existing.type, `Deleted ${existing.type}: "${existing.title}"`, { id: existing.id, path: existing.sourcePath });
      }
      return res;
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
      const item = await this.store.createManualItem(payload);
      this.onActivity?.(item.type, `Created ${item.type}: "${item.title}"`, { id: item.id, path: item.sourcePath });
      return item;
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
