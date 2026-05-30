/* global process, fetch, URL, console */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const port = Number(process.env.PORT ?? 8787);
const key = process.env.GOOGLE_PLACES_API_KEY;
const cachePath = resolve("public/data/places.json");

async function readCachedPlaces() {
  return JSON.parse(await readFile(cachePath, "utf8"));
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=120",
    "access-control-allow-origin": "*",
  });
  response.end(JSON.stringify(body));
}

async function fetchGoogleDetail(placeId) {
  if (!key || placeId.startsWith("mock-")) {
    return undefined;
  }

  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "id,displayName,formattedAddress,location,rating,userRatingCount,types,regularOpeningHours,photos,websiteUri,googleMapsUri,editorialSummary",
    },
  });

  if (!response.ok) {
    throw new Error(`Google Places detail failed: ${response.status}`);
  }

  return response.json();
}

function normalizeGoogleDetail(raw, cached) {
  return {
    ...cached,
    googlePlaceId: raw.id ?? cached.googlePlaceId,
    name: raw.displayName?.text ?? cached.name,
    lat: raw.location?.latitude ?? cached.lat,
    lng: raw.location?.longitude ?? cached.lng,
    rating: raw.rating ?? cached.rating,
    userRatingCount: raw.userRatingCount ?? cached.userRatingCount,
    openingHours: raw.regularOpeningHours?.weekdayDescriptions,
    photos: raw.photos?.slice(0, 3).map((photo) => photo.name),
    websiteUri: raw.websiteUri,
    googleMapsUri: raw.googleMapsUri,
    description: raw.editorialSummary?.text ?? cached.description,
  };
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    const places = await readCachedPlaces();

    if (url.pathname === "/api/places") {
      sendJson(response, 200, places);
      return;
    }

    if (url.pathname.startsWith("/api/places/")) {
      const id = decodeURIComponent(url.pathname.replace("/api/places/", ""));
      const cached = places.find((place) => place.id === id || place.googlePlaceId === id);
      if (!cached) {
        sendJson(response, 404, { error: "Place not found" });
        return;
      }

      const raw = await fetchGoogleDetail(cached.googlePlaceId);
      sendJson(response, 200, raw ? normalizeGoogleDetail(raw, cached) : {
        ...cached,
        openingHours: ["Set GOOGLE_PLACES_API_KEY to fetch live Google Places details."],
        googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cached.name)}`,
        description: "Cached Bangkok guide entry. Live details are fetched lazily when Google Places is configured.",
      });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Unknown error" });
  }
}).listen(port, () => {
  console.log(`Places proxy listening on http://localhost:${port}`);
});
