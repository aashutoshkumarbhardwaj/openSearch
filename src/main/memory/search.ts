import type { MemoryItem, MemorySearchResult, MemoryStatus, MemoryType } from './types.ts';

function words(s: string) {
  return [...new Set(s.toLowerCase().match(/[a-z0-9_./-]{2,}/g) || [])];
}

export function lexicalScore(query: string, text: string): number {
  const q = words(query);
  const t = text.toLowerCase();
  if (!q.length) return 0;
  let score = 0;
  for (const w of q) {
    if (t.includes(w)) score += 1;
  }
  return score / q.length;
}

export function searchMemoryItems(
  items: MemoryItem[],
  query: string,
  options?: { includeSuggested?: boolean; status?: MemoryStatus; type?: MemoryType }
): MemorySearchResult[] {
  if (!query || !query.trim()) {
    return [];
  }

  let candidates = items;
  if (!options?.includeSuggested) {
    // Only search confirmed/active memory items (open, completed) unless explicitly requested
    candidates = candidates.filter(i => i.status === 'open' || i.status === 'completed');
  } else {
    candidates = candidates.filter(i => i.status !== 'dismissed');
  }

  if (options?.status) {
    candidates = candidates.filter(i => i.status === options.status);
  }
  if (options?.type) {
    candidates = candidates.filter(i => i.type === options.type);
  }

  const scored: MemorySearchResult[] = [];

  for (const item of candidates) {
    const searchableText = `${item.title} ${item.details || ''} ${item.sourceExcerpt} ${item.sourcePath} ${item.type}`;
    const score = lexicalScore(query, searchableText);
    if (score > 0) {
      scored.push({ item, score });
    }
  }

  return scored.sort((a, b) => b.score - a.score);
}
