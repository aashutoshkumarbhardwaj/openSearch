import type { MemoryItem, MemoryType, ExtractionProgress, ExtractionOptions, SourceChunk } from './types.ts';
import { MemoryStore } from './store.ts';

interface RawExtractedItem {
  type?: string;
  title?: string;
  details?: string;
  excerpt?: string;
  confidence?: number;
  confidenceReason?: string;
  dueDate?: string | null;
}

export function verifyExcerptInChunk(excerpt: string, chunkText: string): boolean {
  if (!excerpt || !chunkText) return false;
  const cleanExcerpt = excerpt.trim().toLowerCase().replace(/\s+/g, ' ');
  const cleanChunk = chunkText.toLowerCase().replace(/\s+/g, ' ');

  // Direct substring match
  if (cleanChunk.includes(cleanExcerpt)) return true;

  // Partial match: first 40 chars of excerpt
  const startPiece = cleanExcerpt.slice(0, Math.min(cleanExcerpt.length, 45));
  if (startPiece.length >= 15 && cleanChunk.includes(startPiece)) return true;

  // Word token overlap check
  const excerptWords = cleanExcerpt.match(/[a-z0-9_-]{3,}/g) || [];
  if (excerptWords.length < 3) return false;

  let matchedWords = 0;
  for (const w of excerptWords) {
    if (cleanChunk.includes(w)) matchedWords++;
  }
  return (matchedWords / excerptWords.length) >= 0.75;
}

export function extractHeuristicCandidates(chunk: { path: string; relativePath?: string; text: string; id: string }): Array<{
  type: MemoryType;
  title: string;
  details?: string;
  sourcePath: string;
  relativePath?: string;
  sourceExcerpt: string;
  confidence: number;
  confidenceReason: string;
  dueDate?: string;
  chunkId: string;
}> {
  const results: Array<{
    type: MemoryType;
    title: string;
    details?: string;
    sourcePath: string;
    relativePath?: string;
    sourceExcerpt: string;
    confidence: number;
    confidenceReason: string;
    dueDate?: string;
    chunkId: string;
  }> = [];

  const lines = chunk.text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.length < 10) continue;

    // Check for Tasks: TODO, FIXME, [ ] unchecked markdown boxes, "Action Item:"
    const taskMatch = line.match(/^(?:[-*]\s*\[\s*\]|\/\/\s*TODO:?|#\s*TODO:?|TODO:?|FIXME:?|ACTION(?:\s+ITEM)?:?)\s*(.+)$/i);
    if (taskMatch && taskMatch[1]) {
      const taskBody = taskMatch[1].trim();
      if (taskBody.length >= 6 && !taskBody.toLowerCase().startsWith('example')) {
        // Check for explicit deadline in the task body (e.g., "by Friday", "before Dec 15", "due: 2026-10-20")
        const dueMatch = taskBody.match(/(?:due(?::|\s+on|\s+by)?|by|before)\s+([A-Za-z0-9, -]{3,20})/i);
        const dueDate = dueMatch ? dueMatch[1].trim() : undefined;

        results.push({
          type: 'task',
          title: taskBody.slice(0, 120),
          details: lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 3)).join('\n').trim(),
          sourcePath: chunk.path,
          relativePath: chunk.relativePath,
          sourceExcerpt: line,
          confidence: 0.85,
          confidenceReason: 'Explicit task marker found in source document',
          dueDate,
          chunkId: chunk.id
        });
        continue;
      }
    }

    // Check for Decisions: "Decision:", "Decided to", "Architecture Decision:", "We chose to", "We agreed to"
    const decisionMatch = line.match(/^(?:(?:###?\s*)?Decision:?|ADR:?|Resolution:?|Decided(?:\s+to)?|We decided to|We agreed to|Chosen approach:?)\s*(.+)$/i);
    if (decisionMatch && decisionMatch[1]) {
      const decBody = decisionMatch[1].trim();
      if (decBody.length >= 10 && !decBody.toLowerCase().includes('?')) {
        results.push({
          type: 'decision',
          title: decBody.slice(0, 140),
          details: lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 4)).join('\n').trim(),
          sourcePath: chunk.path,
          relativePath: chunk.relativePath,
          sourceExcerpt: line,
          confidence: 0.85,
          confidenceReason: 'Explicit decision header or statement found in source document',
          chunkId: chunk.id
        });
      }
    }
  }

  return results;
}

export class MemoryExtractor {
  private abortController: AbortController | null = null;
  private isRunning = false;

  public get running(): boolean {
    return this.isRunning;
  }

  public cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isRunning = false;
  }

  public async extractFromChunks(
    chunks: Array<{ id: string; path: string; relativePath: string; name: string; text: string }>,
    store: MemoryStore,
    options: {
      activeModel: string;
      onProgress?: (p: ExtractionProgress) => void;
      forceAll?: boolean;
    }
  ): Promise<{ extractedCount: number; newCount: number; totalProcessed: number }> {
    if (this.isRunning) {
      throw new Error('Extraction is already in progress.');
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    let totalExtracted = 0;
    let totalNew = 0;

    // Filter relevant chunks to avoid wasting inference on binary or empty text
    const eligibleChunks = chunks.filter(c => {
      if (!c.text || c.text.length < 40) return false;
      return true;
    });

    const totalChunks = eligibleChunks.length;
    let processed = 0;

    const reportProgress = (stage: ExtractionProgress['stage'], msg: string, done = false, error?: string) => {
      options.onProgress?.({
        stage,
        currentChunk: processed,
        totalChunks,
        extractedCount: totalExtracted,
        newCount: totalNew,
        message: msg,
        done,
        error
      });
    };

    reportProgress('extracting', `Starting extraction across ${totalChunks} passages...`);

    try {
      // First check if Ollama is accessible
      let ollamaOnline = false;
      try {
        const pingRes = await fetch('http://127.0.0.1:11434/api/tags', { signal });
        if (pingRes.ok) ollamaOnline = true;
      } catch {
        ollamaOnline = false;
      }

      for (let i = 0; i < eligibleChunks.length; i++) {
        if (signal.aborted) {
          reportProgress('cancelled', 'Extraction cancelled by user.', true);
          return { extractedCount: totalExtracted, newCount: totalNew, totalProcessed: processed };
        }

        const chunk = eligibleChunks[i];
        processed = i + 1;

        // Run heuristic extraction first
        const heuristics = extractHeuristicCandidates(chunk);
        if (heuristics.length > 0) {
          const added = await store.addSuggestions(heuristics);
          totalExtracted += heuristics.length;
          totalNew += added.length;
        }

        // If Ollama is available, run LLM-powered extraction
        if (ollamaOnline) {
          try {
            const llmCandidates = await this.extractWithOllama(chunk, options.activeModel, signal);
            if (llmCandidates.length > 0) {
              const added = await store.addSuggestions(llmCandidates);
              totalExtracted += llmCandidates.length;
              totalNew += added.length;
            }
          } catch (err: any) {
            if (err.name === 'AbortError') {
              reportProgress('cancelled', 'Extraction cancelled by user.', true);
              return { extractedCount: totalExtracted, newCount: totalNew, totalProcessed: processed };
            }
            console.warn(`Ollama extraction error on chunk ${chunk.name}:`, err.message);
          }
        }

        if (processed % 2 === 0 || processed === totalChunks) {
          reportProgress(
            'extracting',
            `Analyzed ${processed}/${totalChunks} passages (${totalNew} new candidate items found)`
          );
        }
      }

      const finalMsg = ollamaOnline
        ? `Extraction complete. Analyzed ${totalChunks} passages. Found ${totalNew} new candidate items.`
        : `Extraction complete using local heuristic analysis (${totalChunks} passages analyzed, ${totalNew} candidates found). Note: Start Ollama for deep semantic extraction.`;

      reportProgress('completed', finalMsg, true);
      return { extractedCount: totalExtracted, newCount: totalNew, totalProcessed: processed };
    } catch (err: any) {
      const errorMsg = err.name === 'AbortError' ? 'Extraction cancelled.' : err.message || String(err);
      reportProgress(err.name === 'AbortError' ? 'cancelled' : 'error', errorMsg, true, errorMsg);
      throw err;
    } finally {
      this.isRunning = false;
      this.abortController = null;
    }
  }

  private async extractWithOllama(
    chunk: { id: string; path: string; relativePath: string; name: string; text: string },
    model: string,
    signal: AbortSignal
  ): Promise<Array<{
    type: MemoryType;
    title: string;
    details?: string;
    sourcePath: string;
    relativePath?: string;
    sourceExcerpt: string;
    confidence: number;
    confidenceReason: string;
    dueDate?: string;
    chunkId: string;
  }>> {
    // Quick heuristic filter: check if the text contains any task or decision indicators
    const lower = chunk.text.toLowerCase();
    const hasIndicators =
      lower.includes('todo') ||
      lower.includes('fixme') ||
      lower.includes('decision') ||
      lower.includes('decide') ||
      lower.includes('agreed') ||
      lower.includes('will use') ||
      lower.includes('chose') ||
      lower.includes('plan') ||
      lower.includes('finish') ||
      lower.includes('implement') ||
      lower.includes('before') ||
      lower.includes('deadline') ||
      lower.includes('must') ||
      lower.includes('need to') ||
      lower.includes('architecture') ||
      lower.includes('database') ||
      lower.includes('migration') ||
      lower.includes('refactor');

    // If chunk has no potential keywords and is code, skip to preserve inference speed
    if (!hasIndicators && chunk.name.match(/\.(js|jsx|ts|tsx|py|rs|go|java|c|h|cpp|sql|sh)$/i)) {
      return [];
    }

    const prompt = [
      'You are a precise technical memory assistant for OpenSearch / RecallDesk.',
      'Analyze the following document passage and extract any UNFINISHED TASKS or CONFIRMED ARCHITECTURAL/PRODUCT DECISIONS.',
      '',
      'CRITICAL RULES:',
      '1. Only extract items that have explicit factual evidence in the text.',
      '2. Do NOT invent deadlines, commitments, or decisions.',
      '3. Do NOT extract hypothetical examples (e.g., "for example, if you use Postgres...").',
      '4. Do NOT extract third-party library documentation or code instructions.',
      '5. Do NOT extract open/unresolved questions as confirmed decisions.',
      '6. For each item, excerpt MUST be an EXACT VERBATIM quote from the PASSAGE.',
      '7. If no clear tasks or decisions exist, return {"items": []}.',
      '',
      'Respond ONLY with a JSON object in this exact schema:',
      '{',
      '  "items": [',
      '    {',
      '      "type": "task" | "decision",',
      '      "title": "Concise title describing the task or decision (max 15 words)",',
      '      "details": "Brief supporting context or rationale from text",',
      '      "excerpt": "Exact verbatim quote from the passage supporting this item",',
      '      "confidence": 0.85,',
      '      "dueDate": "Explicit deadline mentioned in text, or null"',
      '    }',
      '  ]',
      '}',
      '',
      `PASSAGE (from ${chunk.relativePath || chunk.name}):`,
      '"""',
      chunk.text.slice(0, 1100),
      '"""',
      'JSON Output:'
    ].join('\n');

    const timeout = setTimeout(() => {
      // local chunk timeout
    }, 25_000);

    try {
      const res = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'smollm2:360m-instruct-q4_0',
          prompt,
          stream: false,
          format: 'json',
          options: {
            temperature: 0.1,
            num_predict: 350
          }
        }),
        signal
      });

      if (!res.ok) return [];

      const data = await res.json() as { response?: string };
      if (!data.response?.trim()) return [];

      let parsed: { items?: RawExtractedItem[] };
      try {
        parsed = JSON.parse(data.response.trim());
      } catch {
        // Attempt to find JSON object substring
        const match = data.response.match(/\{[\s\S]*\}/);
        if (match) {
          parsed = JSON.parse(match[0]);
        } else {
          return [];
        }
      }

      if (!Array.isArray(parsed?.items)) return [];

      const verifiedCandidates: Array<{
        type: MemoryType;
        title: string;
        details?: string;
        sourcePath: string;
        relativePath?: string;
        sourceExcerpt: string;
        confidence: number;
        confidenceReason: string;
        dueDate?: string;
        chunkId: string;
      }> = [];

      for (const item of parsed.items) {
        if (!item.title || !item.excerpt) continue;
        const type: MemoryType = item.type === 'decision' ? 'decision' : 'task';

        // Discard hypothetical phrasing or false positives
        const lowerTitle = item.title.toLowerCase();
        if (
          lowerTitle.startsWith('example') ||
          lowerTitle.startsWith('how to') ||
          lowerTitle.startsWith('documentation') ||
          lowerTitle.includes('hypothetical')
        ) {
          continue;
        }

        // Verify excerpt exists in chunk text
        if (!verifyExcerptInChunk(item.excerpt, chunk.text)) {
          continue;
        }

        const confidence = typeof item.confidence === 'number'
          ? Math.max(0.5, Math.min(1.0, item.confidence))
          : 0.8;

        verifiedCandidates.push({
          type,
          title: item.title.trim(),
          details: item.details?.trim() || undefined,
          sourcePath: chunk.path,
          relativePath: chunk.relativePath,
          sourceExcerpt: item.excerpt.trim(),
          confidence,
          confidenceReason: `Extracted via local LLM with verified passage excerpt`,
          dueDate: (item.dueDate && item.dueDate !== 'null') ? String(item.dueDate).trim() : undefined,
          chunkId: chunk.id
        });
      }

      return verifiedCandidates;
    } finally {
      clearTimeout(timeout);
    }
  }
}
