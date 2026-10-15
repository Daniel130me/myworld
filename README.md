# Curiosity World

An honest-attribution geo-discovery app: tap any point or place of interest on a live map and get a **factual story with citations** — or a clearly-labeled honest explanation of why no verified story exists yet.

Built with Next.js 16 (App Router), TypeScript, Google Maps with an OpenStreetMap/Leaflet fallback, and public Wikimedia data.

## How it works

1. **Resolve** — every map click is resolved through Google Places API (New) to a real place (name, category, address, editorial summary).
2. **Research** — place names are researched against the English Wikipedia MediaWiki API with strict title + distance matching, so a story is only attached when it genuinely belongs to that place.
3. **Answer** — an AI layer answers your questions about the selected place, grounded on the fetched summaries and always labeled for verification.
4. **Evidence** — every story carries provenance: where it came from, how it matched, and a "CHECK THE SOURCE" attribution card.

### Honesty model

| Field | Values | Meaning |
|---|---|---|
| `evidence` | `source-backed` / `area-context` | Independent sourced story vs. map-provider context only |
| `matched` | `exact-id` / `exact-name` / `nearby-candidate` / `area-only` | How strongly the place identity was verified |

The app never invents a story. When nothing checks out, it says so.

## Tech stack

- **Framework**: Next.js 16 (App Router) + TypeScript 5
- **UI**: Tailwind CSS 4 + shadcn/ui, Lucide icons
- **Map**: Google Maps JavaScript API, automatic Leaflet/OSM fallback
- **Data**: Prisma ORM (SQLite), TanStack Query, Zod contracts
- **Sources**: Google Places API (New) · English Wikipedia MediaWiki API

## Getting started

```bash
bun install
cp .env.example .env    # then fill in your keys
bun run db:push         # create the SQLite database
bun run dev
```

Open the app, dismiss the welcome modal, and tap any labeled place on the map.

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | SQLite file path (e.g. `file:../db/custom.db`) |
| `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY` | yes | Maps JavaScript API key, restricted to your domains |
| `GOOGLE_MAPS_API_KEY` | yes | Server-side Places API (New) key (billing enabled) |
| `WIKIMEDIA_ENABLED` | no | Set `true` to enable Wikipedia story research |

> Keep both Google keys restricted: the browser key to Maps JavaScript API + approved referrers, the server key to Places API. Never commit `.env`.

## Project layout

```
src/app/                    # App Router pages + /api/v1 endpoints
src/components/curiosity/   # Map canvas & map UI
src/components/ui/          # shadcn/ui components
src/lib/curiosity/          # resolve/research/service layer, contracts, providers
prisma/                     # database schema
db/                         # SQLite data file (gitignored)
```
