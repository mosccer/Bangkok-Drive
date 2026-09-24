const LEVEL_XP_STEP = 250;
export const MAX_LEVEL = 50;

export interface LevelProgress {
  level: number;
  levelStartXp: number;
  nextLevelXp: number;
  fraction: number;
}

// Total XP required to reach `level` (level 1 starts at 0 XP): 250, 750, 1500, 2500...
export function xpForLevel(level: number): number {
  const clamped = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return (LEVEL_XP_STEP * (clamped - 1) * clamped) / 2;
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) {
    level += 1;
  }
  return level;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelForXp(xp);
  const levelStartXp = xpForLevel(level);
  const nextLevelXp = level >= MAX_LEVEL ? levelStartXp : xpForLevel(level + 1);
  const span = Math.max(1, nextLevelXp - levelStartXp);
  return {
    level,
    levelStartXp,
    nextLevelXp,
    fraction: level >= MAX_LEVEL ? 1 : Math.max(0, Math.min(1, (xp - levelStartXp) / span)),
  };
}

export function levelUpCoinBonus(level: number): number {
  return 50 + level * 25;
}
