import { describe, expect, it } from "vitest";
import { curatedPlaces } from "../src/data/curatedPlaces";
import { latLngToWorld } from "../src/data/coordinates";
import {
  blockingAreaAt,
  CITY_RECT,
  CITY_TILE_SIZE,
  cityRoadTileManifest,
  cityTileAt,
  cityTileId,
  cityTileRect,
  generateCityTile,
  majorRoadsInRect,
  parseCityTileId,
} from "../src/data/proceduralCity";
import { distanceToSegment, pointInPolygon, polygonCentroid, segmentPolygonDistance } from "../src/simulation/geometry2d";
import { buildRoadGraph, findRoute } from "../src/simulation/routing";
import { roadSegmentsForTiles } from "../src/simulation/roadGeometry";

const siam = latLngToWorld(13.746, 100.534);
const siamTile = parseCityTileId(cityTileAt(siam))!;

function tilesAround(ix: number, iz: number, radius = 1) {
  const tiles = [];
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) tiles.push(generateCityTile(cityTileId(ix + dx, iz + dz))!);
  }
  return tiles;
}

describe("procedural Bangkok", () => {
  it("covers central Bangkok with a streamable tile grid", () => {
    const manifest = cityRoadTileManifest();
    expect(manifest.source).toBe("procedural");
    expect(manifest.tiles.length).toBeGreaterThan(5_000);
    expect((CITY_RECT.maxX - CITY_RECT.minX) / 2).toBeGreaterThan(25_000);
    expect((CITY_RECT.maxZ - CITY_RECT.minZ) / 2).toBeGreaterThan(20_000);
    for (const [lat, lng] of [
      [13.7515, 100.4929],
      [13.7998, 100.55],
      [13.7055, 100.601],
      [13.72, 100.46],
    ]) {
      expect(manifest.tiles.some((tile) => tile.id === cityTileAt(latLngToWorld(lat, lng)))).toBe(true);
    }
  });

  it("generates the same tile every time", () => {
    const id = cityTileId(siamTile.ix, siamTile.iz);
    const first = generateCityTile(id)!;
    const second = generateCityTile(id)!;
    expect(second.segments).toEqual(first.segments);
    expect(second.buildings?.map((building) => building.id)).toEqual(first.buildings?.map((building) => building.id));
  });

  it("fills tiles with many detailed buildings", () => {
    for (const [lat, lng] of [
      [13.752, 100.4928],
      [13.7372, 100.5605],
      [13.83, 100.62],
    ]) {
      const tile = generateCityTile(cityTileAt(latLngToWorld(lat, lng)))!;
      expect(tile.buildings!.length).toBeGreaterThan(120);
      for (const building of tile.buildings!) {
        expect(building.use).toBeTruthy();
        expect(building.name).toBeTruthy();
        expect(building.address).toContain("เขต");
        expect(building.floors).toBeGreaterThan(0);
      }
    }
  });

  it("keeps building centres inside their own tile so tiles never duplicate a building", () => {
    const tile = generateCityTile(cityTileId(siamTile.ix, siamTile.iz))!;
    const rect = cityTileRect(siamTile.ix, siamTile.iz);
    for (const building of tile.buildings!) {
      const center = polygonCentroid(building.footprint);
      expect(center.x >= rect.minX && center.x < rect.maxX && center.z >= rect.minZ && center.z < rect.maxZ).toBe(true);
    }
    const neighbour = generateCityTile(cityTileId(siamTile.ix + 1, siamTile.iz))!;
    const ids = new Set(tile.buildings!.map((building) => building.id));
    expect(neighbour.buildings!.some((building) => ids.has(building.id))).toBe(false);
  });

  it("never puts buildings on roads, in the river or on a guide place", () => {
    const tiles = tilesAround(siamTile.ix, siamTile.iz);
    const segments = roadSegmentsForTiles(tiles);
    const center = tiles[4];
    for (const building of center.buildings!) {
      for (const segment of segments) {
        const distance = segmentPolygonDistance({ x: segment.ax, z: segment.az }, { x: segment.bx, z: segment.bz }, building.footprint);
        expect(distance).toBeGreaterThanOrEqual(segment.width / 2);
      }
      expect(blockingAreaAt(polygonCentroid(building.footprint))).toBeUndefined();
    }
    const paragon = curatedPlaces.find((place) => place.id === "siam-paragon") ?? curatedPlaces[0];
    const spot = latLngToWorld(paragon.lat, paragon.lng);
    for (const tile of tiles) {
      for (const building of tile.buildings!) expect(pointInPolygon(spot, building.footprint)).toBe(false);
    }
  });

  it("only crosses the Chao Phraya on bridges", () => {
    const riverside = latLngToWorld(13.7405, 100.496);
    const center = parseCityTileId(cityTileAt(riverside))!;
    const tiles = tilesAround(center.ix, center.iz, 2);
    for (const tile of tiles) {
      const nodes = new Map(tile.nodes.map((node) => [node.id, node]));
      for (const segment of tile.segments) {
        const a = nodes.get(segment.from)!;
        const b = nodes.get(segment.to)!;
        const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        if (blockingAreaAt(mid)?.kind === "water") expect(["bridge", "primary", "secondary"]).toContain(segment.kind);
      }
    }
  });

  it("connects neighbouring tiles so routes run across tile edges", () => {
    const tiles = tilesAround(siamTile.ix, siamTile.iz);
    const graph = buildRoadGraph(roadSegmentsForTiles(tiles));
    const from = { x: siam.x - CITY_TILE_SIZE * 0.8, z: siam.z - CITY_TILE_SIZE * 0.6 };
    const to = { x: siam.x + CITY_TILE_SIZE * 0.8, z: siam.z + CITY_TILE_SIZE * 0.6 };
    const route = findRoute(graph, from, to);
    expect(route).toBeTruthy();
    const end = route![route!.length - 1];
    expect(Math.hypot(end.x - to.x, end.z - to.z)).toBeLessThan(200);
  });

  it("names streets and gives an overview road layer for the map", () => {
    const tile = generateCityTile(cityTileId(siamTile.ix, siamTile.iz))!;
    expect(tile.segments.every((segment) => segment.name && segment.name.length > 2)).toBe(true);
    const major = majorRoadsInRect({ minX: siam.x - 4_000, maxX: siam.x + 4_000, minZ: siam.z - 4_000, maxZ: siam.z + 4_000 });
    expect(major.some((piece) => piece.name === "ถนนสุขุมวิท" || piece.name === "ถนนพระรามที่ 1")).toBe(true);
    expect(major.every((piece) => distanceToSegment(siam, piece.a, piece.b) < 10_000)).toBe(true);
  });
});
