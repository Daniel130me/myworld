import { NextResponse } from 'next/server';

// Accounts are experimental and disabled in this deployment (guest-first experience).
export async function GET() {
  return NextResponse.json({ user: null });
}
