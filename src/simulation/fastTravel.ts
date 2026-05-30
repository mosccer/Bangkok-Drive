import type { FastTravelPoint, GeoPoint, PlaceSummary } from "../types";
import { distanceMetersBetweenGeo } from "../data/coordinates";

export const FAST_TRAVEL_DISTANCE_METERS = 2_500;

export function shouldOfferFastTravel(from: GeoPoint, to: GeoPoint, thresholdMeters = FAST_TRAVEL_DISTANCE_METERS): boolean {
  return distanceMetersBetweenGeo(from, to) >= thresholdMeters;
}

export function createFastTravelPoint(from: GeoPoint, place: PlaceSummary): FastTravelPoint {
  return {
    id: place.id,
    label: place.nameTh || place.nameEn || place.name,
    target: { lat: place.lat, lng: place.lng },
    distanceMeters: distanceMetersBetweenGeo(from, { lat: place.lat, lng: place.lng }),
  };
}
