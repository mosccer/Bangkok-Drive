import type { MapArea, PlaceSummary, RoadTile, RoadTileManifest } from "../types";
import { fallbackMapAreas } from "../data/fallbackMapAreas";
import { fallbackRoadTileManifest, loadFallbackTile } from "../data/roadTileFixtures";

const TILE_CACHE_LIMIT = 400;

export class RoadTileStore {
  private manifest?: RoadTileManifest;
  private areas?: Promise<MapArea[]>;
  private places?: Promise<PlaceSummary[]>;
  private readonly cache = new Map<string, RoadTile>();

  constructor(private readonly manifestUrl = "/data/road-tiles/index.json") {}

  async loadManifest(): Promise<RoadTileManifest> {
    if (this.manifest) return this.manifest;

    try {
      const response = await fetch(this.manifestUrl);
      if (!response.ok) throw new Error(`Road tile manifest failed: ${response.status}`);
      this.manifest = (await response.json()) as RoadTileManifest;
    } catch {
      this.manifest = fallbackRoadTileManifest();
    }

    return this.manifest;
  }

  // Imported OSM tiles are fetched; procedural tiles are generated on demand. Both are kept in a
  // small LRU cache so driving back and forth does not rebuild them.
  async loadTile(id: string): Promise<RoadTile | undefined> {
    const cached = this.cache.get(id);
    if (cached) {
      this.cache.delete(id);
      this.cache.set(id, cached);
      return { ...cached, loadedAt: performance.now() };
    }

    const manifest = await this.loadManifest();
    let tile: RoadTile | undefined;
    if (manifest.source === "procedural") {
      tile = loadFallbackTile(id);
    } else {
      const entry = manifest.tiles.find((candidate) => candidate.id === id);
      if (!entry) return undefined;
      try {
        const response = await fetch(entry.href);
        if (!response.ok) throw new Error(`Road tile failed: ${response.status}`);
        tile = (await response.json()) as RoadTile;
      } catch {
        return undefined;
      }
    }
    if (!tile) return undefined;
    const loaded = { ...tile, loadedAt: performance.now() };
    this.cache.set(id, loaded);
    if (this.cache.size > TILE_CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    return loaded;
  }

  // Tiles already generated or downloaded, without triggering new work (used by the world map).
  peekTile(id: string): RoadTile | undefined {
    return this.cache.get(id);
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
