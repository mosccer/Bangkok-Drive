import { describe, expect, it } from "vitest";
import { buildingUseLabels, describeBuilding, inferBuildingUse } from "../src/data/buildingDetails";
import { cityTileAt, generateCityTile } from "../src/data/proceduralCity";
import { latLngToWorld } from "../src/data/coordinates";
import { BuildingIndex } from "../src/simulation/buildingIndex";
import { resolveBuildingCollision } from "../src/simulation/buildingCollision";
import { polygonCentroid } from "../src/simulation/geometry2d";
import type { MapBuilding } from "../src/types";

const square = [
  { x: 0, z: 0 },
  { x: 20, z: 0 },
  { x: 20, z: 20 },
  { x: 0, z: 20 },
];

describe("building collisions", () => {
  it("leaves a car that is clear of buildings alone", () => {
    expect(resolveBuildingCollision({ x: -10, z: 10 }, 2, [square])).toBeUndefined();
  });

  it("pushes a car touching a wall back out along the wall normal", () => {
    const contact = resolveBuildingCollision({ x: -1, z: 10 }, 2, [square])!;
    expect(contact.x).toBeCloseTo(-2, 5);
    expect(contact.z).toBeCloseTo(10, 5);
    expect(contact.normalX).toBeCloseTo(-1, 5);
  });

  it("gets a car out of a building it ended up inside", () => {
    const contact = resolveBuildingCollision({ x: 18, z: 10 }, 2, [square])!;
    expect(contact.x).toBeCloseTo(22, 5);
    expect(contact.normalX).toBeCloseTo(1, 5);
  });
});

describe("building index and details", () => {
  const tile = generateCityTile(cityTileAt(latLngToWorld(13.7372, 100.5605)))!;

  it("finds the building under a point and nearby buildings", () => {
    const index = new BuildingIndex();
    index.setTiles([tile]);
    expect(index.size).toBe(tile.buildings!.length);
    const building = tile.buildings![5];
    const hit = index.buildingAt(polygonCentroid(building.footprint));
    expect(hit?.building.id).toBe(building.id);
    expect(index.get(building.id)?.tileId).toBe(tile.id);
    index.setTiles([]);
    expect(index.size).toBe(0);
  });

  it("describes generated buildings with type, floors, address and tenants", () => {
    const shop = tile.buildings!.find((building) => building.use === "shophouse")!;
    const info = describeBuilding(shop, 2026);
    expect(info.title).toBe(shop.name);
    expect(info.useLabel).toBe(buildingUseLabels.shophouse.th);
    expect(info.facts.map((fact) => fact.label)).toEqual(expect.arrayContaining(["ประเภท", "จำนวนชั้น", "ความสูง", "ที่อยู่", "ปีที่สร้าง"]));
    expect(info.tenants.length).toBeGreaterThan(0);
  });

  it("fills in details for sparse OpenStreetMap buildings", () => {
    const osm: MapBuilding = { id: "osm-1", footprint: square, heightMeters: 60, kind: "commercial" };
    expect(inferBuildingUse(osm)).toBe("office");
    const info = describeBuilding(osm);
    expect(info.title).toContain("อาคารสำนักงาน");
    expect(info.facts.find((fact) => fact.label === "จำนวนชั้น")?.value).toBe("18 ชั้น");
  });
});
