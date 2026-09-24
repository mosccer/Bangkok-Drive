import type RapierModule from "@dimforge/rapier3d-compat";
import type { RoadNode, RoadSegment, RoadTile, WorldAnchor } from "../types";
import { worldMetersToLocal } from "../data/coordinates";

type Rapier = typeof RapierModule;

// Rapier (~1.4 MB of WASM) is loaded on demand so the first frame doesn't wait for it.
export class PhysicsWorld {
  private rapier?: Rapier;
  private world?: RapierModule.World;
  private vehicleBody?: RapierModule.RigidBody;
  private readonly tileBodies = new Map<string, RapierModule.RigidBody[]>();
  private pendingTiles?: { tiles: RoadTile[]; anchor: WorldAnchor };

  get ready(): boolean {
    return Boolean(this.world);
  }

  async init(): Promise<void> {
    const RAPIER = (await import("@dimforge/rapier3d-compat")).default;
    await RAPIER.init();
    this.rapier = RAPIER;
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    world.createCollider(RAPIER.ColliderDesc.cuboid(2400, 0.2, 2400).setTranslation(0, -0.25, 0), ground);
    this.vehicleBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.6, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(1.3, 0.5, 2.3), this.vehicleBody);
    this.world = world;
    if (this.pendingTiles) {
      this.setRoadTiles(this.pendingTiles.tiles, this.pendingTiles.anchor);
      this.pendingTiles = undefined;
    }
  }

  addRoadBarriers(nodes: RoadNode[], segments: RoadSegment[]): void {
    const RAPIER = this.rapier;
    const world = this.world;
    if (!RAPIER || !world) return;
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const segment of segments) {
      const from = byId.get(segment.from);
      const to = byId.get(segment.to);
      if (!from || !to) continue;
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const length = Math.hypot(dx, dz);
      const angle = Math.atan2(dz, dx);
      const centerX = (from.x + to.x) / 2;
      const centerZ = (from.z + to.z) / 2;
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(centerX, 0.25, centerZ).setRotation({ x: 0, y: Math.sin(-angle / 2), z: 0, w: Math.cos(-angle / 2) }));
      world.createCollider(RAPIER.ColliderDesc.cuboid(length / 2, 0.15, 0.08), body);
    }
  }

  setRoadTiles(tiles: RoadTile[], anchor: WorldAnchor): void {
    const world = this.world;
    if (!world) {
      this.pendingTiles = { tiles, anchor };
      return;
    }
    const active = new Set(tiles.map((tile) => tile.id));
    for (const [tileId, bodies] of this.tileBodies) {
      if (active.has(tileId)) continue;
      for (const body of bodies) {
        world.removeRigidBody(body);
      }
      this.tileBodies.delete(tileId);
    }

    for (const tile of tiles) {
      if (this.tileBodies.has(tile.id)) continue;
      this.tileBodies.set(tile.id, this.createTileBodies(tile, anchor));
    }
  }

  clearRoadTiles(): void {
    this.pendingTiles = undefined;
    for (const bodies of this.tileBodies.values()) {
      for (const body of bodies) {
        this.world?.removeRigidBody(body);
      }
    }
    this.tileBodies.clear();
  }

  syncVehicle(x: number, y: number, z: number, yaw: number): void {
    this.vehicleBody?.setNextKinematicTranslation({ x, y, z });
    this.vehicleBody?.setNextKinematicRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
  }

  step(): void {
    this.world?.step();
  }

  private createTileBodies(tile: RoadTile, anchor: WorldAnchor): RapierModule.RigidBody[] {
    const RAPIER = this.rapier;
    const world = this.world;
    if (!RAPIER || !world) return [];
    const byId = new Map(tile.nodes.map((nodeValue) => [nodeValue.id, nodeValue]));
    const bodies: RapierModule.RigidBody[] = [];
    for (const segment of tile.segments) {
      // Dense OSM tiles have thousands of minor segments; only main roads get colliders.
      if (segment.kind === "residential" || segment.kind === "service" || segment.kind === "alley") continue;
      const from = byId.get(segment.from);
      const to = byId.get(segment.to);
      if (!from || !to) continue;
      const localFrom = worldMetersToLocal(from, anchor);
      const localTo = worldMetersToLocal(to, anchor);
      const dx = localTo.x - localFrom.x;
      const dz = localTo.z - localFrom.z;
      const length = Math.hypot(dx, dz);
      if (length <= 0.01) continue;
      const angle = Math.atan2(dz, dx);
      const centerX = (localFrom.x + localTo.x) / 2;
      const centerZ = (localFrom.z + localTo.z) / 2;
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(centerX, 0.02, centerZ).setRotation({ x: 0, y: Math.sin(-angle / 2), z: 0, w: Math.cos(-angle / 2) }),
      );
      world.createCollider(RAPIER.ColliderDesc.cuboid(length / 2, 0.04, Math.max(0.8, segment.width / 2)), body);
      bodies.push(body);
    }
    return bodies;
  }
}
