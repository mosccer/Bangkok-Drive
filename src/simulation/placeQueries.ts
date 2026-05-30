import type { PlaceCategory, PlaceListResponse, PlaceQuery, PlaceSummary, VehicleState } from "../types";
import { placeWorldPosition } from "../data/bangkokWorld";

export function matchesPlaceCategory(place: PlaceSummary, category?: PlaceCategory): boolean {
  if (!category) return true;
  if (place.category === category) return true;
  return category === "tourist_attraction" && place.tags.includes("tour");
}

export function filterPlaces(
  places: PlaceSummary[],
  options: { category?: PlaceCategory; district?: string; minRating?: number; tag?: string },
): PlaceSummary[] {
  return places.filter((place) => {
    if (!matchesPlaceCategory(place, options.category)) return false;
    if (options.district && place.district !== options.district) return false;
    if (options.minRating && (place.rating ?? 0) < options.minRating) return false;
    if (options.tag && !place.tags.includes(options.tag)) return false;
    return true;
  });
}

export function placeDisplayName(place: PlaceSummary, lang: "th" | "en" = "th"): string {
  if (lang === "th") return place.nameTh || place.nameEn || place.name;
  return place.nameEn || place.nameTh || place.name;
}

export function placeDedupeKey(place: PlaceSummary): string {
  return place.googlePlaceId ? `google:${place.googlePlaceId}` : `local:${place.id}`;
}

export function dedupePlaces(places: PlaceSummary[]): PlaceSummary[] {
  const byKey = new Map<string, PlaceSummary>();

  for (const place of places) {
    const key = placeDedupeKey(place);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, place);
      continue;
    }

    const existingScore = (existing.curatedPriority ?? 0) + (existing.rating ?? 0);
    const placeScore = (place.curatedPriority ?? 0) + (place.rating ?? 0);
    if (place.source === "curated" || placeScore > existingScore) {
      byKey.set(key, { ...existing, ...place, tags: Array.from(new Set([...existing.tags, ...place.tags])) });
    }
  }

  return [...byKey.values()];
}

export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const earthRadiusMeters = 6_371_000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function queryPlaces(places: PlaceSummary[], query: PlaceQuery = {}): PlaceListResponse {
  const limit = Math.max(1, Math.min(query.limit ?? 80, 150));
  const offset = Number(query.cursor ?? 0);
  const near =
    typeof query.nearLat === "number" && typeof query.nearLng === "number"
      ? { lat: query.nearLat, lng: query.nearLng }
      : undefined;

  const filtered = dedupePlaces(places)
    .filter((place) => matchesPlaceCategory(place, query.category))
    .filter((place) => !query.districtId || place.districtId === query.districtId)
    .filter((place) => !query.tag || place.tags.includes(query.tag))
    .filter((place) => {
      if (!near || !query.radius) return true;
      return distanceMeters(near, place) <= query.radius;
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
    source: places.some((place) => place.source === "google") ? "mixed" : "static",
    attribution: page.some((place) => place.attributionRequired) ? ["Google Maps"] : [],
  };
}

export function visiblePlacesNearVehicle(
  places: PlaceSummary[],
  vehicle: VehicleState,
  options: { maxMarkers: number; radiusWorldUnits: number; category?: PlaceCategory; districtId?: string },
): PlaceSummary[] {
  return places
    .filter((place) => matchesPlaceCategory(place, options.category))
    .filter((place) => !options.districtId || place.districtId === options.districtId)
    .map((place) => {
      const pos = placeWorldPosition(place);
      return { place, distance: Math.hypot(pos.x - vehicle.position.x, pos.z - vehicle.position.z) };
    })
    .filter(({ distance }) => distance <= options.radiusWorldUnits)
    .sort((a, b) => a.distance - b.distance || (b.place.curatedPriority ?? 0) - (a.place.curatedPriority ?? 0))
    .slice(0, options.maxMarkers)
    .map(({ place }) => place);
}
