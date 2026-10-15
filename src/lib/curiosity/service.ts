import type { NearbyResult, Place } from './types';
import { SETTINGS, serverConfig } from './settings';
import { nearbyWikipedia, wikipediaById, searchWikipedia } from './wikimedia';
import { googlePlaceById } from './google';
import { demonstrationPlaces, demoById } from './demo';

// Shared API service layer (ported from the route logic in backend/src/app.ts).

const config = serverConfig();

export async function getNearby(lat: number, lng: number, radius: number = SETTINGS.searchRadiusMeters): Promise<NearbyResult> {
  if (config.wikimediaEnabled) {
    try {
      const found = await nearbyWikipedia(lat, lng, radius);
      if (found.length) return { places: found, mode: 'live', notice: '' };
      return { places: [], mode: 'live', notice: 'No nearby encyclopedia entries found. Select an area to explore its context.' };
    } catch {
      console.warn('[curiosity] Public encyclopedia temporarily unavailable; serving labeled demo topics');
    }
  }
  return {
    places: demonstrationPlaces(lat, lng), mode: 'demo',
    notice: 'Illustrative demo cards are shown because live encyclopedic research is unavailable.'
  };
}

export async function findPlace(id: string): Promise<Place | null> {
  if (id.startsWith('demo-')) return demoById(id);
  if (id.startsWith('wiki-') && config.wikimediaEnabled) return wikipediaById(id).catch(() => null);
  if (id.startsWith('google-') && config.googleMapsApiKey) return googlePlaceById(id.slice(7), config.googleMapsApiKey).catch(() => null);
  return null;
}

export { searchWikipedia };
