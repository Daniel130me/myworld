import type { Source } from './types';
import { SETTINGS } from './settings';

// Web evidence provider (z-ai-web-dev-sdk web_search, server-only).
// Broadens AI answers beyond the encyclopedia with cited web results.
// Every failure degrades to "no web evidence" — callers stay encyclopedia-grounded.

type WebResult = { url?: string; name?: string; snippet?: string; host_name?: string; date?: string };

export type WebEvidence = { text: string; sources: Source[] };

const NO_EVIDENCE: WebEvidence = { text: '', sources: [] };

const cache = new Map<string, { expires: number; value: WebEvidence }>();
const inflight = new Map<string, Promise<WebEvidence>>();

const cacheKey = (placeName: string, question: string) =>
  `${placeName}:${question}`.toLowerCase().replace(/\s+/g, ' ').slice(0, 90);

async function invokeSearch(query: string): Promise<WebResult[]> {
  const { default: ZAI } = await import('z-ai-web-dev-sdk');
  const zai = await ZAI.create();
  const results = await Promise.race([
    zai.functions.invoke('web_search', { query, num: SETTINGS.webSearchResults }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('web search timeout')), SETTINGS.webSearchTimeoutMs))
  ]);
  return Array.isArray(results) ? results as WebResult[] : [];
}

/**
 * Search the open web for evidence about a place + question.
 * Returns numbered [W#] evidence lines plus matching Source objects; empty on any failure.
 */
export async function searchWebEvidence(placeName: string, question: string, locationHint = ''): Promise<WebEvidence> {
  const key = cacheKey(placeName + locationHint, question);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const existing = inflight.get(key);
  if (existing) return existing;

  const query = [placeName, locationHint, question].filter(Boolean).join(' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 130);

  const promise = (async (): Promise<WebEvidence> => {
    const results = await invokeSearch(query);
    const usable = results
      .filter(r => typeof r.url === 'string' && r.url.startsWith('http')
        && typeof r.snippet === 'string' && r.snippet.trim().length >= 40)
      .slice(0, SETTINGS.webSearchResults);
    if (!usable.length) return NO_EVIDENCE;
    const now = new Date().toISOString();
    const seenPublishers = new Set<string>();
    const sources: Source[] = [];
    for (const r of usable) {
      const publisher = (r.host_name || 'web').replace(/^www\./, '');
      if (seenPublishers.has(publisher)) continue;
      seenPublishers.add(publisher);
      sources.push({
        title: (r.name || publisher || 'Web result').slice(0, 120),
        url: r.url as string,
        publisher,
        retrievedAt: now,
        type: 'web'
      });
    }
    const text = usable.map((r, i) => {
      const publisher = (r.host_name || 'web').replace(/^www\./, '');
      return `[W${i + 1}] ${publisher}: ${r.snippet!.trim().replace(/\s+/g, ' ').slice(0, 320)}`;
    }).join('\n');
    const value: WebEvidence = { text, sources };
    if (cache.size > 120) cache.clear();
    cache.set(key, { expires: Date.now() + SETTINGS.webSearchCacheMs, value });
    return value;
  })().catch(() => NO_EVIDENCE);

  inflight.set(key, promise);
  try { return await promise; } finally { inflight.delete(key); }
}
