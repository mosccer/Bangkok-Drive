import { describe, expect, it } from "vitest";
import { grantAchievements, newlyUnlockedAchievements } from "../src/simulation/achievements";
import { recordBestTime } from "../src/simulation/career";
import { advanceDailyChallenges, ensureDailyChallenges, generateDailyChallenges } from "../src/simulation/dailyChallenges";
import { formatRaceTime, isMissionTimerExpired, startMissionTimer, tickMissionTimer, addMissionPenalty } from "../src/simulation/missionTimer";
import { defaultSaveGame, loadSave } from "../src/simulation/saveGame";
import { applyUpgrades, getUpgradeLevels, purchaseUpgrade } from "../src/simulation/upgrades";
import { getVehicleDefinition } from "../src/data/vehicles";
import type { Mission, SaveGame } from "../src/types";

const withCoins = (coins: number): SaveGame => ({ ...structuredClone(defaultSaveGame), career: { ...structuredClone(defaultSaveGame.career), coins } });

describe("garage upgrades", () => {
  it("buys upgrades with coins and caps at level 3", () => {
    let save = withCoins(5_000);
    for (let i = 0; i < 3; i += 1) {
      const result = purchaseUpgrade(save, "krung-compact", "engine");
      expect(result.ok).toBe(true);
      save = result.save;
    }
    expect(getUpgradeLevels(save, "krung-compact").engine).toBe(3);
    expect(save.career.coins).toBe(5_000 - 150 - 350 - 700);
    const maxed = purchaseUpgrade(save, "krung-compact", "engine");
    expect(maxed.ok).toBe(false);
  });

  it("refuses purchases without enough coins", () => {
    const result = purchaseUpgrade(withCoins(10), "krung-compact", "handling");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_enough_coins");
  });

  it("improves acceleration and grip without raising the 120 km/h cap", () => {
    const base = getVehicleDefinition("krung-compact").stats;
    const tuned = applyUpgrades(base, { engine: 3, handling: 3, nitro: 0 });
    expect(tuned.accelerationMps2).toBeGreaterThan(base.accelerationMps2);
    expect(tuned.grip).toBeGreaterThan(base.grip);
    expect(tuned.maxSpeedKmh).toBe(120);
  });
});

describe("achievements", () => {
  it("unlocks once and pays coins", () => {
    const save = withCoins(0);
    const drifted: SaveGame = { ...save, career: { ...save.career, stats: { ...save.career.stats, bestDrift: 600 } } };
    const unlocked = newlyUnlockedAchievements(drifted);
    expect(unlocked.map((achievement) => achievement.id)).toContain("first-drift");
    const granted = grantAchievements(drifted, unlocked);
    expect(granted.career.coins).toBeGreaterThan(0);
    expect(newlyUnlockedAchievements(granted)).toHaveLength(0);
  });
});

describe("daily challenges", () => {
  it("generates the same three challenges for a date", () => {
    const a = generateDailyChallenges("2026-09-24");
    const b = generateDailyChallenges("2026-09-24");
    expect(a).toEqual(b);
    expect(a.challenges).toHaveLength(3);
    expect(new Set(a.challenges.map((challenge) => challenge.kind)).size).toBe(3);
  });

  it("rolls over on a new day and completes on progress", () => {
    const today = ensureDailyChallenges(undefined, "2026-09-24");
    expect(ensureDailyChallenges(today, "2026-09-24")).toBe(today);
    expect(ensureDailyChallenges(today, "2026-09-25").date).toBe("2026-09-25");
    const challenge = today.challenges[0];
    const result = advanceDailyChallenges(today, challenge.kind, challenge.target);
    expect(result.completed.map((item) => item.id)).toEqual([challenge.id]);
    expect(advanceDailyChallenges(result.state, challenge.kind, 5).completed).toHaveLength(0);
  });
});

describe("mission timer", () => {
  const mission = { timeLimit: 60 } as Mission;

  it("expires after the limit including fast travel penalties", () => {
    let timer = startMissionTimer("m");
    timer = tickMissionTimer(timer, 45);
    expect(isMissionTimerExpired(timer, mission)).toBe(false);
    timer = addMissionPenalty(timer, 20);
    expect(isMissionTimerExpired(timer, mission)).toBe(true);
  });

  it("formats race times", () => {
    expect(formatRaceTime(83.45)).toBe("1:23.5");
    expect(formatRaceTime(5)).toBe("0:05.0");
  });

  it("only records improved best times", () => {
    const first = recordBestTime(withCoins(0), "m", 90_000);
    expect(first.improved).toBe(true);
    expect(recordBestTime(first.save, "m", 95_000).improved).toBe(false);
    expect(recordBestTime(first.save, "m", 80_000).save.career.bestTimesMs.m).toBe(80_000);
  });
});

describe("save migration", () => {
  it("fills career defaults for saves written before the career update", () => {
    const storage = new Map<string, string>();
    const legacy = { ...defaultSaveGame } as Partial<SaveGame>;
    delete legacy.career;
    delete legacy.vehicleUpgrades;
    storage.set("mosgame.save.v1", JSON.stringify(legacy));
    const loaded = loadSave({ getItem: (key: string) => storage.get(key) ?? null } as Storage);
    expect(loaded.career.coins).toBe(0);
    expect(loaded.career.stats.nearMisses).toBe(0);
    expect(loaded.vehicleUpgrades).toEqual({});
    expect(loaded.settings.cameraMode).toBe("chase");
  });
});
