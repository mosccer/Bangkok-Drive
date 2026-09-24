import type { GeoPoint, MapArea, WorldMeters } from "../types";
import { latLngToWorld, MAP_SCALE } from "./coordinates";

// Hand-traced approximations used until `npm run osm:import` provides exact OpenStreetMap polygons.
const chaoPhrayaCenterline: GeoPoint[] = [
  { lat: 13.7818, lng: 100.503 },
  { lat: 13.7755, lng: 100.4985 },
  { lat: 13.7695, lng: 100.495 },
  { lat: 13.7625, lng: 100.4925 },
  { lat: 13.7565, lng: 100.4888 },
  { lat: 13.75, lng: 100.4874 },
  { lat: 13.7445, lng: 100.4906 },
  { lat: 13.7405, lng: 100.496 },
  { lat: 13.7378, lng: 100.5035 },
  { lat: 13.7325, lng: 100.5105 },
  { lat: 13.726, lng: 100.5135 },
  { lat: 13.7197, lng: 100.513 },
  { lat: 13.712, lng: 100.509 },
  { lat: 13.7045, lng: 100.5005 },
  { lat: 13.6975, lng: 100.498 },
  { lat: 13.69, lng: 100.502 },
  { lat: 13.684, lng: 100.511 },
  { lat: 13.681, lng: 100.522 },
];

const parks: Array<{ id: string; name: string; corners: GeoPoint[] }> = [
  {
    id: "fallback-lumphini-park",
    name: "Lumphini Park",
    corners: [
      { lat: 13.7337, lng: 100.5393 },
      { lat: 13.7318, lng: 100.5463 },
      { lat: 13.7256, lng: 100.5447 },
      { lat: 13.7276, lng: 100.5385 },
    ],
  },
  {
    id: "fallback-sanam-luang",
    name: "Sanam Luang",
    corners: [
      { lat: 13.7592, lng: 100.4922 },
      { lat: 13.7592, lng: 100.4945 },
      { lat: 13.7545, lng: 100.4948 },
      { lat: 13.7545, lng: 100.4922 },
    ],
  },
  {
    id: "fallback-chatuchak-park",
    name: "Chatuchak Park",
    corners: [
      { lat: 13.8118, lng: 100.5508 },
      { lat: 13.8118, lng: 100.5562 },
      { lat: 13.8052, lng: 100.5562 },
      { lat: 13.8052, lng: 100.5508 },
    ],
  },
];

export function bufferPolyline(points: WorldMeters[], halfWidth: number): WorldMeters[] {
  const left: WorldMeters[] = [];
  const right: WorldMeters[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(points.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dz = next.z - prev.z;
    const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length;
    const nz = dx / length;
    left.push({ x: points[i].x + nx * halfWidth, z: points[i].z + nz * halfWidth });
    right.push({ x: points[i].x - nx * halfWidth, z: points[i].z - nz * halfWidth });
  }
  return [...left, ...right.reverse()];
}

const toWorld = (point: GeoPoint) => latLngToWorld(point.lat, point.lng);

export const fallbackMapAreas: MapArea[] = [
  {
    id: "fallback-chao-phraya",
    kind: "water",
    name: "Chao Phraya River",
    outer: bufferPolyline(chaoPhrayaCenterline.map(toWorld), 115 * MAP_SCALE),
  },
  ...parks.map((park): MapArea => ({ id: park.id, kind: "park", name: park.name, outer: park.corners.map(toWorld) })),
];
