import { NextRequest, NextResponse } from 'next/server';
import { nearbyInputSchema } from '@/lib/curiosity/contracts';
import { getNearby } from '@/lib/curiosity/service';

export async function GET(request: NextRequest) {
  const parsed = nearbyInputSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 });
  return NextResponse.json(await getNearby(parsed.data.lat, parsed.data.lng, parsed.data.radius));
}
