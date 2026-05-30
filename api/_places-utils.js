/* global process, fetch, URL */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const MAX_LIMIT = 150;
const DEFAULT_LIMIT = 80;
const STATIC_CACHE_PATH = resolve(process.cwd(), "public/data/places.json");

export async function readStaticPlaces() {
  return JSON.parse(await readFile(STATIC_CACHE_PATH, "utf8"));
}

export function parsePlaceQuery(request) {
  const url = new URL(request.url ?? "/api/places", "http://localhost");
  const numberParam = (name) => {
    const value = url.searchParams.get(name);
    return value === null ? undefined : Number(value);
  };

  return {
    districtId: url.searchParams.get("districtId") || undefined,
    category: url.searchParams.get("category") || undefined,
    nearLat: numberParam("nearLat"),
    nearLng: numberParam("nearLng"),
    radius: numberParam("radius"),
    limit: numberParam("limit"),
    cursor: url.searchParams.get("cursor") || undefined,
    lang: url.searchParams.get("lang") === "en" ? "en" : "th",
    tag: url.searchParams.get("tag") || undefined,
  };
}

export function dedupePlaces(places) {
  const byKey = new Map();
  for (const place of places) {
    const key = place.googlePlaceId ? `google:${place.googlePlaceId}` : `local:${place.id}`;
    const existing = byKey.get(key);
    if (!existing || (place.curatedPriority ?? 0) >= (existing.curatedPriority ?? 0)) {
      byKey.set(key, existing ? { ...existing, ...place, tags: [...new Set([...(existing.tags ?? []), ...(place.tags ?? [])])] } : place);
    }
  }
  return [...byKey.values()];
}

export function distanceMeters(a, b) {
  const earthRadiusMeters = 6371000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function matchesPlaceCategory(place, category) {
  if (!category) return true;
  if (place.category === category) return true;
  return category === "tourist_attraction" && place.tags?.includes("tour");
}

export function queryPlaces(places, query = {}, source = "static") {
  const limit = Math.max(1, Math.min(Number(query.limit ?? DEFAULT_LIMIT), MAX_LIMIT));
  const offset = Number(query.cursor ?? 0);
  const near = Number.isFinite(query.nearLat) && Number.isFinite(query.nearLng) ? { lat: query.nearLat, lng: query.nearLng } : undefined;

  const filtered = dedupePlaces(places)
    .filter((place) => matchesPlaceCategory(place, query.category))
    .filter((place) => !query.districtId || place.districtId === query.districtId)
    .filter((place) => !query.tag || place.tags?.includes(query.tag))
    .filter((place) => {
      if (!near || !query.radius) return true;
      return distanceMeters(near, place) <= Number(query.radius);
    })
    .sort((a, b) => {
      if (near) {
        const byDistance = distanceMeters(near, a) - distanceMeters(near, b);
        if (Math.abs(byDistance) > 1) return byDistance;
      }
      return (b.curatedPriority ?? 0) - (a.curatedPriority ?? 0) || (b.rating ?? 0) - (a.rating ?? 0) || (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0);
    });

  const page = filtered.slice(offset, offset + limit);
  return {
    places: page,
    nextCursor: offset + limit < filtered.length ? String(offset + limit) : undefined,
    total: filtered.length,
    source,
    attribution: page.some((place) => place.attributionRequired) ? ["Google Maps"] : [],
  };
}

export async function loadSupabasePlaces() {
  const supabase = await createSupabaseServiceClient();
  if (!supabase) return undefined;
  const [curated, google] = await Promise.all([
    supabase.from("curated_places").select("summary").eq("is_active", true),
    supabase.from("google_place_index").select("summary").eq("is_active", true),
  ]);

  if (curated.error || google.error) {
    throw curated.error ?? google.error;
  }

  return [
    ...(curated.data ?? []).flatMap((row) => row.summary ?? []),
    ...(google.data ?? []).flatMap((row) => row.summary ?? []),
  ];
}

export async function createSupabaseServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return undefined;

  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function loadCachedGoogleDetail(placeId, lang = "th") {
  const supabase = await createSupabaseServiceClient();
  if (!supabase || !placeId) return undefined;
  const cacheKey = `${placeId}:${lang}:detail`;
  const { data, error } = await supabase
    .from("google_place_response_cache")
    .select("payload, expires_at")
    .eq("cache_key", cacheKey)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return data?.payload;
}

export async function storeCachedGoogleDetail(placeId, lang = "th", payload) {
  const supabase = await createSupabaseServiceClient();
  if (!supabase || !placeId || !payload) return;
  const cacheKey = `${placeId}:${lang}:detail`;
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  const { error } = await supabase.from("google_place_response_cache").upsert(
    {
      cache_key: cacheKey,
      google_place_id: placeId,
      language_code: lang,
      payload,
      expires_at: expires,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "cache_key" },
  );
  if (error) throw error;
}

export function findPlace(places, id) {
  return places.find((place) => place.id === id || place.googlePlaceId === id);
}

export function cachedPlaceDetail(place, lang = "th") {
  const descriptionTh =
    place.source === "curated"
      ? "ข้อมูลสถานที่คัดเลือกสำหรับการขับสำรวจกรุงเทพในเกม และสามารถเติมรายละเอียดสดจาก Google Places เมื่อเปิดใช้งาน API"
      : "ข้อมูลจากแคช Google Places สำหรับการสำรวจในเกม";
  const descriptionEn =
    place.source === "curated"
      ? "Curated Bangkok guide entry for in-game exploration. Live Google Places details can enrich it when configured."
      : "Cached Google Places entry for in-game exploration.";

  return {
    ...place,
    name: lang === "th" ? place.nameTh : place.nameEn || place.nameTh || place.name,
    description: lang === "th" ? descriptionTh : descriptionEn,
    descriptionTh,
    descriptionEn,
    googleMapsUri: place.googleMapsUri ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.nameEn ?? place.nameTh ?? place.name)}`,
    sourceAttributions: place.attributionRequired ? [{ provider: "Google Maps" }] : [],
  };
}

export async function fetchGoogleDetail(placeId, lang = "th") {
  if (!process.env.GOOGLE_PLACES_API_KEY || !placeId || placeId.startsWith("mock-")) {
    return undefined;
  }

  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=${lang}&regionCode=TH`, {
    headers: {
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask":
        "id,displayName,formattedAddress,location,rating,userRatingCount,priceLevel,types,regularOpeningHours,photos,websiteUri,googleMapsUri,nationalPhoneNumber,editorialSummary,attributions",
    },
  });

  if (!response.ok) {
    throw new Error(`Google Places detail failed: ${response.status}`);
  }
  return response.json();
}

export function normalizeGoogleDetail(raw, cached, lang = "th") {
  const attributions = [
    ...(raw.attributions ?? []).map((attribution) => ({
      provider: attribution.provider || "Google Maps",
      providerUri: attribution.providerUri,
    })),
    ...((raw.photos ?? []).flatMap((photo) =>
      (photo.authorAttributions ?? []).map((attribution) => ({
        provider: attribution.displayName || "Google Maps photo contributor",
        providerUri: attribution.uri,
      })),
    )),
  ];

  return {
    ...cached,
    googlePlaceId: raw.id?.replace(/^places\//, "") ?? cached.googlePlaceId,
    name: raw.displayName?.text ?? cached.name,
    nameTh: lang === "th" ? raw.displayName?.text ?? cached.nameTh : cached.nameTh,
    nameEn: lang === "en" ? raw.displayName?.text ?? cached.nameEn : cached.nameEn,
    lat: raw.location?.latitude ?? cached.lat,
    lng: raw.location?.longitude ?? cached.lng,
    rating: raw.rating ?? cached.rating,
    userRatingCount: raw.userRatingCount ?? cached.userRatingCount,
    priceLevel: raw.priceLevel ?? cached.priceLevel,
    addressTh: lang === "th" ? raw.formattedAddress : undefined,
    addressEn: lang === "en" ? raw.formattedAddress : undefined,
    phone: raw.nationalPhoneNumber ?? raw.internationalPhoneNumber,
    openingHours: raw.regularOpeningHours?.weekdayDescriptions,
    photos: raw.photos?.slice(0, 3).flatMap((photo) => (photo.name ? [photo.name] : [])),
    websiteUri: raw.websiteUri,
    googleMapsUri: raw.googleMapsUri ?? cached.googleMapsUri,
    description: raw.editorialSummary?.text,
    descriptionTh: lang === "th" ? raw.editorialSummary?.text : undefined,
    descriptionEn: lang === "en" ? raw.editorialSummary?.text : undefined,
    sourceAttributions: attributions.length > 0 ? attributions : [{ provider: "Google Maps" }],
  };
}
