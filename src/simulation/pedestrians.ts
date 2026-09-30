import type { WorldMeters } from "../types";
import type { WorldRoadSegment } from "./roadGeometry";

// People walking the sidewalks around the player. They follow the pavement from street to street,
// pause now and then, and hop back towards the shopfronts when a car comes too close.

export interface Pedestrian {
  id: string;
  laneKey: string;
  direction: 1 | -1;
  side: 1 | -1;
  progress: number;
  speed: number;
  x: number;
  z: number;
  yaw: number;
  colorIndex: number;
  phase: number;
  pause: number;
  dodge: number;
}

export interface PedestrianPlayer {
  x: number;
  z: number;
  speed: number;
}

const SIDEWALK_CENTER = 1.6;
const SPAWN_MIN = 25;
const SPAWN_MAX = 240;
const DESPAWN = 300;
const DODGE_DISTANCE = 7;
export const PEDESTRIAN_COLOR_COUNT = 10;

const laneKey = (lane: WorldRoadSegment) => `${lane.id}@${lane.tileId}`;
const endpointKey = (x: number, z: number) => `${Math.round(x)}:${Math.round(z)}`;

export class PedestrianSystem {
  private lanes: WorldRoadSegment[] = [];
  private lanesByKey = new Map<string, WorldRoadSegment>();
  private endpoints = new Map<string, WorldRoadSegment[]>();
  private nearLanes: WorldRoadSegment[] = [];
  private nearCenter?: WorldMeters;
  private list: Pedestrian[] = [];
  private nextId = 0;
  private spawnTimer = 0;

  constructor(
    private maxPeople = 60,
    private readonly random: () => number = Math.random,
  ) {}

  get people(): readonly Pedestrian[] {
    return this.list;
  }

  setMaxPeople(count: number): void {
    this.maxPeople = count;
    if (this.list.length > count) this.list = this.list.slice(0, count);
  }

  setRoads(segments: WorldRoadSegment[]): void {
    this.lanes = segments.filter((lane) => lane.kind !== "motorway" && lane.kind !== "bridge" && lane.kind !== "service" && lane.length >= 12 && lane.width >= 7);
    this.lanesByKey = new Map(this.lanes.map((lane) => [laneKey(lane), lane]));
    this.endpoints.clear();
    for (const lane of this.lanes) {
      for (const key of [endpointKey(lane.ax, lane.az), endpointKey(lane.bx, lane.bz)]) {
        const bucket = this.endpoints.get(key);
        if (bucket) bucket.push(lane);
        else this.endpoints.set(key, [lane]);
      }
    }
    this.list = this.list.filter((person) => this.lanesByKey.has(person.laneKey));
    this.nearCenter = undefined;
  }

  clear(): void {
    this.list = [];
  }

  update(dt: number, player: PedestrianPlayer): void {
    this.list = this.list.filter((person) => Math.hypot(person.x - player.x, person.z - player.z) <= DESPAWN);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.list.length < this.maxPeople && this.lanes.length) {
      this.spawnTimer = 0.15;
      this.refreshNearLanes(player);
      const burst = this.list.length < this.maxPeople * 0.6 ? 4 : 1;
      for (let i = 0; i < burst && this.list.length < this.maxPeople; i += 1) this.trySpawn(player);
    }
    for (const person of this.list) this.walk(person, dt, player);
  }

  private refreshNearLanes(player: PedestrianPlayer): void {
    if (this.nearCenter && Math.hypot(player.x - this.nearCenter.x, player.z - this.nearCenter.z) < 50) return;
    this.nearCenter = { x: player.x, z: player.z };
    this.nearLanes = this.lanes.filter((lane) => {
      const t = Math.max(0, Math.min(1, ((player.x - lane.ax) * (lane.bx - lane.ax) + (player.z - lane.az) * (lane.bz - lane.az)) / (lane.length * lane.length)));
      return Math.hypot(lane.ax + (lane.bx - lane.ax) * t - player.x, lane.az + (lane.bz - lane.az) * t - player.z) < SPAWN_MAX + 40;
    });
  }

  private trySpawn(player: PedestrianPlayer): void {
    const pool = this.nearLanes.length ? this.nearLanes : this.lanes;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const lane = pool[Math.floor(this.random() * pool.length)];
      const direction: 1 | -1 = this.random() < 0.5 ? 1 : -1;
      const side: 1 | -1 = this.random() < 0.5 ? 1 : -1;
      const progress = this.random() * lane.length;
      const position = sidewalkPosition(lane, direction, side, progress, 0);
      const distance = Math.hypot(position.x - player.x, position.z - player.z);
      if (distance < SPAWN_MIN || distance > SPAWN_MAX) continue;
      this.list.push({
        id: `ped-${this.nextId++}`,
        laneKey: laneKey(lane),
        direction,
        side,
        progress,
        speed: 1.1 + this.random() * 0.7,
        ...position,
        colorIndex: Math.floor(this.random() * PEDESTRIAN_COLOR_COUNT),
        phase: this.random() * Math.PI * 2,
        pause: 0,
        dodge: 0,
      });
      return;
    }
  }

  private walk(person: Pedestrian, dt: number, player: PedestrianPlayer): void {
    let lane = this.lanesByKey.get(person.laneKey);
    if (!lane) return;
    const threat = Math.hypot(person.x - player.x, person.z - player.z) < DODGE_DISTANCE && Math.abs(player.speed) > 3;
    person.dodge = Math.max(0, Math.min(1.3, person.dodge + (threat ? dt * 6 : -dt * 0.8)));
    if (person.pause > 0) {
      person.pause -= dt;
    } else {
      if (this.random() < dt * 0.02) person.pause = 1 + this.random() * 3;
      person.progress += person.speed * dt * (threat ? 1.8 : 1);
      person.phase += dt * person.speed * 5.5;
    }
    if (person.progress >= lane.length) {
      const next = this.nextLane(lane, person.direction);
      person.progress -= lane.length;
      if (next) {
        // Keep the same side of the street relative to the walking direction.
        person.side = (next.direction === person.direction ? person.side : -person.side) as 1 | -1;
        lane = next.lane;
        person.laneKey = laneKey(lane);
        person.direction = next.direction;
      } else {
        person.direction = person.direction === 1 ? -1 : 1;
        person.side = -person.side as 1 | -1;
      }
      person.progress = Math.min(person.progress, lane.length);
    }
    const position = sidewalkPosition(lane, person.direction, person.side, person.progress, person.dodge);
    person.x = position.x;
    person.z = position.z;
    person.yaw = position.yaw;
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
}

// Sidewalk centre line on one side of a road; `dodge` pushes the walker towards the buildings.
export function sidewalkPosition(lane: WorldRoadSegment, direction: 1 | -1, side: 1 | -1, progress: number, dodge: number): { x: number; z: number; yaw: number } {
  const startX = direction === 1 ? lane.ax : lane.bx;
  const startZ = direction === 1 ? lane.az : lane.bz;
  const fx = ((direction === 1 ? lane.bx : lane.ax) - startX) / lane.length;
  const fz = ((direction === 1 ? lane.bz : lane.az) - startZ) / lane.length;
  const offset = (lane.width / 2 + SIDEWALK_CENTER + dodge) * side;
  const along = Math.max(0, Math.min(lane.length, progress));
  return { x: startX + fx * along + fz * offset, z: startZ + fz * along - fx * offset, yaw: Math.atan2(fx, fz) };
}
