import type { RoadTile, RoadTileManifest } from "../types";
import { fallbackRoadTileManifest, fallbackRoadTiles } from "../data/roadTileFixtures";

export class RoadTileStore {
  private manifest?: RoadTileManifest;
  private readonly cache = new Map<string, RoadTile>();

  constructor(private readonly manifestUrl = "/data/road-tiles/index.json") {
    for (const tile of fallbackRoadTiles) {
      this.cache.set(tile.id, { ...tile, loadedAt: performance.now() });
    }
  }

  async loadManifest(): Promise<RoadTileManifest> {
    if (this.manifest) return this.manifest;

    try {
      const response = await fetch(this.manifestUrl);
      if (!response.ok) throw new Error(`Road tile manifest failed: ${response.status}`);
      this.manifest = (await response.json()) as RoadTileManifest;
    } catch {
      this.manifest = fallbackRoadTileManifest;
    }

    return this.manifest;
  }

  async loadTile(id: string): Promise<RoadTile | undefined> {
    const cached = this.cache.get(id);
    if (cached) return { ...cached, loadedAt: performance.now() };

    const manifest = await this.loadManifest();
    const entry = manifest.tiles.find((tile) => tile.id === id);
    if (!entry) return undefined;

    try {
      const response = await fetch(entry.href);
      if (!response.ok) throw new Error(`Road tile failed: ${response.status}`);
      const tile = (await response.json()) as RoadTile;
      const loaded = { ...tile, loadedAt: performance.now() };
      this.cache.set(tile.id, loaded);
      return loaded;
    } catch {
      return undefined;
    }
  }
}
