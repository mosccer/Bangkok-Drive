import * as THREE from "three";
import type {
  ArcadeVisualSettings,
  GhostPlayerState,
  GraphicsQuality,
  Landmark,
  OrientationMode,
  PlaceSummary,
  RoadChunk,
  RoadNode,
  RoadSegment,
  RoadTile,
  RenderQualityProfile,
  SpeedEffectState,
  VehicleDefinition,
  VehicleState,
  VehicleVisualState,
  VisualMood,
  WorldAnchor,
} from "../types";
import { BANGKOK_ORIGIN } from "../data/bangkokWorld";
import { createWorldAnchor, geoToLocal, worldMetersToLocal } from "../data/coordinates";
import { roadChunks, visibleChunksNear } from "../data/roadChunks";
import { getVehicleDefinition } from "../data/vehicles";
import { createAsphaltMaterial, createBuildingMaterial, createSidewalkMaterial, createWaterMaterial } from "./materials/proceduralMaterials";
import { createVehicleMesh } from "./objects/vehicleMesh";
import {
  createSpeedEffectState,
  createVehicleVisualState,
  defaultArcadeVisualSettings,
} from "./arcadeVisuals";
import { getRenderQualityProfile } from "./quality";

export class WorldRenderer {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1800);
  readonly renderer: THREE.WebGLRenderer;
  readonly vehicle = createVehicleMesh();
  private readonly clock = new THREE.Clock();
  private readonly nodeById = new Map<string, RoadNode>();
  private readonly chunkGroups = new Map<string, THREE.Group>();
  private readonly roadTileGroups = new Map<string, THREE.Group>();
  private readonly ghostGroups = new Map<string, THREE.Group>();
  private readonly placeMarkers = new Map<string, THREE.Object3D>();
  private readonly waypointGroup = new THREE.Group();
  private worldAnchor: WorldAnchor = createWorldAnchor(BANGKOK_ORIGIN);
  private streamingTilesActive = false;
  private qualityProfile: RenderQualityProfile;
  private readonly roadMaterial: THREE.MeshStandardMaterial;
  private readonly sidewalkMaterial: THREE.MeshStandardMaterial;
  private readonly waterMaterial: THREE.MeshStandardMaterial;
  private readonly laneMaterial = new THREE.MeshBasicMaterial({ color: "#ffe15d" });
  private readonly skidMarks: THREE.Mesh[] = [];
  private hemiLight?: THREE.HemisphereLight;
  private sunLight?: THREE.DirectionalLight;
  private baseCameraFov = 64;
  private wheelSpin = 0;
  private lastVisualUpdate = performance.now();
  private lastSkidMark = 0;
  private arcadeVisualSettings: ArcadeVisualSettings = defaultArcadeVisualSettings;
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
    this.canvasHost.dataset.mood = this.arcadeVisualSettings.visualMood;
    this.canvasHost.dataset.speed = "idle";
    this.scene.background = new THREE.Color("#a8d3e6");
    this.scene.fog = new THREE.Fog("#a8d3e6", 260, this.qualityProfile.drawDistance);
    this.buildScene();
    this.applyVisualMood();
    this.handleResize();
    window.addEventListener("resize", this.handleResize);
  }

  dispose(): void {
    window.removeEventListener("resize", this.handleResize);
    this.clearSkidMarks();
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

    this.vehicle.position.set(vehicleState.position.x, vehicleState.position.y, vehicleState.position.z);
    this.vehicle.rotation.y = vehicleState.rotation;
    const shakeOffset = this.arcadeVisualSettings.reduceMotion ? 0 : speedEffect.shake * 0.18;
    const cameraTarget = new THREE.Vector3(
      vehicleState.position.x - Math.sin(vehicleState.rotation) * 10,
      7 + Math.sin(now * 0.035) * shakeOffset,
      vehicleState.position.z - Math.cos(vehicleState.rotation) * 10,
    );
    cameraTarget.x += Math.sin(now * 0.05) * shakeOffset;
    cameraTarget.z += Math.cos(now * 0.047) * shakeOffset;
    if (!this.cameraInitialized) {
      this.camera.position.copy(cameraTarget);
      this.cameraInitialized = true;
    } else {
      this.camera.position.lerp(cameraTarget, 0.08);
    }
    this.camera.fov += (speedEffect.fov - this.camera.fov) * 0.12;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(vehicleState.position.x, 1.1, vehicleState.position.z);
    if (!this.streamingTilesActive) {
      this.updateVisibleChunks(vehicleState.position.x, vehicleState.position.z);
    }
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
    this.applyVisualMood();
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
    this.clearRoadTileGroups();
    this.clearPlaceMarkers();
    this.clearSkidMarks();
    this.waypointGroup.clear();
  }

  setVisibleRoadTiles(tiles: RoadTile[]): void {
    this.streamingTilesActive = true;
    const active = new Set(tiles.map((tile) => tile.id));
    for (const [id, group] of this.roadTileGroups) {
      if (!active.has(id)) {
        this.scene.remove(group);
        this.roadTileGroups.delete(id);
      }
    }

    for (const tile of tiles) {
      if (this.roadTileGroups.has(tile.id)) continue;
      const group = new THREE.Group();
      const localNodes = new Map(tile.nodes.map((nodeValue) => [nodeValue.id, { ...nodeValue, ...worldMetersToLocal(nodeValue, this.worldAnchor) }]));
      for (const segment of tile.segments) {
        this.addRoadFromNodes(segment, group, localNodes);
      }
      this.addTileBlocks(tile, group);
      this.roadTileGroups.set(tile.id, group);
      this.scene.add(group);
    }
  }

  setActiveWaypoint(place?: PlaceSummary): void {
    this.waypointGroup.clear();
    if (!place) return;
    const pos = geoToLocal(place, this.worldAnchor);
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
      const pos = geoToLocal(place, this.worldAnchor);
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
      const local = state.lat !== undefined && state.lng !== undefined ? geoToLocal({ lat: state.lat, lng: state.lng }, this.worldAnchor) : { x: state.x, z: state.z };
      group.position.set(local.x, 0.82, local.z);
      group.rotation.y = state.yaw;
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
        new THREE.BoxGeometry(0.34, 0.014, 4.8 + intensity * 2.4),
        new THREE.MeshBasicMaterial({
          color: "#0b0f12",
          transparent: true,
          opacity: 0.16 + intensity * 0.16,
          depthWrite: false,
        }),
      );
      mark.position.set(
        position.x + rightX * side * 0.92 - forwardX * 1.45,
        0.105,
        position.z + rightZ * side * 0.92 - forwardZ * 1.45,
      );
      mark.rotation.y = yaw;
      this.skidMarks.push(mark);
      this.scene.add(mark);
    }
    this.trimSkidMarks();
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

  private updateVehicleVisuals(vehicleVisual: VehicleVisualState): void {
    this.vehicle.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const part = object.userData.vehiclePart;
      if (part === "wheel") {
        object.rotation.x = this.wheelSpin;
        object.rotation.z = Math.PI / 2;
        return;
      }
      if (part === "brakeLight") {
        this.setEmissiveIntensity(object, 0.55 + vehicleVisual.brakeIntensity * 2.5);
        return;
      }
      if (part === "headLight") {
        this.setEmissiveIntensity(object, this.arcadeVisualSettings.visualMood === "neon_night" ? 1.6 : 0.72);
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
      mark.geometry.dispose();
      if (!Array.isArray(mark.material)) {
        mark.material.dispose();
      }
    }
  }

  private applyVisualMood(): void {
    const mood = this.arcadeVisualSettings.visualMood;
    if (mood === "neon_night") {
      this.scene.background = new THREE.Color("#172034");
      this.scene.fog = new THREE.Fog("#172034", 120, this.qualityProfile.drawDistance * 0.84);
      this.renderer.toneMappingExposure = this.qualityProfile.toneMappingExposure * 0.92;
      this.hemiLight?.color.set("#92c5ff");
      this.hemiLight?.groundColor.set("#10151d");
      if (this.hemiLight) this.hemiLight.intensity = 0.86;
      this.sunLight?.color.set("#a7d7ff");
      if (this.sunLight) this.sunLight.intensity = 1.4;
      return;
    }

    if (mood === "boost_arcade") {
      this.scene.background = new THREE.Color("#9bd4ec");
      this.scene.fog = new THREE.Fog("#9bd4ec", 220, this.qualityProfile.drawDistance * 0.96);
      this.renderer.toneMappingExposure = this.qualityProfile.toneMappingExposure * 1.08;
      this.hemiLight?.color.set("#f8fbff");
      this.hemiLight?.groundColor.set("#334c39");
      if (this.hemiLight) this.hemiLight.intensity = 1.36;
      this.sunLight?.color.set("#ffe3a3");
      if (this.sunLight) this.sunLight.intensity = 3.05;
      return;
    }

    this.scene.background = new THREE.Color("#a7d8ef");
    this.scene.fog = new THREE.Fog("#a7d8ef", 260, this.qualityProfile.drawDistance);
    this.renderer.toneMappingExposure = this.qualityProfile.toneMappingExposure;
    this.hemiLight?.color.set("#effbff");
    this.hemiLight?.groundColor.set("#425f43");
    if (this.hemiLight) this.hemiLight.intensity = 1.32;
    this.sunLight?.color.set("#fff0c4");
    if (this.sunLight) this.sunLight.intensity = 2.82;
  }

  private buildScene(): void {
    const hemi = new THREE.HemisphereLight("#e9f7ff", "#35513c", 1.25);
    this.hemiLight = hemi;
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight("#fff1ce", 2.65);
    this.sunLight = sun;
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

  private addRoadFromNodes(segment: RoadSegment, group: THREE.Group, nodes: Map<string, RoadNode>): void {
    const from = nodes.get(segment.from);
    const to = nodes.get(segment.to);
    if (!from || !to) return;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.hypot(dx, dz);
    if (length <= 0.01) return;
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(length, 0.08, segment.width),
      segment.kind === "bridge" ? new THREE.MeshStandardMaterial({ color: "#626b72", roughness: 0.62, metalness: 0.08 }) : this.roadMaterial,
    );
    road.position.set((from.x + to.x) / 2, 0.02, (from.z + to.z) / 2);
    road.rotation.y = -Math.atan2(dz, dx);
    road.receiveShadow = true;
    group.add(road);

    if (segment.width >= 12) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(length * 0.92, 0.09, 0.3), this.laneMaterial);
      line.position.copy(road.position);
      line.position.y = 0.08;
      line.rotation.y = road.rotation.y;
      group.add(line);
    }

    const curbOffset = segment.width / 2 + 1.6;
    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(length, 0.12, 1.8), this.sidewalkMaterial);
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

  private addTileBlocks(tile: RoadTile, group: THREE.Group): void {
    const min = worldMetersToLocal({ x: tile.boundsMeters.minX, z: tile.boundsMeters.minZ }, this.worldAnchor);
    const max = worldMetersToLocal({ x: tile.boundsMeters.maxX, z: tile.boundsMeters.maxZ }, this.worldAnchor);
    const minX = Math.min(min.x, max.x);
    const maxX = Math.max(min.x, max.x);
    const minZ = Math.min(min.z, max.z);
    const maxZ = Math.max(min.z, max.z);
    const materialPalette = ["#9aa4a3", "#ba9d73", "#747f89", "#aeb89a", "#929aa2"];
    const widthSpan = Math.max(80, maxX - minX);
    const depthSpan = Math.max(80, maxZ - minZ);
    for (let i = 0; i < 10; i += 1) {
      const width = 7 + ((i * 5 + tile.id.length) % 14);
      const depth = 8 + ((i * 9) % 16);
      const height = 5 + ((i * 11 + tile.districtIds.length) % 28);
      const x = minX + 24 + ((i * 59) % Math.max(40, widthSpan - 48));
      const z = minZ + 24 + ((i * 43) % Math.max(40, depthSpan - 48));
      if (this.distanceToNearestTileRoad(x, z, tile) < 26) continue;
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

  private distanceToNearestTileRoad(x: number, z: number, tile: RoadTile): number {
    const localNodes = new Map(tile.nodes.map((nodeValue) => [nodeValue.id, { ...nodeValue, ...worldMetersToLocal(nodeValue, this.worldAnchor) }]));
    let nearest = Number.POSITIVE_INFINITY;
    for (const segment of tile.segments) {
      const from = localNodes.get(segment.from);
      const to = localNodes.get(segment.to);
      if (!from || !to) continue;
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const lengthSquared = dx * dx + dz * dz;
      if (lengthSquared <= 0) continue;
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

  private clearRoadTileGroups(): void {
    for (const group of this.roadTileGroups.values()) {
      this.scene.remove(group);
    }
    this.roadTileGroups.clear();
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
      mark.geometry.dispose();
      if (!Array.isArray(mark.material)) {
        mark.material.dispose();
      }
    }
  }
}
