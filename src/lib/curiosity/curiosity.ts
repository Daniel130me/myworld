import type { Place } from './types';

// Deterministic Curiosity Engine (ported from backend/src/modules/curiosity.ts).

export const RANKING = {
  distance: 0.28,
  novelty: 0.25,
  quality: 0.24,
  interest: 0.12,
  diversity: 0.11,
  diversityPenalty: 0.48,
  distanceFalloffMeters: 7200,
  maxPerTopic: 2
} as const;

export function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRadians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRadians;
  const dLng = (b.lng - a.lng) * toRadians;
  const arc = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRadians) * Math.cos(b.lat * toRadians) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(arc)));
}

export type RankingInput = {
  origin: { lat: number; lng: number }; seen: string[]; recentTopics: string[];
  preferredTopics: string[]; exclude: string[]; mode: 'nearby' | 'surprise'; limit?: number;
};

export function rankDiscoveries(places: Place[], params: RankingInput): Array<Place & { reason: string; score: number }> {
  const used = new Set<string>();
  const counts = new Map<string, number>();
  const seen = new Set(params.seen);
  const recent = params.recentTopics.slice(-8);
  const excluded = new Set(params.exclude);
  const candidates = places.filter(p => !excluded.has(p.id)).map(place => {
    const distance = metersBetween(params.origin, place);
    const relevance = 1 / (1 + distance / RANKING.distanceFalloffMeters);
    const novelty = seen.has(place.id) ? 0.08 : 1;
    const quality = place.evidence === 'source-backed' ? 1 : place.evidence === 'area-context' ? 0.45 : 0.2;
    const interest = params.preferredTopics.includes(place.category) ? 1 : 0.4;
    const diversity = recent.includes(place.category) ? 0.1 : 1;
    const score = relevance * RANKING.distance + novelty * RANKING.novelty + quality * RANKING.quality + interest * RANKING.interest + diversity * RANKING.diversity;
    return { ...place, distance, score };
  });
  const result: Array<Place & { reason: string; score: number }> = [];
  const limit = Math.min(params.limit ?? 6, 12);
  while (result.length < limit) {
    const remaining = candidates.filter(p => !used.has(p.id) && (counts.get(p.category) ?? 0) < RANKING.maxPerTopic);
    if (!remaining.length) break;
    remaining.sort((a, b) => {
      const penalty = (p: Place) => (counts.get(p.category) ?? 0) * RANKING.diversityPenalty;
      const aScore = a.score - penalty(a) + (params.mode === 'surprise' && recent.includes(a.category) ? -0.6 : 0);
      const bScore = b.score - penalty(b) + (params.mode === 'surprise' && recent.includes(b.category) ? -0.6 : 0);
      return bScore - aScore || a.id.localeCompare(b.id);
    });
    const next = remaining[0];
    if (!next) break;
    used.add(next.id);
    counts.set(next.category, (counts.get(next.category) ?? 0) + 1);
    const reason = next.evidence === 'demo' ? 'Illustrative discovery · demo only'
      : params.mode === 'surprise' && !recent.includes(next.category) ? 'A different direction for your curiosity'
      : seen.has(next.id) ? 'Worth another look' : 'A sourced discovery near this area';
    result.push({ ...next, reason });
  }
  return result;
}
