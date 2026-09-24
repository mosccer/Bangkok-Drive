import type { SaveGame, UpgradeSlot, VehicleStats, VehicleUpgradeLevels } from "../types";

export const MAX_UPGRADE_LEVEL = 3;
export const upgradeSlots: UpgradeSlot[] = ["engine", "handling", "nitro"];
const UPGRADE_COSTS = [150, 350, 700];

export const upgradeLabels: Record<UpgradeSlot, { en: string; th: string }> = {
  engine: { en: "Engine", th: "เครื่องยนต์" },
  handling: { en: "Handling", th: "ช่วงล่าง" },
  nitro: { en: "Nitro", th: "ไนตรัส" },
};

export const paintPalette = ["#d92332", "#f97316", "#facc15", "#22c55e", "#06b6d4", "#3b82f6", "#a855f7", "#ec4899", "#f8fafc", "#111827"];

export function emptyUpgradeLevels(): VehicleUpgradeLevels {
  return { engine: 0, handling: 0, nitro: 0 };
}

export function getUpgradeLevels(save: Pick<SaveGame, "vehicleUpgrades">, vehicleId: string): VehicleUpgradeLevels {
  return { ...emptyUpgradeLevels(), ...save.vehicleUpgrades[vehicleId] };
}

export function upgradeCost(currentLevel: number): number | undefined {
  return currentLevel >= MAX_UPGRADE_LEVEL ? undefined : UPGRADE_COSTS[currentLevel];
}

// Top speed stays at the 120 km/h cap; upgrades change how fast and how well the car gets there.
export function applyUpgrades(stats: VehicleStats, levels: VehicleUpgradeLevels): VehicleStats {
  return {
    ...stats,
    accelerationMps2: stats.accelerationMps2 * (1 + levels.engine * 0.08),
    brakeMps2: stats.brakeMps2 * (1 + levels.handling * 0.06),
    grip: stats.grip * (1 + levels.handling * 0.05),
    drift: stats.drift * (1 + levels.handling * 0.06),
  };
}

export type UpgradePurchaseResult = { ok: true; save: SaveGame; cost: number } | { ok: false; save: SaveGame; reason: "max_level" | "not_enough_coins" };

export function purchaseUpgrade(save: SaveGame, vehicleId: string, slot: UpgradeSlot): UpgradePurchaseResult {
  const levels = getUpgradeLevels(save, vehicleId);
  const cost = upgradeCost(levels[slot]);
  if (cost === undefined) return { ok: false, save, reason: "max_level" };
  if (save.career.coins < cost) return { ok: false, save, reason: "not_enough_coins" };
  return {
    ok: true,
    cost,
    save: {
      ...save,
      career: { ...save.career, coins: save.career.coins - cost },
      vehicleUpgrades: { ...save.vehicleUpgrades, [vehicleId]: { ...levels, [slot]: levels[slot] + 1 } },
    },
  };
}

export function isFullyUpgraded(levels: VehicleUpgradeLevels): boolean {
  return upgradeSlots.every((slot) => levels[slot] >= MAX_UPGRADE_LEVEL);
}
