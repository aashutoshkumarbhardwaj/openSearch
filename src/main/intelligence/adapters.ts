import { promises as fs, existsSync, statSync } from 'node:fs';
import { extname, basename, join, resolve, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PDFParse } from 'pdf-parse';
import type { IngestedSource, SourceItem, SourceType } from './types.ts';

const MAX_FILE_BYTES = 20_000_000; // 20 MB max
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.venv',
  'venv', '__pycache__', '.cache', 'vendor', 'target'
]);

export function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function detectSourceType(filePath: string): { type: SourceType; mimeType: string; isSupported: boolean; reason?: string } {
  const ext = extname(filePath).toLowerCase();

  // Markdown
  if (['.md', '.mdx'].includes(ext)) {
    return { type: 'markdown', mimeType: 'text/markdown', isSupported: true };
  }

  // Plain Text & Config
  if (['.txt', '.log', '.env.example', '.ini', '.toml', '.yaml', '.yml'].includes(ext)) {
    return { type: 'text', mimeType: 'text/plain', isSupported: true };
  }

  // Code & Structured Data
  if (['.json', '.js', '.jsx', '.ts', '.tsx', '.py', '.html', '.css', '.scss', '.sh', '.sql', '.rs', '.go', '.java', '.c', '.h', '.cpp'].includes(ext)) {
    return { type: 'code', mimeType: 'text/plain', isSupported: true };
  }

  // PDF Documents
  if (ext === '.pdf') {
    return { type: 'pdf', mimeType: 'application/pdf', isSupported: true };
  }

  // Screenshots & Images
  if (['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.svg', '.gif'].includes(ext)) {
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.svg' ? 'image/svg+xml' : 'image/jpeg';
    return { type: 'image', mimeType: mime, isSupported: true };
  }

  // Known unsupported binaries or archives
  if (['.zip', '.tar', '.gz', '.7z', '.rar'].includes(ext)) {
    return {
      type: 'unsupported',
      mimeType: 'application/zip',
      isSupported: false,
      reason: `Archive format (${ext}) is not supported for direct reading. Unpack the files first.`
    };
  }

  if (['.exe', '.dll', '.bin', '.dmg', '.iso', '.so', '.dylib'].includes(ext)) {
    return {
      type: 'unsupported',
      mimeType: 'application/octet-stream',
      isSupported: false,
      reason: `Binary executable format (${ext}) cannot be analyzed for project intelligence.`
    };
  }

  if (['.docx', '.xlsx', '.pptx'].includes(ext)) {
    return {
      type: 'unsupported',
      mimeType: 'application/octet-stream',
      isSupported: false,
      reason: `Office binary format (${ext}) is not yet supported. Convert to PDF or Markdown.`
    };
  }

  if (['.mp4', '.mov', '.avi', '.mp3', '.wav', '.m4a'].includes(ext)) {
    return {
      type: 'unsupported',
      mimeType: 'media/unknown',
      isSupported: false,
      reason: `Media file format (${ext}) is not supported for document intelligence.`
    };
  }

  return {
    type: 'unsupported',
    mimeType: 'application/octet-stream',
    isSupported: false,
    reason: `Unrecognized file format (${ext || 'no extension'}). Supported formats include text, Markdown, code, PDF, and screenshots.`
  };
}

export async function inspectSourceItem(targetPath: string): Promise<SourceItem> {
  const safePath = resolve(targetPath);
  if (!existsSync(safePath)) {
    return {
      id: randomUUID(),
      path: targetPath,
      name: basename(targetPath),
      type: 'unsupported',
      sizeBytes: 0,
      sizeFormatted: '0 B',
      status: 'error',
      warning: 'File or folder does not exist on disk.'
    };
  }

  try {
    const stat = await fs.stat(safePath);
    if (stat.isDirectory()) {
      return {
        id: randomUUID(),
        path: safePath,
        name: basename(safePath),
        type: 'folder',
        isFolder: true,
        sizeBytes: 0,
        sizeFormatted: 'Folder',
        status: 'ready'
      };
    }

    const { type, isSupported, reason } = detectSourceType(safePath);
    const sizeBytes = stat.size;
    const sizeFormatted = formatBytes(sizeBytes);

    if (sizeBytes > MAX_FILE_BYTES) {
      return {
        id: randomUUID(),
        path: safePath,
        name: basename(safePath),
        type: 'unsupported',
        sizeBytes,
        sizeFormatted,
        status: 'unsupported',
        warning: `File size (${sizeFormatted}) exceeds 20 MB limit.`
      };
    }

    if (!isSupported) {
      return {
        id: randomUUID(),
        path: safePath,
        name: basename(safePath),
        type,
        sizeBytes,
        sizeFormatted,
        status: 'unsupported',
        warning: reason
      };
    }

    return {
      id: randomUUID(),
      path: safePath,
      name: basename(safePath),
      type,
      sizeBytes,
      sizeFormatted,
      status: 'ready'
    };
  } catch (err: any) {
    return {
      id: randomUUID(),
      path: safePath,
      name: basename(safePath),
      type: 'unsupported',
      sizeBytes: 0,
      sizeFormatted: '0 B',
      status: 'error',
      warning: `Cannot read source: ${err.message || String(err)}`
    };
  }
}

export async function ingestFileSource(filePath: string, relativeRoot?: string): Promise<IngestedSource> {
  const safePath = resolve(filePath);
  const name = basename(safePath);
  const rel = relativeRoot ? relative(relativeRoot, safePath) : name;
  const { type, mimeType, isSupported, reason } = detectSourceType(safePath);

  if (!isSupported) {
    return {
      id: randomUUID(),
      originalPath: safePath,
      relativePath: rel,
      displayName: name,
      sourceType: type,
      mimeType,
      sizeBytes: 0,
      extractedText: '',
      metadata: { extension: extname(safePath) },
      evidenceLocations: [],
      status: 'unsupported',
      unsupportedReason: reason
    };
  }

  try {
    const stat = await fs.stat(safePath);
    if (stat.size > MAX_FILE_BYTES) {
      return {
        id: randomUUID(),
        originalPath: safePath,
        relativePath: rel,
        displayName: name,
        sourceType: 'unsupported',
        mimeType,
        sizeBytes: stat.size,
        extractedText: '',
        metadata: { extension: extname(safePath) },
        evidenceLocations: [],
        status: 'unsupported',
        unsupportedReason: `File size (${formatBytes(stat.size)}) exceeds maximum 20MB limit.`
      };
    }

    // PDF Adapter
    if (type === 'pdf') {
      let parser: any = null;
      try {
        const data = await fs.readFile(safePath);
        parser = new PDFParse({ data });
        const res = await parser.getText();
        const text = res?.text ? res.text.trim() : '';
        const lines = text.split('\n');

        return {
          id: randomUUID(),
          originalPath: safePath,
          relativePath: rel,
          displayName: name,
          sourceType: 'pdf',
          mimeType,
          sizeBytes: stat.size,
          extractedText: text,
          metadata: {
            pageCount: res?.numpages || 1,
            lineCount: lines.length,
            extension: '.pdf'
          },
          evidenceLocations: [{ page: 1, lineStart: 1, lineEnd: lines.length }],
          status: 'ready'
        };
      } catch (e: any) {
        return {
          id: randomUUID(),
          originalPath: safePath,
          relativePath: rel,
          displayName: name,
          sourceType: 'pdf',
          mimeType,
          sizeBytes: stat.size,
          extractedText: '',
          metadata: { extension: '.pdf' },
          evidenceLocations: [],
          status: 'error',
          error: `Failed to parse PDF document: ${e.message || String(e)}`
        };
      } finally {
        if (parser?.destroy) await parser.destroy().catch(() => {});
      }
    }

    // Image / Screenshot Adapter
    if (type === 'image') {
      const data = await fs.readFile(safePath);
      const base64 = data.toString('base64');

      return {
        id: randomUUID(),
        originalPath: safePath,
        relativePath: rel,
        displayName: name,
        sourceType: 'image',
        mimeType,
        sizeBytes: stat.size,
        extractedText: `[Image / Screenshot: ${name}] (Size: ${formatBytes(stat.size)})`,
        imageDataBase64: base64,
        metadata: {
          extension: extname(safePath),
          isVisual: true
        },
        evidenceLocations: [],
        status: 'ready'
      };
    }

    // Text, Markdown, and Code Adapter
    const rawBuffer = await fs.readFile(safePath);
    // Check for null bytes indicative of non-text binary
    if (rawBuffer.subarray(0, Math.min(rawBuffer.length, 8000)).includes(0)) {
      return {
        id: randomUUID(),
        originalPath: safePath,
        relativePath: rel,
        displayName: name,
        sourceType: 'unsupported',
        mimeType: 'application/octet-stream',
        sizeBytes: stat.size,
        extractedText: '',
        metadata: { extension: extname(safePath) },
        evidenceLocations: [],
        status: 'unsupported',
        unsupportedReason: 'Binary file detected (contains null bytes).'
      };
    }

    const text = rawBuffer.toString('utf8');
    const lines = text.split('\n');

    return {
      id: randomUUID(),
      originalPath: safePath,
      relativePath: rel,
      displayName: name,
      sourceType: type,
      mimeType,
      sizeBytes: stat.size,
      extractedText: text,
      metadata: {
        lineCount: lines.length,
        extension: extname(safePath)
      },
      evidenceLocations: [{ lineStart: 1, lineEnd: lines.length }],
      status: 'ready'
    };
  } catch (err: any) {
    return {
      id: randomUUID(),
      originalPath: safePath,
      relativePath: rel,
      displayName: name,
      sourceType: type,
      mimeType,
      sizeBytes: 0,
      extractedText: '',
      metadata: { extension: extname(safePath) },
      evidenceLocations: [],
      status: 'error',
      error: `Failed to read file: ${err.message || String(err)}`
    };
  }
}

export async function ingestFolderSource(
  folderPath: string,
  onProgress?: (processed: number, file: string) => void
): Promise<IngestedSource[]> {
  const safeRoot = resolve(folderPath);
  const results: IngestedSource[] = [];
  const stack = [safeRoot];
  let processed = 0;
  const MAX_FOLDER_FILES = 400; // Limit to 400 files per single folder analysis to maintain responsiveness

  while (stack.length > 0 && results.length < MAX_FOLDER_FILES) {
    const current = stack.pop()!;
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (results.length >= MAX_FOLDER_FILES) break;
      if (entry.name.startsWith('.') && ['.git', '.next', '.cache', '.venv'].includes(entry.name)) continue;

      const full = join(current, entry.name);
      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          stack.push(full);
        }
      } else if (entry.isFile()) {
        const { isSupported } = detectSourceType(full);
        if (isSupported) {
          const item = await ingestFileSource(full, safeRoot);
          results.push(item);
          processed++;
          onProgress?.(processed, entry.name);
        }
      }
    }
  }

  return results;
}
