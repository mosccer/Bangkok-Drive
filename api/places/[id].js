/* global console */
import {
  cachedPlaceDetail,
  fetchGoogleDetail,
  findPlace,
  loadCachedGoogleDetail,
  loadSupabasePlaces,
  normalizeGoogleDetail,
  readStaticPlaces,
  storeCachedGoogleDetail,
} from "../_places-utils.js";

export default async function handler(request, response) {
  const lang = request.query.lang === "en" ? "en" : "th";
  const id = Array.isArray(request.query.id) ? request.query.id[0] : request.query.id;
  let places = await readStaticPlaces();

  try {
    const supabasePlaces = await loadSupabasePlaces();
    if (supabasePlaces?.length) {
      places = [...places, ...supabasePlaces];
    }
  } catch (error) {
    console.warn("Supabase places cache unavailable", error);
  }

  const cached = findPlace(places, id);
  if (!cached) {
    response.status(404).json({ error: "Place not found" });
    return;
  }

  const cachedGooglePayload = await loadCachedGoogleDetail(cached.googlePlaceId, lang);
  const raw = cachedGooglePayload ?? (await fetchGoogleDetail(cached.googlePlaceId, lang));
  if (!cachedGooglePayload && raw) {
    await storeCachedGoogleDetail(cached.googlePlaceId, lang, raw);
  }
  response.setHeader("cache-control", "s-maxage=120, stale-while-revalidate=600");
  response.status(200).json(raw ? normalizeGoogleDetail(raw, cached, lang) : cachedPlaceDetail(cached, lang));
}
