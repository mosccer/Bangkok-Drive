import { describe, expect, it } from "vitest";
import {
  createSpeedEffectState,
  createVehicleVisualState,
  defaultArcadeVisualSettings,
  getSpeedIntensity,
} from "../src/render/arcadeVisuals";
import { getRenderQualityProfile } from "../src/render/quality";
import type { InputActions, VehicleState } from "../src/types";

const actions = (overrides: Partial<InputActions> = {}): InputActions => ({
  accelerate: false,
  brake: false,
  steerLeft: false,
  steerRight: false,
  handbrake: false,
  boost: false,
  pause: false,
  ...overrides,
});

const vehicle = (speed: number, inputActions: InputActions): VehicleState => ({
  position: { x: 0, y: 0.8, z: 0 },
  rotation: 0,
  speed,
  gearMode: "drive",
  damage: 0,
  traction: 1,
  inputActions,
});

describe("arcade visual effects", () => {
  it("maps speed to a normalized 120 km/h intensity", () => {
    expect(getSpeedIntensity(0)).toBe(0);
    expect(getSpeedIntensity(120 / 3.6)).toBe(1);
    expect(getSpeedIntensity(160 / 3.6)).toBe(1);
  });

  it("creates boost and brake vehicle visual state from input", () => {
    const visual = createVehicleVisualState(
      vehicle(90 / 3.6, actions({ accelerate: true, boost: true, brake: true })),
      1 / 60,
      getRenderQualityProfile("medium"),
    );

    expect(visual.speedKmh).toBeCloseTo(90);
    expect(visual.boostIntensity).toBeGreaterThan(0);
    expect(visual.brakeIntensity).toBe(1);
    expect(Math.abs(visual.wheelSpinDelta)).toBeGreaterThan(0);
  });

  it("keeps low quality from spawning boost trails and skid marks", () => {
    const visual = createVehicleVisualState(
      vehicle(100 / 3.6, actions({ accelerate: true, boost: true, handbrake: true })),
      1 / 60,
      getRenderQualityProfile("low"),
    );

    expect(visual.boostIntensity).toBe(0);
    expect(visual.skidIntensity).toBe(0);
  });

  it("disables FOV and shake when reduce motion is on", () => {
    const profile = getRenderQualityProfile("high");
    const vehicleVisual = createVehicleVisualState(
      vehicle(120 / 3.6, actions({ accelerate: true, boost: true })),
      1 / 60,
      profile,
    );
    const speedEffect = createSpeedEffectState(64, vehicleVisual, profile, {
      ...defaultArcadeVisualSettings,
      reduceMotion: true,
    });

    expect(speedEffect.fov).toBe(64);
    expect(speedEffect.shake).toBe(0);
    expect(speedEffect.streakOpacity).toBe(0);
  });
});
