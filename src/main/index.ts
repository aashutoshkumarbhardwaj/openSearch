import { app, BrowserWindow, dialog, globalShortcut, ipcMain, shell } from 'electron';
import { join, extname, basename, relative, resolve } from 'node:path';
import { promises as fs, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { pipeline, env } from '@huggingface/transformers';
import { randomUUID } from 'node:crypto';
import { PDFParse } from 'pdf-parse';

const isDev = !app.isPackaged;
const SUPPORTED = new Set(['.pdf', '.txt', '.md', '.mdx', '.json', '.js', '.jsx', '.ts', '.tsx', '.py', '.html', '.css', '.scss', '.yml', '.yaml', '.toml', '.ini', '.log', '.sh', '.sql', '.rs', '.go', '.java', '.c', '.h', '.cpp', '.env.example']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.venv', 'venv', '__pycache__', '.cache', 'vendor', 'target']);
const MAX_FILE_BYTES = 20_000_000;
const CHUNK_CHARS = 1200;
const OVERLAP = 180;
type Chunk = { id: string; path: string; relativePath: string; name: string; text: string; modifiedAt: number; embedding?: number[] };
let mainWindow: BrowserWindow | null = null;
let chunks: Chunk[] = [];
let indexedRoots: string[] = [];
let embedder: any = null;
let modelStatus: 'not-loaded' | 'loading' | 'ready' | 'error' = 'not-loaded';
let activeLlmModel = 'smollm2:360m-instruct-q4_0';
let currentPullAbort: AbortController | null = null;
let indexing = false;
const approvedRoots = new Set<string>();
let indexStatus = { files: 0, chunks: 0, errors: 0, lastIndexedAt: null as number | null };

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1260, height: 820, minWidth: 900, minHeight: 620, backgroundColor: '#0b0d12', title: 'OpenSearch',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: existsSync(join(__dirname, '../preload/index.cjs')) ? join(__dirname, '../preload/index.cjs') : join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  if (isDev) mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173');
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function broadcast(channel: string, payload: unknown) { mainWindow?.webContents.send(channel, payload); }

const RECOMMENDED_MODELS = [
  { id: 'smollm2:360m-instruct-q4_0', name: 'SmolLM2 360M', size: '229 MB', desc: 'Ultra-lightweight & instant. Runs on any CPU or laptop.' },
  { id: 'smollm2:1.7b-instruct-q4_0', name: 'SmolLM2 1.7B', size: '1.0 GB', desc: 'Balanced intelligence & speed. Ideal for local document Q&A.' },
  { id: 'llama3.2:1b', name: 'Llama 3.2 1B', size: '1.3 GB', desc: 'Meta’s latest edge model with high instruction adherence.' },
  { id: 'qwen2.5:0.5b', name: 'Qwen 2.5 0.5B', size: '398 MB', desc: 'Compact, fast, multilingual reasoning.' },
  { id: 'qwen2.5:1.5b', name: 'Qwen 2.5 1.5B', size: '986 MB', desc: 'Top-tier accuracy for a small model footprint.' }
];

function formatBytes(bytes: number) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function cosine(a: number[], b: number[]) {
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? dot / (Math.sqrt(aa) * Math.sqrt(bb)) : 0;
}
function words(s: string) { return [...new Set(s.toLowerCase().match(/[a-z0-9_./-]{2,}/g) || [])]; }
function lexicalScore(query: string, text: string) {
  const q = words(query), t = text.toLowerCase();
  if (!q.length) return 0;
  let score = 0;
  for (const w of q) if (t.includes(w)) score += 1;
  return score / q.length;
}
function chunkText(text: string) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const result: string[] = [];
  for (let start = 0; start < normalized.length; start += CHUNK_CHARS - OVERLAP) {
    const part = normalized.slice(start, start + CHUNK_CHARS).trim();
    if (part.length > 35) result.push(part);
  }
  return result;
}
async function loadIndex() {
  const file = join(app.getPath('userData'), 'index-v1.json');
  try {
    const data = JSON.parse(await fs.readFile(file, 'utf8'));
    chunks = Array.isArray(data.chunks) ? data.chunks : [];
    indexedRoots = Array.isArray(data.roots) ? data.roots : [];
    for (const r of indexedRoots) approvedRoots.add(resolve(r));
    indexStatus = data.status || indexStatus;
    if (data.activeLlmModel) activeLlmModel = data.activeLlmModel;
  } catch { /* First launch: no index yet. */ }
}
async function saveIndex() {
  const dir = app.getPath('userData'); await fs.mkdir(dir, { recursive: true });
  const file = join(dir, 'index-v1.json');
  const temp = file + '.tmp';
  await fs.writeFile(temp, JSON.stringify({ chunks, roots: indexedRoots, status: indexStatus, activeLlmModel }), 'utf8');
  await fs.rename(temp, file);
}
async function getEmbedder() {
  if (embedder) return embedder;
  if (modelStatus === 'loading') throw new Error('The local embedding model is already loading.');
  modelStatus = 'loading'; broadcast('model:status', modelStatus);
  try {
    env.cacheDir = join(app.getPath('userData'), 'models');
    env.allowRemoteModels = true; env.allowLocalModels = true;
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'q8' });
    modelStatus = 'ready'; broadcast('model:status', modelStatus);
    return embedder;
  } catch (e) {
    modelStatus = 'error'; broadcast('model:status', modelStatus);
    throw new Error(`Could not load the local embedding model: ${String(e)}. Check internet access for first-time model download, then retry.`);
  }
}
async function embed(text: string): Promise<number[]> {
  const model = await getEmbedder();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}
async function extractText(file: string) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES || stat.size === 0) return null;
  const ext = extname(file).toLowerCase();
  if (!SUPPORTED.has(ext)) return null;
  if (ext === '.pdf') {
    let parser: any = null;
    try {
      const data = await fs.readFile(file);
      parser = new PDFParse({ data });
      const res = await parser.getText();
      return res?.text ? res.text.trim() : null;
    } catch (e) {
      console.error(`Failed to parse PDF ${file}:`, e);
      return null;
    } finally {
      if (parser?.destroy) await parser.destroy().catch(() => {});
    }
  }
  const data = await fs.readFile(file);
  if (data.subarray(0, Math.min(data.length, 8000)).includes(0)) return null;
  return data.toString('utf8');
}
async function walk(root: string, onFile: (file: string) => Promise<void>) {
  const stack = [root];
  while (stack.length) {
    const current = stack.pop()!;
    let entries;
    try { entries = await fs.readdir(current, { withFileTypes: true }); } catch { indexStatus.errors++; continue; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && ['.git', '.next', '.cache', '.venv'].includes(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) stack.push(full); }
      else if (entry.isFile() && SUPPORTED.has(extname(entry.name).toLowerCase())) await onFile(full);
    }
  }
}
async function indexFolders(roots: string[]) {
  if (indexing) throw new Error('Indexing is already running.');
  indexing = true; indexStatus = { files: 0, chunks: 0, errors: 0, lastIndexedAt: null };
  broadcast('index:progress', { ...indexStatus, done: false });
  const newChunks: Chunk[] = [];
  try {
    for (const root of roots) {
      const safeRoot = resolve(root);
      await walk(safeRoot, async file => {
        try {
          const content = await extractText(file); if (!content) return;
          const stat = await fs.stat(file); const rel = relative(safeRoot, file);
          const parts = chunkText(content);
          for (const text of parts) {
            newChunks.push({ id: randomUUID(), path: file, relativePath: rel, name: basename(file), text, modifiedAt: stat.mtimeMs });
          }
          indexStatus.files++;
          if (indexStatus.files % 10 === 0) broadcast('index:progress', { ...indexStatus, done: false });
        } catch { indexStatus.errors++; }
      });
    }
    // Semantic embeddings are computed locally; failures leave keyword search usable.
    try {
      const model = await getEmbedder();
      for (let i = 0; i < newChunks.length; i++) {
        const out = await model(newChunks[i].text, { pooling: 'mean', normalize: true });
        newChunks[i].embedding = Array.from(out.data as Float32Array);
        if (i % 10 === 0) broadcast('index:progress', { ...indexStatus, chunks: i, done: false, stage: 'embedding' });
      }
    } catch (e) { console.error('Embedding step failed; preserving keyword index:', e); }
    chunks = newChunks; indexedRoots = roots; indexStatus.chunks = chunks.length; indexStatus.lastIndexedAt = Date.now();
    await saveIndex();
    broadcast('index:progress', { ...indexStatus, done: true });
    return { ...indexStatus, roots: indexedRoots, semantic: chunks.some(c => c.embedding) };
  } finally { indexing = false; }
}
async function search(query: string) {
  if (!query.trim()) return [];
  let qEmb: number[] | null = null;
  if (chunks.some(c => c.embedding)) { try { qEmb = await embed(query); } catch { /* Fall back to lexical ranking. */ } }
  return chunks.map(c => {
    const lexical = lexicalScore(query, `${c.name} ${c.relativePath} ${c.text}`);
    const semantic = qEmb && c.embedding ? cosine(qEmb, c.embedding) : 0;
    const score = qEmb && c.embedding ? semantic * 0.78 + lexical * 0.22 : lexical;
    return { ...c, score, semantic: Boolean(qEmb && c.embedding), lexical };
  }).filter(c => (qEmb ? c.score > 0.08 || c.lexical > 0 : c.score > 0)).sort((a, b) => b.score - a.score).slice(0, 30).map(({ id, path, relativePath, name, text, score, semantic }) => ({ id, path, relativePath, name, text, score, semantic }));
}
async function askRecallDesk(question: string) {
  if (typeof question !== 'string' || !question.trim() || question.length > 500) {
    throw new Error('Enter a question of up to 500 characters.');
  }

  const matches = await search(question);

  if (!matches.length) {
    return {
      answer: 'I could not find relevant passages in your indexed files. Try different keywords or index another folder.',
      sources: []
    };
  }

  const context = matches.slice(0, 5).map((item, i) => ({
    id: i + 1,
    path: item.path,
    text: item.text.slice(0, 900)
  }));

  const prompt = [
    'You are OpenSearch, a private local document assistant.',
    'Answer using only the supplied source passages.',
    'If the passages do not contain the answer, say that the available sources do not establish it.',
    'Do not invent facts, file contents, or citations.',
    'Cite supporting passages using [1], [2], and so on.',
    '',
    'SOURCE PASSAGES:',
    ...context.map(s => `[${s.id}] File: ${s.path}\n${s.text}`),
    '',
    `QUESTION: ${question}`,
    'ANSWER:'
  ].join('\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: activeLlmModel || 'smollm2:360m-instruct-q4_0',
        prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 180,
          num_ctx: 4096
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Ollama returned HTTP ${response.status}.`);
    }

    const data = await response.json() as { response?: string };

    if (!data.response?.trim()) {
      throw new Error('The local model returned an empty answer.');
    }

    return {
      answer: data.response.trim(),
      sources: context.map(s => ({ id: s.id, path: s.path }))
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The local model took too long. Try a shorter question.');
    }

    if (error instanceof TypeError) {
      throw new Error('Cannot reach Ollama. Start Ollama and try again.');
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}


async function listOllamaModels() {
  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags');
    if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}`);
    const data = await res.json() as { models?: Array<{ name: string; size: number; modified_at: string; digest: string }> };
    const installed = data.models || [];
    if (!installed.some(m => m.name === activeLlmModel || m.name.startsWith(activeLlmModel)) && installed.length > 0) {
      activeLlmModel = installed[0].name;
    }
    return {
      ollamaRunning: true,
      activeModel: activeLlmModel,
      installedModels: installed.map(m => ({
        name: m.name,
        sizeBytes: m.size,
        sizeFormatted: formatBytes(m.size),
        modifiedAt: m.modified_at
      })),
      recommendedModels: RECOMMENDED_MODELS
    };
  } catch (err: any) {
    return {
      ollamaRunning: false,
      activeModel: activeLlmModel,
      installedModels: [],
      recommendedModels: RECOMMENDED_MODELS,
      error: `Cannot connect to Ollama: ${err.message}. Make sure Ollama is running.`
    };
  }
}

async function pullOllamaModel(modelName: string) {
  const model = modelName.trim();
  if (!model) throw new Error('Model name cannot be empty.');
  if (currentPullAbort) throw new Error('A model download is already in progress.');

  currentPullAbort = new AbortController();
  broadcast('models:pull-progress', { model, status: 'Connecting to Ollama...', percent: 0, done: false });

  try {
    const res = await fetch('http://127.0.0.1:11434/api/pull', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, stream: true }),
      signal: currentPullAbort.signal
    });

    if (!res.ok) throw new Error(`Ollama pull failed (${res.status} ${res.statusText})`);
    if (!res.body) throw new Error('No response body from Ollama');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.error) throw new Error(parsed.error);
          const total = parsed.total || 0;
          const completed = parsed.completed || 0;
          const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
          broadcast('models:pull-progress', {
            model,
            status: parsed.status || 'Downloading model...',
            completed,
            total,
            percent,
            done: parsed.status === 'success'
          });
        } catch (e: any) {
          if (e.message && !e.message.startsWith('Unexpected')) throw e;
        }
      }
    }

    activeLlmModel = model;
    await saveIndex();
    broadcast('models:pull-progress', { model, status: 'Model ready and activated!', percent: 100, done: true });
    return { success: true, activeModel: activeLlmModel };
  } catch (err: any) {
    broadcast('models:pull-progress', { model, status: 'Failed', error: err.message, done: true });
    throw err;
  } finally {
    currentPullAbort = null;
  }
}

async function deleteOllamaModel(modelName: string) {
  const model = modelName.trim();
  const res = await fetch('http://127.0.0.1:11434/api/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model })
  });
  if (!res.ok) throw new Error(`Failed to delete model (${res.status} ${res.statusText})`);

  const updated = await listOllamaModels();
  if (activeLlmModel === model) {
    activeLlmModel = updated.installedModels[0]?.name || 'smollm2:360m-instruct-q4_0';
    await saveIndex();
  }
  return { success: true, activeModel: activeLlmModel };
}

app.whenReady().then(async () => {
  await loadIndex(); createWindow();
  globalShortcut.register('Alt+Shift+Space', () => { if (!mainWindow) createWindow(); mainWindow?.show(); mainWindow?.focus(); mainWindow?.webContents.send('search:focus'); });
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform, roots: indexedRoots, status: indexStatus, modelStatus, indexedChunks: chunks.length }));
  ipcMain.handle('folders:choose', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'multiSelections'], title: 'Choose folders to index' });
    if (result.canceled) return [];
    for (const folder of result.filePaths) approvedRoots.add(resolve(folder));
    return result.filePaths;
  });
  ipcMain.handle('index:start', async (_event, roots: string[]) => {
    if (!Array.isArray(roots) || roots.some(r => typeof r !== 'string' || !approvedRoots.has(resolve(r)))) throw new Error('Choose folders using the folder picker before indexing.');
    return indexFolders(roots.slice(0, 20));
  });
  ipcMain.handle('search:query', async (_event, query: string) => {
    if (typeof query !== 'string' || query.length > 500) throw new Error('Search query is invalid or too long.');
    return search(query);
  });
  
  ipcMain.handle('models:list', async () => listOllamaModels());
  ipcMain.handle('models:set-active', async (_event, model: string) => {
    activeLlmModel = model;
    await saveIndex();
    return { success: true, activeModel: activeLlmModel };
  });
  ipcMain.handle('models:pull', async (_event, model: string) => pullOllamaModel(model));
  ipcMain.handle('models:delete', async (_event, model: string) => deleteOllamaModel(model));
  ipcMain.handle('index:clear-embeddings', async () => {
    for (const c of chunks) {
      delete c.embedding;
    }
    await saveIndex();
    return true;
  });

  ipcMain.handle('ai:ask', async (_event, question: string) => {
    return askRecallDesk(question);
  });
  ipcMain.handle('file:open', async (_event, filePath: string) => {
    if (typeof filePath !== 'string' || !chunks.some(c => c.path === filePath)) throw new Error('This file is not in the current index.');
    return shell.openPath(filePath);
  });
  ipcMain.handle('index:clear', async () => { chunks = []; indexedRoots = []; indexStatus = { files: 0, chunks: 0, errors: 0, lastIndexedAt: null }; await saveIndex(); return true; });
  ipcMain.handle('model:load', async () => { await getEmbedder(); return modelStatus; });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
