import type { WorldMeters } from "../types";
import { closestPointOnSegment, pointInPolygon } from "./geometry2d";

export interface BuildingContact {
  x: number;
  z: number;
  // Unit normal pointing from the wall towards the car.
  normalX: number;
  normalZ: number;
  depth: number;
}

// Pushes a circle (the car) out of any building footprints it overlaps. Returns the corrected
// position and the deepest contact, or undefined when the car is clear.
export function resolveBuildingCollision(position: WorldMeters, radius: number, footprints: WorldMeters[][]): BuildingContact | undefined {
  let x = position.x;
  let z = position.z;
  let deepest: BuildingContact | undefined;
  for (let pass = 0; pass < 2; pass += 1) {
    let moved = false;
    for (const polygon of footprints) {
      const point = { x, z };
      const inside = pointInPolygon(point, polygon);
      let best: { x: number; z: number; distance: number } | undefined;
      for (let i = 0; i < polygon.length; i += 1) {
        const hit = closestPointOnSegment(point, polygon[i], polygon[(i + 1) % polygon.length]);
        if (!best || hit.distance < best.distance) best = hit;
      }
      if (!best) continue;
      if (!inside && best.distance >= radius) continue;
      let nx = x - best.x;
      let nz = z - best.z;
      const length = Math.hypot(nx, nz);
      if (length < 1e-6) {
        // Exactly on the wall: push away from the footprint centre.
        const cx = polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length;
        const cz = polygon.reduce((sum, p) => sum + p.z, 0) / polygon.length;
        nx = x - cx;
        nz = z - cz;
      } else if (inside) {
        nx = -nx;
        nz = -nz;
      }
      const normalLength = Math.hypot(nx, nz) || 1;
      nx /= normalLength;
      nz /= normalLength;
      const depth = inside ? best.distance + radius : radius - best.distance;
      x = best.x + nx * radius;
      z = best.z + nz * radius;
      moved = true;
      if (!deepest || depth > deepest.depth) deepest = { x, z, normalX: nx, normalZ: nz, depth };
    }
    if (!moved) break;
  }
  return deepest ? { ...deepest, x, z } : undefined;
}
