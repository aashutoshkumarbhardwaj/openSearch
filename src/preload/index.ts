import { contextBridge, ipcRenderer } from 'electron';

const api = {
  info: () => ipcRenderer.invoke('app:info'),
  chooseFolders: () => ipcRenderer.invoke('folders:choose'),
  startIndex: (roots: string[]) => ipcRenderer.invoke('index:start', roots),
  search: (query: string) => ipcRenderer.invoke('search:query', query),
  ask: (question: string) => ipcRenderer.invoke('ai:ask', question),
  listModels: () => ipcRenderer.invoke('models:list'),
  setActiveModel: (model: string) => ipcRenderer.invoke('models:set-active', model),
  pullModel: (model: string) => ipcRenderer.invoke('models:pull', model),
  deleteModel: (model: string) => ipcRenderer.invoke('models:delete', model),
  clearEmbeddings: () => ipcRenderer.invoke('index:clear-embeddings'),
  onPullProgress: (callback: (data: any) => void) => {
    const listener = (_: unknown, data: any) => callback(data);
    ipcRenderer.on('models:pull-progress', listener);
    return () => ipcRenderer.removeListener('models:pull-progress', listener);
  },
  openFile: (path: string) => ipcRenderer.invoke('file:open', path),
  clearIndex: () => ipcRenderer.invoke('index:clear'),
  loadModel: () => ipcRenderer.invoke('model:load'),
  onProgress: (callback: (payload: any) => void) => {
    const listener = (_: unknown, payload: any) => callback(payload);
    ipcRenderer.on('index:progress', listener);
    return () => ipcRenderer.removeListener('index:progress', listener);
  },
  onModelStatus: (callback: (status: string) => void) => {
    const listener = (_: unknown, status: string) => callback(status);
    ipcRenderer.on('model:status', listener);
    return () => ipcRenderer.removeListener('model:status', listener);
  },
  onFocusSearch: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('search:focus', listener);
    return () => ipcRenderer.removeListener('search:focus', listener);
  },

  // Decision & Task Memory API
  listMemory: (filter?: any) => ipcRenderer.invoke('memory:list', filter),
  chooseMemoryFiles: () => ipcRenderer.invoke('memory:choose-files'),
  chooseMemoryFolders: () => ipcRenderer.invoke('memory:choose-folders'),
  extractMemory: (options?: any) => ipcRenderer.invoke('memory:extract', options),
  cancelExtractMemory: () => ipcRenderer.invoke('memory:cancel-extract'),
  confirmMemory: (id: string) => ipcRenderer.invoke('memory:confirm', id),
  updateMemory: (payload: { id: string; updates: any }) => ipcRenderer.invoke('memory:update', payload),
  dismissMemory: (id: string) => ipcRenderer.invoke('memory:dismiss', id),
  completeMemory: (id: string) => ipcRenderer.invoke('memory:complete', id),
  reopenMemory: (id: string) => ipcRenderer.invoke('memory:reopen', id),
  deleteMemory: (id: string) => ipcRenderer.invoke('memory:delete', id),
  createMemory: (payload: any) => ipcRenderer.invoke('memory:create', payload),
  searchMemory: (query: string, options?: any) => ipcRenderer.invoke('memory:search', query, options),
  openSourceFile: (path: string) => ipcRenderer.invoke('memory:open-source', path),
  onExtractionProgress: (callback: (data: any) => void) => {
    const listener = (_: unknown, data: any) => callback(data);
    ipcRenderer.on('memory:extraction-progress', listener);
    return () => ipcRenderer.removeListener('memory:extraction-progress', listener);
  },
  generateActionPlan: (filePath: string) => ipcRenderer.invoke('memory:generate-plan', filePath),
  listActionPlans: () => ipcRenderer.invoke('memory:list-plans'),
  toggleActionPlanStep: (payload: { planId: string; taskId: string; completed: boolean }) => ipcRenderer.invoke('memory:toggle-plan-step', payload),
  saveActionPlanNotes: (payload: { planId: string; notes: string }) => ipcRenderer.invoke('memory:save-plan-notes', payload),
  deleteActionPlan: (planId: string) => ipcRenderer.invoke('memory:delete-plan', planId),

  // Universal Project Intelligence API
  chooseFilesToAnalyze: () => ipcRenderer.invoke('intelligence:choose-files'),
  chooseFoldersToAnalyze: () => ipcRenderer.invoke('intelligence:choose-folders'),
  inspectSources: (paths: string[]) => ipcRenderer.invoke('intelligence:inspect-sources', paths),
  runIntelligenceAnalysis: (options: any) => ipcRenderer.invoke('intelligence:run-analysis', options),
  cancelIntelligenceAnalysis: () => ipcRenderer.invoke('intelligence:cancel-analysis'),
  acceptFinding: (payload: any) => ipcRenderer.invoke('intelligence:accept-finding', payload),
  onIntelligenceProgress: (callback: (data: any) => void) => {
    const listener = (_: unknown, data: any) => callback(data);
    ipcRenderer.on('intelligence:progress', listener);
    return () => ipcRenderer.removeListener('intelligence:progress', listener);
  },

  // Searchable Clipboard Memory API
  getClipboardSettings: () => ipcRenderer.invoke('clipboard:get-settings'),
  updateClipboardSettings: (updates: any) => ipcRenderer.invoke('clipboard:update-settings', updates),
  listClipboardItems: (filter?: any) => ipcRenderer.invoke('clipboard:list-items', filter),
  searchClipboard: (query: string, options?: any) => ipcRenderer.invoke('clipboard:search', query, options),
  copyClipboardItem: (id: string) => ipcRenderer.invoke('clipboard:copy-item', id),
  pinClipboardItem: (id: string, isPinned: boolean) => ipcRenderer.invoke('clipboard:pin-item', id, isPinned),
  setClipboardLabel: (id: string, label: string) => ipcRenderer.invoke('clipboard:set-label', id, label),
  deleteClipboardItem: (id: string) => ipcRenderer.invoke('clipboard:delete-item', id),
  clearClipboardHistory: (preservePinned?: boolean) => ipcRenderer.invoke('clipboard:clear-history', preservePinned),
  onClipboardItemCaptured: (callback: (data: any) => void) => {
    const listener = (_: unknown, data: any) => callback(data);
    ipcRenderer.on('clipboard:item-captured', listener);
    return () => ipcRenderer.removeListener('clipboard:item-captured', listener);
  },
  onFocusClipboard: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('clipboard:focus', listener);
    return () => ipcRenderer.removeListener('clipboard:focus', listener);
  },

  // Daily Memory Briefing API
  getTodayBriefing: (scope?: string) => ipcRenderer.invoke('briefing:get-today', scope),
  generateBriefing: (options?: any) => ipcRenderer.invoke('briefing:generate', options),
  listBriefingHistory: (limit?: number) => ipcRenderer.invoke('briefing:list-history', limit),
  deleteBriefing: (id: string) => ipcRenderer.invoke('briefing:delete', id),
  getBriefingSettings: () => ipcRenderer.invoke('briefing:get-settings'),
  updateBriefingSettings: (updates: any) => ipcRenderer.invoke('briefing:update-settings', updates),
  getBriefingActivityLog: (limit?: number, scope?: string) => ipcRenderer.invoke('briefing:get-activity-log', limit, scope),
  onNavigateBriefing: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('briefing:navigate', listener);
    return () => ipcRenderer.removeListener('briefing:navigate', listener);
  }
};

contextBridge.exposeInMainWorld('openSearch', api);
contextBridge.exposeInMainWorld('recallDesk', api);
