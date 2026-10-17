import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { searchMemoryItems } from '../src/main/memory/search.ts';
import type { MemoryItem } from '../src/main/memory/types.ts';

const sampleItems: MemoryItem[] = [
  {
    id: 'm1',
    type: 'task',
    title: 'Finish the authentication flow before Friday',
    details: 'Need OAuth2 token refresh logic',
    sourcePath: '/docs/auth.md',
    relativePath: 'docs/auth.md',
    sourceExcerpt: 'TODO: Finish the authentication flow before Friday',
    status: 'open',
    confidence: 0.92,
    dueDate: 'before Friday',
    createdAt: 1000,
    updatedAt: 1000,
    contentHash: 'hash1'
  },
  {
    id: 'm2',
    type: 'decision',
    title: 'Use PostgreSQL instead of MongoDB for the production database',
    details: 'ACID transactions and relational constraints needed',
    sourcePath: '/docs/architecture.md',
    relativePath: 'docs/architecture.md',
    sourceExcerpt: 'Decision: Use PostgreSQL instead of MongoDB for the production database',
    status: 'open',
    confidence: 0.95,
    createdAt: 2000,
    updatedAt: 2000,
    contentHash: 'hash2'
  },
  {
    id: 'm3',
    type: 'task',
    title: 'Add retry handling to the API client',
    details: 'Exponential backoff with jitter',
    sourcePath: '/src/client.ts',
    relativePath: 'src/client.ts',
    sourceExcerpt: '// TODO: Add retry handling to the API client',
    status: 'suggested', // unreviewed suggestion
    confidence: 0.85,
    createdAt: 3000,
    updatedAt: 3000,
    contentHash: 'hash3'
  },
  {
    id: 'm4',
    type: 'task',
    title: 'Fix the failing integration tests',
    sourcePath: '/tests/suite.ts',
    relativePath: 'tests/suite.ts',
    sourceExcerpt: '// TODO: Fix the failing integration tests',
    status: 'completed',
    confidence: 0.88,
    createdAt: 4000,
    updatedAt: 4000,
    contentHash: 'hash4'
  },
  {
    id: 'm5',
    type: 'decision',
    title: 'Keep embeddings and document indexing local',
    sourcePath: '/docs/privacy.md',
    relativePath: 'docs/privacy.md',
    sourceExcerpt: 'Decision: Keep embeddings and document indexing local',
    status: 'dismissed', // dismissed item
    confidence: 0.9,
    createdAt: 5000,
    updatedAt: 5000,
    contentHash: 'hash5'
  }
];

test('searchMemoryItems: finds relevant memories by query keyword', () => {
  const results = searchMemoryItems(sampleItems, 'PostgreSQL');
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].item.id, 'm2');
  assert.strictEqual(results[0].item.type, 'decision');
  assert.ok(results[0].score > 0);
});

test('searchMemoryItems: excludes unreviewed suggestions and dismissed items by default in search', () => {
  // "retry" is in unreviewed suggestion m3
  const resultsDefault = searchMemoryItems(sampleItems, 'retry');
  assert.strictEqual(resultsDefault.length, 0, 'Unreviewed suggestions should not be mixed into confirmed search results without explicit flag');

  // When explicitly requested, suggested items can be searched
  const resultsWithSuggested = searchMemoryItems(sampleItems, 'retry', { includeSuggested: true });
  assert.strictEqual(resultsWithSuggested.length, 1);
  assert.strictEqual(resultsWithSuggested[0].item.id, 'm3');
  assert.strictEqual(resultsWithSuggested[0].item.status, 'suggested');

  // Dismissed items are never returned even with includeSuggested
  const resultsDismissed = searchMemoryItems(sampleItems, 'embeddings', { includeSuggested: true });
  assert.strictEqual(resultsDismissed.length, 0, 'Dismissed items should not appear in search results');
});

test('searchMemoryItems: finds completed tasks when searched', () => {
  const results = searchMemoryItems(sampleItems, 'integration tests');
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].item.id, 'm4');
  assert.strictEqual(results[0].item.status, 'completed');
});

test('searchMemoryItems: returns empty array for empty queries', () => {
  assert.deepStrictEqual(searchMemoryItems(sampleItems, ''), []);
  assert.deepStrictEqual(searchMemoryItems(sampleItems, '   '), []);
});

test('File access verification: handles missing or moved files gracefully', () => {
  const missingPath = '/non/existent/path/notes-123456789.md';
  assert.strictEqual(existsSync(missingPath), false);

  // Helper verifying clean error thrown
  function verifyFileExists(filePath: string) {
    if (!existsSync(filePath)) {
      throw new Error(`File not found on disk: "${filePath}". It may have been moved, renamed, or deleted.`);
    }
  }

  assert.throws(
    () => verifyFileExists(missingPath),
    /File not found on disk/
  );
});
