import type { RoadSegment, RoadTile, WorldMeters } from "../types";

export interface WorldRoadSegment {
  id: string;
  tileId: string;
  kind: RoadSegment["kind"];
  width: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  length: number;
}

export function tileRoadSegments(tile: RoadTile): WorldRoadSegment[] {
  const nodes = new Map(tile.nodes.map((node) => [node.id, node]));
  const segments: WorldRoadSegment[] = [];
  for (const segment of tile.segments) {
    const from = nodes.get(segment.from);
    const to = nodes.get(segment.to);
    if (!from || !to) continue;
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (length < 0.5) continue;
    segments.push({
      id: segment.id,
      tileId: tile.id,
      kind: segment.kind,
      width: segment.width,
      ax: from.x,
      az: from.z,
      bx: to.x,
      bz: to.z,
      length,
    });
  }
  return segments;
}

export function roadSegmentsForTiles(tiles: RoadTile[]): WorldRoadSegment[] {
  return tiles.flatMap(tileRoadSegments);
}

export function projectOnSegment(segment: WorldRoadSegment, point: WorldMeters): { x: number; z: number; t: number; distance: number } {
  const dx = segment.bx - segment.ax;
  const dz = segment.bz - segment.az;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 0 ? Math.max(0, Math.min(1, ((point.x - segment.ax) * dx + (point.z - segment.az) * dz) / lengthSquared)) : 0;
  const x = segment.ax + dx * t;
  const z = segment.az + dz * t;
  return { x, z, t, distance: Math.hypot(point.x - x, point.z - z) };
}

export function nearestRoadPoint(
  segments: WorldRoadSegment[],
  point: WorldMeters,
): { x: number; z: number; distance: number; segment: WorldRoadSegment } | undefined {
  let best: { x: number; z: number; distance: number; segment: WorldRoadSegment } | undefined;
  for (const segment of segments) {
    const projected = projectOnSegment(segment, point);
    if (!best || projected.distance < best.distance) {
      best = { x: projected.x, z: projected.z, distance: projected.distance, segment };
    }
  }
  return best;
}

// Yaw convention matches VehicleController: forward = (sin(yaw), cos(yaw)).
export function yawForDirection(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

// Thailand drives on the left. With forward (fx, fz), the driver's left is (fz, -fx).
export function leftOf(fx: number, fz: number): { x: number; z: number } {
  return { x: fz, z: -fx };
}
