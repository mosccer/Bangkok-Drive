import type { MapArea, PlaceSummary, RoadTile, RoadTileManifest } from "../types";
import { fallbackMapAreas } from "../data/fallbackMapAreas";
import { fallbackRoadTileManifest, fallbackRoadTiles } from "../data/roadTileFixtures";

export class RoadTileStore {
  private manifest?: RoadTileManifest;
  private areas?: Promise<MapArea[]>;
  private places?: Promise<PlaceSummary[]>;
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

  // Water and park polygons span many tiles, so they are stored once for the whole map.
  loadAreas(): Promise<MapArea[]> {
    this.areas ??= this.loadManifest().then(async (manifest) => {
      if (!manifest.areasHref) return fallbackMapAreas;
      try {
        const response = await fetch(manifest.areasHref);
        if (!response.ok) throw new Error(`Map areas failed: ${response.status}`);
        const payload = (await response.json()) as { areas?: MapArea[] };
        return payload.areas?.length ? payload.areas : fallbackMapAreas;
      } catch {
        return fallbackMapAreas;
      }
    });
    return this.areas;
  }

  loadOsmPlaces(): Promise<PlaceSummary[]> {
    this.places ??= this.loadManifest().then(async (manifest) => {
      if (!manifest.placesHref) return [];
      try {
        const response = await fetch(manifest.placesHref);
        if (!response.ok) throw new Error(`OSM places failed: ${response.status}`);
        const payload = (await response.json()) as { places?: PlaceSummary[] };
        return payload.places ?? [];
      } catch {
        return [];
      }
    });
    return this.places;
  }
}
