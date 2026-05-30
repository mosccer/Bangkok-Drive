/* global process, console, URL */
import { createServer } from "node:http";
import {
  cachedPlaceDetail,
  fetchGoogleDetail,
  findPlace,
  loadCachedGoogleDetail,
  loadSupabasePlaces,
  normalizeGoogleDetail,
  parsePlaceQuery,
  queryPlaces,
  readStaticPlaces,
  storeCachedGoogleDetail,
} from "../api/_places-utils.js";

const port = Number(process.env.PORT ?? 8787);

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=120",
    "access-control-allow-origin": "*",
  });
  response.end(JSON.stringify(body));
}

async function loadPlaces() {
  const staticPlaces = await readStaticPlaces();
  try {
    const supabasePlaces = await loadSupabasePlaces();
    return supabasePlaces?.length ? { places: [...staticPlaces, ...supabasePlaces], source: "mixed" } : { places: staticPlaces, source: "static" };
  } catch (error) {
    console.warn("Supabase places cache unavailable", error);
    return { places: staticPlaces, source: "static" };
  }
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    const { places, source } = await loadPlaces();

    if (url.pathname === "/api/places") {
      sendJson(response, 200, queryPlaces(places, parsePlaceQuery(request), source));
      return;
    }

    if (url.pathname.startsWith("/api/places/")) {
      const lang = url.searchParams.get("lang") === "en" ? "en" : "th";
      const id = decodeURIComponent(url.pathname.replace("/api/places/", ""));
      const cached = findPlace(places, id);
      if (!cached) {
        sendJson(response, 404, { error: "Place not found" });
        return;
      }

      const cachedGooglePayload = await loadCachedGoogleDetail(cached.googlePlaceId, lang);
      const raw = cachedGooglePayload ?? (await fetchGoogleDetail(cached.googlePlaceId, lang));
      if (!cachedGooglePayload && raw) {
        await storeCachedGoogleDetail(cached.googlePlaceId, lang, raw);
      }
      sendJson(response, 200, raw ? normalizeGoogleDetail(raw, cached, lang) : cachedPlaceDetail(cached, lang));
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
}).listen(port, () => {
  console.log(`Places proxy listening on http://localhost:${port}`);
});
