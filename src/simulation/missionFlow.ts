import type { Mission, MissionProgress, PlaceSummary, SaveGame } from "../types";

export function ensureMissionProgress(save: SaveGame, mission: Mission): MissionProgress {
  if (save.player.missionProgress?.missionId === mission.id) {
    return save.player.missionProgress;
  }

  return {
    missionId: mission.id,
    activeWaypointIndex: 0,
    reachedWaypointIds: [],
    startedAt: performance.now(),
  };
}

export function activeWaypoint(mission: Mission, progress: MissionProgress, places: PlaceSummary[]): PlaceSummary | undefined {
  if (progress.completedAt !== undefined) return undefined;
  const waypointId = mission.waypoints[progress.activeWaypointIndex];
  return places.find((place) => place.id === waypointId);
}

export function advanceMissionAtWaypoint(save: SaveGame, mission: Mission, placeId: string, now = performance.now()): SaveGame {
  const progress = ensureMissionProgress(save, mission);
  const expected = mission.waypoints[progress.activeWaypointIndex];
  if (placeId !== expected || progress.reachedWaypointIds.includes(placeId)) {
    return { ...save, player: { ...save.player, missionProgress: progress } };
  }

  const reachedWaypointIds = [...progress.reachedWaypointIds, placeId];
  const complete = reachedWaypointIds.length >= mission.waypoints.length;
  const nextProgress: MissionProgress = {
    ...progress,
    activeWaypointIndex: complete ? progress.activeWaypointIndex : progress.activeWaypointIndex + 1,
    reachedWaypointIds,
    completedAt: complete ? now : undefined,
  };

  if (!complete) {
    return { ...save, player: { ...save.player, missionProgress: nextProgress } };
  }

  const reward = missionReward(mission, save.completedMissionIds.includes(mission.id));
  return {
    ...save,
    career: { ...save.career, coins: save.career.coins + reward.coins },
    player: {
      ...save.player,
      xp: save.player.xp + reward.xp,
      badges: mission.reward.badge && !save.player.badges.includes(mission.reward.badge) ? [...save.player.badges, mission.reward.badge] : save.player.badges,
      missionProgress: nextProgress,
    },
    completedMissionIds: save.completedMissionIds.includes(mission.id) ? save.completedMissionIds : [...save.completedMissionIds, mission.id],
    unlockedVehicles:
      mission.reward.unlockVehicle && !save.unlockedVehicles.includes(mission.reward.unlockVehicle)
        ? [...save.unlockedVehicles, mission.reward.unlockVehicle]
        : save.unlockedVehicles,
  };
}

// Replays pay a quarter of the first-clear reward so missions stay worth re-running for best times.
export function missionReward(mission: Mission, alreadyCompleted: boolean): { xp: number; coins: number } {
  const coins = mission.reward.coins ?? Math.round(mission.reward.xp / 3);
  if (!alreadyCompleted) return { xp: mission.reward.xp, coins };
  return { xp: Math.round(mission.reward.xp * 0.25), coins: Math.round(coins * 0.25) };
}

export function startMission(save: SaveGame, mission: Mission, now = performance.now()): SaveGame {
  return {
    ...save,
    player: {
      ...save.player,
      activeMissionId: mission.id,
      missionProgress: { missionId: mission.id, activeWaypointIndex: 0, reachedWaypointIds: [], startedAt: now },
    },
  };
}

export function isMissionComplete(save: SaveGame, mission: Mission): boolean {
  const progress = save.player.missionProgress;
  return progress?.missionId === mission.id && progress.completedAt !== undefined;
}
