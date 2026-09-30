import type { FastTravelPoint, GeoPoint } from "../types";
import { distanceMetersBetweenGeo } from "../data/coordinates";

export const FAST_TRAVEL_DISTANCE_METERS = 2_500;

export function shouldOfferFastTravel(from: GeoPoint, to: GeoPoint, thresholdMeters = FAST_TRAVEL_DISTANCE_METERS): boolean {
  return distanceMetersBetweenGeo(from, to) >= thresholdMeters;
}

export interface FastTravelTarget extends GeoPoint {
  id: string;
  label?: string;
  nameTh?: string;
  nameEn?: string;
  name?: string;
}

export function createFastTravelPoint(from: GeoPoint, place: FastTravelTarget): FastTravelPoint {
  return {
    id: place.id,
    label: place.label || place.nameTh || place.nameEn || place.name || "จุดหมาย",
    target: { lat: place.lat, lng: place.lng },
    distanceMeters: distanceMetersBetweenGeo(from, { lat: place.lat, lng: place.lng }),
  };
}
