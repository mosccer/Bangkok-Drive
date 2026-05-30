import * as THREE from "three";
import type {
  GhostPlayerState,
  GraphicsQuality,
  Landmark,
  OrientationMode,
  PlaceSummary,
  RoadChunk,
  RoadNode,
  RoadSegment,
  RenderQualityProfile,
  VehicleDefinition,
  VehicleState,
} from "../types";
import { placeWorldPosition } from "../data/bangkokWorld";
import { roadChunks, visibleChunksNear } from "../data/roadChunks";
import { getVehicleDefinition } from "../data/vehicles";
import { createAsphaltMaterial, createBuildingMaterial, createSidewalkMaterial, createWaterMaterial } from "./materials/proceduralMaterials";
import { createVehicleMesh } from "./objects/vehicleMesh";
import { getRenderQualityProfile } from "./quality";

export class WorldRenderer {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1800);
  readonly renderer: THREE.WebGLRenderer;
  readonly vehicle = createVehicleMesh();
  private readonly clock = new THREE.Clock();
  private readonly nodeById = new Map<string, RoadNode>();
  private readonly chunkGroups = new Map<string, THREE.Group>();
  private readonly ghostGroups = new Map<string, THREE.Group>();
  private readonly placeMarkers = new Map<string, THREE.Object3D>();
  private readonly waypointGroup = new THREE.Group();
  private qualityProfile: RenderQualityProfile;
  private readonly roadMaterial: THREE.MeshStandardMaterial;
  private readonly sidewalkMaterial: THREE.MeshStandardMaterial;
  private readonly waterMaterial: THREE.MeshStandardMaterial;
  private readonly laneMaterial = new THREE.MeshBasicMaterial({ color: "#ffe15d" });
  private cameraInitialized = false;

  constructor(private readonly canvasHost: HTMLElement) {
    this.qualityProfile = getRenderQualityProfile("medium", this.isMobileViewport());
    this.roadMaterial = createAsphaltMaterial(this.qualityProfile.useHighDetailMaterials);
    this.sidewalkMaterial = createSidewalkMaterial();
    this.waterMaterial = createWaterMaterial();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.qualityProfile.toneMappingExposure;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.qualityProfile.pixelRatioCap));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasHost.append(this.renderer.domElement);
    this.canvasHost.dataset.quality = this.qualityProfile.quality;
    this.canvasHost.dataset.postfx = String(this.qualityProfile.usePostEffects);
    this.scene.background = new THREE.Color("#a8d3e6");
    this.scene.fog = new THREE.Fog("#a8d3e6", 260, this.qualityProfile.drawDistance);
    this.buildScene();
    this.handleResize();
    window.addEventListener("resize", this.handleResize);
  }

  dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    this.renderer.dispose();
  }

  update(vehicleState: VehicleState): void {
    this.vehicle.position.set(vehicleState.position.x, vehicleState.position.y, vehicleState.position.z);
    this.vehicle.rotation.y = vehicleState.rotation;
    const cameraTarget = new THREE.Vector3(
      vehicleState.position.x - Math.sin(vehicleState.rotation) * 10,
      7,
      vehicleState.position.z - Math.cos(vehicleState.rotation) * 10,
    );
    if (!this.cameraInitialized) {
      this.camera.position.copy(cameraTarget);
      this.cameraInitialized = true;
    } else {
      this.camera.position.lerp(cameraTarget, 0.08);
    }
    this.camera.lookAt(vehicleState.position.x, 1.1, vehicleState.position.z);
    this.updateVisibleChunks(vehicleState.position.x, vehicleState.position.z);
  }

  setVehicleDefinition(definition: VehicleDefinition): void {
    this.vehicle.clear();
    const replacement = createVehicleMesh(definition);
    for (const child of [...replacement.children]) {
      this.vehicle.add(child);
    }
  }

  setGraphicsQuality(quality: GraphicsQuality): void {
    this.qualityProfile = getRenderQualityProfile(quality, this.isMobileViewport());
    this.canvasHost.dataset.quality = this.qualityProfile.quality;
    this.canvasHost.dataset.postfx = String(this.qualityProfile.usePostEffects);
    this.renderer.toneMappingExposure = this.qualityProfile.toneMappingExposure;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.qualityProfile.pixelRatioCap));
    this.scene.fog = new THREE.Fog("#a8d3e6", 260, this.qualityProfile.drawDistance);
    this.handleResize();
  }

  resizeForViewport(width: number, height: number, orientation: OrientationMode): void {
    this.camera.fov = orientation === "landscape" ? 64 : 70;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  setActiveWaypoint(place?: PlaceSummary): void {
    this.waypointGroup.clear();
    if (!place) return;
    const pos = placeWorldPosition(place);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(8, 0.45, 8, 36),
      new THREE.MeshBasicMaterial({ color: "#67e8f9" }),
    );
    ring.position.set(pos.x, 0.28, pos.z);
    ring.rotation.x = Math.PI / 2;
    this.waypointGroup.add(ring);
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 3.8, 16, 18, 1, true),
      new THREE.MeshBasicMaterial({ color: "#67e8f9", transparent: true, opacity: 0.22, depthWrite: false }),
    );
    beacon.position.set(pos.x, 8, pos.z);
    this.waypointGroup.add(beacon);
  }

  setVisiblePlaces(places: PlaceSummary[]): void {
    const active = new Set(places.map((place) => place.id));
    for (const [id, marker] of this.placeMarkers) {
      if (!active.has(id)) {
        this.scene.remove(marker);
        this.placeMarkers.delete(id);
      }
    }

    for (const place of places) {
      if (this.placeMarkers.has(place.id)) continue;
      const pos = placeWorldPosition(place);
      const marker = this.createPlaceMarker(place);
      marker.position.set(pos.x, 5.2, pos.z);
      marker.userData.float = true;
      marker.userData.baseY = 5.2;
      marker.userData.phase = pos.x * 0.1;
      this.placeMarkers.set(place.id, marker);
      this.scene.add(marker);
    }
  }

  setGhostCars(states: GhostPlayerState[]): void {
    const active = new Set(states.map((state) => state.profileId));
    for (const [id, group] of this.ghostGroups) {
      if (!active.has(id)) {
        this.scene.remove(group);
        this.ghostGroups.delete(id);
      }
    }

    for (const state of states) {
      let group = this.ghostGroups.get(state.profileId);
      if (!group) {
        group = createVehicleMesh(getVehicleDefinition(state.vehicleId), true);
        this.ghostGroups.set(state.profileId, group);
        this.scene.add(group);
      }
      group.position.set(state.x, 0.82, state.z);
      group.rotation.y = state.yaw;
    }
  }

  render(): void {
    const t = this.clock.getElapsedTime();
    this.scene.traverse((object) => {
      if (object.userData.float) {
        object.position.y = object.userData.baseY + Math.sin(t * 1.8 + object.userData.phase) * 0.25;
      }
    });
    this.renderer.render(this.scene, this.camera);
  }

  private buildScene(): void {
    const hemi = new THREE.HemisphereLight("#e9f7ff", "#35513c", 1.25);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight("#fff1ce", 2.65);
    sun.position.set(-120, 180, 80);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.qualityProfile.shadowMapSize, this.qualityProfile.shadowMapSize);
    sun.shadow.camera.near = 20;
    sun.shadow.camera.far = 420;
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1200, 1200),
      new THREE.MeshStandardMaterial({ color: "#52624d", roughness: 0.92 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.addRiver();
    this.scene.add(this.waypointGroup);
    this.scene.add(this.vehicle);
  }

  private addRoad(segment: RoadSegment, group: THREE.Group): void {
    const from = this.nodeById.get(segment.from);
    const to = this.nodeById.get(segment.to);
    if (!from || !to) return;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dz);
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.08, segment.width),
      segment.kind === "bridge" ? new THREE.MeshStandardMaterial({ color: "#626b72", roughness: 0.62, metalness: 0.08 }) : this.roadMaterial,
    );
    road.position.set((from.x + to.x) / 2, 0.02, (from.z + to.z) / 2);
    road.rotation.y = -Math.atan2(dz, dx);
    road.receiveShadow = true;
    group.add(road);

    const line = new THREE.Mesh(
      new THREE.BoxGeometry(length * 0.92, 0.09, 0.35),
      this.laneMaterial,
    );
    line.position.copy(road.position);
    line.position.y = 0.08;
    line.rotation.y = road.rotation.y;
    group.add(line);

    const curbOffset = segment.width / 2 + 2.4;
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(length, 0.12, 2.8), this.sidewalkMaterial);
      curb.position.copy(road.position);
      curb.position.x += Math.sin(road.rotation.y) * curbOffset * side;
      curb.position.z += Math.cos(road.rotation.y) * curbOffset * side;
      curb.position.y = 0.09;
      curb.rotation.y = road.rotation.y;
      curb.receiveShadow = true;
      group.add(curb);
    }
  }

  private addRiver(): void {
    const river = new THREE.Mesh(
      new THREE.PlaneGeometry(95, 820),
      this.waterMaterial,
    );
    river.rotation.x = -Math.PI / 2;
    river.rotation.z = 0.16;
    river.position.set(-310, 0.025, -60);
    this.scene.add(river);
  }

  private addDistrictBlocks(chunk: RoadChunk, group: THREE.Group): void {
    const materialPalette = ["#9aa4a3", "#ba9d73", "#747f89", "#aeb89a", "#929aa2"];
    for (let i = 0; i < 18; i += 1) {
        const width = 8 + ((i * 7) % 16);
        const depth = 8 + ((i * 11) % 18);
        const height = 6 + ((i * 13 + chunk.id.length) % 34);
        const x = chunk.bounds.minX + 15 + ((i * 37) % Math.max(20, chunk.bounds.maxX - chunk.bounds.minX - 30));
        const z = chunk.bounds.minZ + 15 + ((i * 29) % Math.max(20, chunk.bounds.maxZ - chunk.bounds.minZ - 30));
        if (this.distanceToNearestRoad(x, z) < 32 || Math.hypot(x + 330, z + 80) < 72) {
          continue;
        }
        const building = new THREE.Mesh(
          new THREE.BoxGeometry(width, height, depth),
          createBuildingMaterial(materialPalette[i % materialPalette.length], this.qualityProfile.useHighDetailMaterials),
        );
        building.position.set(x, height / 2, z);
        building.castShadow = true;
        building.receiveShadow = true;
        group.add(building);
      }
  }

  private addLandmark(landmark: Landmark, group: THREE.Group): void {
    const color = landmark.kind === "park" ? "#65a30d" : landmark.kind === "market" ? "#f97316" : landmark.kind === "mall" ? "#818cf8" : "#facc15";
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(5, 7, 26, 8),
      new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.16, emissive: color, emissiveIntensity: 0.04 }),
    );
    tower.position.set(landmark.x, 13, landmark.z);
    tower.castShadow = true;
    group.add(tower);
  }

  private createPlaceMarker(place: PlaceSummary): THREE.Object3D {
    const color =
      place.category === "cafe" || place.category === "bakery" || place.category === "dessert"
        ? "#22d3ee"
        : place.category === "restaurant" || place.category === "street_food" || place.category === "market" || place.category === "night_market"
          ? "#fb923c"
          : place.category === "park"
            ? "#84cc16"
            : "#fde047";
    const group = new THREE.Group();
    const pin = new THREE.Mesh(new THREE.ConeGeometry(2.3, 5.2, 24), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.18, roughness: 0.28, metalness: 0.16 }));
    pin.rotation.x = Math.PI;
    group.add(pin);
    return group;
  }

  private distanceToNearestRoad(x: number, z: number): number {
    let nearest = Number.POSITIVE_INFINITY;
    for (const chunk of roadChunks) {
      for (const node of chunk.nodes) {
        this.nodeById.set(node.id, node);
      }
    }
    for (const segment of roadChunks.flatMap((chunk) => chunk.segments)) {
      const from = this.nodeById.get(segment.from);
      const to = this.nodeById.get(segment.to);
      if (!from || !to) continue;
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const lengthSquared = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - from.x) * dx + (z - from.z) * dz) / lengthSquared));
      const px = from.x + t * dx;
      const pz = from.z + t * dz;
      nearest = Math.min(nearest, Math.hypot(x - px, z - pz));
    }
    return nearest;
  }

  private updateVisibleChunks(x: number, z: number): void {
    const visible = visibleChunksNear(x, z);
    const visibleIds = new Set(visible.map((chunk) => chunk.id));
    for (const [id, group] of this.chunkGroups) {
      if (!visibleIds.has(id)) {
        this.scene.remove(group);
        this.chunkGroups.delete(id);
      }
    }

    for (const chunk of visible) {
      if (this.chunkGroups.has(chunk.id)) continue;
      const group = new THREE.Group();
      for (const nodeValue of chunk.nodes) {
        this.nodeById.set(nodeValue.id, nodeValue);
      }
      for (const segment of chunk.segments) {
        this.addRoad(segment, group);
      }
      this.addDistrictBlocks(chunk, group);
      for (const landmark of chunk.landmarks) {
        this.addLandmark(landmark, group);
      }
      this.chunkGroups.set(chunk.id, group);
      this.scene.add(group);
    }
  }

  private isMobileViewport(): boolean {
    return window.matchMedia("(pointer: coarse)").matches || Math.min(window.innerWidth, window.innerHeight) <= 520;
  }

  private readonly handleResize = (): void => {
    const width = this.canvasHost.clientWidth;
    const height = this.canvasHost.clientHeight;
    const orientation: OrientationMode = width >= height ? "landscape" : "portrait";
    this.resizeForViewport(width, height, orientation);
  };
}
