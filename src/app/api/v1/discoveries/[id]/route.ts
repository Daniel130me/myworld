import { NextRequest, NextResponse } from 'next/server';
import { placeIdParamSchema } from '@/lib/curiosity/contracts';
import { findPlace, getNearby } from '@/lib/curiosity/service';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parse = placeIdParamSchema.safeParse({ id });
  if (!parse.success) return NextResponse.json({ error: 'Discovery unavailable' }, { status: 400 });
  const place = await findPlace(parse.data.id);
  if (!place) return NextResponse.json({ error: 'Discovery unavailable' }, { status: 404 });
  const related = (await getNearby(place.lat, place.lng)).places.filter(p => p.id !== place.id).slice(0, 4);
  return NextResponse.json({ place, related });
}
