import { describe, expect, it } from "vitest";
import { getRenderQualityProfile } from "../src/render/quality";

describe("render quality profiles", () => {
  it("enables post effects for medium and high desktop profiles", () => {
    expect(getRenderQualityProfile("medium").usePostEffects).toBe(true);
    expect(getRenderQualityProfile("high").usePostEffects).toBe(true);
  });

  it("keeps low and mobile profiles lighter", () => {
    expect(getRenderQualityProfile("low").usePostEffects).toBe(false);
    expect(getRenderQualityProfile("low").useBoostTrails).toBe(false);
    expect(getRenderQualityProfile("low").useSkidMarks).toBe(false);
    expect(getRenderQualityProfile("medium", true).quality).toBe("medium");
    expect(getRenderQualityProfile("medium", true).usePostEffects).toBe(false);
    expect(getRenderQualityProfile("medium", true).useBoostTrails).toBe(true);
    expect(getRenderQualityProfile("high").pixelRatioCap).toBeGreaterThan(getRenderQualityProfile("low").pixelRatioCap);
  });

  it("enables the full arcade effects stack on high quality", () => {
    const high = getRenderQualityProfile("high");
    expect(high.useSpeedEffects).toBe(true);
    expect(high.useBoostTrails).toBe(true);
    expect(high.useSkidMarks).toBe(true);
    expect(high.useEnhancedMaterials).toBe(true);
  });
});
