import type { SaveGame } from "../types";
import { getUpgradeLevels, isFullyUpgraded } from "./upgrades";

export interface AchievementDefinition {
  id: string;
  title: string;
  titleTh: string;
  description: string;
  rewardCoins: number;
  isUnlocked: (save: SaveGame) => boolean;
}

export const achievementDefinitions: AchievementDefinition[] = [
  {
    id: "first-drift",
    title: "Sideways in Siam",
    titleTh: "ดริฟต์ครั้งแรก",
    description: "Bank a 500 point drift",
    rewardCoins: 60,
    isUnlocked: (save) => save.career.stats.bestDrift >= 500,
  },
  {
    id: "drift-king",
    title: "Drift King of Sukhumvit",
    titleTh: "ราชาดริฟต์",
    description: "Bank a 5,000 point drift",
    rewardCoins: 300,
    isUnlocked: (save) => save.career.stats.bestDrift >= 5_000,
  },
  {
    id: "coin-collector",
    title: "Coin Collector",
    titleTh: "นักสะสมเหรียญ",
    description: "Pick up 50 road coins",
    rewardCoins: 80,
    isUnlocked: (save) => save.career.stats.coinsCollected >= 50,
  },
  {
    id: "coin-tycoon",
    title: "Yaowarat Tycoon",
    titleTh: "เจ้าสัวเยาวราช",
    description: "Pick up 500 road coins",
    rewardCoins: 400,
    isUnlocked: (save) => save.career.stats.coinsCollected >= 500,
  },
  {
    id: "traffic-weaver",
    title: "Traffic Weaver",
    titleTh: "เซียนแซงรถ",
    description: "Score 5 near misses",
    rewardCoins: 80,
    isUnlocked: (save) => save.career.stats.nearMisses >= 5,
  },
  {
    id: "rush-hour-hero",
    title: "Rush Hour Hero",
    titleTh: "ฮีโร่ชั่วโมงเร่งด่วน",
    description: "Score 50 near misses",
    rewardCoins: 350,
    isUnlocked: (save) => save.career.stats.nearMisses >= 50,
  },
  {
    id: "top-speed",
    title: "Expressway Legend",
    titleTh: "ตำนานทางด่วน",
    description: "Hit 120 km/h",
    rewardCoins: 50,
    isUnlocked: (save) => save.career.stats.topSpeedKmh >= 119.5,
  },
  {
    id: "road-trip",
    title: "Bangkok Road Trip",
    titleTh: "ขับเที่ยวกรุงเทพ",
    description: "Drive 10 km",
    rewardCoins: 120,
    isUnlocked: (save) => save.career.stats.distanceMeters >= 10_000,
  },
  {
    id: "marathon",
    title: "Bangkok Marathon",
    titleTh: "มาราธอนกรุงเทพ",
    description: "Drive 42.195 km",
    rewardCoins: 500,
    isUnlocked: (save) => save.career.stats.distanceMeters >= 42_195,
  },
  {
    id: "explorer-10",
    title: "City Explorer",
    titleTh: "นักสำรวจเมือง",
    description: "Discover 10 places",
    rewardCoins: 150,
    isUnlocked: (save) => save.discoveredPlaceIds.length >= 10,
  },
  {
    id: "mission-3",
    title: "Tour Operator",
    titleTh: "ไกด์มืออาชีพ",
    description: "Complete 3 missions",
    rewardCoins: 200,
    isUnlocked: (save) => save.completedMissionIds.length >= 3,
  },
  {
    id: "fully-tuned",
    title: "Fully Tuned",
    titleTh: "แต่งเต็มระบบ",
    description: "Max every upgrade on one car",
    rewardCoins: 250,
    isUnlocked: (save) => Object.keys(save.vehicleUpgrades).some((vehicleId) => isFullyUpgraded(getUpgradeLevels(save, vehicleId))),
  },
];

export function newlyUnlockedAchievements(save: SaveGame): AchievementDefinition[] {
  const owned = new Set(save.career.achievements);
  return achievementDefinitions.filter((achievement) => !owned.has(achievement.id) && achievement.isUnlocked(save));
}

export function grantAchievements(save: SaveGame, achievements: AchievementDefinition[]): SaveGame {
  if (!achievements.length) return save;
  return {
    ...save,
    career: {
      ...save.career,
      coins: save.career.coins + achievements.reduce((sum, achievement) => sum + achievement.rewardCoins, 0),
      achievements: [...save.career.achievements, ...achievements.map((achievement) => achievement.id)],
    },
  };
}
