import type { NavTarget, PlaceSummary, WorldMeters } from "../types";
import { MAP_SCALE } from "../data/coordinates";
import { placeDisplayName } from "./placeQueries";

export type Maneuver = "straight" | "left" | "right" | "uturn" | "arrive";

export interface RouteProgress {
  // Real-world metres (world units / MAP_SCALE), matching the rest of the HUD.
  remainingMeters: number;
  maneuver: Maneuver;
  maneuverMeters: number;
  etaSeconds: number;
  offRouteMeters: number;
}

const TURN_DEGREES = 32;
const UTURN_DEGREES = 150;
const MIN_ETA_SPEED = 12;

export const maneuverLabels: Record<Maneuver, { th: string; arrow: string }> = {
  straight: { th: "ตรงไป", arrow: "↑" },
  left: { th: "เลี้ยวซ้าย", arrow: "↰" },
  right: { th: "เลี้ยวขวา", arrow: "↱" },
  uturn: { th: "กลับรถ", arrow: "↶" },
  arrive: { th: "ถึงจุดหมาย", arrow: "🏁" },
};

export function placeToNavTarget(place: PlaceSummary): NavTarget {
  return { id: `place:${place.id}`, kind: "place", label: placeDisplayName(place), lat: place.lat, lng: place.lng, placeId: place.id };
}

// Turn direction between two headings on the x/z ground plane (x east, z south).
export function turnBetween(ax: number, az: number, bx: number, bz: number): { maneuver: Maneuver; degrees: number } {
  const la = Math.hypot(ax, az) || 1;
  const lb = Math.hypot(bx, bz) || 1;
  const dot = (ax * bx + az * bz) / (la * lb);
  const cross = (ax * bz - az * bx) / (la * lb);
  const degrees = (Math.atan2(cross, dot) * 180) / Math.PI;
  if (Math.abs(degrees) >= UTURN_DEGREES) return { maneuver: "uturn", degrees };
  if (degrees >= TURN_DEGREES) return { maneuver: "right", degrees };
  if (degrees <= -TURN_DEGREES) return { maneuver: "left", degrees };
  return { maneuver: "straight", degrees };
}

// Where the car is along a route polyline, how far is left and what the next turn is.
export function routeProgress(route: WorldMeters[], position: WorldMeters, speed: number): RouteProgress | undefined {
  if (route.length < 2) return undefined;
  let bestIndex = 0;
  let bestT = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < route.length - 1; i += 1) {
    const a = route[i];
    const b = route[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((position.x - a.x) * dx + (position.z - a.z) * dz) / lengthSquared)) : 0;
    const distance = Math.hypot(position.x - (a.x + dx * t), position.z - (a.z + dz * t));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
      bestT = t;
    }
  }
  const legLength = (i: number) => Math.hypot(route[i + 1].x - route[i].x, route[i + 1].z - route[i].z);
  let remaining = legLength(bestIndex) * (1 - bestT);
  let maneuver: Maneuver = "arrive";
  let maneuverDistance: number | undefined;
  for (let i = bestIndex + 1; i < route.length - 1; i += 1) {
    if (maneuverDistance === undefined) {
      const turn = turnBetween(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z, route[i + 1].x - route[i].x, route[i + 1].z - route[i].z);
      if (turn.maneuver !== "straight" && legLength(i - 1) > 0.5) {
        maneuver = turn.maneuver;
        maneuverDistance = remaining;
      }
    }
    remaining += legLength(i);
  }
  const effectiveSpeed = Math.max(MIN_ETA_SPEED, Math.abs(speed));
  return {
    remainingMeters: (remaining + bestDistance) / MAP_SCALE,
    maneuver,
    maneuverMeters: (maneuverDistance ?? remaining) / MAP_SCALE,
    etaSeconds: (remaining + bestDistance) / effectiveSpeed,
    offRouteMeters: bestDistance / MAP_SCALE,
  };
}

export function formatEta(seconds: number): string {
  if (seconds < 60) return "< 1 นาที";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} นาที`;
  return `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที`;
}

// A target counts as reached near the pin itself or, for pins off the road network, near the
// road point the route ends at.
export function hasArrived(position: WorldMeters, target: WorldMeters, radius: number, roadEnd?: WorldMeters): boolean {
  if (Math.hypot(position.x - target.x, position.z - target.z) < radius) return true;
  return Boolean(roadEnd && Math.hypot(position.x - roadEnd.x, position.z - roadEnd.z) < radius * 0.7 && Math.hypot(target.x - roadEnd.x, target.z - roadEnd.z) < 260);
}
