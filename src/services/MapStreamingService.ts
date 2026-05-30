import type { RoadTile, RoadTileManifestEntry, StreamingMapState, WorldAnchor, WorldMeters } from "../types";
import { RoadTileStore } from "./RoadTileStore";

export interface MapStreamingOptions {
  desktopTileRadius?: number;
  mobileTileRadius?: number;
  keepTileIds?: string[];
}

function intersectsMeters(
  bounds: RoadTileManifestEntry["boundsMeters"],
  center: WorldMeters,
  radiusMeters: number,
): boolean {
  return (
    bounds.minX <= center.x + radiusMeters &&
    bounds.maxX >= center.x - radiusMeters &&
    bounds.minZ <= center.z + radiusMeters &&
    bounds.maxZ >= center.z - radiusMeters
  );
}

function tileDistanceToPoint(tile: RoadTileManifestEntry, point: WorldMeters): number {
  const centerX = (tile.boundsMeters.minX + tile.boundsMeters.maxX) / 2;
  const centerZ = (tile.boundsMeters.minZ + tile.boundsMeters.maxZ) / 2;
  return Math.hypot(centerX - point.x, centerZ - point.z);
}

export class MapStreamingService {
  private lastState?: StreamingMapState;

  constructor(
    private readonly tileStore = new RoadTileStore(),
    private readonly options: MapStreamingOptions = {},
  ) {}

  async update(anchor: WorldAnchor, vehicleWorldMeters: WorldMeters, isMobile: boolean): Promise<StreamingMapState> {
    const manifest = await this.tileStore.loadManifest();
    const tileRadius = isMobile ? (this.options.mobileTileRadius ?? 1) : (this.options.desktopTileRadius ?? 2);
    const radiusMeters = manifest.tileSizeMeters * tileRadius;
    const keep = new Set(this.options.keepTileIds ?? []);
    const activeTile = this.findActiveTile(manifest.tiles, vehicleWorldMeters);
    if (activeTile) keep.add(activeTile.id);

    const selected = manifest.tiles
      .filter((tile) => keep.has(tile.id) || intersectsMeters(tile.boundsMeters, vehicleWorldMeters, radiusMeters))
      .sort((a, b) => tileDistanceToPoint(a, vehicleWorldMeters) - tileDistanceToPoint(b, vehicleWorldMeters));

    const loadedTiles = (await Promise.all(selected.map((tile) => this.tileStore.loadTile(tile.id)))).filter((tile): tile is RoadTile => Boolean(tile));
    const state: StreamingMapState = {
      scaleMode: "real_1_1",
      anchor,
      activeTileId: activeTile?.id,
      visibleTileIds: loadedTiles.map((tile) => tile.id),
      loadedTiles,
      tileSizeMeters: manifest.tileSizeMeters,
    };
    this.lastState = state;
    return state;
  }

  getLastState(): StreamingMapState | undefined {
    return this.lastState;
  }

  findActiveTile(entries: RoadTileManifestEntry[], vehicleWorldMeters: WorldMeters): RoadTileManifestEntry | undefined {
    return (
      entries.find(
        (tile) =>
          vehicleWorldMeters.x >= tile.boundsMeters.minX &&
          vehicleWorldMeters.x <= tile.boundsMeters.maxX &&
          vehicleWorldMeters.z >= tile.boundsMeters.minZ &&
          vehicleWorldMeters.z <= tile.boundsMeters.maxZ,
      ) ?? [...entries].sort((a, b) => tileDistanceToPoint(a, vehicleWorldMeters) - tileDistanceToPoint(b, vehicleWorldMeters))[0]
    );
  }
}
