import { describe, expect, it } from "vitest";
import { PedestrianSystem, sidewalkPosition } from "../src/simulation/pedestrians";
import { pickTrafficType, TrafficSystem } from "../src/simulation/traffic";
import type { WorldRoadSegment } from "../src/simulation/roadGeometry";

const street: WorldRoadSegment = { id: "s", tileId: "t", kind: "secondary", width: 16, ax: 0, az: 0, bx: 0, bz: 400, length: 400 };
const alley: WorldRoadSegment = { id: "a", tileId: "t", kind: "residential", width: 10, ax: 0, az: 400, bx: 300, bz: 400, length: 300 };

function seededRandom(seed = 1): () => number {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return value / 2147483647;
  };
}

describe("AI traffic mix", () => {
  it("keeps buses to main roads and mixes in motorbikes, tuk-tuks and taxis", () => {
    expect(pickTrafficType(street, 0.05)).toBe("bus");
    expect(pickTrafficType(alley, 0.05)).toBe("motorbike");
    expect(pickTrafficType(street, 0.35)).toBe("tuktuk");
    expect(pickTrafficType(street, 0.5)).toBe("taxi");
    expect(pickTrafficType(street, 0.9)).toBe("car");
  });

  it("fills up to the configured number of vehicles near the player", () => {
    const traffic = new TrafficSystem(seededRandom(11), { maxCars: 12, minSpawnDistance: 10 });
    traffic.setRoads([street, alley]);
    for (let i = 0; i < 60; i += 1) traffic.update(0.2, { x: 0, z: 200, yaw: 0, speed: 0 });
    expect(traffic.cars.length).toBe(12);
    expect(new Set(traffic.cars.map((car) => car.type)).size).toBeGreaterThan(1);
  });
});

describe("pedestrians", () => {
  it("walk on the sidewalk, not the road", () => {
    const people = new PedestrianSystem(20, seededRandom(5));
    people.setRoads([street, alley]);
    for (let i = 0; i < 40; i += 1) people.update(0.2, { x: 0, z: 200, speed: 0 });
    expect(people.people.length).toBe(20);
    for (const person of people.people) {
      const onStreet = Math.abs(person.x) >= street.width / 2 && Math.abs(person.x) <= street.width / 2 + 3.2 && person.z >= 0 && person.z <= 400;
      const onAlley = Math.abs(person.z - 400) >= alley.width / 2 && Math.abs(person.z - 400) <= alley.width / 2 + 3.2;
      expect(onStreet || onAlley).toBe(true);
    }
  });

  it("step towards the buildings when a car comes close", () => {
    const calm = sidewalkPosition(street, 1, 1, 100, 0);
    const dodging = sidewalkPosition(street, 1, 1, 100, 1.2);
    expect(Math.abs(dodging.x)).toBeGreaterThan(Math.abs(calm.x));
  });
});
