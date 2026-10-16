/// <reference types="vite/client" />
interface Window {
  recallDesk: {
    info: () => Promise<any>;
    chooseFolders: () => Promise<string[]>;
    startIndex: (roots: string[]) => Promise<any>;
    search: (query: string) => Promise<any[]>;
    ask: (question: string) => Promise<{
      answer: string;
      sources: { id: number; path: string }[];
    }>;
    listModels: () => Promise<{
      ollamaRunning: boolean;
      activeModel: string;
      installedModels: Array<{ name: string; sizeBytes: number; sizeFormatted: string; modifiedAt: string }>;
      recommendedModels: Array<{ id: string; name: string; size: string; desc: string }>;
      error?: string;
    }>;
    setActiveModel: (model: string) => Promise<{ success: boolean; activeModel: string }>;
    pullModel: (model: string) => Promise<{ success: boolean; activeModel: string }>;
    deleteModel: (model: string) => Promise<{ success: boolean; activeModel: string }>;
    clearEmbeddings: () => Promise<boolean>;
    onPullProgress: (callback: (data: any) => void) => () => void;
    openFile: (path: string) => Promise<string>;
    clearIndex: () => Promise<boolean>;
    loadModel: () => Promise<string>;
    onProgress: (callback: (payload: any) => void) => () => void;
    onModelStatus: (callback: (status: string) => void) => () => void;
    onFocusSearch: (callback: () => void) => () => void;
  };
}
