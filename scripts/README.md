# Data Pipeline

This prototype ships with a cached Bangkok guide dataset so the game runs without external credentials.

Production data should be imported through a backend job, not directly from the browser:

1. Seed curated Bangkok places into `curated_places`.
2. Build 50-district cells from `scripts/import-places.mjs`.
3. Query Google Places Nearby Search for supported types and Text Search for temple, market, street-food, dessert, and night-market searches.
4. Normalize into `PlaceSummary`, deduplicate by `googlePlaceId`, and upsert into `google_place_index`.
5. Keep Google payloads in `google_place_response_cache` with `expires_at`; store long-term identifiers and curated content separately.
6. Fetch Place Details only when a player opens a place drawer.

Never expose a Google Places API key in the Vite client. Put it behind `/api/places` and `/api/places/:id`.

Useful commands:

```powershell
npm run places:import -- dry-run
npm run places:import -- curated-seed --dry-run
$env:GOOGLE_PLACES_API_KEY="your-google-key"; npm run places:import -- google-index --dry-run
$env:SUPABASE_URL="https://your-project.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="service-role"; npm run places:import -- curated-seed
```

Default guards are intentionally conservative: `PLACES_IMPORT_QPS=1`, `PLACES_IMPORT_DAILY_REQUEST_LIMIT=300`, and `MAX_RESULTS_PER_DISTRICT_CATEGORY=60`.

## OpenStreetMap Map Import

`npm run osm:import` builds the streaming map from OpenStreetMap through the Overpass API
(`scripts/import-osm.ts`, conversion logic in `src/data/osmImport.ts`):

1. Split the bounding box into blocks (one Overpass request each, default `0.024°`).
2. Fetch roads (with `lanes`/`width`/`name`), building footprints (`height`/`building:levels`),
   water and park polygons, and POIs: Buddhist temples, cafes, bakeries/desserts, museums,
   attractions, markets and malls.
3. Cut each block into small streaming tiles (default `0.006°`) in `public/data/road-tiles/*.json`.
4. Write `public/data/road-tiles/areas.json` (water/parks, split multipolygons re-assembled and simplified),
   `public/data/osm-places.json` (all imported POIs, including every mapped temple), and `index.json`.

```powershell
npm run osm:import -- --dry-run
npm run osm:import
npm run osm:import -- --bbox=13.70,100.47,13.82,100.58 --tile=0.006 --block=0.024
npm run osm:import -- --endpoint=https://overpass.kumi.systems/api/interpreter --with-restaurants
```

Coordinates use `MAP_SCALE` from `src/data/coordinates.ts`, so imported roads, buildings and places line up
with the game world. Without generated files the game uses the bundled fallback tiles plus an approximate
Chao Phraya river and park outlines (`src/data/fallbackMapAreas.ts`).

Map data © OpenStreetMap contributors, available under the Open Database License (ODbL). The HUD shows
this attribution whenever imported OSM tiles are loaded.
