import { describe, expect, it } from "vitest";
import { bangkokWorld } from "../src/data/bangkokWorld";
import { activeWaypoint, advanceMissionAtWaypoint, ensureMissionProgress, isMissionComplete, missionReward, startMission } from "../src/simulation/missionFlow";
import { createStarterMissions } from "../src/simulation/missions";
import { defaultSaveGame } from "../src/simulation/saveGame";
import type { SaveGame } from "../src/types";

describe("mission flow", () => {
  it("advances and rewards a completed mission", () => {
    const mission = createStarterMissions(bangkokWorld.places)[2];
    const progress = ensureMissionProgress(defaultSaveGame, mission);
    const save: SaveGame = {
      ...defaultSaveGame,
      player: { ...defaultSaveGame.player, activeMissionId: mission.id, missionProgress: progress },
    };
    const completed = mission.waypoints.reduce<SaveGame>(
      (current, waypointId, index) => advanceMissionAtWaypoint(current, mission, waypointId, 1000 + index),
      save,
    );

    expect(completed.completedMissionIds).toContain(mission.id);
    expect(completed.player.xp).toBe(defaultSaveGame.player.xp + mission.reward.xp);
    expect(completed.player.badges).toContain("Cafe Trail Scout");
  });

  it("pays coins, clears the waypoint on completion, and pays a reduced replay reward", () => {
    const mission = createStarterMissions(bangkokWorld.places)[0];
    const run = (initial: SaveGame) =>
      mission.waypoints.reduce<SaveGame>((current, waypointId) => advanceMissionAtWaypoint(current, mission, waypointId, 1), startMission(initial, mission, 0));
    const first = run(defaultSaveGame);
    expect(isMissionComplete(first, mission)).toBe(true);
    expect(first.career.coins).toBe(mission.reward.coins);
    expect(activeWaypoint(mission, first.player.missionProgress!, bangkokWorld.places)).toBeUndefined();

    const replay = run(first);
    const replayReward = missionReward(mission, true);
    expect(replay.player.xp - first.player.xp).toBe(replayReward.xp);
    expect(replayReward.xp).toBeLessThan(mission.reward.xp);
  });
});
