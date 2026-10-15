import { NextRequest, NextResponse } from 'next/server';
import { placeInputSchema } from '@/lib/curiosity/contracts';
import { metersBetween } from '@/lib/curiosity/curiosity';
import { getNearby, findPlace } from '@/lib/curiosity/service';
import { googlePlaceById } from '@/lib/curiosity/google';
import { researchPlaceByName } from '@/lib/curiosity/wikimedia';
import { serverConfig } from '@/lib/curiosity/settings';
import type { Place } from '@/lib/curiosity/types';

const config = serverConfig();

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  const parsed = placeInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 });
  const { lat, lng, wikiId, placeId } = parsed.data;

  if (wikiId) {
    const exact = await findPlace(wikiId);
    if (exact) return NextResponse.json({ selection: exact, confidence: 'exact-id', candidates: [], notice: '' });
  }
  if (placeId && config.googleMapsApiKey) {
    const found = await googlePlaceById(placeId, config.googleMapsApiKey).catch(() => null);
    if (found) {
      // The map named a real place — research it by name so popular spots get a
      // genuine, cited story instead of a "not verified yet" placeholder.
      const story = config.wikimediaEnabled
        ? await researchPlaceByName(found.name, lat, lng).catch(() => null)
        : null;
      if (story) {
        const googleContext = found.description && found.description !== 'Location identified by Google Places.' ? found.description : '';
        const merged: Place = {
          ...story,
          description: story.description
            ? (googleContext ? `${story.description} · Google lists: ${googleContext}` : story.description)
            : (googleContext || 'An encyclopedia entry about this place.')
        };
        return NextResponse.json({ selection: merged, confidence: 'exact-name', candidates: [], notice: '' });
      }
      const nearby = await getNearby(lat, lng, 2500);
      const candidates = nearby.places.filter(p => metersBetween({ lat, lng }, p) < 2500).slice(0, 4);
      return NextResponse.json({
        selection: found, confidence: 'exact-id', candidates,
        notice: `${found.name} is identified, but no encyclopedic source matched it yet. Nearby entries are suggestions, not proof of identity.`
      });
    }
  }
  const nearby = await getNearby(lat, lng, 2500);
  const candidates = nearby.places.filter(p => metersBetween({ lat, lng }, p) < 2500).slice(0, 4);
  return NextResponse.json({
    selection: {
      id: `point-${lat.toFixed(5)}-${lng.toFixed(5)}`, name: 'Selected area', lat, lng,
      category: 'Area context', description: 'You selected a map coordinate, not an independently verified building.',
      summary: 'I cannot confirm the identity or story of an individual building from this coordinate alone. Explore an identified nearby place instead.',
      source: null, thumbnail: null, evidence: 'area-context', matched: 'area-only'
    },
    confidence: 'area-only', candidates,
    notice: nearby.mode === 'demo' ? nearby.notice : 'Nearby entries are suggestions, not proof of identity.'
  });
}
