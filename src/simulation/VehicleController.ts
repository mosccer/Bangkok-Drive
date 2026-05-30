import { getVehicleDefinition } from "../data/vehicles";
import type { InputActions, VehicleDefinition, VehicleState } from "../types";
import { kmhToMps } from "./speed";

export class VehicleController {
  private vehicleDefinition = getVehicleDefinition("krung-compact");
  readonly state: VehicleState = {
    position: { x: -330, y: 0.8, z: -90 },
    rotation: Math.PI / 2,
    speed: 0,
    gearMode: "drive",
    damage: 0,
    traction: 1,
    inputActions: {
      accelerate: false,
      brake: false,
      steerLeft: false,
      steerRight: false,
      handbrake: false,
      boost: false,
      pause: false,
    },
  };

  setVehicle(definition: VehicleDefinition): void {
    this.vehicleDefinition = definition;
  }

  teleportLocal(x: number, z: number, rotation = this.state.rotation, speed = 0): VehicleState {
    this.state.position.x = x;
    this.state.position.z = z;
    this.state.rotation = rotation;
    this.state.speed = speed;
    this.state.gearMode = Math.abs(speed) < 0.2 ? "neutral" : speed < 0 ? "reverse" : "drive";
    return this.state;
  }

  update(dt: number, input: InputActions): VehicleState {
    this.state.inputActions = input;
    const forward = input.accelerate ? 1 : 0;
    const reverseIntent = input.brake && this.state.speed < 0.35 ? 1 : 0;
    const boostMultiplier = input.boost && this.state.speed > 8 ? 1.22 : 1;
    const maxForwardSpeed = kmhToMps(this.vehicleDefinition.stats.maxSpeedKmh);
    const maxReverseSpeed = 9;

    if (forward) {
      this.state.speed += this.vehicleDefinition.stats.accelerationMps2 * boostMultiplier * dt;
    } else if (input.brake && this.state.speed > 0.35) {
      this.state.speed -= this.vehicleDefinition.stats.brakeMps2 * dt;
    } else if (reverseIntent) {
      this.state.speed -= this.vehicleDefinition.stats.accelerationMps2 * 0.46 * dt;
    } else {
      const rollingDrag = 1.25 + this.vehicleDefinition.stats.mass / 2800;
      this.state.speed -= Math.sign(this.state.speed) * Math.min(Math.abs(this.state.speed), rollingDrag * dt);
    }

    this.state.speed = Math.max(-maxReverseSpeed, Math.min(maxForwardSpeed, this.state.speed));

    this.state.traction = input.handbrake ? this.vehicleDefinition.stats.drift : this.vehicleDefinition.stats.grip;
    const steer = (input.steerLeft ? 1 : 0) - (input.steerRight ? 1 : 0);
    const steerStrength = Math.min(1, Math.abs(this.state.speed) / 16) * this.state.traction;
    this.state.rotation += steer * steerStrength * dt * 2.4;

    this.state.position.x += Math.sin(this.state.rotation) * this.state.speed * dt;
    this.state.position.z += Math.cos(this.state.rotation) * this.state.speed * dt;
    this.state.gearMode = this.state.speed < -0.4 ? "reverse" : Math.abs(this.state.speed) < 0.2 ? "neutral" : "drive";

    return this.state;
  }
}
