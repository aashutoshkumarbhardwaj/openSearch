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
  extractMemory: () => ipcRenderer.invoke('memory:extract'),
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
  }
};

contextBridge.exposeInMainWorld('openSearch', api);
contextBridge.exposeInMainWorld('recallDesk', api);
