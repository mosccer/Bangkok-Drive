import type { GraphicsQuality, RenderQualityProfile } from "../types";

export function getRenderQualityProfile(quality: GraphicsQuality, mobile = false): RenderQualityProfile {
  if (quality === "low") {
    return {
      quality: "low",
      pixelRatioCap: 1.15,
      shadowMapSize: 1024,
      toneMappingExposure: 1.02,
      drawDistance: 620,
      usePostEffects: false,
      useHighDetailMaterials: false,
      useSpeedEffects: true,
      useBoostTrails: false,
      useSkidMarks: false,
      useEnhancedMaterials: false,
    };
  }

  if (mobile && quality !== "high") {
    return {
      quality: "medium",
      pixelRatioCap: 1.2,
      shadowMapSize: 1024,
      toneMappingExposure: 1.06,
      drawDistance: 680,
      usePostEffects: false,
      useHighDetailMaterials: false,
      useSpeedEffects: true,
      useBoostTrails: true,
      useSkidMarks: true,
      useEnhancedMaterials: false,
    };
  }

  if (quality === "high") {
    return {
      quality: "high",
      pixelRatioCap: 2,
      shadowMapSize: 2048,
      toneMappingExposure: 1.18,
      drawDistance: 980,
      usePostEffects: true,
      useHighDetailMaterials: true,
      useSpeedEffects: true,
      useBoostTrails: true,
      useSkidMarks: true,
      useEnhancedMaterials: true,
    };
  }

  return {
    quality: "medium",
    pixelRatioCap: 1.55,
    shadowMapSize: 1536,
    toneMappingExposure: 1.1,
    drawDistance: 780,
    usePostEffects: true,
    useHighDetailMaterials: true,
    useSpeedEffects: true,
    useBoostTrails: true,
    useSkidMarks: true,
    useEnhancedMaterials: true,
  };
}
