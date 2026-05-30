import { describe, expect, it } from "vitest";
import { bangkokWorld } from "../src/data/bangkokWorld";
import { advanceMissionAtWaypoint, ensureMissionProgress } from "../src/simulation/missionFlow";
import { createStarterMissions } from "../src/simulation/missions";
import { defaultSaveGame } from "../src/simulation/saveGame";

describe("mission flow", () => {
  it("advances and rewards a completed mission", () => {
    const mission = createStarterMissions(bangkokWorld.places)[2];
    const progress = ensureMissionProgress(defaultSaveGame, mission);
    const save = {
      ...defaultSaveGame,
      player: { ...defaultSaveGame.player, activeMissionId: mission.id, missionProgress: progress },
    };
    const completed = advanceMissionAtWaypoint(save, mission, mission.waypoints[0], 1000);

    expect(completed.completedMissionIds).toContain(mission.id);
    expect(completed.player.xp).toBe(defaultSaveGame.player.xp + mission.reward.xp);
    expect(completed.player.badges).toContain("Cafe Trail Scout");
  });
});
