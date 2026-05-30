import { describe, expect, it } from "vitest";
import { getEffectiveVehicleStats, getVehicleDefinition, isVehicleUnlocked, vehicleDefinitions } from "../src/data/vehicles";

describe("garage vehicles", () => {
  it("defines five fictional city classes", () => {
    expect(vehicleDefinitions.map((vehicle) => vehicle.class).sort()).toEqual(["compact", "ev", "pickup", "sport", "taxi"]);
  });

  it("sets every car to a 120 km/h top speed", () => {
    expect(vehicleDefinitions.every((vehicle) => vehicle.stats.maxSpeedKmh === 120)).toBe(true);
    expect(getEffectiveVehicleStats("krung-compact").maxSpeedKmh).toBe(120);
  });

  it("locks and unlocks by xp or mission", () => {
    expect(isVehicleUnlocked(getVehicleDefinition("thonburi-pickup"), 0, [])).toBe(false);
    expect(isVehicleUnlocked(getVehicleDefinition("thonburi-pickup"), 250, [])).toBe(true);
    expect(isVehicleUnlocked(getVehicleDefinition("ari-ev"), 999, [])).toBe(false);
    expect(isVehicleUnlocked(getVehicleDefinition("ari-ev"), 0, ["ari-cafe-trail"])).toBe(true);
  });
});
