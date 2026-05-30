# Data Pipeline

This prototype ships with a cached Bangkok guide dataset so the game runs without external credentials.

Production data should be imported through a backend job, not directly from the browser:

1. Build grid cells from `buildBangkokImportGrid`.
2. Query Google Places Nearby Search for each cell and type.
3. Normalize into `PlaceSummary`.
4. Deduplicate by `googlePlaceId`.
5. Store summaries in a cache file or database.
6. Fetch Place Details only when a player opens a place drawer.

Never expose a Google Places API key in the Vite client. Put it behind `/api/places` and `/api/places/:id`.
