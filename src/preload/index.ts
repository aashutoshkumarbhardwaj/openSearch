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
  onProgress: (callback: (payload: any) => void) => { const listener = (_: unknown, payload: any) => callback(payload); ipcRenderer.on('index:progress', listener); return () => ipcRenderer.removeListener('index:progress', listener); },
  onModelStatus: (callback: (status: string) => void) => { const listener = (_: unknown, status: string) => callback(status); ipcRenderer.on('model:status', listener); return () => ipcRenderer.removeListener('model:status', listener); },
  onFocusSearch: (callback: () => void) => { const listener = () => callback(); ipcRenderer.on('search:focus', listener); return () => ipcRenderer.removeListener('search:focus', listener); }
};
contextBridge.exposeInMainWorld('openSearch', api);
contextBridge.exposeInMainWorld('recallDesk', api);
