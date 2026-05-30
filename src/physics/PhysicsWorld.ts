import RAPIER from "@dimforge/rapier3d-compat";
import type { RoadNode, RoadSegment } from "../types";

export class PhysicsWorld {
  private world!: RAPIER.World;
  private vehicleBody!: RAPIER.RigidBody;

  async init(): Promise<void> {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(600, 0.2, 600).setTranslation(0, -0.25, 0), ground);
    this.vehicleBody = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(-330, 0.6, -90));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(1.3, 0.5, 2.3), this.vehicleBody);
  }

  addRoadBarriers(nodes: RoadNode[], segments: RoadSegment[]): void {
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
      const body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(centerX, 0.25, centerZ).setRotation({ x: 0, y: Math.sin(-angle / 2), z: 0, w: Math.cos(-angle / 2) }));
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(length / 2, 0.15, 0.08), body);
    }
  }

  syncVehicle(x: number, y: number, z: number, yaw: number): void {
    this.vehicleBody.setNextKinematicTranslation({ x, y, z });
    this.vehicleBody.setNextKinematicRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
  }

  step(): void {
    this.world.step();
  }
}
