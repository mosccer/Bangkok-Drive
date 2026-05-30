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
