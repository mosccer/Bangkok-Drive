import type { MapArea, PlaceSummary, RoadTile, RoadTileManifest } from "../types";
import { fallbackMapAreas } from "../data/fallbackMapAreas";
import { fallbackRoadTileManifest, loadFallbackTile } from "../data/roadTileFixtures";

const TILE_CACHE_LIMIT = 400;

// Runs `generateCityTile` in a worker when the platform has one, falling back to the main thread.
class CityTileGenerator {
  private worker?: Worker;
  private failed = typeof Worker === "undefined";
  private nextRequest = 0;
  private readonly pending = new Map<number, (tile: RoadTile | undefined) => void>();

  generate(id: string): Promise<RoadTile | undefined> {
    const worker = this.ensureWorker();
    if (!worker) return Promise.resolve(loadFallbackTile(id));
    const requestId = this.nextRequest++;
    return new Promise((resolve) => {
      this.pending.set(requestId, resolve);
      worker.postMessage({ requestId, id });
    });
  }

  private ensureWorker(): Worker | undefined {
    if (this.failed) return undefined;
    if (this.worker) return this.worker;
    try {
      this.worker = new Worker(new URL("./cityTileWorker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (event: MessageEvent<{ requestId: number; tile?: RoadTile; error?: string }>) => {
        const resolve = this.pending.get(event.data.requestId);
        this.pending.delete(event.data.requestId);
        resolve?.(event.data.tile);
      };
      this.worker.onerror = () => this.abandonWorker();
      return this.worker;
    } catch {
      this.abandonWorker();
      return undefined;
    }
  }

  // Worker unavailable (blocked, crashed): finish outstanding requests on the main thread.
  private abandonWorker(): void {
    this.failed = true;
    this.worker?.terminate();
    this.worker = undefined;
    const waiting = [...this.pending.entries()];
    this.pending.clear();
    for (const [, resolve] of waiting) resolve(undefined);
  }
}

export class RoadTileStore {
  private manifest?: RoadTileManifest;
  private areas?: Promise<MapArea[]>;
  private places?: Promise<PlaceSummary[]>;
  private readonly cache = new Map<string, RoadTile>();
  private readonly generator = new CityTileGenerator();
  private readonly inFlight = new Map<string, Promise<RoadTile | undefined>>();

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
      let request = this.inFlight.get(id);
      if (!request) {
        request = this.generator.generate(id).then((generated) => generated ?? loadFallbackTile(id));
        this.inFlight.set(id, request);
      }
      tile = await request;
      this.inFlight.delete(id);
      const raced = this.cache.get(id);
      if (raced) return { ...raced, loadedAt: performance.now() };
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
