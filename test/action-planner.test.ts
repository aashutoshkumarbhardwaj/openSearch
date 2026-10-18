import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  parseDeterministicActionPlan,
  ActionPlanStore,
  chunkText
} from '../src/main/memory/planner.ts';

test('ActionPlanner: parseDeterministicActionPlan generates structured phases, deadlines and tick marks', () => {
  const sampleDoc = [
    '# Computer Science Assessment 2: Distributed Search Engine',
    'Due: 2026-11-15 by 23:59 PM',
    '',
    '## Specifications',
    'Students must complete the following deliverables:',
    '- [ ] Implement inverted index with term frequency scoring',
    '- [ ] Build REST API server with query endpoints',
    '- [ ] Add unit test suite with at least 80% code coverage',
    '- [ ] Benchmark indexing performance across 10,000 documents',
    'TODO: Write architectural design document before submission'
  ].join('\n');

  const plan = parseDeterministicActionPlan(sampleDoc, '/path/to/assessment.md', 'assessment.md');

  assert.strictEqual(plan.title, 'Computer Science Assessment 2: Distributed Search Engine');
  assert.strictEqual(plan.sourceName, 'assessment.md');
  assert.ok(plan.deadlines.length >= 1);
  assert.strictEqual(plan.deadlines[0].date, '2026-11-15 by 23:59 PM');

  // Verify phases
  assert.ok(plan.phases.length >= 3);
  const allTasks = plan.phases.flatMap(p => p.tasks);
  assert.ok(allTasks.length >= 4);

  // Check that all tasks start with completed = false (tick marks ready)
  for (const t of allTasks) {
    assert.strictEqual(t.completed, false);
    assert.ok(t.title.length > 0);
  }

  // Verify raw notes markdown checklist
  assert.ok(plan.rawNotes.includes('# Computer Science Assessment 2'));
  assert.ok(plan.rawNotes.includes('- [ ]'));
});

test('ActionPlanStore: saves, updates tick marks, edits notes, and deletes plans', async () => {
  const tempDir = join(tmpdir(), `recall-desk-plan-test-${randomUUID()}`);
  await fs.mkdir(tempDir, { recursive: true });

  try {
    const store = new ActionPlanStore(tempDir);
    await store.load();

    const plan = parseDeterministicActionPlan(
      '# Project Spec\nTODO: Finish feature A\nTODO: Finish feature B',
      '/tmp/spec.txt',
      'spec.txt'
    );

    await store.savePlan(plan);

    const listed = store.listPlans();
    assert.strictEqual(listed.length, 1);
    assert.strictEqual(listed[0].id, plan.id);

    // Toggle tick mark
    const targetTaskId = plan.phases[0].tasks[0].id;
    const updated = await store.updateStep(plan.id, targetTaskId, true);
    assert.ok(updated);
    const updatedTask = updated.phases[0].tasks.find(t => t.id === targetTaskId);
    assert.strictEqual(updatedTask?.completed, true);

    // Update notes in notepad
    const editedNotes = '# Custom Notes\nUser edited notepad contents';
    const notesUpdated = await store.updateNotes(plan.id, editedNotes);
    assert.strictEqual(notesUpdated?.rawNotes, editedNotes);

    // Reload from disk to verify persistence
    const reloadedStore = new ActionPlanStore(tempDir);
    await reloadedStore.load();
    const loadedPlan = reloadedStore.getPlan(plan.id);
    assert.ok(loadedPlan);
    assert.strictEqual(loadedPlan.rawNotes, editedNotes);
    const loadedTask = loadedPlan.phases[0].tasks.find(t => t.id === targetTaskId);
    assert.strictEqual(loadedTask?.completed, true);

    // Delete plan
    const deleted = await reloadedStore.deletePlan(plan.id);
    assert.strictEqual(deleted, true);
    assert.strictEqual(reloadedStore.listPlans().length, 0);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
});

test('ActionPlanner: chunkText segments document cleanly with overlap', () => {
  const text = 'Word '.repeat(500);
  const chunks = chunkText(text, 500, 100);
  assert.ok(chunks.length >= 4);
  for (const c of chunks) {
    assert.ok(c.length > 35);
  }
});
