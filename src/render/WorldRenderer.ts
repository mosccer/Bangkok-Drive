import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type {
  ArcadeVisualSettings,
  CameraMode,
  GraphicsQuality,
  MapArea,
  MapBuilding,
  OrientationMode,
  PlaceCategory,
  PlaceSummary,
  RoadTile,
  RenderQualityProfile,
  SpeedEffectState,
  VehicleDefinition,
  VehicleState,
  VehicleVisualState,
  VisualMood,
  WorldAnchor,
  WorldMeters,
} from "../types";
import { BANGKOK_ORIGIN } from "../data/bangkokWorld";
import { createWorldAnchor, geoToLocal, MAP_SCALE, worldMetersToLocal } from "../data/coordinates";
import { getVehicleDefinition } from "../data/vehicles";
import type { TrafficVehicleType } from "../simulation/traffic";
import { PEDESTRIAN_COLOR_COUNT } from "../simulation/pedestrians";
import {
  createAsphaltMaterial,
  createBridgeMaterial,
  createFacadeMaterials,
  createGrassMaterial,
  createGroundMaterial,
  createMarkingMaterial,
  createSidewalkMaterial,
  createWaterMaterial,
} from "./materials/proceduralMaterials";
import { createVehicleMesh } from "./objects/vehicleMesh";
import { createTrafficMesh } from "./objects/trafficMeshes";
import { SkyEnvironment, type MoodPreset } from "./environment/SkyEnvironment";
import { areaBounds, buildAreaObject, type AreaMaterials } from "./world/areaBuilder";
import { buildTileGroup, disposeGroup, type WorldMaterials } from "./world/tileBuilder";
import { createSpeedEffectState, createVehicleVisualState, defaultArcadeVisualSettings } from "./arcadeVisuals";
import { getRenderQualityProfile } from "./quality";
import { AdaptiveResolution } from "./adaptiveResolution";

const GROUND_SIZE = 2600;
const SIDEWALK_HEIGHT = 0.16;

function normalize2(x: number, z: number): { x: number; z: number } {
  const length = Math.hypot(x, z) || 1;
  return { x: x / length, z: z / length };
}
const GROUND_REPEAT = 60;
const AREA_BUILD_RADIUS = 5_000;
const trafficPalettes: Record<TrafficVehicleType, string[]> = {
  car: ["#e2e8f0", "#94a3b8", "#1f2937", "#b91c1c", "#1d4ed8", "#f8fafc"],
  taxi: ["#ec4899", "#a3e635", "#f97316", "#3b82f6", "#facc15"],
  pickup: ["#f8fafc", "#475569", "#1f2937", "#78716c"],
  tuktuk: ["#2563eb", "#16a34a", "#dc2626", "#0f766e"],
  motorbike: ["#111827", "#dc2626", "#2563eb", "#f8fafc"],
  bus: ["#dc2626", "#2563eb", "#f97316", "#f5f5f4"],
};
const shirtColors = ["#ef4444", "#f97316", "#facc15", "#22c55e", "#0ea5e9", "#6366f1", "#ec4899", "#f8fafc", "#1f2937", "#a16207"].slice(0, PEDESTRIAN_COLOR_COUNT);
const MAX_PEDESTRIANS = 180;
const ROUTE_Y = 0.15;
const ROUTE_HALF_WIDTH = 1.7;

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Sprite) {
      child.material.map?.dispose();
      child.material.dispose();
      return;
    }
    if (child instanceof THREE.Line) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
      return;
    }
    if (!(child instanceof THREE.Mesh)) return;
    if (!child.geometry.userData.shared) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!material.userData.shared) material.dispose();
    }
  });
}

// Name tags and emote bubbles: canvas text on a sprite so they always face the camera.
function createLabelSprite(text: string, background: string, border: string, fontSize = 44): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = `800 ${fontSize}px Inter, system-ui, sans-serif`;
  const padding = 22;
  let width = 256;
  if (ctx) {
    ctx.font = font;
    width = Math.min(640, Math.ceil(ctx.measureText(text).width) + padding * 2);
  }
  canvas.width = width;
  canvas.height = fontSize + padding * 1.4;
  if (ctx) {
    ctx.font = font;
    ctx.fillStyle = background;
    ctx.strokeStyle = border;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(3, 3, canvas.width - 6, canvas.height - 6, canvas.height / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = background === "#0b1220" ? "#f8fafc" : "#1c1204";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, toneMapped: false }));
  const worldHeight = 1.1;
  sprite.scale.set((worldHeight * canvas.width) / canvas.height, worldHeight, 1);
  sprite.renderOrder = 10;
  return sprite;
}

// Cyan band with forward-pointing chevrons for the 3D route line; scrolls along the route.
function createRouteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "rgba(34, 211, 238, 0.3)";
    ctx.fillRect(0, 0, 64, 128);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const top of [22, 86]) {
      ctx.beginPath();
      ctx.moveTo(12, top + 26);
      ctx.lineTo(32, top);
      ctx.lineTo(52, top + 26);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function markerColor(category: PlaceCategory): string {
  if (category === "cafe" || category === "bakery" || category === "dessert") return "#22d3ee";
  if (category === "restaurant" || category === "street_food" || category === "market" || category === "night_market") return "#fb923c";
  if (category === "park") return "#84cc16";
  if (category === "temple") return "#fbbf24";
  return "#fde047";
}

export class WorldRenderer {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1800);
  readonly renderer: THREE.WebGLRenderer;
  readonly vehicle = createVehicleMesh();
  private readonly timer = new THREE.Timer();
  private readonly environment: SkyEnvironment;
  private readonly roadTileGroups = new Map<string, { group: THREE.Group; tile: RoadTile }>();
  private readonly remotePlayerGroups = new Map<string, THREE.Group>();
  private readonly placeMarkers = new Map<string, THREE.Object3D>();
  private readonly pickupMeshes = new Map<string, THREE.Object3D>();
  private readonly trafficMeshes = new Map<string, THREE.Group>();
  private readonly areaObjects = new Map<string, THREE.Object3D>();
  private readonly areaGroup = new THREE.Group();
  private readonly waypointGroup = new THREE.Group();
  private readonly skidMarks: THREE.Mesh[] = [];
  private readonly skidGeometry = new THREE.BoxGeometry(0.34, 0.014, 1);
  private readonly markerGeometry = new THREE.ConeGeometry(2.3, 5.2, 24);
  private readonly markerRingGeometry = new THREE.RingGeometry(3.2, 4, 32);
  private readonly markerMaterials = new Map<string, { pin: THREE.Material; ring: THREE.Material }>();
  private readonly coinGeometry = new THREE.CylinderGeometry(1.1, 1.1, 0.22, 20);
  private readonly coinMaterial = new THREE.MeshStandardMaterial({ color: "#fbbf24", emissive: "#f59e0b", emissiveIntensity: 0.45, metalness: 0.75, roughness: 0.25 });
  private readonly nitroGeometry = new THREE.CapsuleGeometry(0.7, 1.5, 6, 12);
  private readonly nitroMaterial = new THREE.MeshStandardMaterial({ color: "#38bdf8", emissive: "#0ea5e9", emissiveIntensity: 0.8, metalness: 0.35, roughness: 0.2 });
  private readonly worldMaterials: WorldMaterials;
  private readonly areaMaterials: AreaMaterials;
  private readonly waterMaterial: THREE.MeshStandardMaterial;
  private readonly groundMaterial: THREE.MeshStandardMaterial;
  private readonly facade: ReturnType<typeof createFacadeMaterials>;
  private readonly lampHeadMaterial = new THREE.MeshStandardMaterial({ color: "#fff7dd", emissive: "#ffd48a", emissiveIntensity: 0.05, roughness: 0.4 });
  private waypointKey = "";
  private waypointRing?: THREE.Mesh;
  private worldAnchor: WorldAnchor = createWorldAnchor(BANGKOK_ORIGIN);
  private qualityProfile: RenderQualityProfile;
  private moodPreset: MoodPreset;
  private mapAreas: MapArea[] = [];
  private areasKey = "";
  private ground?: THREE.Mesh;
  private composer?: EffectComposer;
  private bloomPass?: UnrealBloomPass;
  private baseCameraFov = 64;
  private wheelSpin = 0;
  private lastVisualUpdate = performance.now();
  private lastSkidMark = 0;
  private arcadeVisualSettings: ArcadeVisualSettings = defaultArcadeVisualSettings;
  private cameraInitialized = false;
  private cameraMode: CameraMode = "chase";
  private impactShake = 0;
  private readonly vehiclePosition = new THREE.Vector3();
  private readonly adaptiveResolution = new AdaptiveResolution();
  private lastRenderTime = 0;
  private readonly pendingTiles = new Map<string, RoadTile>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly selectionGroup = new THREE.Group();
  private selectedBuilding?: MapBuilding;
  private readonly routeTexture = createRouteTexture();
  private readonly routeMaterial = new THREE.MeshBasicMaterial({ map: this.routeTexture, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2 });
  private routeMesh?: THREE.Mesh;
  private routeWorld?: WorldMeters[];
  private routeKey = "";
  private readonly pedestrianBodies: THREE.InstancedMesh;
  private readonly pedestrianLegs: THREE.InstancedMesh;
  private readonly pedestrianHeads: THREE.InstancedMesh;

  constructor(private readonly canvasHost: HTMLElement) {
    this.qualityProfile = getRenderQualityProfile("medium", this.isMobileViewport());
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.qualityProfile.toneMappingExposure;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.qualityProfile.pixelRatioCap));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    canvasHost.append(this.renderer.domElement);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.facade = createFacadeMaterials(this.qualityProfile.useHighDetailMaterials);
    this.waterMaterial = createWaterMaterial();
    this.groundMaterial = createGroundMaterial();
    const treeTrunk = new THREE.MeshStandardMaterial({ color: "#6b4f3a", roughness: 0.9 });
    const treeLeaves = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85, flatShading: true });
    this.worldMaterials = {
      asphalt: createAsphaltMaterial(this.qualityProfile.useHighDetailMaterials),
      bridge: createBridgeMaterial(),
      sidewalk: createSidewalkMaterial(),
      markings: createMarkingMaterial(),
      walls: this.facade.walls,
      roofs: this.facade.roofs,
      signs: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      props: new THREE.MeshStandardMaterial({ color: "#cbd5e1", roughness: 0.55, metalness: 0.35 }),
      treeTrunk,
      treeLeaves,
      lampPole: new THREE.MeshStandardMaterial({ color: "#4b5563", roughness: 0.5, metalness: 0.6 }),
      lampHead: this.lampHeadMaterial,
    };
    this.areaMaterials = {
      water: this.waterMaterial,
      park: createGrassMaterial(),
      templeGround: new THREE.MeshStandardMaterial({ color: "#d8c9a6", roughness: 0.8 }),
      treeTrunk,
      treeLeaves,
    };

    const shirt = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8 });
    this.pedestrianBodies = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.24, 0.3, 0.9, 8).translate(0, 1.2, 0), shirt, MAX_PEDESTRIANS);
    this.pedestrianLegs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.4, 0.78, 0.24).translate(0, 0.39, 0), new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.85 }), MAX_PEDESTRIANS);
    this.pedestrianHeads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.19, 10, 8).translate(0, 1.84, 0), new THREE.MeshStandardMaterial({ color: "#c58c5c", roughness: 0.7 }), MAX_PEDESTRIANS);
    for (const mesh of [this.pedestrianBodies, this.pedestrianLegs, this.pedestrianHeads]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      this.scene.add(mesh);
    }
    shirtColors.forEach((color, index) => this.pedestrianBodies.setColorAt(index, new THREE.Color(color)));

    this.environment = new SkyEnvironment(this.scene);
    this.moodPreset = this.environment.currentPreset;
    this.canvasHost.dataset.quality = this.qualityProfile.quality;
    this.canvasHost.dataset.postfx = String(this.qualityProfile.usePostEffects);
    this.canvasHost.dataset.mood = this.arcadeVisualSettings.visualMood;
    this.canvasHost.dataset.speed = "idle";
    this.buildScene();
    this.applyQuality();
    this.applyVisualMood();
    this.handleResize();
    window.addEventListener("resize", this.handleResize);
  }

  dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    this.clearSkidMarks();
    this.composer?.dispose();
    this.renderer.dispose();
  }

  update(vehicleState: VehicleState): void {
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0, (now - this.lastVisualUpdate) / 1000));
    this.lastVisualUpdate = now;
    const vehicleVisual = createVehicleVisualState(vehicleState, dt, this.qualityProfile);
    const speedEffect = createSpeedEffectState(this.baseCameraFov, vehicleVisual, this.qualityProfile, this.arcadeVisualSettings);
    this.wheelSpin += vehicleVisual.wheelSpinDelta;
    this.updateVehicleVisuals(vehicleVisual);
    this.updateCanvasEffects(speedEffect);
    if (vehicleVisual.skidIntensity > 0.2 && now - this.lastSkidMark > 85) {
      this.lastSkidMark = now;
      this.spawnSkidMark(vehicleState.position, vehicleState.rotation, vehicleVisual.skidIntensity);
    }

    this.vehicle.position.set(vehicleState.position.x, 0, vehicleState.position.z);
    this.vehicle.rotation.y = vehicleState.rotation;
    this.impactShake = Math.max(0, this.impactShake - dt * 2.4);
    const motionAllowed = !this.arcadeVisualSettings.reduceMotion;
    const shakeOffset = motionAllowed ? speedEffect.shake * 0.18 + (this.arcadeVisualSettings.cameraShake ? this.impactShake * 0.9 : 0) : 0;
    const forwardX = Math.sin(vehicleState.rotation);
    const forwardZ = Math.cos(vehicleState.rotation);
    const rig = this.cameraRig();
    const cameraTarget = new THREE.Vector3(
      vehicleState.position.x - forwardX * rig.back,
      rig.height + Math.sin(now * 0.035) * shakeOffset,
      vehicleState.position.z - forwardZ * rig.back,
    );
    cameraTarget.x += Math.sin(now * 0.05) * shakeOffset;
    cameraTarget.z += Math.cos(now * 0.047) * shakeOffset;
    if (!this.cameraInitialized || rig.snap) {
      this.camera.position.copy(cameraTarget);
      this.cameraInitialized = true;
    } else {
      this.camera.position.lerp(cameraTarget, rig.follow);
    }
    this.camera.fov += (speedEffect.fov - this.camera.fov) * 0.12;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(vehicleState.position.x + forwardX * rig.lookAhead, rig.lookHeight, vehicleState.position.z + forwardZ * rig.lookAhead);

    this.vehiclePosition.set(vehicleState.position.x, 0, vehicleState.position.z);
    this.environment.follow(this.camera, this.vehiclePosition, vehicleState.rotation);
    if (this.ground) {
      const period = GROUND_SIZE / GROUND_REPEAT;
      this.ground.position.set(Math.round(vehicleState.position.x / period) * period, 0, Math.round(vehicleState.position.z / period) * period);
    }
    const waterMap = this.waterMaterial.map;
    if (waterMap) {
      waterMap.offset.x = (waterMap.offset.x + dt * 0.004) % 1;
      waterMap.offset.y = (waterMap.offset.y + dt * 0.0025) % 1;
    }
  }

  setCameraMode(mode: CameraMode): void {
    this.cameraMode = mode;
    this.cameraInitialized = false;
  }

  triggerImpact(strength: number): void {
    this.impactShake = Math.min(1.5, this.impactShake + strength);
  }

  setPickups(items: Array<{ id: string; kind: "coin" | "nitro"; x: number; z: number }>): void {
    const active = new Set(items.map((item) => item.id));
    for (const [id, mesh] of this.pickupMeshes) {
      if (!active.has(id)) {
        this.scene.remove(mesh);
        this.pickupMeshes.delete(id);
      }
    }
    for (const item of items) {
      let mesh = this.pickupMeshes.get(item.id);
      if (!mesh) {
        mesh = item.kind === "coin" ? new THREE.Mesh(this.coinGeometry, this.coinMaterial) : new THREE.Mesh(this.nitroGeometry, this.nitroMaterial);
        if (item.kind === "coin") mesh.rotation.x = Math.PI / 2;
        mesh.userData.spinPhase = (item.x + item.z) * 0.05;
        mesh.userData.pickupKind = item.kind;
        mesh.castShadow = true;
        this.pickupMeshes.set(item.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.set(item.x, item.kind === "coin" ? 1.4 : 1.6, item.z);
    }
  }

  setTrafficCars(cars: Array<{ id: string; type: TrafficVehicleType; x: number; z: number; yaw: number; colorIndex: number; braking: boolean }>): void {
    const active = new Set(cars.map((car) => car.id));
    for (const [id, group] of this.trafficMeshes) {
      if (!active.has(id)) {
        this.scene.remove(group);
        disposeObject(group);
        this.trafficMeshes.delete(id);
      }
    }
    for (const car of cars) {
      let group = this.trafficMeshes.get(car.id);
      if (!group) {
        const palette = trafficPalettes[car.type];
        group = createTrafficMesh(car.type, palette[Math.abs(car.colorIndex) % palette.length]);
        this.trafficMeshes.set(car.id, group);
        this.scene.add(group);
      }
      group.position.set(car.x, 0, car.z);
      group.rotation.y = car.yaw;
      const night = this.moodPreset.headlights > 0.5;
      const key = `${car.braking}:${night}`;
      if (group.userData.lightKey !== key) {
        group.userData.lightKey = key;
        group.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          if (object.userData.vehiclePart === "brakeLight") this.setEmissiveIntensity(object, car.braking ? 2.8 : night ? 1.1 : 0.5);
          if (object.userData.vehiclePart === "headLight") this.setEmissiveIntensity(object, night ? 2.2 : 0.8);
        });
      }
    }
  }

  setVehicleDefinition(definition: VehicleDefinition): void {
    this.vehicle.traverse((child) => {
      if (child instanceof THREE.Mesh && !child.geometry.userData.shared) child.geometry.dispose();
    });
    this.vehicle.clear();
    const replacement = createVehicleMesh(definition);
    for (const child of [...replacement.children]) {
      this.vehicle.add(child);
    }
  }

  setGraphicsQuality(quality: GraphicsQuality): void {
    const previous = this.qualityProfile.quality;
    this.qualityProfile = getRenderQualityProfile(quality, this.isMobileViewport());
    this.canvasHost.dataset.quality = this.qualityProfile.quality;
    this.canvasHost.dataset.postfx = String(this.qualityProfile.usePostEffects);
    this.applyPixelRatio();
    this.applyQuality();
    this.applyVisualMood();
    if (previous !== this.qualityProfile.quality) {
      // Detail levels (trees, crossings, building caps) are baked per tile, so rebuild on the next stream update.
      this.clearRoadTileGroups();
      this.clearAreas();
    }
    this.handleResize();
  }

  setArcadeVisualSettings(settings: ArcadeVisualSettings): void {
    this.arcadeVisualSettings = settings;
    this.setVisualMood(settings.visualMood);
    if (settings.reduceMotion || !settings.speedEffects) {
      this.updateCanvasEffects({ fov: this.baseCameraFov, shake: 0, streakOpacity: 0, boostGlow: 0 });
    }
  }

  setVisualMood(mood: VisualMood): void {
    this.arcadeVisualSettings = { ...this.arcadeVisualSettings, visualMood: mood };
    this.canvasHost.dataset.mood = mood;
    this.applyVisualMood();
  }

  resizeForViewport(width: number, height: number, orientation: OrientationMode): void {
    this.baseCameraFov = orientation === "landscape" ? 64 : 70;
    this.camera.fov = this.baseCameraFov;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer?.setSize(width, height);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
  }

  setWorldOriginOffset(anchor: WorldAnchor): void {
    if (
      anchor.version === this.worldAnchor.version &&
      anchor.worldMeters.x === this.worldAnchor.worldMeters.x &&
      anchor.worldMeters.z === this.worldAnchor.worldMeters.z
    ) {
      return;
    }
    this.worldAnchor = anchor;
    // Tile and area meshes are built around fixed world points, so a new origin only moves them.
    for (const { group, tile } of this.roadTileGroups.values()) {
      const local = worldMetersToLocal(tile.originMeters, anchor);
      group.position.set(local.x, 0, local.z);
    }
    this.areaGroup.position.set(-anchor.worldMeters.x, 0, -anchor.worldMeters.z);
    this.clearPlaceMarkers();
    this.clearSkidMarks();
    this.waypointKey = "";
    this.cameraInitialized = false;
    this.setSelectedBuilding(this.selectedBuilding);
    const route = this.routeWorld;
    this.routeKey = "";
    this.setRoute(route);
  }

  // Tile meshes are built a few per frame, nearest first, so streaming never stalls a frame.
  setVisibleRoadTiles(tiles: RoadTile[]): void {
    const active = new Set(tiles.map((tile) => tile.id));
    for (const [id, entry] of this.roadTileGroups) {
      if (!active.has(id)) {
        this.scene.remove(entry.group);
        disposeGroup(entry.group);
        this.roadTileGroups.delete(id);
      }
    }
    for (const id of [...this.pendingTiles.keys()]) {
      if (!active.has(id)) this.pendingTiles.delete(id);
    }
    for (const tile of tiles) {
      if (!this.roadTileGroups.has(tile.id)) this.pendingTiles.set(tile.id, tile);
    }
  }

  // Builds every queued tile now (after a teleport, so the player never lands in an empty world).
  flushTileBuilds(center: { x: number; z: number }, radius = Number.POSITIVE_INFINITY): void {
    this.vehiclePosition.set(center.x, 0, center.z);
    for (const tile of this.orderedPendingTiles()) {
      const local = worldMetersToLocal(tile.originMeters, this.worldAnchor);
      if (Math.hypot(local.x - center.x, local.z - center.z) > radius) continue;
      this.buildTile(tile);
    }
  }

  get pendingTileCount(): number {
    return this.pendingTiles.size;
  }

  private orderedPendingTiles(): RoadTile[] {
    const distance = (tile: RoadTile) => {
      const local = worldMetersToLocal(tile.originMeters, this.worldAnchor);
      return Math.hypot(local.x - this.vehiclePosition.x, local.z - this.vehiclePosition.z);
    };
    return [...this.pendingTiles.values()].sort((a, b) => distance(a) - distance(b));
  }

  private buildPendingTiles(): void {
    if (!this.pendingTiles.size) return;
    const start = performance.now();
    const budget = this.isMobileViewport() ? 5 : 9;
    for (const tile of this.orderedPendingTiles()) {
      this.buildTile(tile);
      if (performance.now() - start > budget) break;
    }
  }

  private buildTile(tile: RoadTile): void {
    this.pendingTiles.delete(tile.id);
    if (this.roadTileGroups.has(tile.id)) return;
    const group = buildTileGroup(tile, { materials: this.worldMaterials, quality: this.qualityProfile });
    const local = worldMetersToLocal(tile.originMeters, this.worldAnchor);
    group.position.set(local.x, 0, local.z);
    this.roadTileGroups.set(tile.id, { group, tile });
    this.scene.add(group);
  }

  // Ray from the camera through a screen point; returns the local ground position of the building hit.
  pickBuilding(clientX: number, clientY: number): { x: number; z: number } | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return undefined;
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    this.raycaster.far = 1_400;
    const targets: THREE.Object3D[] = [];
    for (const { group } of this.roadTileGroups.values()) {
      for (const child of group.children) {
        if (child.userData.pickable === "building") targets.push(child);
      }
    }
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit) return undefined;
    // Step slightly into the wall so the point lands inside the footprint.
    const inward = this.raycaster.ray.direction.clone().multiplyScalar(0.4);
    return { x: hit.point.x + inward.x, z: hit.point.z + inward.z };
  }

  // Glowing outline and floating name over the building shown in the info card.
  setSelectedBuilding(building?: MapBuilding): void {
    this.selectedBuilding = building;
    for (const child of [...this.selectionGroup.children]) {
      this.selectionGroup.remove(child);
      disposeObject(child);
    }
    if (!building || building.footprint.length < 3) return;
    const local = building.footprint.map((point) => worldMetersToLocal(point, this.worldAnchor));
    const shape = new THREE.Shape(local.map((point) => new THREE.Vector2(point.x, -point.z)));
    const height = Math.max(4, building.heightMeters * MAP_SCALE) + 1.2;
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2);
    const shell = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: "#22d3ee", transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }));
    shell.scale.set(1.02, 1, 1.02);
    const center = local.reduce((sum, point) => ({ x: sum.x + point.x / local.length, z: sum.z + point.z / local.length }), { x: 0, z: 0 });
    shell.position.set(center.x * -0.02, 0, center.z * -0.02);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color: "#67e8f9", toneMapped: false }));
    const label = createLabelSprite(building.name ?? "อาคาร", "#0b1220", "#67e8f9", 44);
    label.scale.multiplyScalar(4.5);
    label.position.set(center.x, height + 7, center.z);
    this.selectionGroup.add(shell, edges, label);
  }

  // Route drawn on the road surface as a scrolling chevron ribbon (world coordinates).
  setRoute(points?: WorldMeters[]): void {
    const key = points ? `${points.length}|${points.map((point) => `${Math.round(point.x)}:${Math.round(point.z)}`).join(",")}|${this.worldAnchor.version}` : "";
    if (key === this.routeKey) return;
    this.routeKey = key;
    this.routeWorld = points;
    if (this.routeMesh) {
      this.scene.remove(this.routeMesh);
      this.routeMesh.geometry.dispose();
      this.routeMesh = undefined;
    }
    if (!points || points.length < 2) return;
    const local = points.map((point) => worldMetersToLocal(point, this.worldAnchor)).filter((point, index, list) => index === 0 || Math.hypot(point.x - list[index - 1].x, point.z - list[index - 1].z) > 0.5);
    if (local.length < 2) return;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    let distance = 0;
    for (let i = 0; i < local.length; i += 1) {
      const prev = local[Math.max(0, i - 1)];
      const next = local[Math.min(local.length - 1, i + 1)];
      if (i > 0) distance += Math.hypot(local[i].x - prev.x, local[i].z - prev.z);
      const inDir = i > 0 ? normalize2(local[i].x - prev.x, local[i].z - prev.z) : normalize2(next.x - local[i].x, next.z - local[i].z);
      const outDir = i < local.length - 1 ? normalize2(next.x - local[i].x, next.z - local[i].z) : inDir;
      const tangent = normalize2(inDir.x + outDir.x, inDir.z + outDir.z);
      const miter = Math.min(2, 1 / Math.max(0.35, tangent.x * outDir.x + tangent.z * outDir.z));
      const nx = -tangent.z * ROUTE_HALF_WIDTH * miter;
      const nz = tangent.x * ROUTE_HALF_WIDTH * miter;
      positions.push(local[i].x + nx, ROUTE_Y, local[i].z + nz, local[i].x - nx, ROUTE_Y, local[i].z - nz);
      uvs.push(0, distance / 6, 1, distance / 6);
      if (i > 0) {
        const base = (i - 1) * 2;
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    this.routeMaterial.side = THREE.DoubleSide;
    this.routeMesh = new THREE.Mesh(geometry, this.routeMaterial);
    this.routeMesh.renderOrder = 2;
    this.scene.add(this.routeMesh);
  }

  setPedestrians(people: Array<{ x: number; z: number; yaw: number; colorIndex: number; phase: number }>): void {
    const count = Math.min(MAX_PEDESTRIANS, people.length);
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const scale = new THREE.Vector3(1, 1, 1);
    const position = new THREE.Vector3();
    const color = new THREE.Color();
    for (let i = 0; i < count; i += 1) {
      const person = people[i];
      rotation.setFromAxisAngle(up, person.yaw);
      position.set(person.x, SIDEWALK_HEIGHT + Math.abs(Math.sin(person.phase)) * 0.06, person.z);
      matrix.compose(position, rotation, scale);
      this.pedestrianBodies.setMatrixAt(i, matrix);
      this.pedestrianHeads.setMatrixAt(i, matrix);
      scale.set(1, 1 - Math.abs(Math.sin(person.phase)) * 0.08, 1);
      matrix.compose(position, rotation, scale);
      this.pedestrianLegs.setMatrixAt(i, matrix);
      scale.set(1, 1, 1);
      this.pedestrianBodies.setColorAt(i, color.set(shirtColors[person.colorIndex % shirtColors.length]));
    }
    for (const mesh of [this.pedestrianBodies, this.pedestrianLegs, this.pedestrianHeads]) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.pedestrianBodies.instanceColor) this.pedestrianBodies.instanceColor.needsUpdate = true;
  }

  setMapAreas(areas: MapArea[]): void {
    const key = areas.map((area) => area.id).join(",");
    if (key === this.areasKey) return;
    this.areasKey = key;
    this.mapAreas = areas;
    this.clearAreas();
  }

  updateAreas(vehicleLocal: { x: number; z: number }): void {
    const worldX = vehicleLocal.x + this.worldAnchor.worldMeters.x;
    const worldZ = vehicleLocal.z + this.worldAnchor.worldMeters.z;
    for (const area of this.mapAreas) {
      const bounds = areaBounds(area);
      const dx = Math.max(bounds.minX - worldX, 0, worldX - bounds.maxX);
      const dz = Math.max(bounds.minZ - worldZ, 0, worldZ - bounds.maxZ);
      const near = Math.hypot(dx, dz) < AREA_BUILD_RADIUS;
      const existing = this.areaObjects.get(area.id);
      if (near && !existing) {
        const object = buildAreaObject(area, this.areaMaterials, this.qualityProfile.quality !== "low");
        this.areaObjects.set(area.id, object);
        this.areaGroup.add(object);
      } else if (!near && existing) {
        this.areaGroup.remove(existing);
        disposeGroup(existing);
        this.areaObjects.delete(area.id);
      }
    }
  }

  setActiveWaypoint(place?: { id: string; lat: number; lng: number }): void {
    const key = place ? `${place.id}:${this.worldAnchor.version}:${this.worldAnchor.worldMeters.x}` : "";
    if (key === this.waypointKey) return;
    this.waypointKey = key;
    this.waypointGroup.clear();
    this.waypointRing = undefined;
    if (!place) return;
    const pos = geoToLocal(place, this.worldAnchor);
    const ring = new THREE.Mesh(this.waypointRingGeometry, this.waypointRingMaterial);
    ring.position.set(pos.x, 0.3, pos.z);
    ring.rotation.x = Math.PI / 2;
    this.waypointRing = ring;
    const beacon = new THREE.Mesh(this.waypointBeaconGeometry, this.waypointBeaconMaterial);
    beacon.position.set(pos.x, 30, pos.z);
    this.waypointGroup.add(ring, beacon);
  }

  private readonly waypointRingGeometry = new THREE.TorusGeometry(8, 0.45, 8, 48);
  private readonly waypointRingMaterial = new THREE.MeshBasicMaterial({ color: "#67e8f9", toneMapped: false });
  private readonly waypointBeaconGeometry = new THREE.CylinderGeometry(1.2, 4, 60, 24, 1, true);
  private readonly waypointBeaconMaterial = new THREE.MeshBasicMaterial({
    color: "#67e8f9",
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

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
      const pos = geoToLocal(place, this.worldAnchor);
      const marker = this.createPlaceMarker(place.category);
      marker.position.set(pos.x, 0, pos.z);
      marker.userData.phase = pos.x * 0.1;
      this.placeMarkers.set(place.id, marker);
      this.scene.add(marker);
    }
  }

  setRemotePlayers(players: Array<{ id: string; name: string; vehicleId: string; color: string; x: number; z: number; yaw: number; emote?: string }>): void {
    const active = new Set(players.map((player) => player.id));
    for (const [id, group] of this.remotePlayerGroups) {
      if (!active.has(id)) {
        this.scene.remove(group);
        disposeObject(group);
        this.remotePlayerGroups.delete(id);
      }
    }

    for (const player of players) {
      const key = `${player.vehicleId}|${player.color}|${player.name}`;
      let group = this.remotePlayerGroups.get(player.id);
      if (group && group.userData.key !== key) {
        this.scene.remove(group);
        disposeObject(group);
        group = undefined;
      }
      if (!group) {
        group = createVehicleMesh({ ...getVehicleDefinition(player.vehicleId), color: player.color });
        group.userData.key = key;
        const tag = createLabelSprite(player.name, "#0b1220", "#67e8f9");
        tag.position.set(0, 4.4, 0);
        tag.userData.role = "nameTag";
        group.add(tag);
        this.remotePlayerGroups.set(player.id, group);
        this.scene.add(group);
      }
      group.position.set(player.x, 0, player.z);
      group.rotation.y = player.yaw;
      const emoteKey = player.emote ?? "";
      if (group.userData.emote !== emoteKey) {
        group.userData.emote = emoteKey;
        const old = group.children.find((child) => child.userData.role === "emote");
        if (old) {
          group.remove(old);
          disposeObject(old);
        }
        if (player.emote) {
          const bubble = createLabelSprite(player.emote, "#fef9c3", "#fde047", 96);
          bubble.position.set(0, 7, 0);
          bubble.userData.role = "emote";
          group.add(bubble);
        }
      }
    }
  }

  spawnSkidMark(position: { x: number; y: number; z: number }, yaw: number, intensity: number): void {
    if (!this.qualityProfile.useSkidMarks || this.arcadeVisualSettings.reduceMotion) return;
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    for (const side of [-1, 1]) {
      const mark = new THREE.Mesh(
        this.skidGeometry,
        new THREE.MeshBasicMaterial({ color: "#0b0f12", transparent: true, opacity: 0.16 + intensity * 0.16, depthWrite: false }),
      );
      mark.scale.z = 4.8 + intensity * 2.4;
      mark.position.set(position.x + rightX * side * 0.92 - forwardX * 1.45, 0.1, position.z + rightZ * side * 0.92 - forwardZ * 1.45);
      mark.rotation.y = yaw;
      this.skidMarks.push(mark);
      this.scene.add(mark);
    }
    this.trimSkidMarks();
  }

  render(): void {
    this.timer.update();
    const t = this.timer.getElapsed();
    for (const marker of this.placeMarkers.values()) {
      const pin = marker.children[0];
      if (pin) {
        pin.position.y = 6.2 + Math.sin(t * 1.8 + marker.userData.phase) * 0.35;
        pin.rotation.y = t * 0.8 + marker.userData.phase;
      }
    }
    for (const mesh of this.pickupMeshes.values()) {
      const phase = mesh.userData.spinPhase as number;
      if (mesh.userData.pickupKind === "coin") {
        mesh.rotation.z = t * 3 + phase;
      } else {
        mesh.rotation.y = t * 2 + phase;
      }
      mesh.position.y = (mesh.userData.pickupKind === "coin" ? 1.4 : 1.6) + Math.sin(t * 3 + phase) * 0.2;
    }
    if (this.waypointRing) {
      const pulse = 1 + Math.sin(t * 3) * 0.06;
      this.waypointRing.scale.set(pulse, pulse, 1);
    }
    if (this.routeMesh && !this.arcadeVisualSettings.reduceMotion) {
      this.routeTexture.offset.y = -((t * 0.9) % 1);
    }
    this.buildPendingTiles();
    const now = performance.now();
    if (this.lastRenderTime) {
      const scale = this.adaptiveResolution.update(now - this.lastRenderTime);
      if (scale !== undefined) this.applyPixelRatio();
    }
    this.lastRenderTime = now;
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private cameraRig(): { back: number; height: number; lookAhead: number; lookHeight: number; follow: number; snap: boolean } {
    switch (this.cameraMode) {
      case "far":
        return { back: 17, height: 10.5, lookAhead: 4, lookHeight: 1.2, follow: 0.07, snap: false };
      case "hood":
        return { back: -1.3, height: 1.75, lookAhead: 24, lookHeight: 1.4, follow: 1, snap: true };
      case "drone":
        return { back: 6, height: 46, lookAhead: 6, lookHeight: 0, follow: 0.12, snap: false };
      default:
        return { back: 10, height: 6.2, lookAhead: 2, lookHeight: 1.4, follow: 0.1, snap: false };
    }
  }

  private updateVehicleVisuals(vehicleVisual: VehicleVisualState): void {
    const night = this.moodPreset.headlights > 0.5;
    this.vehicle.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const part = object.userData.vehiclePart;
      if (part === "wheel") {
        object.rotation.x = this.wheelSpin;
        object.rotation.z = Math.PI / 2;
        return;
      }
      if (part === "brakeLight") {
        this.setEmissiveIntensity(object, (night ? 1.2 : 0.55) + vehicleVisual.brakeIntensity * 2.5);
        return;
      }
      if (part === "headLight") {
        this.setEmissiveIntensity(object, night ? 2.6 : 0.8);
        return;
      }
      if (part === "boostGlow") {
        const opacity = vehicleVisual.boostIntensity * 0.52;
        object.visible = opacity > 0.02;
        object.scale.set(1 + vehicleVisual.boostIntensity * 0.25, 1, 0.7 + vehicleVisual.boostIntensity * 1.4);
        this.setMaterialOpacity(object, opacity);
      }
    });
  }

  private updateCanvasEffects(speedEffect: SpeedEffectState): void {
    const streak = speedEffect.streakOpacity;
    const layerOpacity = Math.max(streak, speedEffect.boostGlow * 0.65);
    this.canvasHost.dataset.speed = streak > 0.38 ? "fast" : streak > 0.1 ? "medium" : "idle";
    this.canvasHost.style.setProperty("--speed-layer-opacity", layerOpacity.toFixed(3));
    this.canvasHost.style.setProperty("--speed-streak-opacity", streak.toFixed(3));
    this.canvasHost.style.setProperty("--boost-glow-opacity", speedEffect.boostGlow.toFixed(3));
  }

  private setEmissiveIntensity(mesh: THREE.Mesh, intensity: number): void {
    const material = mesh.material;
    if (Array.isArray(material)) return;
    if ("emissiveIntensity" in material) {
      material.emissiveIntensity = intensity;
    }
  }

  private setMaterialOpacity(mesh: THREE.Mesh, opacity: number): void {
    const material = mesh.material;
    if (Array.isArray(material)) return;
    material.transparent = true;
    material.opacity = opacity;
  }

  private trimSkidMarks(): void {
    const maxMarks = this.qualityProfile.quality === "high" ? 110 : 70;
    while (this.skidMarks.length > maxMarks) {
      const mark = this.skidMarks.shift();
      if (!mark) return;
      this.scene.remove(mark);
      if (!Array.isArray(mark.material)) mark.material.dispose();
    }
  }

  // Pauses (hidden tab, pause menu) would look like one huge frame, so callers reset the timer.
  resetFrameTimer(): void {
    this.lastRenderTime = 0;
  }

  private applyPixelRatio(): void {
    const ratio = Math.min(window.devicePixelRatio, this.qualityProfile.pixelRatioCap) * this.adaptiveResolution.scale;
    if (Math.abs(this.renderer.getPixelRatio() - ratio) < 0.01) return;
    this.renderer.setPixelRatio(ratio);
    this.composer?.setPixelRatio(ratio);
  }

  private applyQuality(): void {
    const profile = this.qualityProfile;
    this.renderer.shadowMap.enabled = profile.useShadows;
    const extent = profile.quality === "high" ? 130 : 95;
    this.environment.setShadowQuality(profile.shadowMapSize, extent);
    this.environment.sun.castShadow = profile.useShadows;
    this.adaptiveResolution.reset();
    const wantsBloom = profile.quality === "high" && profile.usePostEffects && !this.isMobileViewport();
    if (wantsBloom && !this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.4, 1.0);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    } else if (!wantsBloom && this.composer) {
      this.composer.dispose();
      this.composer = undefined;
      this.bloomPass = undefined;
    }
  }

  private applyVisualMood(): void {
    const preset = this.environment.applyMood(this.arcadeVisualSettings.visualMood, this.qualityProfile.drawDistance);
    this.moodPreset = preset;
    this.renderer.toneMappingExposure = this.qualityProfile.toneMappingExposure * preset.exposure;
    this.facade.walls.emissiveIntensity = preset.windowGlow;
    this.lampHeadMaterial.emissiveIntensity = preset.lampGlow;
    (this.worldMaterials.markings as THREE.MeshStandardMaterial).emissiveIntensity = preset.stars ? 0.25 : 0.05;
    if (this.bloomPass) this.bloomPass.strength = preset.bloomStrength;
    this.camera.far = Math.max(1800, this.qualityProfile.drawDistance * 1.6);
    this.camera.updateProjectionMatrix();
  }

  private buildScene(): void {
    this.groundMaterial.map?.repeat.set(GROUND_REPEAT, GROUND_REPEAT);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE), this.groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.ground = ground;
    this.scene.add(ground);
    this.areaGroup.position.set(-this.worldAnchor.worldMeters.x, 0, -this.worldAnchor.worldMeters.z);
    this.scene.add(this.areaGroup);
    this.scene.add(this.waypointGroup);
    this.scene.add(this.selectionGroup);
    this.scene.add(this.vehicle);
  }

  private createPlaceMarker(category: PlaceCategory): THREE.Object3D {
    const color = markerColor(category);
    let materials = this.markerMaterials.get(color);
    if (!materials) {
      materials = {
        pin: new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.28, metalness: 0.16 }),
        ring: new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
      };
      this.markerMaterials.set(color, materials);
    }
    const group = new THREE.Group();
    const pin = new THREE.Mesh(this.markerGeometry, materials.pin);
    pin.rotation.x = Math.PI;
    pin.position.y = 6.2;
    pin.castShadow = true;
    const ring = new THREE.Mesh(this.markerRingGeometry, materials.ring);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.2;
    group.add(pin, ring);
    return group;
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

  private clearRoadTileGroups(): void {
    for (const { group } of this.roadTileGroups.values()) {
      this.scene.remove(group);
      disposeGroup(group);
    }
    this.roadTileGroups.clear();
  }

  private clearAreas(): void {
    for (const object of this.areaObjects.values()) {
      this.areaGroup.remove(object);
      disposeGroup(object);
    }
    this.areaObjects.clear();
  }

  private clearPlaceMarkers(): void {
    for (const marker of this.placeMarkers.values()) {
      this.scene.remove(marker);
    }
    this.placeMarkers.clear();
  }

  private clearSkidMarks(): void {
    while (this.skidMarks.length) {
      const mark = this.skidMarks.pop();
      if (!mark) return;
      this.scene.remove(mark);
      if (!Array.isArray(mark.material)) mark.material.dispose();
    }
  }
}
