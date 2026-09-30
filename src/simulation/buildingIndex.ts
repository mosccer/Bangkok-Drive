import type { MapBuilding, RoadTile, WorldMeters } from "../types";
import { distanceToPolygon, pointInPolygon, polygonBounds, polygonCentroid, rectsOverlap, type Rect } from "./geometry2d";

export interface IndexedBuilding {
  building: MapBuilding;
  tileId: string;
  bounds: Rect;
  center: WorldMeters;
}

const CELL = 64;

// Spatial hash over the buildings of the loaded tiles (world coordinates), used for collisions,
// tap-to-inspect and the full-screen map.
export class BuildingIndex {
  private readonly tiles = new Map<string, IndexedBuilding[]>();
  private readonly grid = new Map<string, IndexedBuilding[]>();
  private readonly byId = new Map<string, IndexedBuilding>();

  setTiles(tiles: RoadTile[]): void {
    const active = new Set(tiles.map((tile) => tile.id));
    let changed = false;
    for (const id of [...this.tiles.keys()]) {
      if (!active.has(id)) {
        this.tiles.delete(id);
        changed = true;
      }
    }
    for (const tile of tiles) {
      if (this.tiles.has(tile.id)) continue;
      this.tiles.set(
        tile.id,
        (tile.buildings ?? []).filter((building) => building.footprint.length >= 3).map((building) => ({ building, tileId: tile.id, bounds: polygonBounds(building.footprint), center: polygonCentroid(building.footprint) })),
      );
      changed = true;
    }
    if (changed) this.rebuild();
  }

  get size(): number {
    return this.byId.size;
  }

  get(id: string): IndexedBuilding | undefined {
    return this.byId.get(id);
  }

  query(rect: Rect): IndexedBuilding[] {
    const found = new Set<IndexedBuilding>();
    for (let x = Math.floor(rect.minX / CELL); x <= Math.floor(rect.maxX / CELL); x += 1) {
      for (let z = Math.floor(rect.minZ / CELL); z <= Math.floor(rect.maxZ / CELL); z += 1) {
        for (const entry of this.grid.get(`${x}:${z}`) ?? []) {
          if (rectsOverlap(entry.bounds, rect)) found.add(entry);
        }
      }
    }
    return [...found];
  }

  nearby(point: WorldMeters, radius: number): IndexedBuilding[] {
    return this.query({ minX: point.x - radius, maxX: point.x + radius, minZ: point.z - radius, maxZ: point.z + radius });
  }

  // The building containing the point, or the closest one within `tolerance`.
  buildingAt(point: WorldMeters, tolerance = 0): IndexedBuilding | undefined {
    let best: IndexedBuilding | undefined;
    let bestDistance = tolerance;
    for (const entry of this.nearby(point, tolerance + 1)) {
      if (pointInPolygon(point, entry.building.footprint)) return entry;
      const distance = distanceToPolygon(point, entry.building.footprint);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = entry;
      }
    }
    return best;
  }

  private rebuild(): void {
    this.grid.clear();
    this.byId.clear();
    for (const entries of this.tiles.values()) {
      for (const entry of entries) {
        this.byId.set(entry.building.id, entry);
        for (let x = Math.floor(entry.bounds.minX / CELL); x <= Math.floor(entry.bounds.maxX / CELL); x += 1) {
          for (let z = Math.floor(entry.bounds.minZ / CELL); z <= Math.floor(entry.bounds.maxZ / CELL); z += 1) {
            const key = `${x}:${z}`;
            const bucket = this.grid.get(key);
            if (bucket) bucket.push(entry);
            else this.grid.set(key, [entry]);
          }
        }
      }
    }
  }
}
