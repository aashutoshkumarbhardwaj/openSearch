import { dialog, ipcMain } from 'electron';
import { resolve } from 'node:path';
import { ProjectIntelligenceAnalyzer } from './analyzer.ts';
import { inspectSourceItem } from './adapters.ts';
import type { Finding, IntelligenceRunOptions, SourceItem } from './types.ts';
import type { MemoryStore } from '../memory/store.ts';

export * from './types.ts';
export * from './adapters.ts';
export * from './analyzer.ts';

export class IntelligenceController {
  private analyzer: ProjectIntelligenceAnalyzer;
  private approvedAnalysisPaths: Set<string> = new Set();

  constructor(
    private memoryStore: MemoryStore,
    private getIndexedChunks: () => Array<{ id: string; path: string; relativePath: string; name: string; text: string }>,
    private getActiveModel: () => string,
    private broadcast: (channel: string, payload: unknown) => void
  ) {
    this.analyzer = new ProjectIntelligenceAnalyzer();
  }

  public registerIpcHandlers(): void {
    ipcMain.handle('intelligence:choose-files', async () => {
      const res = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        title: 'Select documents, code, notes, or images to analyze'
      });
      if (res.canceled) return [];
      for (const p of res.filePaths) {
        this.approvedAnalysisPaths.add(resolve(p));
      }
      return res.filePaths;
    });

    ipcMain.handle('intelligence:choose-folders', async () => {
      const res = await dialog.showOpenDialog({
        properties: ['openDirectory', 'multiSelections'],
        title: 'Select folder or project directory to analyze'
      });
      if (res.canceled) return [];
      for (const p of res.filePaths) {
        this.approvedAnalysisPaths.add(resolve(p));
      }
      return res.filePaths;
    });

    ipcMain.handle('intelligence:inspect-sources', async (_event, paths: string[]) => {
      if (!Array.isArray(paths)) throw new Error('Paths must be an array.');
      const items: SourceItem[] = [];
      for (const p of paths.slice(0, 100)) {
        if (typeof p === 'string' && p.trim()) {
          items.push(await inspectSourceItem(p));
        }
      }
      return items;
    });

    ipcMain.handle('intelligence:run-analysis', async (_event, options: IntelligenceRunOptions) => {
      if (!options || !Array.isArray(options.sources) || options.sources.length === 0) {
        throw new Error('Please select at least one source file, folder, or indexed library to analyze.');
      }

      return this.analyzer.runAnalysis(options, {
        activeModel: this.getActiveModel(),
        indexedChunks: this.getIndexedChunks(),
        onProgress: p => {
          this.broadcast('intelligence:progress', p);
        }
      });
    });

    ipcMain.handle('intelligence:cancel-analysis', async () => {
      this.analyzer.cancel();
      return true;
    });

    ipcMain.handle('intelligence:accept-finding', async (_event, payload: {
      finding: Finding;
      targetType: 'task' | 'decision';
      editedTitle?: string;
      editedDetails?: string;
      dueDate?: string;
    }) => {
      if (!payload?.finding) {
        throw new Error('Invalid finding data.');
      }

      const f = payload.finding;
      const title = (payload.editedTitle || f.title).trim();
      const details = (payload.editedDetails || f.description || f.reason || '').trim();
      const targetType = payload.targetType || (f.type === 'decision' ? 'decision' : 'task');

      // Create item in persistent MemoryStore
      const memoryItem = await this.memoryStore.createManualItem({
        type: targetType,
        title,
        details: details || undefined,
        sourcePath: f.sourcePath,
        relativePath: f.sourceName,
        sourceExcerpt: f.sourceExcerpt,
        dueDate: payload.dueDate || f.dueDate,
        status: 'open'
      });

      return { success: true, memoryItem };
    });
  }
}
