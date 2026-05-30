import type { GhostPlayerState, Mission, PlaceSummary, PlayerProfile, SaveGame } from "../../types";
import { bangkokWorld, placeWorldPosition } from "../../data/bangkokWorld";
import { findChunkIdAt, roadChunks } from "../../data/roadChunks";
import { getVehicleDefinition, isVehicleUnlocked, vehicleDefinitions } from "../../data/vehicles";
import { InputController } from "../../input/InputController";
import { PhysicsWorld } from "../../physics/PhysicsWorld";
import { activeWaypoint, advanceMissionAtWaypoint, ensureMissionProgress } from "../../simulation/missionFlow";
import { createStarterMissions } from "../../simulation/missions";
import { loadSave, mergeCloudSave, saveGame } from "../../simulation/saveGame";
import { VehicleController } from "../../simulation/VehicleController";
import { pruneStaleGhosts } from "../../simulation/ghosts";
import { createOnlineService, type OnlineService } from "../../services/onlineService";
import { CachedPlacesService, GooglePlacesProxyService, type PlacesService } from "../../services/placesService";
import { Hud } from "../../ui/Hud";
import { WorldRenderer } from "../WorldRenderer";

export class GameApp {
  private readonly canvasHost: HTMLDivElement;
  private readonly hud: Hud;
  private readonly input: InputController;
  private readonly renderer: WorldRenderer;
  private readonly vehicle = new VehicleController();
  private readonly physics = new PhysicsWorld();
  private readonly missions: Mission[];
  private readonly placesService: PlacesService;
  private readonly online: OnlineService;
  private save: SaveGame;
  private profile?: PlayerProfile;
  private running = false;
  private paused = false;
  private lastTime = performance.now();
  private detailRequest?: string;
  private currentChunkId = "central";
  private ghostStates: GhostPlayerState[] = [];
  private lastGhostTrack = 0;
  private lastCloudSave = 0;

  constructor(private readonly host: HTMLElement) {
    this.host.className = "game-shell";
    this.canvasHost = document.createElement("div");
    this.canvasHost.className = "canvas-host";
    this.host.append(this.canvasHost);

    this.hud = new Hud(this.host);
    this.input = new InputController(this.hud.root);
    this.renderer = new WorldRenderer(this.canvasHost, bangkokWorld);
    this.missions = createStarterMissions(bangkokWorld.places);
    this.save = loadSave();
    this.renderer.setGraphicsQuality(this.save.settings.graphicsQuality);
    this.applyVehicle(this.save.activeVehicleId);
    const fallback = new CachedPlacesService(bangkokWorld.places);
    this.placesService = new GooglePlacesProxyService("/api", fallback);
    this.online = createOnlineService();
    this.hud.updateGarage(vehicleDefinitions, this.save, (id) => this.selectVehicle(id));
  }

  async start(): Promise<void> {
    await this.physics.init();
    this.physics.addRoadBarriers(
      roadChunks.flatMap((chunk) => chunk.nodes),
      roadChunks.flatMap((chunk) => chunk.segments),
    );
    this.profile = await this.online.ensureProfile();
    const cloud = await this.online.loadCloudSave(this.profile.id);
    this.save = mergeCloudSave(this.save, cloud);
    this.renderer.setGraphicsQuality(this.save.settings.graphicsQuality);
    this.applyVehicle(this.save.activeVehicleId);
    this.hud.updateGarage(vehicleDefinitions, this.save, (id) => this.selectVehicle(id));
    await this.joinGhostChunk(findChunkIdAt(this.vehicle.state.position.x, this.vehicle.state.position.z));
    this.running = true;
    requestAnimationFrame(this.tick);
  }

  dispose(): void {
    this.running = false;
    this.input.dispose();
    this.renderer.dispose();
  }

  private readonly tick = (time: number): void => {
    if (!this.running) return;
    const dt = Math.min(0.05, (time - this.lastTime) / 1000);
    this.lastTime = time;

    const actions = this.input.update();
    if (actions.pause) {
      this.paused = !this.paused;
      document.body.classList.toggle("paused", this.paused);
    }

    if (!this.paused) {
      const vehicleState = this.vehicle.update(dt, actions);
      this.physics.syncVehicle(vehicleState.position.x, vehicleState.position.y, vehicleState.position.z, vehicleState.rotation);
      this.physics.step();
      this.checkDiscovery();
      this.checkMissionProgress();
      this.renderer.update(vehicleState);
    }

    const activeMission = this.getActiveMission();
    const progress = ensureMissionProgress(this.save, activeMission);
    const waypoint = activeWaypoint(activeMission, progress, bangkokWorld.places);
    const nearby = this.findNearbyPlace();
    this.hud.update(this.vehicle.state, activeMission, this.save, nearby);
    this.hud.drawMinimap(this.vehicle.state, bangkokWorld.places, placeWorldPosition, waypoint);
    this.renderer.setActiveWaypoint(waypoint);
    this.renderer.setGhostCars(pruneStaleGhosts(this.ghostStates, performance.now()));
    void this.maybeOpenNearbyDetail(nearby);
    void this.tickOnline(time);
    this.renderer.render();
    requestAnimationFrame(this.tick);
  };

  private getActiveMission(): Mission {
    return this.missions.find((mission) => mission.id === this.save.player.activeMissionId) ?? this.missions[0];
  }

  private findNearbyPlace(): PlaceSummary | undefined {
    return bangkokWorld.places.find((place) => {
      const pos = placeWorldPosition(place);
      return Math.hypot(pos.x - this.vehicle.state.position.x, pos.z - this.vehicle.state.position.z) < 24;
    });
  }

  private checkDiscovery(): void {
    const nearby = this.findNearbyPlace();
    if (!nearby || this.save.discoveredPlaceIds.includes(nearby.id)) {
      return;
    }
    this.save = {
      ...this.save,
      player: { ...this.save.player, xp: this.save.player.xp + 25 },
      discoveredPlaceIds: [...this.save.discoveredPlaceIds, nearby.id],
    };
    saveGame(this.save);
  }

  private checkMissionProgress(): void {
    const mission = this.getActiveMission();
    const progress = ensureMissionProgress(this.save, mission);
    this.save = { ...this.save, player: { ...this.save.player, missionProgress: progress } };
    const waypoint = activeWaypoint(mission, progress, bangkokWorld.places);
    if (!waypoint) return;
    const pos = placeWorldPosition(waypoint);
    if (Math.hypot(pos.x - this.vehicle.state.position.x, pos.z - this.vehicle.state.position.z) > 20) {
      return;
    }
    const beforeCompleted = this.save.completedMissionIds.length;
    this.save = advanceMissionAtWaypoint(this.save, mission, waypoint.id);
    if (this.save.completedMissionIds.length !== beforeCompleted) {
      this.unlockEligibleVehicles();
    }
    saveGame(this.save);
    this.hud.updateGarage(vehicleDefinitions, this.save, (id) => this.selectVehicle(id));
  }

  private async maybeOpenNearbyDetail(nearby?: PlaceSummary): Promise<void> {
    if (!nearby || this.detailRequest === nearby.id) {
      return;
    }
    this.detailRequest = nearby.id;
    const detail = await this.placesService.getDetail(nearby.id);
    if (detail && this.findNearbyPlace()?.id === nearby.id) {
      this.hud.openDetail(detail);
    }
  }

  private selectVehicle(id: string): void {
    this.unlockEligibleVehicles();
    if (!this.save.unlockedVehicles.includes(id)) return;
    this.save = { ...this.save, activeVehicleId: id };
    this.applyVehicle(id);
    saveGame(this.save);
    this.hud.updateGarage(vehicleDefinitions, this.save, (vehicleId) => this.selectVehicle(vehicleId));
  }

  private applyVehicle(id: string): void {
    const definition = getVehicleDefinition(id);
    this.vehicle.setVehicle(definition);
    this.renderer.setVehicleDefinition(definition);
  }

  private unlockEligibleVehicles(): void {
    const unlocked = new Set(this.save.unlockedVehicles);
    for (const vehicle of vehicleDefinitions) {
      if (isVehicleUnlocked(vehicle, this.save.player.xp, this.save.completedMissionIds)) {
        unlocked.add(vehicle.id);
      }
    }
    this.save = { ...this.save, unlockedVehicles: [...unlocked] };
  }

  private async tickOnline(time: number): Promise<void> {
    if (!this.profile) return;
    const chunkId = findChunkIdAt(this.vehicle.state.position.x, this.vehicle.state.position.z);
    if (chunkId !== this.currentChunkId) {
      await this.joinGhostChunk(chunkId);
    }

    if (time - this.lastGhostTrack > 1500) {
      this.lastGhostTrack = time;
      await this.online.trackGhost({
        profileId: this.profile.id,
        displayName: this.profile.displayName,
        vehicleId: this.save.activeVehicleId,
        chunkId,
        x: this.vehicle.state.position.x,
        z: this.vehicle.state.position.z,
        yaw: this.vehicle.state.rotation,
        speed: this.vehicle.state.speed,
        updatedAt: Date.now(),
      });
    }

    if (time - this.lastCloudSave > 10000) {
      this.lastCloudSave = time;
      await this.online.saveCloud(this.profile.id, this.save);
    }
  }

  private async joinGhostChunk(chunkId: string): Promise<void> {
    this.currentChunkId = chunkId;
    await this.online.joinGhostChannel(chunkId, (states) => {
      this.ghostStates = states;
    });
  }
}
