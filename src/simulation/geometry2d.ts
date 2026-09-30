import type { WorldMeters } from "../types";

// Small 2D helpers on the x/z ground plane, shared by the city generator, building index,
// collision, routing and the full-screen map.

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function pointInPolygon(point: WorldMeters, polygon: WorldMeters[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.z > point.z !== b.z > point.z && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

export function closestPointOnSegment(point: WorldMeters, a: WorldMeters, b: WorldMeters): { x: number; z: number; t: number; distance: number } {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared)) : 0;
  const x = a.x + dx * t;
  const z = a.z + dz * t;
  return { x, z, t, distance: Math.hypot(point.x - x, point.z - z) };
}

export function distanceToSegment(point: WorldMeters, a: WorldMeters, b: WorldMeters): number {
  return closestPointOnSegment(point, a, b).distance;
}

// Distance from a point to a polygon's outline (0 when the point is inside).
export function distanceToPolygon(point: WorldMeters, polygon: WorldMeters[]): number {
  if (pointInPolygon(point, polygon)) return 0;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polygon.length; i += 1) {
    best = Math.min(best, distanceToSegment(point, polygon[i], polygon[(i + 1) % polygon.length]));
  }
  return best;
}

// Parameters (t along p, u along q) where two open segments cross, ignoring touches at the ends.
export function segmentIntersection(
  pa: WorldMeters,
  pb: WorldMeters,
  qa: WorldMeters,
  qb: WorldMeters,
  endTolerance = 0.001,
): { t: number; u: number } | undefined {
  const rx = pb.x - pa.x;
  const rz = pb.z - pa.z;
  const sx = qb.x - qa.x;
  const sz = qb.z - qa.z;
  const denominator = rx * sz - rz * sx;
  if (Math.abs(denominator) < 1e-9) return undefined;
  const t = ((qa.x - pa.x) * sz - (qa.z - pa.z) * sx) / denominator;
  const u = ((qa.x - pa.x) * rz - (qa.z - pa.z) * rx) / denominator;
  if (t <= endTolerance || t >= 1 - endTolerance || u <= endTolerance || u >= 1 - endTolerance) return undefined;
  return { t, u };
}

// Liang-Barsky clip of segment a-b to a rectangle; returns the kept parameter range or undefined.
export function clipSegmentToRect(a: WorldMeters, b: WorldMeters, rect: Rect): { t0: number; t1: number } | undefined {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  let t0 = 0;
  let t1 = 1;
  const checks: Array<[number, number]> = [
    [-dx, a.x - rect.minX],
    [dx, rect.maxX - a.x],
    [-dz, a.z - rect.minZ],
    [dz, rect.maxZ - a.z],
  ];
  for (const [p, q] of checks) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return undefined;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return undefined;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return undefined;
      if (r < t1) t1 = r;
    }
  }
  return t1 - t0 > 1e-9 ? { t0, t1 } : undefined;
}

export function polygonBounds(points: WorldMeters[]): Rect {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.z < minZ) minZ = point.z;
    if (point.z > maxZ) maxZ = point.z;
  }
  return { minX, maxX, minZ, maxZ };
}

export function polygonCentroid(points: WorldMeters[]): WorldMeters {
  let x = 0;
  let z = 0;
  for (const point of points) {
    x += point.x;
    z += point.z;
  }
  return { x: x / Math.max(1, points.length), z: z / Math.max(1, points.length) };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ;
}

export function lerpPoint(a: WorldMeters, b: WorldMeters, t: number): WorldMeters {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

export function segmentDistance(a: WorldMeters, b: WorldMeters, c: WorldMeters, d: WorldMeters): number {
  if (segmentIntersection(a, b, c, d, 0)) return 0;
  return Math.min(distanceToSegment(a, c, d), distanceToSegment(b, c, d), distanceToSegment(c, a, b), distanceToSegment(d, a, b));
}

// Distance between a segment and a polygon (0 when they touch or the segment lies inside).
export function segmentPolygonDistance(a: WorldMeters, b: WorldMeters, polygon: WorldMeters[]): number {
  if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) return 0;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polygon.length; i += 1) {
    best = Math.min(best, segmentDistance(a, b, polygon[i], polygon[(i + 1) % polygon.length]));
    if (best === 0) return 0;
  }
  return best;
}

// Separating-axis test for two convex polygons, with an optional gap they must keep.
export function convexPolygonsOverlap(p: WorldMeters[], q: WorldMeters[], gap = 0): boolean {
  for (const polygon of [p, q]) {
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 1e-9) continue;
      const nx = -(b.z - a.z) / length;
      const nz = (b.x - a.x) / length;
      let minP = Number.POSITIVE_INFINITY;
      let maxP = Number.NEGATIVE_INFINITY;
      for (const point of p) {
        const projection = point.x * nx + point.z * nz;
        minP = Math.min(minP, projection);
        maxP = Math.max(maxP, projection);
      }
      let minQ = Number.POSITIVE_INFINITY;
      let maxQ = Number.NEGATIVE_INFINITY;
      for (const point of q) {
        const projection = point.x * nx + point.z * nz;
        minQ = Math.min(minQ, projection);
        maxQ = Math.max(maxQ, projection);
      }
      if (maxP + gap <= minQ || maxQ + gap <= minP) return false;
    }
  }
  return true;
}
