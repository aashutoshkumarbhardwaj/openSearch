import { randomUUID } from 'node:crypto';
import type {
  AnalysisGoal,
  EvidenceClassification,
  Finding,
  FindingType,
  IngestedSource,
  IntelligenceAnalysisResult,
  IntelligenceProgress,
  IntelligenceRunOptions
} from './types.ts';
import {
  detectSourceType,
  ingestFileSource,
  ingestFolderSource
} from './adapters.ts';
import { verifyExcerptInChunk, extractHeuristicCandidates } from '../memory/extractor.ts';

const VISION_MODEL_KEYWORDS = ['vision', 'llava', 'vl', 'minicpm', 'moondream', 'bakllava', 'clip'];

export function isVisionCapable(modelName: string): boolean {
  const lower = (modelName || '').toLowerCase();
  return VISION_MODEL_KEYWORDS.some(kw => lower.includes(kw));
}

export class ProjectIntelligenceAnalyzer {
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

  public async runAnalysis(
    options: IntelligenceRunOptions,
    context: {
      activeModel: string;
      indexedChunks?: Array<{ id: string; path: string; relativePath: string; name: string; text: string }>;
      onProgress?: (progress: IntelligenceProgress) => void;
    }
  ): Promise<IntelligenceAnalysisResult> {
    if (this.isRunning) {
      throw new Error('Project Intelligence analysis is already running.');
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const warnings: string[] = [];
    const ingestedSources: IngestedSource[] = [];

    const reportProgress = (
      stage: IntelligenceProgress['stage'],
      percent: number,
      msg: string,
      sourcesProcessed: number,
      totalSources: number,
      findingsCount: number,
      done = false,
      error?: string
    ) => {
      context.onProgress?.({
        stage,
        percent,
        sourcesProcessed,
        totalSources,
        findingsCount,
        message: msg,
        done,
        error
      });
    };

    try {
      reportProgress('inspecting', 5, 'Inspecting and ingesting selected sources...', 0, options.sources.length, 0);

      // Phase 1: Ingestion through source adapters
      for (let i = 0; i < options.sources.length; i++) {
        if (signal.aborted) throw new Error('Analysis cancelled by user.');

        const src = options.sources[i];

        if (src.isIndexed) {
          // Pull from currently indexed chunks
          const chunks = context.indexedChunks || [];
          if (!chunks.length) {
            warnings.push('Indexed content was selected, but no indexed files were found in the current library.');
          } else {
            // Group chunks by file path
            const byFile = new Map<string, string[]>();
            for (const c of chunks) {
              const existing = byFile.get(c.path) || [];
              existing.push(c.text);
              byFile.set(c.path, existing);
            }
            for (const [path, texts] of byFile.entries()) {
              const fullText = texts.join('\n\n');
              const { type, mimeType } = detectSourceType(path);
              ingestedSources.push({
                id: randomUUID(),
                originalPath: path,
                relativePath: path.split(/[/\\]/).pop() || path,
                displayName: path.split(/[/\\]/).pop() || path,
                sourceType: type,
                mimeType,
                sizeBytes: fullText.length,
                extractedText: fullText,
                metadata: { source: 'indexed_library' },
                evidenceLocations: [],
                status: 'ready'
              });
            }
          }
        } else if (src.isFolder) {
          reportProgress('ingesting', 15, `Reading folder: ${src.path.split(/[/\\]/).pop()}...`, i, options.sources.length, 0);
          const folderSources = await ingestFolderSource(src.path, (count, name) => {
            reportProgress('ingesting', Math.min(35, 15 + count), `Ingesting ${name}...`, i, options.sources.length, 0);
          });
          ingestedSources.push(...folderSources);
        } else {
          const single = await ingestFileSource(src.path);
          ingestedSources.push(single);
        }
      }

      const readySources = ingestedSources.filter(s => s.status === 'ready' && s.extractedText.trim().length > 0);
      const unsupportedSources = ingestedSources.filter(s => s.status === 'unsupported');
      const errorSources = ingestedSources.filter(s => s.status === 'error');

      for (const un of unsupportedSources) {
        warnings.push(`Skipped "${un.displayName}": ${un.unsupportedReason || 'Unsupported format.'}`);
      }
      for (const err of errorSources) {
        warnings.push(`Error reading "${err.displayName}": ${err.error || 'Failed to read file.'}`);
      }

      if (!readySources.length) {
        throw new Error('None of the selected sources could be parsed or contained readable text.');
      }

      // Check vision capability if images were supplied
      const imageSources = readySources.filter(s => s.sourceType === 'image');
      const hasVisionModel = isVisionCapable(context.activeModel);

      if (imageSources.length > 0 && !hasVisionModel) {
        warnings.push(
          `Image understanding note: Selected model '${context.activeModel}' is text-only. Visual inspection of diagrams/screenshots requires a vision model (e.g. 'llava' or 'llama3.2-vision'). Image filenames and metadata were recorded.`
        );
      }

      reportProgress(
        'analyzing',
        40,
        `Analyzing ${readySources.length} prepared sources for goal: ${options.goal.replace('_', ' ')}...`,
        readySources.length,
        readySources.length,
        0
      );

      if (signal.aborted) throw new Error('Analysis cancelled by user.');

      // Phase 2: Call Ollama with strict structured JSON prompt
      let ollamaOnline = false;
      try {
        const pingRes = await fetch('http://127.0.0.1:11434/api/tags', { signal });
        if (pingRes.ok) ollamaOnline = true;
      } catch (err: any) {
        if (signal.aborted || err.name === 'AbortError') {
          throw new Error('Analysis cancelled by user.');
        }
        ollamaOnline = false;
      }

      if (signal.aborted) throw new Error('Analysis cancelled by user.');

      let analysisResult: { overview: string; findings: Finding[] };

      if (ollamaOnline) {
        try {
          analysisResult = await this.analyzeWithOllama(
            readySources,
            options.goal,
            options.customInstructions,
            context.activeModel,
            imageSources,
            hasVisionModel,
            signal
          );
        } catch (err: any) {
          if (err.name === 'AbortError') throw err;
          console.warn('Ollama analysis failed; falling back to rule-based intelligence engine:', err.message);
          warnings.push(`Local LLM notice: ${err.message}. Applied local rule-based intelligence analysis.`);
          analysisResult = this.analyzeWithHeuristics(readySources, options.goal, options.customInstructions);
        }
      } else {
        warnings.push('Ollama is currently offline on 127.0.0.1:11434. Used local privacy-first rule-based intelligence engine.');
        analysisResult = this.analyzeWithHeuristics(readySources, options.goal, options.customInstructions);
      }

      // Phase 3: Validate and ground findings against ingested text
      const validatedFindings: Finding[] = [];
      const seenTitles = new Set<string>();

      for (const raw of analysisResult.findings) {
        if (!raw.title || !raw.title.trim()) continue;
        const normKey = `${raw.type}:${raw.title.trim().toLowerCase()}`;
        if (seenTitles.has(normKey)) continue;
        seenTitles.add(normKey);

        // Find matching source
        let matchedSource = readySources.find(
          s => s.displayName.toLowerCase() === (raw.sourceName || '').toLowerCase() ||
               s.originalPath.toLowerCase() === (raw.sourcePath || '').toLowerCase()
        );

        if (!matchedSource && readySources.length > 0) {
          // Fallback to source that contains the excerpt
          matchedSource = readySources.find(s => s.extractedText.includes((raw.sourceExcerpt || '').slice(0, 40))) || readySources[0];
        }

        const sourcePath = matchedSource ? matchedSource.originalPath : (raw.sourcePath || 'Unknown');
        const sourceName = matchedSource ? matchedSource.displayName : (raw.sourceName || 'Unknown');
        const sourceExcerpt = (raw.sourceExcerpt || '').trim();

        // Excerpt ground-truth verification
        let evidenceClass = raw.evidenceClassification || 'inferred';
        if (matchedSource && sourceExcerpt) {
          const verified = verifyExcerptInChunk(sourceExcerpt, matchedSource.extractedText);
          if (verified) {
            evidenceClass = 'explicitly_stated';
          } else if (evidenceClass === 'explicitly_stated') {
            evidenceClass = 'inferred';
          }
        }

        const finding: Finding = {
          id: randomUUID(),
          type: raw.type || 'task',
          title: raw.title.trim(),
          description: raw.description?.trim() || raw.title.trim(),
          reason: raw.reason?.trim() || undefined,
          sourcePath,
          sourceName,
          sourceExcerpt: sourceExcerpt || (matchedSource ? matchedSource.extractedText.slice(0, 150) : ''),
          evidenceClassification: evidenceClass,
          confidence: typeof raw.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : 0.85,
          status: 'suggested',
          targetMemoryType: raw.type === 'decision' ? 'decision' : 'task',
          dueDate: raw.dueDate ? String(raw.dueDate).trim() : undefined,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };

        validatedFindings.push(finding);
      }

      reportProgress('completed', 100, `Completed analysis. Found ${validatedFindings.length} intelligence findings.`, readySources.length, readySources.length, validatedFindings.length, true);

      return {
        overview: analysisResult.overview || 'Analysis completed across selected context sources.',
        goal: options.goal,
        customInstructions: options.customInstructions,
        findings: validatedFindings,
        sourcesAnalyzed: {
          total: ingestedSources.length,
          successful: readySources.length,
          failed: errorSources.length,
          unsupported: unsupportedSources.length,
          details: ingestedSources.map(s => ({
            path: s.originalPath,
            name: s.displayName,
            type: s.sourceType,
            status: s.status
          }))
        },
        warnings,
        modelUsed: ollamaOnline ? context.activeModel : 'Local Heuristic Engine',
        completedAt: Date.now()
      };
    } catch (err: any) {
      const isAbort = err.name === 'AbortError' || (err.message && err.message.includes('cancelled'));
      reportProgress(isAbort ? 'cancelled' : 'error', 0, isAbort ? 'Analysis cancelled.' : err.message, 0, 0, 0, true, err.message);
      throw err;
    } finally {
      this.isRunning = false;
      this.abortController = null;
    }
  }

  private async analyzeWithOllama(
    sources: IngestedSource[],
    goal: AnalysisGoal,
    customInstructions: string | undefined,
    model: string,
    imageSources: IngestedSource[],
    hasVisionModel: boolean,
    signal: AbortSignal
  ): Promise<{ overview: string; findings: Finding[] }> {
    // Build context summary with manageable length
    let contextPassages = '';
    let remainingBudget = 9000; // Character budget for prompt context to avoid small model context overflows

    for (const src of sources) {
      if (remainingBudget <= 0) break;
      const snippet = src.extractedText.slice(0, Math.min(src.extractedText.length, 1800));
      contextPassages += `\n--- SOURCE: ${src.displayName} (Path: ${src.originalPath}, Type: ${src.sourceType}) ---\n${snippet}\n`;
      remainingBudget -= snippet.length;
    }

    const goalDescriptions: Record<AnalysisGoal, string> = {
      overview: 'Provide a structured executive summary of what this project contains, its primary purpose, core components, architecture, and current state.',
      next_actions: 'Analyze the material to determine: What am I working on, what matters most, and what concrete steps should I do next? Identify actionable next steps backed by evidence.',
      tasks: 'Extract all explicit tasks, commitments, acceptance criteria, action items, and TODOs from the files. Highlight any explicit deadlines.',
      decisions: 'Identify all confirmed decisions, architectural choices, technology adoptions, and unresolved questions that need confirmation.',
      issues: 'Identify potential issues, inconsistencies, bugs, risks, or incomplete requirements. Do NOT claim defects unless grounded in the text.',
      images: 'Interpret visible diagrams, screenshots, interface states, or error messages from the provided context.',
      custom: customInstructions ? `User custom instructions: ${customInstructions}` : 'Analyze project context thoroughly.'
    };

    const prompt = [
      'You are RecallDesk Universal Project Intelligence, an expert, privacy-first technical assistant.',
      `ANALYSIS GOAL: ${goalDescriptions[goal]}`,
      customInstructions ? `ADDITIONAL USER INSTRUCTIONS: ${customInstructions}` : '',
      '',
      'GROUNDING AND INTEGRITY RULES:',
      '1. Base every finding strictly on the provided source passages.',
      '2. Do NOT invent deadlines, commitments, or imaginary bug defects.',
      '3. For each finding, provide an exact quote or close substring in "sourceExcerpt".',
      '4. Distinguish explicitly stated items from inferred recommendations using "evidenceClassification".',
      '5. Output MUST be valid JSON adhering strictly to the schema below.',
      '',
      'OUTPUT SCHEMA (JSON only, no markdown wrapping, no extra keys):',
      '{',
      '  "overview": "Comprehensive 2-4 sentence executive synthesis of project status and findings",',
      '  "findings": [',
      '    {',
      '      "type": "task" | "decision" | "issue" | "recommendation" | "question",',
      '      "title": "Concise, descriptive title (under 14 words)",',
      '      "description": "Clear explanation of the finding",',
      '      "reason": "Why this matters or its impact",',
      '      "sourceName": "Exact filename from which this comes",',
      '      "sourceExcerpt": "Verbatim supporting quote from the source passage",',
      '      "evidenceClassification": "explicitly_stated" | "directly_observed" | "inferred" | "suggested",',
      '      "confidence": 0.85,',
      '      "dueDate": "Explicit deadline if present in text, else null"',
      '    }',
      '  ]',
      '}',
      '',
      'CONTEXT PASSAGES:',
      contextPassages,
      '',
      'JSON Output:'
    ].join('\n');

    const requestBody: any = {
      model,
      prompt,
      stream: false,
      format: 'json',
      options: {
        temperature: 0.1,
        num_predict: 850
      }
    };

    // If vision model and images are present, attach images array
    if (hasVisionModel && imageSources.length > 0) {
      const base64Images = imageSources
        .map(img => img.imageDataBase64)
        .filter((b): b is string => typeof b === 'string' && b.length > 0)
        .slice(0, 3);
      if (base64Images.length > 0) {
        requestBody.images = base64Images;
      }
    }

    const res = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal
    });

    if (!res.ok) {
      throw new Error(`Ollama returned status HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json() as { response?: string };
    if (!data.response?.trim()) {
      throw new Error('Ollama returned an empty response.');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(data.response.trim());
    } catch {
      const jsonMatch = data.response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Model did not return valid JSON output.');
      }
    }

    return {
      overview: parsed?.overview || 'Project intelligence synthesis completed.',
      findings: Array.isArray(parsed?.findings) ? parsed.findings : []
    };
  }

  private analyzeWithHeuristics(
    sources: IngestedSource[],
    goal: AnalysisGoal,
    customInstructions?: string
  ): { overview: string; findings: Finding[] } {
    const findings: Finding[] = [];
    const sourceNames = sources.map(s => s.displayName).join(', ');

    // Extract heuristics from all sources
    for (const src of sources) {
      const heuristics = extractHeuristicCandidates({
        id: src.id,
        path: src.originalPath,
        relativePath: src.relativePath,
        text: src.extractedText
      });

      for (const h of heuristics) {
        findings.push({
          id: randomUUID(),
          type: h.type,
          title: h.title,
          description: h.details || h.title,
          sourcePath: src.originalPath,
          sourceName: src.displayName,
          sourceExcerpt: h.sourceExcerpt,
          evidenceClassification: 'explicitly_stated',
          confidence: h.confidence,
          status: 'suggested',
          targetMemoryType: h.type,
          dueDate: h.dueDate,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
    }

    // Add goal-directed recommendations
    if (goal === 'next_actions' || goal === 'overview') {
      const totalLines = sources.reduce((acc, s) => acc + (s.metadata.lineCount || 0), 0);
      findings.push({
        id: randomUUID(),
        type: 'recommendation',
        title: `Review ${sources.length} analyzed sources (${totalLines} lines)`,
        description: `Inspected sources: ${sourceNames}. Recommended next action: review discovered tasks and confirmed decisions.`,
        sourcePath: sources[0]?.originalPath || 'Workspace',
        sourceName: sources[0]?.displayName || 'Project',
        sourceExcerpt: `Analyzed sources: ${sourceNames}`,
        evidenceClassification: 'directly_observed',
        confidence: 0.95,
        status: 'suggested',
        targetMemoryType: 'task',
        createdAt: Date.now(),
        updatedAt: Date.now()
      });
    }

    return {
      overview: `Analyzed ${sources.length} sources (${sourceNames}) using local intelligence engine. Extracted explicit action items, decisions, and structural indicators.`,
      findings
    };
  }
}
