import type { DriverStats, SaveGame } from "../types";

export function addRewards(save: SaveGame, rewards: { xp?: number; coins?: number }): SaveGame {
  return {
    ...save,
    player: { ...save.player, xp: save.player.xp + Math.max(0, Math.floor(rewards.xp ?? 0)) },
    career: { ...save.career, coins: save.career.coins + Math.max(0, Math.floor(rewards.coins ?? 0)) },
  };
}

export function addStat(save: SaveGame, key: keyof DriverStats, amount: number): SaveGame {
  return { ...save, career: { ...save.career, stats: { ...save.career.stats, [key]: save.career.stats[key] + amount } } };
}

export function maxStat(save: SaveGame, key: keyof DriverStats, value: number): SaveGame {
  if (value <= save.career.stats[key]) return save;
  return { ...save, career: { ...save.career, stats: { ...save.career.stats, [key]: value } } };
}

export function recordBestTime(save: SaveGame, missionId: string, timeMs: number): { save: SaveGame; improved: boolean } {
  const previous = save.career.bestTimesMs[missionId];
  if (previous !== undefined && previous <= timeMs) return { save, improved: false };
  return {
    save: { ...save, career: { ...save.career, bestTimesMs: { ...save.career.bestTimesMs, [missionId]: Math.round(timeMs) } } },
    improved: true,
  };
}
