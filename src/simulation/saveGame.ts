import type { DriverStats, SaveGame } from "../types";

const KEY = "mosgame.save.v1";

export const defaultDriverStats: DriverStats = {
  distanceMeters: 0,
  topSpeedKmh: 0,
  coinsCollected: 0,
  nearMisses: 0,
  crashes: 0,
  bestDrift: 0,
  totalDrift: 0,
  fastTravels: 0,
};

export const defaultSaveGame: SaveGame = {
  player: {
    xp: 0,
    badges: [],
    activeMissionId: "royal-island-tour",
    discoveryDailyXpByDistrict: {},
    missionProgress: {
      missionId: "royal-island-tour",
      activeWaypointIndex: 0,
      reachedWaypointIds: [],
      startedAt: 0,
    },
  },
  career: {
    coins: 0,
    stats: defaultDriverStats,
    achievements: [],
    bestTimesMs: {},
  },
  activeVehicleId: "krung-compact",
  unlockedVehicles: ["krung-compact"],
  vehicleUpgrades: {},
  vehiclePaint: {},
  discoveredPlaceIds: [],
  completedMissionIds: [],
  settings: {
    graphicsQuality: "medium",
    mapScaleMode: "real_1_1",
    visualMood: "day_festival",
    cameraShake: true,
    speedEffects: true,
    reduceMotion: false,
    soundEnabled: true,
    cameraMode: "chase",
    playerName: "",
    multiplayerRoom: "bangkok",
    units: "metric",
  },
};

export function loadSave(storage: Storage = localStorage): SaveGame {
  const raw = storage.getItem(KEY);
  if (!raw) {
    return structuredClone(defaultSaveGame);
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SaveGame>;
    const migratedUnlockedVehicles = (parsed.unlockedVehicles ?? defaultSaveGame.unlockedVehicles).map((id) =>
      id === "bkk-starter" ? "krung-compact" : id,
    );
    if (!migratedUnlockedVehicles.includes("krung-compact")) {
      migratedUnlockedVehicles.unshift("krung-compact");
    }
    const activeVehicleId =
      parsed.activeVehicleId === "bkk-starter" ? "krung-compact" : parsed.activeVehicleId ?? migratedUnlockedVehicles[0] ?? defaultSaveGame.activeVehicleId;
    return {
      ...structuredClone(defaultSaveGame),
      ...parsed,
      player: { ...defaultSaveGame.player, ...parsed.player },
      career: {
        ...structuredClone(defaultSaveGame.career),
        ...parsed.career,
        stats: { ...defaultDriverStats, ...parsed.career?.stats },
      },
      vehicleUpgrades: { ...parsed.vehicleUpgrades },
      vehiclePaint: { ...parsed.vehiclePaint },
      settings: { ...defaultSaveGame.settings, ...parsed.settings },
      activeVehicleId,
      unlockedVehicles: migratedUnlockedVehicles,
    };
  } catch {
    return structuredClone(defaultSaveGame);
  }
}

export function saveGame(save: SaveGame, storage: Storage = localStorage): void {
  storage.setItem(KEY, JSON.stringify(save));
}

export function mergeCloudSave(local: SaveGame, cloud?: Partial<SaveGame>): SaveGame {
  if (!cloud) {
    return local;
  }

  const completedMissionIds = Array.from(new Set([...(local.completedMissionIds ?? []), ...(cloud.completedMissionIds ?? [])]));
  const discoveredPlaceIds = Array.from(new Set([...(local.discoveredPlaceIds ?? []), ...(cloud.discoveredPlaceIds ?? [])]));
  const unlockedVehicles = Array.from(new Set([...(local.unlockedVehicles ?? []), ...(cloud.unlockedVehicles ?? [])]));

  return {
    ...local,
    ...cloud,
    player: {
      ...local.player,
      ...cloud.player,
      xp: Math.max(local.player.xp, cloud.player?.xp ?? 0),
      badges: Array.from(new Set([...(local.player.badges ?? []), ...(cloud.player?.badges ?? [])])),
    },
    activeVehicleId: cloud.activeVehicleId ?? local.activeVehicleId,
    completedMissionIds,
    discoveredPlaceIds,
    unlockedVehicles,
    settings: { ...local.settings, ...cloud.settings },
  };
}
