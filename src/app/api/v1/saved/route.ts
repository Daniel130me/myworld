import { NextResponse } from 'next/server';

// Cloud saved-place sync requires the experimental account flow, which is disabled here.
// Guest saving works fully client-side (browser localStorage), so the UI never needs these endpoints.
export async function GET() {
  return NextResponse.json({ error: 'Sign in to synchronize saved discoveries' }, { status: 401 });
}

export async function POST() {
  return NextResponse.json({ error: 'Sign in to synchronize' }, { status: 401 });
}
