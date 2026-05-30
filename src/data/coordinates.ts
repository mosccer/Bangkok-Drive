import { BANGKOK_ORIGIN } from "./bangkokWorld";
import type { GeoPoint, WorldAnchor, WorldMeters } from "../types";

const METERS_PER_LAT_DEGREE = 111_320;
const DEFAULT_SCALE = 2;
const RECENTER_THRESHOLD_METERS = 1_500;

export function latLngToWorld(lat: number, lng: number, scale = DEFAULT_SCALE): WorldMeters {
  const latMeters = (lat - BANGKOK_ORIGIN.lat) * METERS_PER_LAT_DEGREE;
  const lngMeters = (lng - BANGKOK_ORIGIN.lng) * METERS_PER_LAT_DEGREE * Math.cos((BANGKOK_ORIGIN.lat * Math.PI) / 180);
  return { x: lngMeters * scale, z: -latMeters * scale };
}

export function worldToLatLng(x: number, z: number, scale = DEFAULT_SCALE): GeoPoint {
  const lat = BANGKOK_ORIGIN.lat - z / scale / METERS_PER_LAT_DEGREE;
  const lng = BANGKOK_ORIGIN.lng + x / scale / (METERS_PER_LAT_DEGREE * Math.cos((BANGKOK_ORIGIN.lat * Math.PI) / 180));
  return { lat, lng };
}

export function createWorldAnchor(geo: GeoPoint, version = 0): WorldAnchor {
  return {
    geo,
    worldMeters: latLngToWorld(geo.lat, geo.lng, DEFAULT_SCALE),
    version,
  };
}

export function worldMetersToLocal(worldMeters: WorldMeters, anchor: WorldAnchor): WorldMeters {
  return {
    x: worldMeters.x - anchor.worldMeters.x,
    z: worldMeters.z - anchor.worldMeters.z,
  };
}

export function localToWorldMeters(local: WorldMeters, anchor: WorldAnchor): WorldMeters {
  return {
    x: anchor.worldMeters.x + local.x,
    z: anchor.worldMeters.z + local.z,
  };
}

export function geoToLocal(geo: GeoPoint, anchor: WorldAnchor): WorldMeters {
  return worldMetersToLocal(latLngToWorld(geo.lat, geo.lng, DEFAULT_SCALE), anchor);
}

export function localToGeo(local: WorldMeters, anchor: WorldAnchor): GeoPoint {
  const world = localToWorldMeters(local, anchor);
  return worldToLatLng(world.x, world.z, DEFAULT_SCALE);
}

export function shouldRecenter(local: WorldMeters, thresholdMeters = RECENTER_THRESHOLD_METERS): boolean {
  return Math.hypot(local.x, local.z) >= thresholdMeters;
}

export function recenterAnchor(anchor: WorldAnchor, vehicleLocal: WorldMeters): { anchor: WorldAnchor; vehicleLocal: WorldMeters; vehicleGeo: GeoPoint } {
  const vehicleWorld = localToWorldMeters(vehicleLocal, anchor);
  const vehicleGeo = worldToLatLng(vehicleWorld.x, vehicleWorld.z, 1);
  return {
    anchor: {
      geo: vehicleGeo,
      worldMeters: vehicleWorld,
      version: anchor.version + 1,
    },
    vehicleLocal: { x: 0, z: 0 },
    vehicleGeo,
  };
}

export function distanceMetersBetweenGeo(a: GeoPoint, b: GeoPoint): number {
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
