import type { WorldMeters } from "../types";
import { leftOf, yawForDirection, type WorldRoadSegment } from "./roadGeometry";

export interface TrafficCar {
  id: string;
  laneId: string;
  direction: 1 | -1;
  progress: number;
  speed: number;
  cruiseSpeed: number;
  x: number;
  z: number;
  yaw: number;
  colorIndex: number;
  stopSeconds: number;
  braking: boolean;
  closeCall: boolean;
  crashCooldown: number;
}

export interface TrafficPlayer {
  x: number;
  z: number;
  yaw: number;
  speed: number;
}

export type TrafficEvent = { kind: "crash"; carId: string; impactSpeed: number } | { kind: "near_miss"; carId: string };

export interface TrafficOptions {
  maxCars: number;
  spawnRadius: number;
  despawnRadius: number;
  minSpawnDistance: number;
}

export const CAR_COLLISION_DISTANCE = 3.3;
const NEAR_MISS_DISTANCE = 6.5;
const NEAR_MISS_RELEASE_DISTANCE = 9;
const NEAR_MISS_MIN_SPEED_MPS = 50 / 3.6;
const TRAFFIC_COLOR_COUNT = 8;

const defaultOptions: TrafficOptions = {
  maxCars: 16,
  spawnRadius: 380,
  despawnRadius: 480,
  minSpawnDistance: 70,
};

export class TrafficSystem {
  private lanes: WorldRoadSegment[] = [];
  private lanesById = new Map<string, WorldRoadSegment>();
  private endpoints = new Map<string, WorldRoadSegment[]>();
  private carList: TrafficCar[] = [];
  private nextId = 0;
  private spawnTimer = 0;
  private readonly options: TrafficOptions;

  constructor(
    private readonly random: () => number = Math.random,
    options: Partial<TrafficOptions> = {},
  ) {
    this.options = { ...defaultOptions, ...options };
  }

  get cars(): readonly TrafficCar[] {
    return this.carList;
  }

  setMaxCars(maxCars: number): void {
    this.options.maxCars = maxCars;
  }

  setRoads(segments: WorldRoadSegment[]): void {
    this.lanes = segments.filter((segment) => segment.kind !== "alley" && segment.kind !== "service" && segment.length >= 12);
    this.lanesById = new Map(this.lanes.map((lane) => [lane.id + "@" + lane.tileId, lane]));
    this.endpoints.clear();
    for (const lane of this.lanes) {
      for (const key of [endpointKey(lane.ax, lane.az), endpointKey(lane.bx, lane.bz)]) {
        const list = this.endpoints.get(key);
        if (list) list.push(lane);
        else this.endpoints.set(key, [lane]);
      }
    }
    this.carList = this.carList.filter((car) => this.lanesById.has(car.laneId));
  }

  clear(): void {
    this.carList = [];
  }

  update(dt: number, player: TrafficPlayer): TrafficEvent[] {
    const events: TrafficEvent[] = [];
    this.carList = this.carList.filter((car) => Math.hypot(car.x - player.x, car.z - player.z) <= this.options.despawnRadius);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.carList.length < this.options.maxCars && this.lanes.length) {
      this.spawnTimer = 0.2;
      this.trySpawn(player);
    }

    for (const car of this.carList) {
      this.driveCar(car, dt, player);
      events.push(...this.checkPlayerContact(car, player));
    }
    return events;
  }

  private trySpawn(player: TrafficPlayer): void {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const lane = this.lanes[Math.floor(this.random() * this.lanes.length)];
      const progress = this.random() * lane.length;
      const direction: 1 | -1 = this.random() < 0.5 ? 1 : -1;
      const position = lanePosition(lane, direction, progress);
      const distance = Math.hypot(position.x - player.x, position.z - player.z);
      if (distance < this.options.minSpawnDistance || distance > this.options.spawnRadius) continue;
      if (this.carList.some((car) => Math.hypot(car.x - position.x, car.z - position.z) < 18)) continue;
      const cruiseSpeed = cruiseSpeedFor(lane) * (0.85 + this.random() * 0.3);
      this.carList.push({
        id: `traffic-${this.nextId++}`,
        laneId: lane.id + "@" + lane.tileId,
        direction,
        progress,
        speed: cruiseSpeed,
        cruiseSpeed,
        x: position.x,
        z: position.z,
        yaw: position.yaw,
        colorIndex: Math.floor(this.random() * TRAFFIC_COLOR_COUNT),
        stopSeconds: 0,
        braking: false,
        closeCall: false,
        crashCooldown: 0,
      });
      return;
    }
  }

  private driveCar(car: TrafficCar, dt: number, player: TrafficPlayer): void {
    const lane = this.lanesById.get(car.laneId);
    if (!lane) return;
    car.crashCooldown = Math.max(0, car.crashCooldown - dt);
    let targetSpeed = car.cruiseSpeed;
    if (car.stopSeconds > 0) {
      car.stopSeconds -= dt;
      targetSpeed = 0;
    } else if (this.isBlocked(car, player)) {
      targetSpeed = 0;
    }
    const accel = targetSpeed < car.speed ? 9 : 3;
    car.speed += Math.sign(targetSpeed - car.speed) * Math.min(Math.abs(targetSpeed - car.speed), accel * dt);
    car.braking = targetSpeed < car.speed - 0.5 || (targetSpeed === 0 && car.speed < 0.5);
    car.progress += car.speed * dt;

    let current = lane;
    if (car.progress >= current.length) {
      const next = this.nextLane(current, car.direction);
      car.progress -= current.length;
      if (next) {
        current = next.lane;
        car.laneId = next.lane.id + "@" + next.lane.tileId;
        car.direction = next.direction;
      } else {
        car.direction = car.direction === 1 ? -1 : 1;
      }
      car.progress = Math.min(car.progress, current.length);
    }
    const position = lanePosition(current, car.direction, car.progress);
    car.x = position.x;
    car.z = position.z;
    car.yaw = position.yaw;
  }

  private isBlocked(car: TrafficCar, player: TrafficPlayer): boolean {
    const fx = Math.sin(car.yaw);
    const fz = Math.cos(car.yaw);
    const blockers: WorldMeters[] = [{ x: player.x, z: player.z }];
    for (const other of this.carList) {
      if (other !== car) blockers.push(other);
    }
    return blockers.some((blocker) => {
      const dx = blocker.x - car.x;
      const dz = blocker.z - car.z;
      const ahead = dx * fx + dz * fz;
      const lateral = Math.abs(dx * fz - dz * fx);
      return ahead > 0 && ahead < 11 && lateral < 2.6;
    });
  }

  private nextLane(lane: WorldRoadSegment, direction: 1 | -1): { lane: WorldRoadSegment; direction: 1 | -1 } | undefined {
    const endX = direction === 1 ? lane.bx : lane.ax;
    const endZ = direction === 1 ? lane.bz : lane.az;
    const options = (this.endpoints.get(endpointKey(endX, endZ)) ?? []).filter((candidate) => candidate !== lane);
    if (!options.length) return undefined;
    const next = options[Math.floor(this.random() * options.length)];
    const startsAtA = Math.hypot(next.ax - endX, next.az - endZ) < Math.hypot(next.bx - endX, next.bz - endZ);
    return { lane: next, direction: startsAtA ? 1 : -1 };
  }

  private checkPlayerContact(car: TrafficCar, player: TrafficPlayer): TrafficEvent[] {
    const distance = Math.hypot(car.x - player.x, car.z - player.z);
    if (distance < CAR_COLLISION_DISTANCE) {
      car.closeCall = false;
      if (car.crashCooldown > 0) return [];
      car.crashCooldown = 1.5;
      car.stopSeconds = 2.5;
      car.speed = 0;
      const relVx = Math.sin(player.yaw) * player.speed - Math.sin(car.yaw) * car.speed;
      const relVz = Math.cos(player.yaw) * player.speed - Math.cos(car.yaw) * car.speed;
      return [{ kind: "crash", carId: car.id, impactSpeed: Math.hypot(relVx, relVz) }];
    }
    if (distance < NEAR_MISS_DISTANCE && Math.abs(player.speed) >= NEAR_MISS_MIN_SPEED_MPS && car.crashCooldown === 0) {
      car.closeCall = true;
      return [];
    }
    if (car.closeCall && distance > NEAR_MISS_RELEASE_DISTANCE) {
      car.closeCall = false;
      return [{ kind: "near_miss", carId: car.id }];
    }
    return [];
  }
}

function endpointKey(x: number, z: number): string {
  return `${Math.round(x)}:${Math.round(z)}`;
}

function cruiseSpeedFor(lane: WorldRoadSegment): number {
  if (lane.kind === "motorway") return 22;
  if (lane.kind === "primary" || lane.kind === "arterial" || lane.kind === "bridge") return 14;
  if (lane.kind === "secondary" || lane.kind === "tertiary") return 12;
  return 9;
}

export function lanePosition(lane: WorldRoadSegment, direction: 1 | -1, progress: number): { x: number; z: number; yaw: number } {
  const startX = direction === 1 ? lane.ax : lane.bx;
  const startZ = direction === 1 ? lane.az : lane.bz;
  const fx = ((direction === 1 ? lane.bx : lane.ax) - startX) / lane.length;
  const fz = ((direction === 1 ? lane.bz : lane.az) - startZ) / lane.length;
  const left = leftOf(fx, fz);
  const offset = Math.max(1.7, lane.width / 4);
  const along = Math.max(0, Math.min(lane.length, progress));
  return {
    x: startX + fx * along + left.x * offset,
    z: startZ + fz * along + left.z * offset,
    yaw: yawForDirection(fx, fz),
  };
}
