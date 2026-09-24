import { describe, expect, it } from "vitest";
import { levelForXp, levelProgress, xpForLevel } from "../src/simulation/progression";

describe("player levels", () => {
  it("uses a growing XP curve", () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(250);
    expect(xpForLevel(3)).toBe(750);
    expect(xpForLevel(4)).toBe(1500);
  });

  it("finds the level and progress for an XP total", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(249)).toBe(1);
    expect(levelForXp(250)).toBe(2);
    const progress = levelProgress(500);
    expect(progress.level).toBe(2);
    expect(progress.fraction).toBeCloseTo(0.5);
  });
});
