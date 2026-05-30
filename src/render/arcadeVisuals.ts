import type { ArcadeVisualSettings, RenderQualityProfile, SaveGame, SpeedEffectState, VehicleState, VehicleVisualState } from "../types";

const DEFAULT_TOP_SPEED_KMH = 120;
const WHEEL_RADIUS_METERS = 0.36;

export const defaultArcadeVisualSettings: ArcadeVisualSettings = {
  visualMood: "day_festival",
  cameraShake: true,
  speedEffects: true,
  reduceMotion: false,
};

export function buildArcadeVisualSettings(settings: SaveGame["settings"]): ArcadeVisualSettings {
  return {
    visualMood: settings.visualMood,
    cameraShake: settings.cameraShake,
    speedEffects: settings.speedEffects,
    reduceMotion: settings.reduceMotion,
  };
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function getSpeedIntensity(speedMps: number, topSpeedKmh = DEFAULT_TOP_SPEED_KMH): number {
  return clamp01((Math.abs(speedMps) * 3.6) / topSpeedKmh);
}

export function createVehicleVisualState(
  vehicle: VehicleState,
  dt: number,
  quality: RenderQualityProfile,
  topSpeedKmh = DEFAULT_TOP_SPEED_KMH,
): VehicleVisualState {
  const speedKmh = Math.abs(vehicle.speed) * 3.6;
  const speedIntensity = getSpeedIntensity(vehicle.speed, topSpeedKmh);
  const boostIntent = vehicle.inputActions.boost && vehicle.inputActions.accelerate && Math.abs(vehicle.speed) > 8;
  const skidIntent = vehicle.inputActions.handbrake && Math.abs(vehicle.speed) > 7;

  return {
    speedKmh,
    speedIntensity,
    boostIntensity: quality.useBoostTrails && boostIntent ? clamp01(0.35 + speedIntensity * 0.75) : 0,
    brakeIntensity: vehicle.inputActions.brake ? 1 : 0,
    skidIntensity: quality.useSkidMarks && skidIntent ? clamp01(0.2 + speedIntensity * 0.85) : 0,
    wheelSpinDelta: (vehicle.speed * dt) / WHEEL_RADIUS_METERS,
  };
}

export function createSpeedEffectState(
  baseFov: number,
  vehicleVisual: VehicleVisualState,
  quality: RenderQualityProfile,
  settings: ArcadeVisualSettings,
): SpeedEffectState {
  const effectsEnabled = quality.useSpeedEffects && settings.speedEffects && !settings.reduceMotion;
  if (!effectsEnabled) {
    return { fov: baseFov, shake: 0, streakOpacity: 0, boostGlow: 0 };
  }

  const highSpeed = clamp01((vehicleVisual.speedIntensity - 0.58) / 0.42);
  const boostGlow = vehicleVisual.boostIntensity;
  const shake = settings.cameraShake ? clamp01(highSpeed * 0.42 + boostGlow * 0.58) : 0;

  return {
    fov: baseFov + highSpeed * 7 + boostGlow * 3,
    shake,
    streakOpacity: highSpeed * (quality.usePostEffects ? 0.58 : 0.38),
    boostGlow,
  };
}
