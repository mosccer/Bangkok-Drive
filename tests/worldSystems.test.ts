import { describe, expect, it } from "vitest";
import { fallbackRoadTiles } from "../src/data/roadTileFixtures";
import { CollectibleField, generateTileCollectibles } from "../src/simulation/collectibles";
import { nearestRoadPoint, roadSegmentsForTiles, type WorldRoadSegment } from "../src/simulation/roadGeometry";
import { lanePosition, TrafficSystem } from "../src/simulation/traffic";

const straightRoad: WorldRoadSegment = { id: "r", tileId: "t", kind: "primary", width: 16, ax: 0, az: 0, bx: 0, bz: 400, length: 400 };

function seededRandom(seed = 1): () => number {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return value / 2147483647;
  };
}

describe("road coins and nitro", () => {
  it("places deterministic pickups on streamed roads", () => {
    const tile = fallbackRoadTiles[0];
    const first = generateTileCollectibles(tile);
    expect(first.length).toBeGreaterThan(10);
    expect(generateTileCollectibles(tile)).toEqual(first);
    expect(first.some((item) => item.kind === "nitro")).toBe(true);
    const segments = roadSegmentsForTiles([tile]);
    for (const item of first) {
      expect(nearestRoadPoint(segments, item)!.distance).toBeLessThan(10);
    }
  });

  it("collects nearby pickups and respawns them later", () => {
    const field = new CollectibleField(1_000);
    field.setTiles([fallbackRoadTiles[0]]);
    const target = generateTileCollectibles(fallbackRoadTiles[0])[0];
    const picked = field.collect(target, 1, 0);
    expect(picked.map((item) => item.id)).toContain(target.id);
    expect(field.nearby(target, 1, 10, 500).map((item) => item.id)).not.toContain(target.id);
    expect(field.nearby(target, 1, 10, 1_500).map((item) => item.id)).toContain(target.id);
  });
});

describe("traffic", () => {
  it("keeps cars on the left side of the road", () => {
    // Heading +z: the driver's left is +x.
    const northbound = lanePosition(straightRoad, 1, 100);
    const southbound = lanePosition(straightRoad, -1, 100);
    expect(northbound.x).toBeGreaterThan(0);
    expect(southbound.x).toBeLessThan(0);
  });

  it("spawns cars around the player and moves them along lanes", () => {
    const traffic = new TrafficSystem(seededRandom(7), { maxCars: 4, minSpawnDistance: 20 });
    traffic.setRoads([straightRoad]);
    const player = { x: 50, z: 0, yaw: 0, speed: 0 };
    for (let i = 0; i < 40; i += 1) traffic.update(0.1, player);
    expect(traffic.cars.length).toBeGreaterThan(0);
    const before = traffic.cars.map((car) => car.z);
    traffic.update(1, player);
    expect(traffic.cars.some((car, index) => Math.abs(car.z - before[index]) > 1)).toBe(true);
  });

  it("reports crashes and near misses", () => {
    const traffic = new TrafficSystem(seededRandom(3), { maxCars: 1, minSpawnDistance: 0, spawnRadius: 1_000 });
    traffic.setRoads([straightRoad]);
    traffic.update(0.1, { x: 500, z: 0, yaw: 0, speed: 0 });
    const car = traffic.cars[0];
    expect(car).toBeTruthy();
    const crash = traffic.update(0.001, { x: car.x, z: car.z, yaw: 0, speed: 20 });
    expect(crash.some((event) => event.kind === "crash")).toBe(true);

    const passer = new TrafficSystem(seededRandom(3), { maxCars: 1, minSpawnDistance: 0, spawnRadius: 1_000 });
    passer.setRoads([straightRoad]);
    passer.update(0.1, { x: 500, z: 0, yaw: 0, speed: 0 });
    const other = passer.cars[0];
    passer.update(0.001, { x: other.x + 5, z: other.z, yaw: 0, speed: 25 });
    const events = passer.update(0.001, { x: other.x + 30, z: other.z, yaw: 0, speed: 25 });
    expect(events.some((event) => event.kind === "near_miss")).toBe(true);
  });
});
