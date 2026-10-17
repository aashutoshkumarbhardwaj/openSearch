import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { MemoryStore, createContentHash } from '../src/main/memory/store.ts';

test('MemoryStore: saves and loads items across restarts (persistence)', async () => {
  const testDir = join(tmpdir(), `recall-desk-test-${randomUUID()}`);
  await fs.mkdir(testDir, { recursive: true });

  try {
    const store1 = new MemoryStore(testDir);
    await store1.load();

    await store1.addSuggestions([
      {
        type: 'task',
        title: 'Finish the authentication flow before Friday',
        details: 'Need OAuth2 token refresh logic',
        sourcePath: '/docs/auth.md',
        sourceExcerpt: 'TODO: Finish the authentication flow before Friday',
        confidence: 0.9,
        dueDate: 'before Friday'
      },
      {
        type: 'decision',
        title: 'Use PostgreSQL instead of MongoDB for the production database',
        details: 'Relational integrity needed for financial records',
        sourcePath: '/docs/architecture.md',
        sourceExcerpt: 'Decision: Use PostgreSQL instead of MongoDB for the production database',
        confidence: 0.95
      }
    ]);

    const items1 = store1.getItems();
    assert.strictEqual(items1.length, 2);

    // Simulate restart with a new store instance pointing to same file
    const store2 = new MemoryStore(testDir);
    await store2.load();
    const items2 = store2.getItems();

    assert.strictEqual(items2.length, 2);
    assert.strictEqual(items2[0].status, 'suggested');
    assert.strictEqual(items2[1].status, 'suggested');

    const authTask = items2.find(i => i.title.includes('authentication'));
    assert.ok(authTask);
    assert.strictEqual(authTask.dueDate, 'before Friday');
    assert.strictEqual(authTask.sourcePath, '/docs/auth.md');
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
});

test('MemoryStore: duplicate prevention across repeated extraction', async () => {
  const testDir = join(tmpdir(), `recall-desk-test-${randomUUID()}`);
  await fs.mkdir(testDir, { recursive: true });

  try {
    const store = new MemoryStore(testDir);
    await store.load();

    const candidate = {
      type: 'task' as const,
      title: 'Add retry handling to the API client',
      details: 'Exponential backoff with jitter',
      sourcePath: '/src/client.ts',
      sourceExcerpt: '// TODO: Add retry handling to the API client',
      confidence: 0.85
    };

    // First addition
    const added1 = await store.addSuggestions([candidate]);
    assert.strictEqual(added1.length, 1);
    assert.strictEqual(store.getItems().length, 1);

    // Repeated extraction with exact same candidate
    const added2 = await store.addSuggestions([candidate]);
    assert.strictEqual(added2.length, 0, 'Should not add duplicate item');
    assert.strictEqual(store.getItems().length, 1);

    // Even if user confirmed the item, repeated extraction must NOT re-suggest
    await store.confirmItem(added1[0].id);
    const added3 = await store.addSuggestions([candidate]);
    assert.strictEqual(added3.length, 0, 'Should not re-suggest confirmed item');

    // Even if user dismissed the item, repeated extraction must NOT re-suggest
    await store.dismissItem(added1[0].id);
    const added4 = await store.addSuggestions([candidate]);
    assert.strictEqual(added4.length, 0, 'Should not re-suggest dismissed item');
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
});

test('MemoryStore: status lifecycle (confirm, edit, dismiss, complete, reopen)', async () => {
  const testDir = join(tmpdir(), `recall-desk-test-${randomUUID()}`);
  await fs.mkdir(testDir, { recursive: true });

  try {
    const store = new MemoryStore(testDir);
    await store.load();

    const [item] = await store.addSuggestions([
      {
        type: 'task',
        title: 'Fix the failing integration tests',
        sourcePath: '/tests/suite.ts',
        sourceExcerpt: '// TODO: Fix the failing integration tests',
        confidence: 0.88
      }
    ]);

    assert.strictEqual(item.status, 'suggested');

    // 1. Confirm
    const confirmed = await store.confirmItem(item.id);
    assert.strictEqual(confirmed.status, 'open');

    // 2. Edit
    const updated = await store.updateItem(item.id, {
      title: 'Fix failing auth integration tests on CI',
      details: 'Mock server token expired',
      dueDate: '2026-10-25'
    });
    assert.strictEqual(updated.title, 'Fix failing auth integration tests on CI');
    assert.strictEqual(updated.details, 'Mock server token expired');
    assert.strictEqual(updated.dueDate, '2026-10-25');

    // 3. Complete
    const completed = await store.completeItem(item.id);
    assert.strictEqual(completed.status, 'completed');

    // 4. Reopen
    const reopened = await store.reopenItem(item.id);
    assert.strictEqual(reopened.status, 'open');

    // 5. Dismiss
    const dismissed = await store.dismissItem(item.id);
    assert.strictEqual(dismissed.status, 'dismissed');

    // 6. Delete
    const deleted = await store.deleteItem(item.id);
    assert.strictEqual(deleted, true);
    assert.strictEqual(store.getItem(item.id), null);
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
});

test('MemoryStore: validation and error handling', async () => {
  const testDir = join(tmpdir(), `recall-desk-test-${randomUUID()}`);
  await fs.mkdir(testDir, { recursive: true });

  try {
    const store = new MemoryStore(testDir);
    await store.load();

    // Non-existent ID errors
    await assert.rejects(
      async () => store.confirmItem('non-existent-id'),
      /Memory item not found/
    );

    // Empty title update error
    const [task] = await store.addSuggestions([
      {
        type: 'task',
        title: 'Valid title',
        sourcePath: '/file.ts',
        sourceExcerpt: 'TODO: Valid title'
      }
    ]);

    await assert.rejects(
      async () => store.updateItem(task.id, { title: '   ' }),
      /Title cannot be empty/
    );

    // Completing a decision should be rejected (decisions are adopted or dismissed, tasks are completed)
    const [decision] = await store.addSuggestions([
      {
        type: 'decision',
        title: 'Keep embeddings local',
        sourcePath: '/docs/adr.md',
        sourceExcerpt: 'Decision: Keep embeddings local'
      }
    ]);
    await store.confirmItem(decision.id);

    await assert.rejects(
      async () => store.completeItem(decision.id),
      /Only tasks can be marked as completed/
    );
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
});
