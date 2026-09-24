import { describe, expect, it } from "vitest";
import { convertOverpassToRoadChunk, convertOverpassToRoadTile, normalizeOsmRoadKind, type OverpassResponse } from "../src/data/osmImport";

describe("OSM chunk conversion", () => {
  it("converts Overpass ways into road chunk segments", () => {
    const fixture: OverpassResponse = {
      elements: [
        { type: "node", id: 1, lat: 13.75, lon: 100.5 },
        { type: "node", id: 2, lat: 13.751, lon: 100.501 },
        { type: "node", id: 3, lat: 13.752, lon: 100.502 },
        { type: "way", id: 10, nodes: [1, 2, 3], tags: { highway: "primary" } },
      ],
    };

    const chunk = convertOverpassToRoadChunk(fixture, "fixture", "Test District");

    expect(chunk.nodes).toHaveLength(3);
    expect(chunk.segments).toHaveLength(2);
    expect(chunk.segments[0].kind).toBe("arterial");
    expect(chunk.bounds.maxX).toBeGreaterThan(chunk.bounds.minX);
  });

  it("converts Overpass ways into 1:1 road tiles", () => {
    const fixture: OverpassResponse = {
      elements: [
        { type: "node", id: 1, lat: 13.75, lon: 100.5 },
        { type: "node", id: 2, lat: 13.751, lon: 100.501 },
        { type: "way", id: 10, nodes: [1, 2], tags: { highway: "secondary" } },
      ],
    };
    const tile = convertOverpassToRoadTile(fixture, {
      id: "tile-fixture",
      districtIds: ["phra-nakhon"],
      south: 13.749,
      west: 100.499,
      north: 13.752,
      east: 100.502,
    });

    expect(tile.id).toBe("tile-fixture");
    expect(tile.nodes).toHaveLength(2);
    expect(tile.segments[0].kind).toBe("secondary");
    expect(tile.boundsMeters.maxX).toBeGreaterThan(tile.boundsMeters.minX);
  });

  it("normalizes OSM road kinds for streaming", () => {
    expect(normalizeOsmRoadKind({ highway: "trunk" })).toBe("motorway");
    expect(normalizeOsmRoadKind({ highway: "service" })).toBe("service");
    expect(normalizeOsmRoadKind({ highway: "primary", bridge: "yes" })).toBe("bridge");
  });
});

import {
  assembleRings,
  buildingHeightMeters,
  buildOverpassQuery,
  createImportGrid,
  extractMapAreas,
  extractOsmPlaces,
  polygonArea,
  roadWidthFromTags,
  simplifyRing,
} from "../src/data/osmImport";
import { latLngToWorld } from "../src/data/coordinates";

const zone = { id: "z", districtIds: ["phra-nakhon"], south: 13.74, west: 100.48, north: 13.76, east: 100.5 };
const square = (lat: number, lon: number, size: number) => [
  { lat, lon },
  { lat, lon: lon + size },
  { lat: lat + size, lon: lon + size },
  { lat: lat + size, lon },
  { lat, lon },
];

describe("OSM map import v2", () => {
  it("projects road tiles at the game map scale so they line up with places", () => {
    const tile = convertOverpassToRoadTile(
      {
        elements: [
          { type: "way", id: 1, nodes: [1, 2], geometry: [{ lat: 13.75, lon: 100.49 }, { lat: 13.751, lon: 100.49 }], tags: { highway: "primary_link", lanes: "4", name: "Na Phra Lan" } },
        ],
      },
      zone,
    );
    const expected = latLngToWorld(13.75, 100.49);
    expect(tile.nodes[0].x).toBeCloseTo(expected.x, 0);
    expect(tile.nodes[0].z).toBeCloseTo(expected.z, 0);
    expect(tile.segments[0]).toMatchObject({ kind: "primary", name: "Na Phra Lan", width: roadWidthFromTags({ lanes: "4" }) });
  });

  it("drops road segments whose midpoint belongs to a neighbouring tile", () => {
    const tile = convertOverpassToRoadTile(
      { elements: [{ type: "way", id: 1, nodes: [1, 2, 3], geometry: [{ lat: 13.75, lon: 100.49 }, { lat: 13.755, lon: 100.49 }, { lat: 13.77, lon: 100.49 }], tags: { highway: "secondary" } }] },
      zone,
    );
    expect(tile.segments).toHaveLength(1);
  });

  it("extracts building footprints with heights from levels", () => {
    const tile = convertOverpassToRoadTile(
      {
        elements: [
          { type: "way", id: 7, nodes: [1, 2, 3, 4, 1], geometry: square(13.75, 100.49, 0.0003), tags: { building: "apartments", "building:levels": "10" } },
          { type: "way", id: 8, nodes: [1, 2, 3, 4, 1], geometry: square(13.75, 100.491, 0.00001), tags: { building: "yes" } },
        ],
      },
      zone,
    );
    expect(tile.buildings).toHaveLength(1);
    expect(tile.buildings![0]).toMatchObject({ id: "osm-w7", kind: "residential", heightMeters: 33 });
    expect(tile.buildings![0].footprint).toHaveLength(4);
    expect(buildingHeightMeters({ height: "45 m" })).toBe(45);
    expect(buildingHeightMeters({ building: "temple" })).toBe(14);
  });

  it("assembles split multipolygon members into water rings", () => {
    const ring = square(13.74, 100.49, 0.01);
    const rings = assembleRings([ring.slice(0, 3), ring.slice(2).reverse()]);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(4);

    const areas = extractMapAreas({
      elements: [
        {
          type: "relation",
          id: 99,
          tags: { natural: "water", name: "Chao Phraya" },
          members: [
            { type: "way", ref: 1, role: "outer", geometry: ring.slice(0, 3) },
            { type: "way", ref: 2, role: "outer", geometry: ring.slice(2) },
          ],
        },
        { type: "way", id: 5, nodes: [1, 2, 3, 4, 1], geometry: square(13.75, 100.5, 0.002), tags: { leisure: "park" } },
      ],
    });
    expect(areas.map((area) => area.kind).sort()).toEqual(["park", "water"]);
    expect(areas.find((area) => area.kind === "water")?.name).toBe("Chao Phraya");
  });

  it("simplifies dense rings without collapsing them", () => {
    const dense = Array.from({ length: 100 }, (_, i) => ({ x: i, z: i % 2 ? 0.01 : 0 })).concat([{ x: 100, z: 50 }, { x: 0, z: 50 }]);
    const simplified = simplifyRing(dense, 1);
    expect(simplified.length).toBeLessThan(10);
    expect(Math.abs(polygonArea(simplified))).toBeCloseTo(Math.abs(polygonArea(dense)), -1);
  });

  it("turns temples, cafes and attractions into places", () => {
    const places = extractOsmPlaces({
      elements: [
        { type: "node", id: 1, lat: 13.7465, lon: 100.4927, tags: { amenity: "place_of_worship", religion: "buddhist", name: "วัดโพธิ์", "name:en": "Wat Pho" } },
        { type: "node", id: 2, lat: 13.75, lon: 100.5, tags: { amenity: "cafe", name: "Some Cafe" } },
        { type: "way", id: 3, nodes: [1, 2, 3, 4, 1], geometry: square(13.75, 100.49, 0.001), tags: { tourism: "museum", name: "Museum Siam" } },
        { type: "node", id: 4, lat: 13.75, lon: 100.5, tags: { amenity: "bench" } },
      ],
    });
    expect(places.map((place) => place.category)).toEqual(["temple", "cafe", "museum"]);
    expect(places[0]).toMatchObject({ id: "osm-n1", source: "osm", nameTh: "วัดโพธิ์", nameEn: "Wat Pho", districtId: "phra-nakhon" });
    expect(places[0].tags).toContain("temple");
  });

  it("plans a tile grid and a query covering roads, buildings, water and POIs", () => {
    const grid = createImportGrid({ south: 13.7, west: 100.47, north: 13.724, east: 100.494 }, 0.012);
    expect(grid).toHaveLength(4);
    expect(new Set(grid.map((tile) => tile.id)).size).toBe(4);
    const query = buildOverpassQuery(grid[0]);
    for (const key of ['"highway"', '"building"', '"natural"="water"', '"place_of_worship"', "out geom"]) {
      expect(query).toContain(key);
    }
  });
});
