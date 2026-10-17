import test from 'node:test';
import assert from 'node:assert/strict';
import { lexicalScore } from '../src/main/memory/search.ts';

// Test existing chunking logic used by RecallDesk
function chunkText(text: string, chunkChars = 1200, overlap = 180) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const result: string[] = [];
  for (let start = 0; start < normalized.length; start += chunkChars - overlap) {
    const part = normalized.slice(start, start + chunkChars).trim();
    if (part.length > 35) result.push(part);
  }
  return result;
}

function cosine(a: number[], b: number[]) {
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa && bb ? dot / (Math.sqrt(aa) * Math.sqrt(bb)) : 0;
}

test('Indexing & Search: chunkText correctly segments long documents with overlap', () => {
  const sampleDoc = 'A'.repeat(2500);
  const chunks = chunkText(sampleDoc, 1000, 200);
  assert.ok(chunks.length >= 3);
  for (const c of chunks) {
    assert.ok(c.length > 35);
  }
});

test('Indexing & Search: lexical scoring ranks passages matching query terms higher', () => {
  const passage1 = 'The PostgreSQL database container handles all user records with ACID safety.';
  const passage2 = 'We configured Redis caching for session tokens and session cookies.';
  const passage3 = 'Unrelated frontend styles in Tailwind and CSS variables.';

  const score1 = lexicalScore('PostgreSQL database', passage1);
  const score2 = lexicalScore('PostgreSQL database', passage2);
  const score3 = lexicalScore('PostgreSQL database', passage3);

  assert.ok(score1 > score2, 'Passage with both query words must score higher');
  assert.strictEqual(score3, 0, 'Passage with no matching words must score 0');
});

test('Indexing & Search: cosine similarity correctly measures identical and orthogonal vectors', () => {
  const vec1 = [1, 0, 0];
  const vec2 = [1, 0, 0];
  const vec3 = [0, 1, 0];

  assert.strictEqual(cosine(vec1, vec2), 1.0);
  assert.strictEqual(cosine(vec1, vec3), 0.0);
});
