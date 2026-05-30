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

  return {
    ...save,
    player: {
      ...save.player,
      xp: save.player.xp + mission.reward.xp,
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
