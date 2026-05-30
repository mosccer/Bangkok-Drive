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

## 1:1 Road Tiles

`npm run osm:import` now targets the central Bangkok 1:1 streaming map:

1. Fetch Overpass road data for the prototype zones.
2. Save raw responses in `public/data/road-chunks`.
3. Convert roads to meter-scale `RoadTile` JSON files in `public/data/road-tiles`.
4. Write `public/data/road-tiles/index.json` for `RoadTileStore`.

The runtime still has bundled fallback road tiles, so the game can run without generated tile files.
