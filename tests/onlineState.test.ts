import { describe, expect, it } from "vitest";
import type { GhostPlayerState } from "../src/types";
import { interpolateGhostState, pruneStaleGhosts } from "../src/simulation/ghosts";
import { defaultSaveGame, mergeCloudSave } from "../src/simulation/saveGame";

const ghost = (overrides: Partial<GhostPlayerState>): GhostPlayerState => ({
  profileId: "p1",
  displayName: "Guest",
  vehicleId: "krung-compact",
  chunkId: "siam",
  x: 0,
  z: 0,
  yaw: 0,
  speed: 0,
  updatedAt: 0,
  ...overrides,
});

describe("online state helpers", () => {
  it("interpolates ghost state", () => {
    const result = interpolateGhostState(ghost({ updatedAt: 0 }), ghost({ x: 10, z: 20, speed: 30, updatedAt: 1000 }), 500);
    expect(result.x).toBe(5);
    expect(result.z).toBe(10);
    expect(result.speed).toBe(15);
  });

  it("prunes stale ghosts", () => {
    expect(pruneStaleGhosts([ghost({ profileId: "fresh", updatedAt: 900 }), ghost({ profileId: "old", updatedAt: 0 })], 1000, 500)).toHaveLength(1);
  });

  it("merges local and cloud saves without losing progress", () => {
    const merged = mergeCloudSave(
      { ...defaultSaveGame, discoveredPlaceIds: ["local"], unlockedVehicles: ["krung-compact"] },
      { discoveredPlaceIds: ["cloud"], unlockedVehicles: ["siam-taxi"], player: { ...defaultSaveGame.player, xp: 500 } },
    );
    expect(merged.discoveredPlaceIds.sort()).toEqual(["cloud", "local"]);
    expect(merged.unlockedVehicles.sort()).toEqual(["krung-compact", "siam-taxi"]);
    expect(merged.player.xp).toBe(500);
  });
});
