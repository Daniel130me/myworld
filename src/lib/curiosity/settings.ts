// Server-side settings for the Curiosity World API (ported from backend/src/config.ts).

export const SETTINGS = {
  outboundTimeoutMs: 6500,
  aiTimeoutMs: 14000,
  wikimediaSearchLimit: 18,
  maxSuggestions: 8,
  searchRadiusMeters: 8500,
  maxChatTurns: 8,
  maxMessageCharacters: 650,
  webSearchResults: 5,
  webSearchTimeoutMs: 4500,
  webSearchCacheMs: 10 * 60_000,
  cacheMs: 3 * 60_000
} as const;

function envFlag(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value === 'true';
}

export function serverConfig() {
  return {
    wikimediaEnabled: envFlag('WIKIMEDIA_ENABLED', true),
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    webSearchEnabled: envFlag('WEB_SEARCH_ENABLED', true),
    aiEnabled: true // z-ai SDK is available in this environment; conversation endpoint degrades gracefully on failure.
  };
}

export type ServerConfig = ReturnType<typeof serverConfig>;
