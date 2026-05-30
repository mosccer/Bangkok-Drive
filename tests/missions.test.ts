import { describe, expect, it } from "vitest";
import { bangkokWorld } from "../src/data/bangkokWorld";
import { availableMissions, createStarterMissions } from "../src/simulation/missions";

describe("mission generation", () => {
  it("creates mission types required by the plan", () => {
    const missions = createStarterMissions(bangkokWorld.places);
    expect(missions.map((mission) => mission.type)).toEqual(
      expect.arrayContaining(["tour_route", "food_run", "cafe_trail", "time_trial", "discovery"]),
    );
  });

  it("respects completed mission unlock requirements", () => {
    const missions = createStarterMissions(bangkokWorld.places);
    const locked = availableMissions(missions, 0, []);
    const unlocked = availableMissions(missions, 0, ["royal-island-tour"]);

    expect(locked.some((mission) => mission.id === "landmark-time-trial")).toBe(false);
    expect(unlocked.some((mission) => mission.id === "landmark-time-trial")).toBe(true);
  });
});
