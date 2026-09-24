import { describe, expect, it } from "vitest";
import { buildRoadGraph, findRoute } from "../src/simulation/routing";
import type { WorldRoadSegment } from "../src/simulation/roadGeometry";

const road = (id: string, ax: number, az: number, bx: number, bz: number, kind: WorldRoadSegment["kind"] = "residential"): WorldRoadSegment => ({
  id,
  tileId: "t",
  kind,
  width: 10,
  ax,
  az,
  bx,
  bz,
  length: Math.hypot(bx - ax, bz - az),
});

describe("road routing", () => {
  // A square block: the only way from (0,0) to (100,100) is around a corner.
  const segments = [road("a", 0, 0, 100, 0), road("b", 100, 0, 100, 100), road("c", 0, 0, 0, 100), road("d", 0, 100, 100, 100)];

  it("follows connected roads instead of a straight line", () => {
    const route = findRoute(buildRoadGraph(segments), { x: 2, z: -3 }, { x: 99, z: 101 });
    expect(route).toBeTruthy();
    expect(route![0]).toEqual({ x: 0, z: 0 });
    expect(route![route!.length - 1]).toEqual({ x: 100, z: 100 });
    expect(route).toHaveLength(3);
  });

  it("prefers main roads when lengths are similar", () => {
    const withPrimary = [...segments.slice(0, 2).map((segment) => ({ ...segment, kind: "primary" as const })), ...segments.slice(2)];
    const route = findRoute(buildRoadGraph(withPrimary), { x: 0, z: 0 }, { x: 100, z: 100 });
    expect(route![1]).toEqual({ x: 100, z: 0 });
  });

  it("returns undefined when there are no roads", () => {
    expect(findRoute(buildRoadGraph([]), { x: 0, z: 0 }, { x: 1, z: 1 })).toBeUndefined();
  });
});

describe("routing over hand-traced roads", () => {
  it("connects roads that cross without a shared node", () => {
    const cross = [road("ew", -100, 0, 100, 0), road("ns", 0, -100, 0, 100)];
    const route = findRoute(buildRoadGraph(cross), { x: -100, z: 0 }, { x: 0, z: 100 });
    expect(route?.map((point) => [Math.round(point.x), Math.round(point.z)])).toEqual([
      [-100, 0],
      [0, 0],
      [0, 100],
    ]);
  });

  it("routes between the fallback tiles' streets", async () => {
    const { fallbackRoadTiles } = await import("../src/data/roadTileFixtures");
    const { latLngToWorld } = await import("../src/data/coordinates");
    const { roadSegmentsForTiles } = await import("../src/simulation/roadGeometry");
    const graph = buildRoadGraph(roadSegmentsForTiles(fallbackRoadTiles));
    expect(findRoute(graph, latLngToWorld(13.752, 100.4928), latLngToWorld(13.75, 100.4913))).toBeTruthy();
  });
});
