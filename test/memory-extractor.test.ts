import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  extractHeuristicCandidates,
  verifyExcerptInChunk,
  MemoryExtractor
} from '../src/main/memory/extractor.ts';
import { MemoryStore } from '../src/main/memory/store.ts';

test('MemoryExtractor: extracts valid tasks and deadlines from text', () => {
  const chunk = {
    id: 'c1',
    path: '/project/docs/auth.md',
    relativePath: 'docs/auth.md',
    text: [
      '# Authentication Architecture',
      'The new OAuth provider requires refresh tokens.',
      'TODO: Finish the authentication flow before Friday',
      '- [ ] Add retry handling to the API client',
      'Everything else is complete.'
    ].join('\n')
  };

  const extracted = extractHeuristicCandidates(chunk);
  assert.strictEqual(extracted.length, 2);

  const task1 = extracted.find(e => e.title.includes('authentication flow'));
  assert.ok(task1);
  assert.strictEqual(task1.type, 'task');
  assert.strictEqual(task1.dueDate, 'Friday');
  assert.strictEqual(task1.sourceExcerpt, 'TODO: Finish the authentication flow before Friday');

  const task2 = extracted.find(e => e.title.includes('retry handling'));
  assert.ok(task2);
  assert.strictEqual(task2.type, 'task');
  assert.strictEqual(task2.sourceExcerpt, '- [ ] Add retry handling to the API client');
});

test('MemoryExtractor: extracts valid decisions and distinguishes from hypotheticals', () => {
  const chunk = {
    id: 'c2',
    path: '/project/docs/database.md',
    relativePath: 'docs/database.md',
    text: [
      '# Architecture Decisions',
      'Decision: Use PostgreSQL instead of MongoDB for the production database',
      'We evaluated MongoDB and DynamoDB, but relational constraints and ACID transactions are required.',
      'We decided to keep embeddings and document indexing local',
      'Hypothetical example: For example, should we use Redis? We have not decided yet.'
    ].join('\n')
  };

  const extracted = extractHeuristicCandidates(chunk);
  assert.strictEqual(extracted.length, 2);

  const dec1 = extracted.find(e => e.title.includes('PostgreSQL'));
  assert.ok(dec1);
  assert.strictEqual(dec1.type, 'decision');
  assert.strictEqual(dec1.sourceExcerpt, 'Decision: Use PostgreSQL instead of MongoDB for the production database');

  const dec2 = extracted.find(e => e.title.includes('keep embeddings'));
  assert.ok(dec2);
  assert.strictEqual(dec2.type, 'decision');

  // Ensure hypothetical questions are not extracted
  const hypothetical = extracted.find(e => e.title.toLowerCase().includes('redis'));
  assert.strictEqual(hypothetical, undefined);
});

test('MemoryExtractor: verifyExcerptInChunk validates ground truth against source text', () => {
  const chunkText = 'We decided to use SQLite for lightweight local persistence and fast startup.';

  // Exact match
  assert.strictEqual(
    verifyExcerptInChunk('We decided to use SQLite for lightweight local persistence', chunkText),
    true
  );

  // Case/whitespace normalization
  assert.strictEqual(
    verifyExcerptInChunk('  we decided to USE sqlite for lightweight   ', chunkText),
    true
  );

  // Hallucinated excerpt not in text
  assert.strictEqual(
    verifyExcerptInChunk('We will migrate everything to AWS DynamoDB next week', chunkText),
    false
  );

  // Empty inputs
  assert.strictEqual(verifyExcerptInChunk('', chunkText), false);
  assert.strictEqual(verifyExcerptInChunk('some text', ''), false);
});

test('MemoryExtractor: handles empty index and short/unsupported passages gracefully', async () => {
  const testDir = join(tmpdir(), `recall-desk-test-${randomUUID()}`);
  await fs.mkdir(testDir, { recursive: true });

  try {
    const store = new MemoryStore(testDir);
    await store.load();

    const extractor = new MemoryExtractor();
    const emptyChunks: any[] = [];

    const result = await extractor.extractFromChunks(emptyChunks, store, {
      activeModel: 'test-model'
    });

    assert.strictEqual(result.extractedCount, 0);
    assert.strictEqual(result.newCount, 0);
    assert.strictEqual(result.totalProcessed, 0);
    assert.strictEqual(store.getItems().length, 0);
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
});

test('MemoryExtractor: runs gracefully when Ollama is unavailable without crashing', async () => {
  const testDir = join(tmpdir(), `recall-desk-test-${randomUUID()}`);
  await fs.mkdir(testDir, { recursive: true });

  try {
    const store = new MemoryStore(testDir);
    await store.load();

    const extractor = new MemoryExtractor();
    const chunks = [
      {
        id: 'c-test',
        path: '/test/notes.md',
        relativePath: 'notes.md',
        name: 'notes.md',
        text: 'TODO: Fix the failing integration tests\nDecision: Keep embeddings local'
      }
    ];

    let progressCalled = false;
    const result = await extractor.extractFromChunks(chunks, store, {
      activeModel: 'non-existent-model',
      onProgress: p => {
        progressCalled = true;
      }
    });

    assert.ok(progressCalled);
    assert.strictEqual(result.totalProcessed, 1);
    // Extracted candidates via robust local heuristics even when Ollama is offline!
    assert.strictEqual(result.newCount, 2);

    const items = store.getItems();
    assert.strictEqual(items.length, 2);
    assert.ok(items.some(i => i.type === 'task' && i.title.includes('integration tests')));
    assert.ok(items.some(i => i.type === 'decision' && i.title.includes('embeddings local')));
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
});

test('MemoryExtractor: cancellation terminates extraction loop cleanly', async () => {
  const testDir = join(tmpdir(), `recall-desk-test-${randomUUID()}`);
  await fs.mkdir(testDir, { recursive: true });

  try {
    const store = new MemoryStore(testDir);
    await store.load();

    const extractor = new MemoryExtractor();
    const chunks = Array.from({ length: 50 }, (_, i) => ({
      id: `chunk-${i}`,
      path: `/test/file-${i}.md`,
      relativePath: `file-${i}.md`,
      name: `file-${i}.md`,
      text: `TODO: Task number ${i} in document`
    }));

    // Trigger cancel after first chunk
    const extractPromise = extractor.extractFromChunks(chunks, store, {
      activeModel: 'test-model',
      onProgress: p => {
        if (p.currentChunk >= 2) {
          extractor.cancel();
        }
      }
    });

    const res = await extractPromise;
    assert.strictEqual(extractor.running, false);
    assert.ok(res.totalProcessed < 50, 'Should have stopped before finishing all 50 chunks');
  } finally {
    await fs.rm(testDir, { recursive: true, force: true });
  }
});
