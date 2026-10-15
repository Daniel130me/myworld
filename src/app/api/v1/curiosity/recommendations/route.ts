import { NextRequest, NextResponse } from 'next/server';
import { recommendationInputSchema } from '@/lib/curiosity/contracts';
import { rankDiscoveries } from '@/lib/curiosity/curiosity';
import { getNearby } from '@/lib/curiosity/service';
import { SETTINGS } from '@/lib/curiosity/settings';

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  const parsed = recommendationInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 });
  const { lat, lng, ...preferences } = parsed.data;
  const nearby = await getNearby(lat, lng);
  const ranked = rankDiscoveries(nearby.places, { origin: { lat, lng }, ...preferences, limit: SETTINGS.maxSuggestions });
  return NextResponse.json({ places: ranked, mode: nearby.mode, notice: nearby.notice });
}
