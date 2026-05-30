import { BANGKOK_ORIGIN } from "./bangkokWorld";

const METERS_PER_LAT_DEGREE = 111_320;

export function latLngToWorld(lat: number, lng: number, scale = 0.018): { x: number; z: number } {
  const latMeters = (lat - BANGKOK_ORIGIN.lat) * METERS_PER_LAT_DEGREE;
  const lngMeters = (lng - BANGKOK_ORIGIN.lng) * METERS_PER_LAT_DEGREE * Math.cos((BANGKOK_ORIGIN.lat * Math.PI) / 180);
  return { x: lngMeters * scale, z: -latMeters * scale };
}

export function worldToLatLng(x: number, z: number, scale = 0.018): { lat: number; lng: number } {
  const lat = BANGKOK_ORIGIN.lat - z / scale / METERS_PER_LAT_DEGREE;
  const lng = BANGKOK_ORIGIN.lng + x / scale / (METERS_PER_LAT_DEGREE * Math.cos((BANGKOK_ORIGIN.lat * Math.PI) / 180));
  return { lat, lng };
}
