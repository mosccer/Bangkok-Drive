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
- Hybrid Bangkok Places: curated real guide entries plus Google Places-ready directory/cache
- Bangkok 1:1 Streaming Map prototype with meter-scale road tiles and floating origin
- Supabase-ready guest auth, cloud save, leaderboard, and ghost car presence service

## Google Places Integration

The browser client calls `/api/places` and `/api/places/:id` through `GooglePlacesProxyService`.
If the backend is unavailable, it falls back to bundled curated Bangkok places so the game remains playable.

Current wording treats "all Bangkok places" as broad coverage by supported district/category queries, not a guarantee that every real business is present.

Runtime query shape:

```text
/api/places?districtId=&category=&nearLat=&nearLng=&radius=&limit=&cursor=&lang=th
/api/places/:id?lang=th
```

The HUD filters POIs by district/category without changing mission routes. The renderer caps visible markers near the player so mobile stays readable.

## Bangkok 1:1 Streaming Map

The current prototype defaults to `real_1_1` map scale:

- `1 world unit = 1 meter`
- Vehicle physics/rendering use local coordinates around a floating origin.
- POIs and mission waypoints use real `lat/lng`.
- Road tiles stream around the player from bundled fallback tiles first; OSM import can replace them with Overpass-derived data.
- Fast travel appears for waypoints farther than 2.5 km so real distance does not make mobile sessions drag.

The condensed map code remains as a fallback/dev reference while the 1:1 tile pipeline matures.

Run the optional local proxy:

```powershell
$env:GOOGLE_PLACES_API_KEY="your-key"
npm run places:proxy
```

Backend production requirements:

- Keep API key server-side.
- Cache curated places in `curated_places` and Google index rows in `google_place_index`.
- Keep Google response payloads in `google_place_response_cache` with expiry.
- Cache Place Summary results by district/category cell.
- Fetch Place Details lazily when a player opens a POI.
- Deduplicate by `googlePlaceId`.
- Respect Google Places quota, billing, and field-mask rules.

Import commands:

```powershell
npm run places:import -- dry-run
npm run places:import -- curated-seed --dry-run
$env:GOOGLE_PLACES_API_KEY="your-key"; npm run places:import -- google-index --dry-run
```

## Online Setup

Create a Supabase project, enable anonymous sign-ins, then run the SQL in `supabase/schema.sql`.

Add these environment variables locally and in Vercel:

```powershell
$env:VITE_SUPABASE_URL="https://your-project.supabase.co"
$env:VITE_SUPABASE_PUBLISHABLE_KEY="your-publishable-key"
$env:GOOGLE_PLACES_API_KEY="your-google-key"
$env:VITE_PLACES_API_BASE="/api"
```

Realtime ghost cars use Supabase Presence and are intentionally non-colliding. The client tracks a small position packet per chunk at a low rate so driving remains stable on mobile.

## OSM Road Import

Prototype chunks live in `src/data/roadChunks.ts`. To fetch raw Overpass exports for replacement data:

```powershell
npm run osm:import
```

The script writes raw exports to `public/data/road-chunks/*.overpass.json` and 1:1 streaming tiles to `public/data/road-tiles/*.json` plus `public/data/road-tiles/index.json`. If Overpass is unavailable, the app uses bundled fallback road tiles for the central Bangkok prototype zones.
