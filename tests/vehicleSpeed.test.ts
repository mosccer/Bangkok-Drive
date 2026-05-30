import { describe, expect, it } from "vitest";
import { vehicleDefinitions } from "../src/data/vehicles";
import { VehicleController } from "../src/simulation/VehicleController";
import { mpsToKmh } from "../src/simulation/speed";
import type { InputActions } from "../src/types";

const blankActions = (): InputActions => ({
  accelerate: false,
  brake: false,
  steerLeft: false,
  steerRight: false,
  handbrake: false,
  boost: false,
  pause: false,
});

function run(controller: VehicleController, seconds: number, actions: InputActions): number {
  const dt = 1 / 60;
  for (let time = 0; time < seconds; time += dt) {
    controller.update(dt, actions);
  }
  return mpsToKmh(controller.state.speed);
}

describe("vehicle 120 km/h handling", () => {
  it("lets every car reach at least 118 km/h under sustained acceleration", () => {
    for (const vehicle of vehicleDefinitions) {
      const controller = new VehicleController();
      controller.setVehicle(vehicle);
      const speed = run(controller, 8, { ...blankActions(), accelerate: true });
      expect(speed, vehicle.id).toBeGreaterThanOrEqual(118);
      expect(speed, vehicle.id).toBeLessThanOrEqual(120.1);
    }
  });

  it("brakes down from high speed", () => {
    const controller = new VehicleController();
    run(controller, 8, { ...blankActions(), accelerate: true });
    const beforeBrake = mpsToKmh(controller.state.speed);
    const afterBrake = run(controller, 1.5, { ...blankActions(), brake: true });
    expect(afterBrake).toBeLessThan(beforeBrake - 35);
  });

  it("boost improves acceleration without exceeding the 120 km/h cap", () => {
    const normal = new VehicleController();
    const boosted = new VehicleController();
    const normalSpeed = run(normal, 2.5, { ...blankActions(), accelerate: true });
    const boostedSpeed = run(boosted, 2.5, { ...blankActions(), accelerate: true, boost: true });
    const boostedTop = run(boosted, 8, { ...blankActions(), accelerate: true, boost: true });
    expect(boostedSpeed).toBeGreaterThan(normalSpeed);
    expect(boostedTop).toBeLessThanOrEqual(120.1);
  });
});
