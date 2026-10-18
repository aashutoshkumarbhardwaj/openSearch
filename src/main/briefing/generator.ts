import { randomUUID } from 'node:crypto';
import type { MemoryStore } from '../memory/store.ts';
import type { ActivityTracker } from './activity.ts';
import type {
  DailyBriefing,
  BriefingGenerateOptions,
  BriefingFocusItem,
  BriefingTaskItem,
  BriefingDecisionItem,
  BriefingActivityItem,
  BriefingScope
} from './types.ts';

export interface BriefingGeneratorContext {
  memoryStore: MemoryStore;
  activityTracker: ActivityTracker;
  getRecentClipboard?: (limit: number) => Promise<Array<{ text: string; contentType: string; capturedAt: number }>>;
  activeModel?: string;
}

export class BriefingGenerator {
  private memoryStore: MemoryStore;
  private activityTracker: ActivityTracker;
  private getRecentClipboard?: (limit: number) => Promise<Array<{ text: string; contentType: string; capturedAt: number }>>;
  private activeModel: string;

  constructor(context: BriefingGeneratorContext) {
    this.memoryStore = context.memoryStore;
    this.activityTracker = context.activityTracker;
    this.getRecentClipboard = context.getRecentClipboard;
    this.activeModel = context.activeModel || 'mistral:latest';
  }

  public setActiveModel(model: string): void {
    if (model && model.trim()) {
      this.activeModel = model.trim();
    }
  }

  public async generate(options: BriefingGenerateOptions = {}, signal?: AbortSignal): Promise<DailyBriefing> {
    const scope: BriefingScope = options.scope || 'all';
    const scopeName = scope === 'all' ? 'All Projects' : scope.split(/[/\\]/).filter(Boolean).pop() || scope;

    const todayDate = new Date().toISOString().slice(0, 10);

    // 1. Gather confirmed tasks & decisions from MemoryStore
    const allMemoryItems = this.memoryStore.getItems();
    
    // Filter by scope if specific project
    const scopedMemoryItems = allMemoryItems.filter(item => {
      if (scope === 'all') return true;
      const path = (item.sourcePath || item.relativePath || '').toLowerCase();
      return path.includes(scope.toLowerCase());
    });

    // 2. Extract Open Tasks & Prioritize Deadlines
    const rawOpenTasks = scopedMemoryItems.filter(i => i.type === 'task' && i.status === 'open');

    // Sort: Tasks with explicit dueDate first (earliest deadline first), then recent updatedAt
    rawOpenTasks.sort((a, b) => {
      if (a.dueDate && b.dueDate) {
        return a.dueDate.localeCompare(b.dueDate);
      }
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return b.updatedAt - a.updatedAt;
    });

    const openTasks: BriefingTaskItem[] = rawOpenTasks.slice(0, 15).map(t => ({
      id: t.id,
      title: t.title,
      details: t.details,
      dueDate: t.dueDate,
      sourcePath: t.sourcePath,
      relativePath: t.relativePath,
      status: 'open'
    }));

    // 3. Extract Recently Completed Tasks (past 48 hours)
    const cutoff48h = Date.now() - 48 * 60 * 60 * 1000;
    const completedRecently: BriefingTaskItem[] = scopedMemoryItems
      .filter(i => i.type === 'task' && i.status === 'completed' && i.updatedAt >= cutoff48h)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5)
      .map(t => ({
        id: t.id,
        title: t.title,
        details: t.details,
        dueDate: t.dueDate,
        sourcePath: t.sourcePath,
        relativePath: t.relativePath,
        status: 'completed'
      }));

    // 4. Extract Key Decisions (status === 'open' or suggested/confirmed)
    const keyDecisions: BriefingDecisionItem[] = scopedMemoryItems
      .filter(i => i.type === 'decision' && i.status === 'open')
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 8)
      .map(d => ({
        id: d.id,
        title: d.title,
        details: d.details,
        sourcePath: d.sourcePath,
        relativePath: d.relativePath,
        updatedAt: d.updatedAt
      }));

    // 5. Gather Verified Recent Activities
    const recentActivity: BriefingActivityItem[] = this.activityTracker.getRecentActivities(
      10,
      cutoff48h,
      scope === 'all' ? undefined : scope
    );

    // 6. Gather Clipboard Snippets (ONLY IF opted-in)
    let clipboardSummary: string | undefined = undefined;
    if (options.includeClipboard && this.getRecentClipboard) {
      try {
        const clips = await this.getRecentClipboard(5);
        if (clips.length > 0) {
          clipboardSummary = `${clips.length} recent clipboard item(s) recorded in workspace.`;
        }
      } catch {
        // Clipboard access failure is non-fatal
      }
    }

    // 7. Check for Insufficient Data
    const insufficientData = openTasks.length === 0 && keyDecisions.length === 0 && recentActivity.length === 0;

    // 8. Deterministic focus items fallback
    const deterministicFocus = this.buildDeterministicFocusItems(openTasks, keyDecisions, recentActivity);

    // 9. Deterministic summary fallback
    const deadlineCount = openTasks.filter(t => Boolean(t.dueDate)).length;
    let fallbackSummary = '';
    if (insufficientData) {
      fallbackSummary = 'Limited project data available. No open tasks, recent decisions, or verified activity have been recorded yet.';
    } else {
      const parts: string[] = [];
      if (openTasks.length > 0) {
        parts.push(`${openTasks.length} open task${openTasks.length === 1 ? '' : 's'}${deadlineCount > 0 ? ` (${deadlineCount} with scheduled deadline${deadlineCount === 1 ? '' : 's'})` : ''}`);
      }
      if (completedRecently.length > 0) {
        parts.push(`${completedRecently.length} task${completedRecently.length === 1 ? '' : 's'} completed recently`);
      }
      if (keyDecisions.length > 0) {
        parts.push(`${keyDecisions.length} active decision${keyDecisions.length === 1 ? '' : 's'}`);
      }
      if (recentActivity.length > 0) {
        parts.push(`${recentActivity.length} verified event${recentActivity.length === 1 ? '' : 's'}`);
      }
      fallbackSummary = `Daily memory briefing for ${scopeName}: Tracking ${parts.join(', ')}.`;
      if (clipboardSummary) {
        fallbackSummary += ` ${clipboardSummary}`;
      }
    }

    let summary = fallbackSummary;
    let focusItems = deterministicFocus;
    let generationType: 'ai' | 'deterministic' = 'deterministic';
    let modelUsed: string | undefined = undefined;

    // 10. Attempt Ollama AI Summarization if available and not aborted
    if (!insufficientData && !signal?.aborted) {
      const aiResult = await this.summarizeWithOllama(
        scopeName,
        openTasks,
        completedRecently,
        keyDecisions,
        recentActivity,
        signal
      );

      if (aiResult) {
        summary = aiResult.summary;
        // Merge or validate focus items
        if (aiResult.focusItems && aiResult.focusItems.length > 0) {
          focusItems = aiResult.focusItems;
        }
        generationType = 'ai';
        modelUsed = this.activeModel;
      }
    }

    return {
      id: randomUUID(),
      date: todayDate,
      createdAt: Date.now(),
      scope,
      scopeName,
      summary,
      focusItems,
      openTasks,
      completedRecently,
      keyDecisions,
      recentActivity,
      insufficientData,
      generationType,
      modelUsed
    };
  }

  private buildDeterministicFocusItems(
    openTasks: BriefingTaskItem[],
    keyDecisions: BriefingDecisionItem[],
    recentActivity: BriefingActivityItem[]
  ): BriefingFocusItem[] {
    const focus: BriefingFocusItem[] = [];

    // Focus 1: Highest priority open task with a deadline, or first open task
    const deadlineTask = openTasks.find(t => Boolean(t.dueDate));
    if (deadlineTask) {
      focus.push({
        id: randomUUID(),
        title: `Address scheduled deadline: ${deadlineTask.title}`,
        rationale: `This task has an explicit deadline recorded for ${deadlineTask.dueDate}.`,
        priority: 'high',
        relatedTaskId: deadlineTask.id,
        relatedSource: deadlineTask.sourcePath || deadlineTask.relativePath
      });
    } else if (openTasks.length > 0) {
      const topTask = openTasks[0];
      focus.push({
        id: randomUUID(),
        title: `Tackle open task: ${topTask.title}`,
        rationale: 'Active open item in memory store.',
        priority: 'high',
        relatedTaskId: topTask.id,
        relatedSource: topTask.sourcePath || topTask.relativePath
      });
    }

    // Focus 2: Second open task or key decision alignment
    const remainingTasks = openTasks.filter(t => !focus.some(f => f.relatedTaskId === t.id));
    if (remainingTasks.length > 0) {
      const secondTask = remainingTasks[0];
      focus.push({
        id: randomUUID(),
        title: `Progress on: ${secondTask.title}`,
        rationale: secondTask.dueDate ? `Due on ${secondTask.dueDate}.` : 'Pending unfinished project work.',
        priority: 'medium',
        relatedTaskId: secondTask.id,
        relatedSource: secondTask.sourcePath || secondTask.relativePath
      });
    } else if (keyDecisions.length > 0) {
      const decision = keyDecisions[0];
      focus.push({
        id: randomUUID(),
        title: `Review saved decision: ${decision.title}`,
        rationale: 'Recorded decision ready to be reviewed or applied to project architecture.',
        priority: 'medium',
        relatedSource: decision.sourcePath || decision.relativePath
      });
    }

    // Focus 3: Third item from verified activity or third task
    if (focus.length < 3) {
      if (remainingTasks.length > 1) {
        const thirdTask = remainingTasks[1];
        focus.push({
          id: randomUUID(),
          title: `Continue: ${thirdTask.title}`,
          rationale: thirdTask.dueDate ? `Scheduled for ${thirdTask.dueDate}.` : 'Open project task.',
          priority: 'low',
          relatedTaskId: thirdTask.id,
          relatedSource: thirdTask.sourcePath || thirdTask.relativePath
        });
      } else if (recentActivity.length > 0) {
        const latestAct = recentActivity[0];
        focus.push({
          id: randomUUID(),
          title: `Review recent project changes`,
          rationale: `Latest verified activity: ${latestAct.description}`,
          priority: 'low'
        });
      }
    }

    if (focus.length === 0) {
      focus.push({
        id: randomUUID(),
        title: 'Index project directory',
        rationale: 'Add folder or workspace sources to populate tasks, decisions, and activity logs.',
        priority: 'medium'
      });
    }

    return focus.slice(0, 3);
  }

  private async summarizeWithOllama(
    scopeName: string,
    openTasks: BriefingTaskItem[],
    completedRecently: BriefingTaskItem[],
    keyDecisions: BriefingDecisionItem[],
    recentActivity: BriefingActivityItem[],
    signal?: AbortSignal
  ): Promise<{ summary: string; focusItems: BriefingFocusItem[] } | null> {
    try {
      // 1. Health check Ollama with timeout
      const pingController = new AbortController();
      const pingTimeout = setTimeout(() => pingController.abort(), 1500);
      try {
        const pingRes = await fetch('http://127.0.0.1:11434/api/tags', {
          signal: pingController.signal
        });
        clearTimeout(pingTimeout);
        if (!pingRes.ok) return null;
      } catch {
        clearTimeout(pingTimeout);
        return null;
      }

      if (signal?.aborted) return null;

      // 2. Prepare structured, bounded payload
      const payloadContext = {
        scopeName,
        openTasks: openTasks.slice(0, 8).map(t => ({
          id: t.id,
          title: t.title,
          dueDate: t.dueDate || null,
          source: t.relativePath || t.sourcePath || null
        })),
        completedRecently: completedRecently.slice(0, 4).map(t => t.title),
        keyDecisions: keyDecisions.slice(0, 5).map(d => ({
          id: d.id,
          title: d.title,
          source: d.relativePath || d.sourcePath || null
        })),
        recentActivity: recentActivity.slice(0, 5).map(a => a.description)
      };

      const systemPrompt = `You are RecallDesk's Daily Memory Briefing synthesizer.
Given the verified local tasks, deadlines, decisions, and activity below, produce a strictly grounded briefing.
DO NOT invent deadlines, tasks, or facts. Everything must refer directly to the items provided.
Respond ONLY with a valid JSON object matching this schema:
{
  "summary": "1-2 sentence executive briefing summarizing unfinished work, imminent deadlines, and recent milestones.",
  "focusItems": [
    {
      "title": "Clear action phrase",
      "rationale": "Why this matters, citing actual deadline or context",
      "priority": "high" | "medium" | "low",
      "relatedTaskId": "exact id from openTasks if applicable",
      "relatedSource": "source path if applicable"
    }
  ]
}
Provide at most 3 focus items.`;

      const requestBody = {
        model: this.activeModel,
        prompt: `${systemPrompt}\n\nProject Data:\n${JSON.stringify(payloadContext, null, 2)}\n\nJSON output:`,
        stream: false,
        format: 'json',
        options: {
          temperature: 0.2
        }
      };

      const res = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal
      });

      if (!res.ok) return null;

      const data = await res.json() as { response?: string };
      if (!data.response?.trim()) return null;

      let parsed: any;
      try {
        parsed = JSON.parse(data.response.trim());
      } catch {
        const jsonMatch = data.response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          return null;
        }
      }

      if (!parsed || typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
        return null;
      }

      const validFocusItems: BriefingFocusItem[] = [];
      if (Array.isArray(parsed.focusItems)) {
        for (const item of parsed.focusItems.slice(0, 3)) {
          if (!item.title || typeof item.title !== 'string') continue;
          
          // Verify relatedTaskId if present
          let verifiedTaskId: string | undefined = undefined;
          let verifiedSource: string | undefined = item.relatedSource;

          if (item.relatedTaskId && typeof item.relatedTaskId === 'string') {
            const matchingTask = openTasks.find(t => t.id === item.relatedTaskId);
            if (matchingTask) {
              verifiedTaskId = matchingTask.id;
              verifiedSource = verifiedSource || matchingTask.sourcePath || matchingTask.relativePath;
            }
          }

          validFocusItems.push({
            id: randomUUID(),
            title: item.title.trim(),
            rationale: typeof item.rationale === 'string' ? item.rationale.trim() : 'Suggested priority action.',
            priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium',
            relatedTaskId: verifiedTaskId,
            relatedSource: verifiedSource
          });
        }
      }

      return {
        summary: parsed.summary.trim(),
        focusItems: validFocusItems.length > 0 ? validFocusItems : this.buildDeterministicFocusItems(openTasks, keyDecisions, recentActivity)
      };
    } catch {
      // Any error falls back gracefully to deterministic logic
      return null;
    }
  }
}
