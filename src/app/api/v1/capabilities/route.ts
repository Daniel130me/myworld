import { NextResponse } from 'next/server';
import { serverConfig } from '@/lib/curiosity/settings';
import type { CapabilitiesResult } from '@/lib/curiosity/types';

const config = serverConfig();

export async function GET() {
  const body: CapabilitiesResult = {
    maps: 'browser demo tiles / optional Google Maps',
    encyclopedia: config.wikimediaEnabled,
    googlePlaces: Boolean(config.googleMapsApiKey),
    ai: config.aiEnabled,
    accounts: false,
    guestSaving: true,
    news: false,
    note: 'Location lookup may be approximate. Sources are shown for supported facts.'
  };
  return NextResponse.json(body);
}
