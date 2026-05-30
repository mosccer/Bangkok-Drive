import { describe, expect, it } from "vitest";
import { minimapWorldToScreen } from "../src/ui/Hud";
import type { VehicleState } from "../src/types";

const vehicle = (rotation: number): Pick<VehicleState, "position" | "rotation"> => ({
  position: { x: 0, y: 0.8, z: 0 },
  rotation,
});

describe("minimap heading-up projection", () => {
  it("puts a point in front of a north-facing vehicle above center", () => {
    const point = minimapWorldToScreen(vehicle(0), { x: 0, z: 100 }, 360, 360);
    expect(point.x).toBeCloseTo(180);
    expect(point.y).toBeLessThan(180);
  });

  it("puts a point in front of an east-facing vehicle above center", () => {
    const point = minimapWorldToScreen(vehicle(Math.PI / 2), { x: 100, z: 0 }, 360, 360);
    expect(point.x).toBeCloseTo(180);
    expect(point.y).toBeLessThan(180);
  });

  it("puts a point on the vehicle right side to the right of center", () => {
    const point = minimapWorldToScreen(vehicle(0), { x: 100, z: 0 }, 360, 360);
    expect(point.x).toBeGreaterThan(180);
    expect(point.y).toBeCloseTo(180);
  });
});
