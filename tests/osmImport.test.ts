import { describe, expect, it } from "vitest";
import { convertOverpassToRoadChunk, type OverpassResponse } from "../src/data/osmImport";

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
});
