import { describe, expect, it } from "vitest";
import { initialGraphicsQuality, isLowEndDevice } from "../src/platform/device";

describe("device defaults", () => {
  it("detects low-end phones from cores or memory", () => {
    expect(isLowEndDevice({ hardwareConcurrency: 4 })).toBe(true);
    expect(isLowEndDevice({ deviceMemory: 2 })).toBe(true);
    expect(isLowEndDevice({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe(false);
    expect(isLowEndDevice({})).toBe(false);
  });

  it("starts low-end phones on low quality and everything else on medium", () => {
    expect(initialGraphicsQuality(true, { hardwareConcurrency: 4 })).toBe("low");
    expect(initialGraphicsQuality(true, { hardwareConcurrency: 8 })).toBe("medium");
    expect(initialGraphicsQuality(false, { hardwareConcurrency: 2 })).toBe("medium");
  });
});
