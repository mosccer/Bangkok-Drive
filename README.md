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
- `Space`: handbrake / drift (drifting scores points and refills nitro)
- `Shift`: nitro boost (uses the nitro gauge)
- `C`: camera (chase / far / hood / drone)
- `M`: minimap zoom
- `R`: back to the nearest road
- `H`: horn
- `G`: garage · `J`: missions · `B`: Bangkok guide · `O`: online
- `P` / `Esc`: pause menu
- Mobile: left virtual stick, right pedals (N₂O, GO, BRK, DRIFT), CAM and HORN buttons

URL options: `?start=13.7405,100.4995` spawns at a location, `?room=friends` joins a multiplayer room.

## Current Implementation

- Vite + TypeScript + Three.js, Rapier physics world
- Streaming 1:1-style Bangkok map (2x map scale) with a floating origin; roads, buildings, water and parks
  can be imported from OpenStreetMap
- Graphics: gradient sky with sun and stars, day / golden hour / neon night lighting, sun shadows that
  follow the car, bloom on High, reflections, merged road meshes with sidewalks, lane markings and zebra
  crossings, shophouse rows and towers, instanced street trees and lamps, animated Chao Phraya river
- Arcade driving: nitro gauge, drift scoring with combo multiplier, coin trails and nitro pickups on roads,
  AI traffic driving on the left with near-miss bonuses and crashes, back-to-road respawn
- Career: coins, player levels, garage upgrades (engine / handling / nitro) and paint shop, daily challenges,
  achievements, driver stats
- Missions board with timed runs, fast-travel time penalty, best times and leaderboard submission
- Bangkok Guide: 78 curated temples, cafés, attractions, markets and parks with editorial reviews,
  search/filter/sort, navigation to any place, Google user reviews when the Places API is configured, and
  every mapped temple/café/attraction from OpenStreetMap after an import
- Multiplayer rooms: live cars with name tags, emotes, player list with jump-to-friend, and races to a
  random landmark with a shared countdown
- Procedural WebAudio engine, tyre, nitro, pickup and UI sounds
- Settings: graphics quality, time of day, camera, sound, camera shake, speed effects, reduce motion
- Local save plus Supabase guest auth, cloud save and leaderboard

## Mobile

- Installable PWA (`manifest.webmanifest`, icons): add to the home screen for fullscreen landscape play
- First launch on low-end phones starts on Low quality; dynamic resolution lowers the render scale when
  frames get slow and restores it when they recover; shadows are off on mobile Medium
- Rapier physics (~1.4 MB WASM) and supabase-js load lazily, so the first download is ~225 KB gzipped JS
- Analog steering stick with pointer capture, multi-touch pedals, drift/camera/horn buttons, haptics
- Compact icon menu, bottom-sheet panels in portrait and side sheets in landscape, minimap drawn at half
  rate on phones
- Auto-pause when the app goes to the background, screen wake lock while driving, fullscreen button with
  landscape lock (Android)

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
npm run places:export-curated
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

## Multiplayer

Players in the same room code see each other live. With Supabase configured, rooms run over Supabase
Realtime (presence for who is in the room, broadcast for ~7 position updates per second and events), so
friends can play over the internet; no extra tables are needed. Without Supabase the game falls back to a
same-device room over `BroadcastChannel`, which is handy for testing with two browser tabs.

- Open **Online** (`O`) to set your name and room, copy an invite link (`?room=<code>`), send emotes,
  jump to a friend, or start a race.
- Races pick a curated landmark 0.9–3 km away; everyone in the room gets a 5-second countdown, fast travel
  is disabled during the race, and finishers earn XP and coins by position.
- Remote cars are interpolated and do not collide. Snapshots and events from other clients are validated
  before use.

## OpenStreetMap Import

```powershell
npm run osm:import -- --dry-run
npm run osm:import
```

`scripts/import-osm.ts` fetches roads, building footprints, water/park polygons and POIs (every mapped
Buddhist temple, cafés, attractions, museums, markets, malls) from the Overpass API and writes streaming
tiles to `public/data/road-tiles/`, polygons to `public/data/road-tiles/areas.json` and places to
`public/data/osm-places.json`. See `scripts/README.md` for options. Without generated files the game uses
bundled fallback tiles with an approximate river and parks.

Map data © OpenStreetMap contributors (ODbL).
