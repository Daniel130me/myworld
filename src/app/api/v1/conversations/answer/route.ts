import { NextRequest, NextResponse } from 'next/server';
import { answerInputSchema } from '@/lib/curiosity/contracts';
import { findPlace } from '@/lib/curiosity/service';
import { answerQuestion } from '@/lib/curiosity/conversation';

export async function POST(request: NextRequest) {
  let body: unknown;
  try { body = await request.json(); } catch { body = null; }
  const parsed = answerInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 });
  const place = await findPlace(parsed.data.placeId);
  if (!place) return NextResponse.json({ error: 'Open an available discovery before asking' }, { status: 404 });
  try {
    return NextResponse.json(await answerQuestion(place, parsed.data.question, parsed.data.history));
  } catch {
    return NextResponse.json({ error: 'The conversation provider is temporarily unavailable. Try again.' }, { status: 503 });
  }
}
