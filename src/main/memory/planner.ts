import { promises as fs, existsSync } from 'node:fs';
import { resolve, basename, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PDFParse } from 'pdf-parse';
import type { ActionPlan, ActionPlanPhase, ActionPlanTask, MemoryItem } from './types.ts';
import { MemoryStore } from './store.ts';

const MAX_READ_BYTES = 15_000_000;

export function chunkText(text: string, chunkChars = 1000, overlap = 120): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const result: string[] = [];
  for (let start = 0; start < normalized.length; start += chunkChars - overlap) {
    const part = normalized.slice(start, start + chunkChars).trim();
    if (part.length > 35) result.push(part);
  }
  return result;
}

export async function extractTextFromFile(filePath: string): Promise<{ text: string; name: string }> {
  const safe = resolve(filePath);
  if (!existsSync(safe)) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  const stat = await fs.stat(safe);
  if (stat.isDirectory()) {
    // Read directory files recursively
    const textPieces: string[] = [];
    const entries = await fs.readdir(safe, { withFileTypes: true });
    for (const ent of entries.slice(0, 30)) {
      if (ent.isFile() && !ent.name.startsWith('.')) {
        const subPath = join(safe, ent.name);
        try {
          const res = await extractTextFromFile(subPath);
          if (res.text.trim()) {
            textPieces.push(`=== FILE: ${ent.name} ===\n${res.text}`);
          }
        } catch {
          // ignore unreadable files in folder
        }
      }
    }
    return { text: textPieces.join('\n\n'), name: basename(safe) };
  }

  if (stat.size > MAX_READ_BYTES) {
    throw new Error(`File size (${Math.round(stat.size / 1024 / 1024)} MB) exceeds limit.`);
  }

  const ext = extname(safe).toLowerCase();
  const name = basename(safe);

  if (ext === '.pdf') {
    let parser: any = null;
    try {
      const data = await fs.readFile(safe);
      parser = new PDFParse({ data });
      const res = await parser.getText();
      return { text: res?.text ? res.text.trim() : '', name };
    } finally {
      if (parser?.destroy) await parser.destroy().catch(() => {});
    }
  }

  // Text, Markdown, Code
  const buffer = await fs.readFile(safe);
  // Simple binary check
  if (buffer.subarray(0, Math.min(buffer.length, 4000)).includes(0)) {
    throw new Error(`Cannot parse binary file: ${name}`);
  }

  return { text: buffer.toString('utf8'), name };
}

export function parseDeterministicActionPlan(
  text: string,
  sourcePath: string,
  sourceName: string
): ActionPlan {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Extract Title
  let title = `Action Plan: ${sourceName.replace(/\.[^/.]+$/, '')}`;
  const firstHeader = lines.find(l => l.startsWith('# '));
  if (firstHeader) {
    title = firstHeader.replace(/^#+\s*/, '').trim();
  }

  // Detect Deadlines
  const deadlines: Array<{ title: string; date: string; description?: string }> = [];
  const dateRegex = /(?:due(?::|\s+on|\s+by)?|deadline(?::|\s+is)?|submit(?:\s+by)?|before)\s+([A-Za-z0-9, :.-]{4,35})/gi;
  let match;
  while ((match = dateRegex.exec(text)) !== null) {
    const rawDate = match[1].trim();
    if (rawDate.length >= 4 && !rawDate.toLowerCase().includes('example')) {
      deadlines.push({
        title: `Deliverable Deadline: ${rawDate}`,
        date: rawDate,
        description: `Mentioned in ${sourceName}`
      });
      if (deadlines.length >= 4) break;
    }
  }

  // Standard Assessment & Project Phases
  const phase1Tasks: ActionPlanTask[] = [];
  const phase2Tasks: ActionPlanTask[] = [];
  const phase3Tasks: ActionPlanTask[] = [];
  const phase4Tasks: ActionPlanTask[] = [];

  // Scrape TODOs, checkmarks, bullets, deliverables, criteria
  const taskLines: Array<{ line: string; raw: string }> = [];
  for (const line of lines) {
    const taskMatch = line.match(/^(?:[-*]\s*\[\s*\]|\/\/\s*TODO:?|#\s*TODO:?|TODO:?|FIXME:?|Task\s*\d*:?|Step\s*\d*:?|[-*]\s+)\s*(.+)$/i);
    if (taskMatch && taskMatch[1].length >= 8 && taskMatch[1].length <= 160) {
      taskLines.push({ line: taskMatch[1].trim(), raw: line });
    }
  }

  // Calculate default target dates
  const today = new Date();
  const formatOffset = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  // If specific task lines found in doc, map them to phases
  if (taskLines.length >= 3) {
    taskLines.forEach((t, i) => {
      const task: ActionPlanTask = {
        id: randomUUID(),
        title: t.line.replace(/^[-*]\s*/, ''),
        completed: false,
        sourceExcerpt: t.raw.slice(0, 180),
        dueDate: deadlines[0]?.date || formatOffset(Math.min(14, (i + 1) * 2))
      };

      if (i < Math.ceil(taskLines.length * 0.3)) {
        phase1Tasks.push(task);
      } else if (i < Math.ceil(taskLines.length * 0.7)) {
        phase2Tasks.push(task);
      } else {
        phase3Tasks.push(task);
      }
    });
  } else {
    // Generate grounded default assessment phases based on document content
    phase1Tasks.push({
      id: randomUUID(),
      title: `Analyze ${sourceName} assessment requirements & rubric`,
      description: 'Review specifications, grading constraints, and deliverables.',
      completed: false,
      dueDate: formatOffset(1),
      sourceExcerpt: lines.slice(0, 3).join(' ')
    });
    phase1Tasks.push({
      id: randomUUID(),
      title: 'Setup development workspace and project dependencies',
      description: 'Ensure local environment matches requirements.',
      completed: false,
      dueDate: formatOffset(2),
      sourceExcerpt: `Derived from ${sourceName}`
    });

    phase2Tasks.push({
      id: randomUUID(),
      title: 'Implement core functionality and major deliverables',
      description: 'Execute primary features outlined in specification.',
      completed: false,
      dueDate: deadlines[0]?.date || formatOffset(5),
      sourceExcerpt: lines.slice(3, 8).join(' ')
    });
    phase2Tasks.push({
      id: randomUUID(),
      title: 'Implement error handling and edge cases',
      description: 'Cover validation and expected boundary conditions.',
      completed: false,
      dueDate: formatOffset(7),
      sourceExcerpt: `Derived from ${sourceName}`
    });

    phase3Tasks.push({
      id: randomUUID(),
      title: 'Run test suite, verify acceptance criteria & benchmark',
      description: 'Confirm all test cases and quality standards pass.',
      completed: false,
      dueDate: formatOffset(9),
      sourceExcerpt: `Verification step for ${sourceName}`
    });

    phase4Tasks.push({
      id: randomUUID(),
      title: `Final packaging, review, and submission for ${sourceName}`,
      description: 'Finalize submission assets and submit ahead of deadline.',
      completed: false,
      dueDate: deadlines[0]?.date || formatOffset(12),
      sourceExcerpt: deadlines[0]?.title || `Submission for ${sourceName}`
    });
  }

  const phases: ActionPlanPhase[] = [
    {
      id: 'phase-1',
      phaseName: 'Phase 1: Requirements & Setup',
      targetTimeline: 'Days 1–2',
      tasks: phase1Tasks
    },
    {
      id: 'phase-2',
      phaseName: 'Phase 2: Implementation & Deliverables',
      targetTimeline: 'Days 3–7',
      tasks: phase2Tasks
    },
    {
      id: 'phase-3',
      phaseName: 'Phase 3: Testing & Acceptance Verification',
      targetTimeline: 'Days 8–10',
      tasks: phase3Tasks
    }
  ];

  if (phase4Tasks.length > 0) {
    phases.push({
      id: 'phase-4',
      phaseName: 'Phase 4: Final Review & Submission',
      targetTimeline: 'Final Milestone',
      tasks: phase4Tasks
    });
  }

  const allTasks = phases.flatMap(p => p.tasks);
  const nowIso = new Date().toISOString();

  // Generate initial Notepad markdown representation
  const rawNotesLines: string[] = [
    `# ${title}`,
    `Source: ${sourceName} (${sourcePath})`,
    `Generated: ${nowIso.slice(0, 10)}`,
    '',
    `## Executive Summary`,
    `Action plan generated from ${sourceName}. Total actionable steps: ${allTasks.length}.`,
    ''
  ];

  if (deadlines.length > 0) {
    rawNotesLines.push('## Deadlines');
    for (const d of deadlines) {
      rawNotesLines.push(`- **${d.date}**: ${d.title}`);
    }
    rawNotesLines.push('');
  }

  rawNotesLines.push('## Action Plan Checklist');
  for (const p of phases) {
    rawNotesLines.push(`\n### ${p.phaseName} (${p.targetTimeline})`);
    for (const t of p.tasks) {
      rawNotesLines.push(`- [ ] ${t.title}${t.dueDate ? ` (Due: ${t.dueDate})` : ''}`);
      if (t.description) rawNotesLines.push(`  - Note: ${t.description}`);
    }
  }

  return {
    id: randomUUID(),
    title,
    sourcePath,
    sourceName,
    createdAt: nowIso,
    updatedAt: nowIso,
    summary: `Structured ${allTasks.length}-step execution plan extracted from ${sourceName}.`,
    rawNotes: rawNotesLines.join('\n'),
    phases,
    deadlines
  };
}

export class ActionPlanStore {
  private filePath: string;
  private plans: Map<string, ActionPlan> = new Map();

  constructor(storageDir: string) {
    this.filePath = join(storageDir, 'action_plans.json');
  }

  public async load(): Promise<void> {
    try {
      if (existsSync(this.filePath)) {
        const raw = await fs.readFile(this.filePath, 'utf8');
        const list: ActionPlan[] = JSON.parse(raw);
        this.plans.clear();
        for (const p of list) {
          this.plans.set(p.id, p);
        }
      }
    } catch (e) {
      console.warn('Failed to load action plans:', e);
      this.plans.clear();
    }
  }

  public async save(): Promise<void> {
    const list = Array.from(this.plans.values());
    const temp = `${this.filePath}.tmp`;
    await fs.writeFile(temp, JSON.stringify(list, null, 2), 'utf8');
    await fs.rename(temp, this.filePath);
  }

  public listPlans(): ActionPlan[] {
    return Array.from(this.plans.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public getPlan(id: string): ActionPlan | undefined {
    return this.plans.get(id);
  }

  public async savePlan(plan: ActionPlan): Promise<void> {
    this.plans.set(plan.id, plan);
    await this.save();
  }

  public async updateStep(
    planId: string,
    taskId: string,
    completed: boolean,
    memoryStore?: MemoryStore
  ): Promise<ActionPlan | null> {
    const plan = this.plans.get(planId);
    if (!plan) return null;

    let targetMemoryId: string | undefined;

    for (const phase of plan.phases) {
      for (const t of phase.tasks) {
        if (t.id === taskId) {
          t.completed = completed;
          targetMemoryId = t.memoryItemId;
          break;
        }
      }
    }

    plan.updatedAt = new Date().toISOString();

    // Sync corresponding task memory item in MemoryStore if linked
    if (targetMemoryId && memoryStore) {
      try {
        if (completed) {
          await memoryStore.completeItem(targetMemoryId);
        } else {
          await memoryStore.reopenItem(targetMemoryId);
        }
      } catch {
        // ignore sync error
      }
    }

    await this.save();
    return plan;
  }

  public async updateNotes(planId: string, notes: string): Promise<ActionPlan | null> {
    const plan = this.plans.get(planId);
    if (!plan) return null;
    plan.rawNotes = notes;
    plan.updatedAt = new Date().toISOString();
    await this.save();
    return plan;
  }

  public async deletePlan(id: string): Promise<boolean> {
    const deleted = this.plans.delete(id);
    if (deleted) await this.save();
    return deleted;
  }
}

export async function generateActionPlanFromSource(
  filePath: string,
  activeModel: string,
  store: MemoryStore
): Promise<ActionPlan> {
  const { text, name } = await extractTextFromFile(filePath);
  if (!text || text.trim().length < 15) {
    throw new Error(`Document ${name} has insufficient text to generate an action plan.`);
  }

  // Attempt local Ollama plan synthesis if available
  let plan = parseDeterministicActionPlan(text, filePath, name);

  try {
    const ping = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(2000) });
    if (ping.ok) {
      const prompt = [
        'You are a senior project planning assistant for OpenSearch / RecallDesk.',
        `Analyze the following document (${name}) and create a structured, chronological Action Plan.`,
        'Extract 3-4 logical phases with actionable tasks, target timelines, and any explicit deadlines.',
        '',
        'Schema format in valid JSON:',
        '{',
        '  "title": "Action Plan Title",',
        '  "summary": "Brief executive summary of requirements",',
        '  "deadlines": [ { "title": "Final Submission", "date": "YYYY-MM-DD or string" } ],',
        '  "phases": [',
        '    {',
        '      "phaseName": "Phase 1: Setup & Analysis",',
        '      "targetTimeline": "Days 1-2",',
        '      "tasks": [',
        '        { "title": "Concise task title", "description": "Brief details", "dueDate": "YYYY-MM-DD or null" }',
        '      ]',
        '    }',
        '  ]',
        '}',
        '',
        'DOCUMENT TEXT (excerpt):',
        text.slice(0, 3000),
        '',
        'JSON Output:'
      ].join('\n');

      const res = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: activeModel || 'smollm2:360m-instruct-q4_0',
          prompt,
          stream: false,
          format: 'json',
          options: { temperature: 0.2, num_predict: 500 }
        }),
        signal: AbortSignal.timeout(25000)
      });

      if (res.ok) {
        const data = await res.json() as { response?: string };
        if (data.response) {
          const parsed = JSON.parse(data.response);
          if (Array.isArray(parsed.phases) && parsed.phases.length > 0) {
            const phases: ActionPlanPhase[] = parsed.phases.map((p: any, idx: number) => ({
              id: `phase-${idx + 1}`,
              phaseName: p.phaseName || `Phase ${idx + 1}`,
              targetTimeline: p.targetTimeline || `Milestone ${idx + 1}`,
              tasks: Array.isArray(p.tasks)
                ? p.tasks.map((t: any) => ({
                    id: randomUUID(),
                    title: String(t.title || 'Actionable task'),
                    description: t.description ? String(t.description) : undefined,
                    dueDate: t.dueDate && t.dueDate !== 'null' ? String(t.dueDate) : undefined,
                    completed: false,
                    sourceExcerpt: `Extracted from ${name}`
                  }))
                : []
            }));

            plan = {
              ...plan,
              title: parsed.title || plan.title,
              summary: parsed.summary || plan.summary,
              phases,
              deadlines: Array.isArray(parsed.deadlines) ? parsed.deadlines : plan.deadlines
            };
          }
        }
      }
    }
  } catch (e) {
    // Graceful fallback to deterministic plan
    console.warn('Ollama action plan synthesis skipped or failed, using deterministic parsing:', e);
  }

  // Automatically register all action plan tasks into MemoryStore as verified tasks!
  // This automatically connects the Action Plan to Tasks & Decisions, Calendar, and Timeline!
  for (const phase of plan.phases) {
    for (const t of phase.tasks) {
      try {
        const mem = await store.createManualItem({
          type: 'task',
          title: t.title,
          details: t.description || `Phase: ${phase.phaseName}`,
          sourcePath: filePath,
          relativePath: name,
          sourceExcerpt: t.sourceExcerpt || `Action Plan: ${plan.title}`,
          dueDate: t.dueDate,
          status: 'open'
        });
        t.memoryItemId = mem.id;
      } catch (err) {
        console.warn('Failed to register memory item for task:', err);
      }
    }
  }

  return plan;
}
