import { describe, expect, it } from "vitest";
import { createDriftState, driftRewards, updateDrift } from "../src/simulation/drift";
import { addNitro, createNitroState, nitroTuningForLevel, updateNitro } from "../src/simulation/nitro";

const tuning = nitroTuningForLevel(0);
const boosting = { wantsBoost: true, accelerating: true, speedMps: 20, drifting: false };

describe("nitro gauge", () => {
  it("drains while boosting and locks out when empty", () => {
    let state = createNitroState(0.05);
    let active = false;
    for (let i = 0; i < 60; i += 1) {
      ({ state, active } = updateNitro(state, 1 / 30, boosting, tuning));
    }
    expect(state.charge).toBeLessThan(0.2);
    expect(state.locked).toBe(true);
    expect(active).toBe(false);
  });

  it("does not boost below the minimum speed", () => {
    const result = updateNitro(createNitroState(1), 0.1, { ...boosting, speedMps: 2 }, tuning);
    expect(result.active).toBe(false);
  });

  it("recharges faster while drifting and unlocks after pickups", () => {
    const idle = updateNitro(createNitroState(0.5), 1, { ...boosting, wantsBoost: false }, tuning).state;
    const drifting = updateNitro(createNitroState(0.5), 1, { ...boosting, wantsBoost: false, drifting: true }, tuning).state;
    expect(drifting.charge).toBeGreaterThan(idle.charge);
    expect(addNitro({ charge: 0, locked: true }, 0.35)).toEqual({ charge: 0.35, locked: false });
  });
});

describe("drift scoring", () => {
  const drift = { handbrake: true, steering: true, speedMps: 20 };
  const straight = { handbrake: false, steering: false, speedMps: 20 };

  it("builds a multiplier over a long drift and banks after the grace window", () => {
    let state = createDriftState();
    for (let i = 0; i < 60 * 4; i += 1) state = updateDrift(state, 1 / 60, drift).state;
    expect(state.multiplier).toBeGreaterThanOrEqual(3);
    let banked: { points: number } | undefined;
    for (let i = 0; i < 60 && !banked; i += 1) {
      const result = updateDrift(state, 1 / 60, straight);
      state = result.state;
      banked = result.banked;
    }
    expect(banked?.points).toBeGreaterThan(500);
    expect(state.active).toBe(false);
  });

  it("keeps the chain alive through a short straighten-up", () => {
    let state = createDriftState();
    for (let i = 0; i < 30; i += 1) state = updateDrift(state, 1 / 60, drift).state;
    const scoreBefore = state.score;
    for (let i = 0; i < 20; i += 1) state = updateDrift(state, 1 / 60, straight).state;
    expect(state.active).toBe(true);
    for (let i = 0; i < 30; i += 1) state = updateDrift(state, 1 / 60, drift).state;
    expect(state.score).toBeGreaterThan(scoreBefore);
  });

  it("converts points into XP and coins", () => {
    expect(driftRewards(1_000)).toEqual({ xp: 20, coins: 10 });
  });
});
