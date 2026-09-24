import type { RoadTile, WorldMeters } from "../types";
import { hashString } from "./hash";
import { leftOf, tileRoadSegments, type WorldRoadSegment } from "./roadGeometry";

export type CollectibleKind = "coin" | "nitro";

export interface Collectible {
  id: string;
  kind: CollectibleKind;
  x: number;
  z: number;
}

const TRAIL_SPACING_METERS = 150;
const COINS_PER_TRAIL = 5;
const COIN_GAP_METERS = 7;
const GRID_CELL_METERS = 120;
export const COIN_VALUE = 5;
export const NITRO_PICKUP_AMOUNT = 0.35;

// OSM roads arrive as many short segments, so trail count is proportional to length with a
// deterministic chance for the fractional remainder.
export function generateSegmentCollectibles(segment: WorldRoadSegment): Collectible[] {
  if (segment.kind === "service" || segment.kind === "alley" || segment.length < 20) return [];
  const fx = (segment.bx - segment.ax) / segment.length;
  const fz = (segment.bz - segment.az) / segment.length;
  const left = leftOf(fx, fz);
  const items: Collectible[] = [];
  const expected = segment.length / TRAIL_SPACING_METERS;
  const baseHash = hashString(`${segment.tileId}:${segment.id}`);
  const trailCount = Math.floor(expected) + ((baseHash % 1000) / 1000 < expected % 1 ? 1 : 0);
  const spacing = segment.length / Math.max(1, trailCount);
  for (let trail = 0; trail < trailCount; trail += 1) {
    const hash = hashString(`${segment.tileId}:${segment.id}:${trail}`);
    const start = Math.min(segment.length - 4, trail * spacing + 4 + (hash % Math.max(1, Math.floor(spacing / 3))));
    const lateral = ((((hash >>> 8) % 100) / 100) * 2 - 1) * Math.max(0, segment.width / 2 - 2.2);
    if (hash % 4 === 0) {
      items.push({
        id: `${segment.tileId}:${segment.id}:${trail}:n`,
        kind: "nitro",
        x: segment.ax + fx * start + left.x * lateral,
        z: segment.az + fz * start + left.z * lateral,
      });
      continue;
    }
    for (let i = 0; i < COINS_PER_TRAIL; i += 1) {
      const along = start + i * COIN_GAP_METERS;
      if (along > segment.length - 2) break;
      items.push({
        id: `${segment.tileId}:${segment.id}:${trail}:${i}`,
        kind: "coin",
        x: segment.ax + fx * along + left.x * lateral,
        z: segment.az + fz * along + left.z * lateral,
      });
    }
  }
  return items;
}

export function generateTileCollectibles(tile: RoadTile): Collectible[] {
  return tileRoadSegments(tile).flatMap(generateSegmentCollectibles);
}

export class CollectibleField {
  private readonly tileItems = new Map<string, Collectible[]>();
  private readonly grid = new Map<string, Collectible[]>();
  private readonly collectedAt = new Map<string, number>();

  constructor(private readonly respawnMs = 120_000) {}

  setTiles(tiles: RoadTile[]): void {
    const active = new Set(tiles.map((tile) => tile.id));
    let changed = false;
    for (const id of [...this.tileItems.keys()]) {
      if (!active.has(id)) {
        this.tileItems.delete(id);
        changed = true;
      }
    }
    for (const tile of tiles) {
      if (this.tileItems.has(tile.id)) continue;
      this.tileItems.set(tile.id, generateTileCollectibles(tile));
      changed = true;
    }
    if (changed) this.rebuildGrid();
  }

  nearby(center: WorldMeters, radius: number, max: number, now: number): Collectible[] {
    return this.query(center, radius, now)
      .map((item) => ({ item, distance: Math.hypot(item.x - center.x, item.z - center.z) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, max)
      .map(({ item }) => item);
  }

  collect(center: WorldMeters, radius: number, now: number): Collectible[] {
    const picked = this.query(center, radius, now);
    for (const item of picked) {
      this.collectedAt.set(item.id, now);
    }
    return picked;
  }

  private query(center: WorldMeters, radius: number, now: number): Collectible[] {
    const result: Collectible[] = [];
    const minCellX = Math.floor((center.x - radius) / GRID_CELL_METERS);
    const maxCellX = Math.floor((center.x + radius) / GRID_CELL_METERS);
    const minCellZ = Math.floor((center.z - radius) / GRID_CELL_METERS);
    const maxCellZ = Math.floor((center.z + radius) / GRID_CELL_METERS);
    for (let cx = minCellX; cx <= maxCellX; cx += 1) {
      for (let cz = minCellZ; cz <= maxCellZ; cz += 1) {
        for (const item of this.grid.get(`${cx}:${cz}`) ?? []) {
          if (Math.hypot(item.x - center.x, item.z - center.z) > radius) continue;
          const collected = this.collectedAt.get(item.id);
          if (collected !== undefined) {
            if (now - collected < this.respawnMs) continue;
            this.collectedAt.delete(item.id);
          }
          result.push(item);
        }
      }
    }
    return result;
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (const items of this.tileItems.values()) {
      for (const item of items) {
        const key = `${Math.floor(item.x / GRID_CELL_METERS)}:${Math.floor(item.z / GRID_CELL_METERS)}`;
        const bucket = this.grid.get(key);
        if (bucket) bucket.push(item);
        else this.grid.set(key, [item]);
      }
    }
  }
}
