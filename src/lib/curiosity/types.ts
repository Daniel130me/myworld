// Shared domain types for Curiosity World (ported from the original Fastify backend contracts).

export type Source = {
  title: string;
  url: string;
  publisher: string;
  retrievedAt: string;
  type: 'encyclopedia' | 'place' | 'web';
};

export type Place = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
  description: string;
  summary: string;
  source: Source | null;
  thumbnail: string | null;
  evidence: 'source-backed' | 'area-context' | 'demo';
  matched: 'exact-id' | 'exact-name' | 'nearby-candidate' | 'area-only';
  distance?: number;
  reason?: string;
  score?: number;
};

export type NearbyResult = { places: Place[]; mode: 'live' | 'demo'; notice: string };

export type ResolveResult = { selection: Place; candidates: Place[]; confidence: string; notice: string };

export type AnswerResult = { answer: string; generated: boolean; sources: Source[] };

export type CapabilitiesResult = {
  maps: string;
  encyclopedia: boolean;
  googlePlaces: boolean;
  ai: boolean;
  accounts: boolean;
  guestSaving: boolean;
  news: boolean;
  note: string;
};

// ---- Client-side only types (localStorage / UI state) ----

export type Coordinates = { lat: number; lng: number };
export type SavedPlace = { placeId: string; name: string; category: string; lat: number; lng: number; note: string; savedAt: string; id?: string };
export type HistoryItem = { place: Place; openedAt: string };
export type Mode = 'quiet' | 'smart' | 'storyteller';
export type ExploreSession = { id: string; startedAt: string; endedAt?: string; mode: Mode; status: 'active' | 'paused' | 'ended'; discoveries: string[]; saved: string[] };
export type ChatItem = { role: 'user' | 'assistant'; content: string; generated?: boolean; sources?: Source[] };
export type ClientCapabilities = { ai: boolean; accounts: boolean; googlePlaces: boolean; encyclopedia: boolean; news: boolean; guestSaving: boolean };
