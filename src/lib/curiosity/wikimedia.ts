import type { Place, Source } from './types';
import { SETTINGS } from './settings';
import { metersBetween } from './curiosity';

// Wikimedia provider (ported from backend/src/providers/wikimedia.ts) — public Wikipedia geo-research.

type WikiPage = {
  pageid?: number; title?: string; extract?: string; description?: string;
  coordinates?: Array<{ lat: number; lon: number }>; thumbnail?: { source: string };
};

const API = 'https://en.wikipedia.org/w/api.php';
const cache = new Map<string, { expires: number; value: Place[] }>();
const inflight = new Map<string, Promise<Place[]>>();

async function wikiQuery(params: Record<string, string>): Promise<WikiPage[]> {
  const url = new URL(API);
  for (const [key, value] of Object.entries({ ...params, action: 'query', format: 'json', formatversion: '2' })) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: {
      // Wikimedia requires a descriptive User-Agent with contact info; generic/browser UAs are refused (403).
      'User-Agent': 'CuriosityWorld/0.1 (https://github.com/Daniel130me/myworld; public knowledge explorer; contact: curiosity-world@example.com)',
      'Accept': 'application/json'
    },
    signal: AbortSignal.timeout(SETTINGS.outboundTimeoutMs)
  });
  if (!response.ok) throw new Error(`Wikimedia returned ${response.status}`);
  const data = (await response.json()) as { query?: { pages?: WikiPage[] } };
  return data.query?.pages ?? [];
}

function toPlace(page: WikiPage): Place | null {
  if (!page.pageid || !page.title) return null;
  const coordinate = page.coordinates?.[0];
  const description = (page.description ?? '').trim();
  const intro = (page.extract ?? '').trim();
  const now = new Date().toISOString();
  const source: Source = {
    title: page.title, url: `https://en.wikipedia.org/?curid=${page.pageid}`,
    publisher: 'Wikipedia contributors', retrievedAt: now, type: 'encyclopedia'
  };
  const summary = intro || description;
  return {
    id: `wiki-${page.pageid}`, name: page.title,
    lat: coordinate?.lat ?? 0, lng: coordinate?.lon ?? 0,
    category: categorize(description), description: description || 'An encyclopedia entry about this place.',
    summary: summary || 'Read the linked encyclopedia source to learn more.', source,
    thumbnail: page.thumbnail?.source?.startsWith('https://') ? page.thumbnail.source : null,
    evidence: 'source-backed', matched: 'nearby-candidate'
  };
}

function categorize(description: string) {
  const d = description.toLowerCase();
  if (/university|school|college|museum|library/.test(d)) return 'Education';
  if (/bridge|railway|station|airport|road/.test(d)) return 'Engineering';
  if (/church|mosque|temple|cathedral/.test(d)) return 'Culture';
  if (/company|market|business/.test(d)) return 'Economy';
  if (/park|nature|river|lake|island/.test(d)) return 'Nature';
  if (/historic|historical|monument|palace|fort/.test(d)) return 'History';
  return 'Places';
}

function cached(key: string, get: () => Promise<Place[]>): Promise<Place[]> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value);
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = get().then(value => {
    if (cache.size > 150) cache.clear();
    cache.set(key, { expires: Date.now() + SETTINGS.cacheMs, value });
    return value;
  }).finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

export async function nearbyWikipedia(lat: number, lng: number, radius: number = SETTINGS.searchRadiusMeters): Promise<Place[]> {
  // The rounded key avoids repeated near-identical lookups while panning.
  const key = `${lat.toFixed(2)}:${lng.toFixed(2)}:${radius}`;
  return cached(key, async () => (await wikiQuery({
    generator: 'geosearch', ggscoord: `${lat}|${lng}`, ggsradius: String(radius),
    ggslimit: String(SETTINGS.wikimediaSearchLimit), prop: 'coordinates|pageimages|extracts|description',
    exintro: '1', explaintext: '1', exsentences: '4', piprop: 'thumbnail', pithumbsize: '480', colimit: 'max'
  })).map(toPlace).filter((p): p is Place => Boolean(p)));
}

export async function wikipediaById(id: string): Promise<Place | null> {
  const pageid = /^wiki-(\d+)$/.exec(id)?.[1];
  if (!pageid) return null;
  const pages = await wikiQuery({
    pageids: pageid, prop: 'coordinates|pageimages|extracts|description',
    explaintext: '1', exchars: '2800', piprop: 'thumbnail', pithumbsize: '600'
  });
  const found = pages[0] ? toPlace(pages[0]) : null;
  // exchars pulls the article opening including raw section headers; tidy it for narrative display.
  return found ? { ...found, summary: tidyExtract(found.summary, 2400), matched: 'exact-id' } : null;
}

export async function searchWikipedia(text: string): Promise<Place[]> {
  const pages = await wikiQuery({
    generator: 'search', gsrsearch: text, gsrlimit: '12',
    prop: 'coordinates|pageimages|extracts|description', exintro: '1', explaintext: '1',
    exsentences: '3', piprop: 'thumbnail', pithumbsize: '360'
  });
  return pages.filter(page => Boolean(page.coordinates?.length)).map(toPlace).filter((p): p is Place => Boolean(p));
}

const normalizeName = (value: string) =>
  value.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

function tokenOverlap(a: string, b: string): number {
  const left = new Set(a.split(' ').filter(Boolean));
  const right = new Set(b.split(' ').filter(Boolean));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  left.forEach(token => { if (right.has(token)) shared += 1; });
  return shared / Math.min(left.size, right.size);
}

function searchCached(key: string, get: () => Promise<Place[]>): Promise<Place[]> {
  return cached(key, get);
}

function tidyExtract(text: string, max = 900): string {
  const cleaned = text.replace(/==+[^=]*==+\s*/g, '').replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  const cut = cleaned.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return lastStop > max * 0.55 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`;
}

/**
 * Research a named place (usually identified by Google Places) against Wikipedia.
 * A match is only accepted when the article title corresponds to the place name AND
 * the article's coordinates sit close to the tapped location — so a popular place
 * gains a real, cited story instead of a placeholder.
 */
export async function researchPlaceByName(name: string, lat: number, lng: number): Promise<Place | null> {
  const target = normalizeName(name);
  if (target.length < 4) return null;
  const candidates = await searchCached(`name:${target}`, () => wikiQuery({
    generator: 'search', gsrsearch: name, gsrlimit: '8',
    prop: 'coordinates|pageimages|extracts|description', exintro: '1', explaintext: '1',
    piprop: 'thumbnail', pithumbsize: '480'
  }).then(pages => pages.map(toPlace).filter((p): p is Place => Boolean(p))));
  const located = candidates.filter(p => p.lat !== 0 || p.lng !== 0);
  let best: { place: Place; distance: number } | null = null;
  for (const place of located) {
    const title = normalizeName(place.name);
    const distance = metersBetween({ lat, lng }, place);
    const identical = title === target;
    const contained = title.includes(target) || target.includes(title);
    const overlap = tokenOverlap(target, title);
    const accepted =
      (identical && distance <= 8000) ||
      (contained && target.length >= 6 && distance <= 1600) ||
      (overlap >= 0.99 && target.length >= 8 && distance <= 400) ||
      (overlap >= 0.5 && distance <= 350);
    if (!accepted) continue;
    if (!best || distance < best.distance) best = { place, distance };
  }
  return best ? { ...best.place, summary: tidyExtract(best.place.summary), matched: 'exact-name' } : null;
}
