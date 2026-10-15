import type { Place } from './types';
import { SETTINGS } from './settings';

// Google Places (New) adapter (ported from backend/src/providers/google.ts).
// Server-only: requires GOOGLE_MAPS_API_KEY. Never expose a server key to the browser.

export async function googlePlaceById(placeId: string, key: string): Promise<Place | null> {
  // Do not allow a user-supplied URL. Only a validated provider identifier reaches this path.
  if (!/^[\w-]{5,180}$/.test(placeId)) return null;
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'id,displayName,location,types,formattedAddress,primaryTypeDisplayName,editorialSummary' },
    signal: AbortSignal.timeout(SETTINGS.outboundTimeoutMs)
  });
  if (!response.ok) throw new Error(`Google Places returned ${response.status}`);
  const result = (await response.json()) as {
    id?: string; displayName?: { text?: string }; location?: { latitude: number; longitude: number };
    types?: string[]; formattedAddress?: string;
    primaryTypeDisplayName?: { text?: string }; editorialSummary?: { text?: string };
  };
  if (!result.id || !result.location || !result.displayName?.text) return null;
  const category = result.primaryTypeDisplayName?.text ?? result.types?.[0]?.replaceAll('_', ' ') ?? 'Place';
  const context = result.editorialSummary?.text?.trim() || result.formattedAddress || '';
  return {
    id: `google-${result.id}`, name: result.displayName.text,
    lat: result.location.latitude, lng: result.location.longitude,
    category,
    description: context || 'Location identified by Google Places.',
    summary: `Google identifies this as ${category.toLowerCase() === 'place' ? 'a place' : `a ${category.toLowerCase()}`} — ${context || result.displayName.text}. No independent encyclopedic story has matched it yet, but you can still ask questions or explore nearby entries.`,
    source: null, thumbnail: null, evidence: 'area-context', matched: 'exact-id'
  };
}
