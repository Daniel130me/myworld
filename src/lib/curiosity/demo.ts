import type { Place } from './types';

// Illustrative demo fixtures (ported from backend/src/modules/demo.ts).
// These are intentionally illustrative entries, not factual claims about real locations.

const SAMPLE_POINTS = [
  { name: 'The stories beneath the streets', category: 'History', lat: 6.4541, lng: 3.3947, description: 'A demonstration of how neighborhood history could be explored when supported research is available.' },
  { name: 'The changing urban landscape', category: 'Architecture', lat: 6.4482, lng: 3.4231, description: 'A demonstration of architecture-related curiosity suggestions, not a claim about a specific building.' },
  { name: 'Hidden connections in city life', category: 'Culture', lat: 6.4659, lng: 3.3752, description: 'An illustrative prompt inviting exploration of everyday places and the people who shape them.' },
  { name: 'Engineering all around us', category: 'Engineering', lat: 6.4325, lng: 3.4415, description: 'A sample topic showing how the app can introduce a completely different subject.' },
  { name: 'Markets and everyday innovation', category: 'Economy', lat: 6.4693, lng: 3.3859, description: 'An illustrative discovery card for discussing local trade and entrepreneurship.' },
  { name: 'Why neighborhoods have names', category: 'Geography', lat: 6.5082, lng: 3.3754, description: 'A sample curiosity prompt about place names. No naming-origin facts have been verified.' }
];

export function demonstrationPlaces(lat: number, lng: number): Place[] {
  // Offset the fictional sample geography to the requested point, so the interface works anywhere.
  return SAMPLE_POINTS.map((item, index) => ({
    id: `demo-${index + 1}-${lat.toFixed(3)}-${lng.toFixed(3)}`, name: item.name,
    lat: Math.max(-89.9, Math.min(89.9, lat + (item.lat - 6.45) * 0.45)),
    lng: Math.max(-179.9, Math.min(179.9, lng + (item.lng - 3.4) * 0.45)),
    category: item.category, description: item.description, summary: item.description,
    source: null, thumbnail: null, evidence: 'demo', matched: 'area-only'
  }));
}

export function demoById(id: string) {
  const match = /^demo-([1-6])-(-?\d{1,2}\.\d{1,3})-(-?\d{1,3}\.\d{1,3})$/.exec(id);
  if (!match) return null;
  const lat = Number(match[2]); const lng = Number(match[3]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return demonstrationPlaces(lat, lng)[Number(match[1]) - 1] ?? null;
}
