# MOSGAME Bangkok Drive

Web racing open-world prototype set in a condensed Bangkok.

## Run

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`.

## Controls

- `W` / `ArrowUp`: accelerate
- `S` / `ArrowDown`: brake / reverse
- `A` / `D`: steer
- `Space`: handbrake
- `Shift`: boost
- `P` / `Esc`: pause
- Mobile: left virtual stick, right pedals

## Current Implementation

- Vite + TypeScript + Three.js
- Rapier initialized for physics world and vehicle collider
- Condensed Bangkok road chunks with districts, river, procedural buildings, landmarks, and place markers
- Free roam driving with chase camera, waypoint route guidance, and mission progress
- Garage with five fictional city vehicle classes
- Discovery XP, mission rewards, local save, and cloud-save-ready data shapes
- DOM HUD, minimap, POI drawer, garage drawer, mobile controls
- Google Places proxy interface with cached fallback data
- Supabase-ready guest auth, cloud save, leaderboard, and ghost car presence service

## Google Places Integration

The browser client calls `/api/places` and `/api/places/:id` through `GooglePlacesProxyService`.
If the backend is unavailable, it falls back to bundled cached sample places so the game remains playable.

Run the optional local proxy:

```powershell
$env:GOOGLE_PLACES_API_KEY="your-key"
npm run places:proxy
```

Backend production requirements:

- Keep API key server-side.
- Cache Place Summary results by type/grid cell.
- Fetch Place Details lazily when a player opens a POI.
- Deduplicate by `googlePlaceId`.
- Respect Google Places quota, billing, and field-mask rules.

## Online Setup

Create a Supabase project, enable anonymous sign-ins, then run the SQL in `supabase/schema.sql`.

Add these environment variables locally and in Vercel:

```powershell
$env:VITE_SUPABASE_URL="https://your-project.supabase.co"
$env:VITE_SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
$env:GOOGLE_PLACES_API_KEY="your-google-key"
```

Realtime ghost cars use Supabase Presence and are intentionally non-colliding. The client tracks a small position packet per chunk at a low rate so driving remains stable on mobile.

## OSM Road Import

Prototype chunks live in `src/data/roadChunks.ts`. To fetch raw Overpass exports for replacement data:

```powershell
npm run osm:import
```

The script writes raw exports to `public/data/road-chunks/*.overpass.json`; convert them through `convertOverpassToRoadChunk` before shipping.
