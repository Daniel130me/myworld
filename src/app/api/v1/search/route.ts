import { NextRequest, NextResponse } from 'next/server';
import { searchInputSchema } from '@/lib/curiosity/contracts';
import { searchWikipedia } from '@/lib/curiosity/service';
import { serverConfig } from '@/lib/curiosity/settings';

const config = serverConfig();

export async function GET(request: NextRequest) {
  const query = searchInputSchema.safeParse({ q: request.nextUrl.searchParams.get('q') ?? '' });
  if (!query.success) return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 });
  if (!config.wikimediaEnabled) return NextResponse.json({ places: [], notice: 'Live search is disabled' });
  try {
    return NextResponse.json({ places: await searchWikipedia(query.data.q), notice: '' });
  } catch {
    return NextResponse.json({ error: 'Search source temporarily unavailable' }, { status: 503 });
  }
}
