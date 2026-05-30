import type { PlaceCategory, PlaceSummary } from "../types";

export function filterPlaces(
  places: PlaceSummary[],
  options: { category?: PlaceCategory; district?: string; minRating?: number; tag?: string },
): PlaceSummary[] {
  return places.filter((place) => {
    if (options.category && place.category !== options.category) return false;
    if (options.district && place.district !== options.district) return false;
    if (options.minRating && (place.rating ?? 0) < options.minRating) return false;
    if (options.tag && !place.tags.includes(options.tag)) return false;
    return true;
  });
}
