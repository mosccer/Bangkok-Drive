/* global process, fetch */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function fetchGoogleDetail(placeId) {
  if (!process.env.GOOGLE_PLACES_API_KEY || placeId.startsWith("mock-")) {
    return undefined;
  }

  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
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

export default async function handler(request, response) {
  const cachePath = resolve(process.cwd(), "public/data/places.json");
  const places = JSON.parse(await readFile(cachePath, "utf8"));
  const id = request.query.id;
  const cached = places.find((place) => place.id === id || place.googlePlaceId === id);

  if (!cached) {
    response.status(404).json({ error: "Place not found" });
    return;
  }

  const raw = await fetchGoogleDetail(cached.googlePlaceId);
  response.setHeader("cache-control", "s-maxage=120, stale-while-revalidate=600");
  response.status(200).json(
    raw
      ? normalizeGoogleDetail(raw, cached)
      : {
          ...cached,
          openingHours: ["Set GOOGLE_PLACES_API_KEY to fetch live Google Places details."],
          googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cached.name)}`,
          description: "Cached Bangkok guide entry. Live details are fetched lazily when Google Places is configured.",
        },
  );
}
