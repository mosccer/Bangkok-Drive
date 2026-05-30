import type { GhostPlayerState, Mission, PlaceQuery, PlaceSummary, PlayerProfile, SaveGame } from "../../types";
import { bangkokWorld } from "../../data/bangkokWorld";
import {
  createWorldAnchor,
  geoToLocal,
  localToGeo,
  localToWorldMeters,
  recenterAnchor,
  shouldRecenter,
} from "../../data/coordinates";
import { getVehicleDefinition, isVehicleUnlocked, vehicleDefinitions } from "../../data/vehicles";
import { InputController } from "../../input/InputController";
import { PhysicsWorld } from "../../physics/PhysicsWorld";
import { activeWaypoint, advanceMissionAtWaypoint, ensureMissionProgress } from "../../simulation/missionFlow";
import { createStarterMissions } from "../../simulation/missions";
import { createFastTravelPoint, shouldOfferFastTravel } from "../../simulation/fastTravel";
import { loadSave, mergeCloudSave, saveGame } from "../../simulation/saveGame";
import { matchesPlaceCategory } from "../../simulation/placeQueries";
import { VehicleController } from "../../simulation/VehicleController";
import { pruneStaleGhosts } from "../../simulation/ghosts";
import { createOnlineService, type OnlineService } from "../../services/onlineService";
import { MapStreamingService } from "../../services/MapStreamingService";
import { CachedPlacesService, GooglePlacesProxyService, type PlacesService } from "../../services/placesService";
import { Hud } from "../../ui/Hud";
import { buildArcadeVisualSettings } from "../arcadeVisuals";
import { WorldRenderer } from "../WorldRenderer";

export class GameApp {
  private readonly canvasHost: HTMLDivElement;
  private readonly hud: Hud;
  private readonly input: InputController;
  private readonly renderer: WorldRenderer;
  private readonly vehicle = new VehicleController();
  private readonly physics = new PhysicsWorld();
  private readonly mapStreaming = new MapStreamingService();
  private readonly placesService: PlacesService;
  private readonly online: OnlineService;
  private missions: Mission[];
  private places: PlaceSummary[] = bangkokWorld.places;
  private visiblePlaces: PlaceSummary[] = bangkokWorld.places.slice(0, 24);
  private placeQuery: PlaceQuery = { limit: 150, lang: "th" };
  private save: SaveGame;
  private profile?: PlayerProfile;
  private running = false;
  private paused = false;
  private lastTime = performance.now();
  private detailRequest?: string;
  private currentChunkId = "real-phra-nakhon-00";
  private ghostStates: GhostPlayerState[] = [];
  private lastGhostTrack = 0;
  private lastCloudSave = 0;
  private lastStreamUpdate = 0;
  private streamInFlight?: Promise<void>;
  private worldAnchor = createWorldAnchor({ lat: 13.7515, lng: 100.4929 });

  constructor(private readonly host: HTMLElement) {
    this.host.className = "game-shell";
    this.canvasHost = document.createElement("div");
    this.canvasHost.className = "canvas-host";
    this.host.append(this.canvasHost);

    this.hud = new Hud(this.host, (query) => this.setPlaceFilters(query));
    this.input = new InputController(this.hud.root);
    this.renderer = new WorldRenderer(this.canvasHost);
    this.renderer.setWorldOriginOffset(this.worldAnchor);
    this.missions = createStarterMissions(this.places);
    this.save = loadSave();
    this.renderer.setGraphicsQuality(this.save.settings.graphicsQuality);
    this.renderer.setArcadeVisualSettings(buildArcadeVisualSettings(this.save.settings));
    this.applyVehicle(this.save.activeVehicleId);
    const fallback = new CachedPlacesService(bangkokWorld.places);
    const placesApiBase = import.meta.env.VITE_PLACES_API_BASE ?? (window.location.port === "5173" ? "" : "/api");
    this.placesService = placesApiBase ? new GooglePlacesProxyService(placesApiBase, fallback) : fallback;
    this.online = createOnlineService();
    this.hud.updateGarage(vehicleDefinitions, this.save, (id) => this.selectVehicle(id));
  }

  async start(): Promise<void> {
    await this.refreshPlaces();
    await this.physics.init();
    const startOnRoad = geoToLocal({ lat: 13.7520, lng: 100.4928 }, this.worldAnchor);
    this.vehicle.teleportLocal(startOnRoad.x, startOnRoad.z, Math.PI / 2, 0);
    await this.updateStreaming(true);
    this.profile = await this.online.ensureProfile();
    const cloud = await this.online.loadCloudSave(this.profile.id);
    this.save = mergeCloudSave(this.save, cloud);
    this.renderer.setGraphicsQuality(this.save.settings.graphicsQuality);
    this.renderer.setArcadeVisualSettings(buildArcadeVisualSettings(this.save.settings));
    this.applyVehicle(this.save.activeVehicleId);
    this.hud.updateGarage(vehicleDefinitions, this.save, (id) => this.selectVehicle(id));
    await this.joinGhostChunk(this.currentChunkId);
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
      this.recenterIfNeeded();
      this.physics.syncVehicle(vehicleState.position.x, vehicleState.position.y, vehicleState.position.z, vehicleState.rotation);
      this.physics.step();
      this.checkDiscovery();
      this.checkMissionProgress();
      this.renderer.update(vehicleState);
      void this.updateStreaming(false, time);
    }

    this.updateVisiblePlaces();
    const activeMission = this.getActiveMission();
    const progress = ensureMissionProgress(this.save, activeMission);
    const waypoint = activeWaypoint(activeMission, progress, this.places);
    const waypointLocal = waypoint ? geoToLocal(waypoint, this.worldAnchor) : undefined;
    const nearby = this.findNearbyPlace();
    this.hud.update(this.vehicle.state, activeMission, this.save, nearby, waypoint, waypointLocal);
    this.hud.drawMinimap(this.vehicle.state, this.visiblePlaces, (place) => geoToLocal(place, this.worldAnchor), waypoint);
    this.updateFastTravelPrompt(waypoint);
    this.renderer.setVisiblePlaces(this.visiblePlaces);
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
    return this.places.find((place) => {
      const pos = geoToLocal(place, this.worldAnchor);
      return Math.hypot(pos.x - this.vehicle.state.position.x, pos.z - this.vehicle.state.position.z) < 35;
    });
  }

  private checkDiscovery(): void {
    const nearby = this.findNearbyPlace();
    if (!nearby || this.save.discoveredPlaceIds.includes(nearby.id)) {
      return;
    }
    const xpReward = this.discoveryXpReward(nearby);
    this.save = {
      ...this.save,
      player: {
        ...this.save.player,
        xp: this.save.player.xp + xpReward,
        discoveryDailyXpByDistrict: this.updatedDiscoveryXpLog(nearby, xpReward),
      },
      discoveredPlaceIds: [...this.save.discoveredPlaceIds, nearby.id],
    };
    saveGame(this.save);
  }

  private checkMissionProgress(): void {
    const mission = this.getActiveMission();
    const progress = ensureMissionProgress(this.save, mission);
    this.save = { ...this.save, player: { ...this.save.player, missionProgress: progress } };
    const waypoint = activeWaypoint(mission, progress, this.places);
    if (!waypoint) return;
    const pos = geoToLocal(waypoint, this.worldAnchor);
    if (Math.hypot(pos.x - this.vehicle.state.position.x, pos.z - this.vehicle.state.position.z) > 35) {
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
    if (this.isMobileViewport()) {
      return;
    }
    this.detailRequest = nearby.id;
    const detail = await this.placesService.getDetail(nearby.id, "th");
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
    const chunkId = this.currentChunkId;

    if (time - this.lastGhostTrack > 1500) {
      this.lastGhostTrack = time;
      const geo = localToGeo(this.vehicle.state.position, this.worldAnchor);
      await this.online.trackGhost({
        profileId: this.profile.id,
        displayName: this.profile.displayName,
        vehicleId: this.save.activeVehicleId,
        chunkId,
        x: this.vehicle.state.position.x,
        z: this.vehicle.state.position.z,
        lat: geo.lat,
        lng: geo.lng,
        tileId: chunkId,
        originVersion: this.worldAnchor.version,
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

  private async setPlaceFilters(query: PlaceQuery): Promise<void> {
    this.placeQuery = { ...this.placeQuery, ...query };
    this.updateVisiblePlaces();
  }

  private async refreshPlaces(): Promise<void> {
    const response = await this.placesService.listSummaries({ limit: 150, lang: "th" });
    this.places = response.places.length ? response.places : bangkokWorld.places;
    this.missions = createStarterMissions(this.places);
    this.updateVisiblePlaces();
  }

  private updateVisiblePlaces(): void {
    const isMobile = this.isMobileViewport();
    const maxMarkers = isMobile ? 40 : 80;
    const radiusMeters = isMobile ? 900 : 1_600;
    this.visiblePlaces = this.places
      .filter((place) => matchesPlaceCategory(place, this.placeQuery.category))
      .filter((place) => !this.placeQuery.districtId || place.districtId === this.placeQuery.districtId)
      .map((place) => {
        const local = geoToLocal(place, this.worldAnchor);
        return { place, distance: Math.hypot(local.x - this.vehicle.state.position.x, local.z - this.vehicle.state.position.z) };
      })
      .filter(({ distance }) => distance <= radiusMeters)
      .sort((a, b) => a.distance - b.distance || (b.place.curatedPriority ?? 0) - (a.place.curatedPriority ?? 0))
      .slice(0, maxMarkers)
      .map(({ place }) => place);
  }

  private discoveryXpReward(place: PlaceSummary): number {
    const today = new Date().toISOString().slice(0, 10);
    const current = this.save.player.discoveryDailyXpByDistrict?.[place.districtId];
    const usedToday = current?.date === today ? current.xp : 0;
    return Math.max(0, Math.min(25, 250 - usedToday));
  }

  private updatedDiscoveryXpLog(place: PlaceSummary, reward: number): Record<string, { date: string; xp: number }> {
    const today = new Date().toISOString().slice(0, 10);
    const log = { ...(this.save.player.discoveryDailyXpByDistrict ?? {}) };
    const current = log[place.districtId];
    log[place.districtId] = {
      date: today,
      xp: (current?.date === today ? current.xp : 0) + reward,
    };
    return log;
  }

  private recenterIfNeeded(): void {
    if (!shouldRecenter(this.vehicle.state.position)) return;
    const speed = this.vehicle.state.speed;
    const rotation = this.vehicle.state.rotation;
    const recentered = recenterAnchor(this.worldAnchor, this.vehicle.state.position);
    this.worldAnchor = recentered.anchor;
    this.vehicle.teleportLocal(recentered.vehicleLocal.x, recentered.vehicleLocal.z, rotation, speed);
    this.renderer.setWorldOriginOffset(this.worldAnchor);
    this.physics.clearRoadTiles();
    void this.updateStreaming(true);
  }

  private async updateStreaming(force = false, time = performance.now()): Promise<void> {
    if (!force && time - this.lastStreamUpdate < 650) return;
    if (this.streamInFlight) return this.streamInFlight;

    this.lastStreamUpdate = time;
    this.streamInFlight = (async () => {
      const isMobile = this.isMobileViewport();
      const vehicleWorldMeters = localToWorldMeters(this.vehicle.state.position, this.worldAnchor);
      const state = await this.mapStreaming.update(this.worldAnchor, vehicleWorldMeters, isMobile);
      const nextChunkId = state.activeTileId ?? this.currentChunkId;
      if (nextChunkId !== this.currentChunkId) {
        this.currentChunkId = nextChunkId;
        if (this.profile) {
          await this.joinGhostChunk(nextChunkId);
        }
      } else {
        this.currentChunkId = nextChunkId;
      }
      this.renderer.setWorldOriginOffset(this.worldAnchor);
      this.renderer.setVisibleRoadTiles(state.loadedTiles);
      this.physics.setRoadTiles(state.loadedTiles, this.worldAnchor);
      const geo = localToGeo(this.vehicle.state.position, this.worldAnchor);
      void this.loadNearbyPlaces(geo.lat, geo.lng, isMobile ? 1_500 : 2_500);
    })().finally(() => {
      this.streamInFlight = undefined;
    });

    return this.streamInFlight;
  }

  private isMobileViewport(): boolean {
    return window.matchMedia("(pointer: coarse)").matches || Math.min(window.innerWidth, window.innerHeight) <= 520;
  }

  private async loadNearbyPlaces(lat: number, lng: number, radius: number): Promise<void> {
    const response = await this.placesService.listSummaries({ nearLat: lat, nearLng: lng, radius, limit: 150, lang: "th" });
    if (!response.places.length) return;
    const byId = new Map(this.places.map((place) => [place.id, place]));
    for (const place of response.places) {
      byId.set(place.id, place);
    }
    this.places = [...byId.values()];
    this.missions = createStarterMissions(this.places);
  }

  private updateFastTravelPrompt(waypoint?: PlaceSummary): void {
    if (!waypoint) {
      this.hud.updateFastTravel(undefined, undefined);
      return;
    }
    const currentGeo = localToGeo(this.vehicle.state.position, this.worldAnchor);
    const target = { lat: waypoint.lat, lng: waypoint.lng };
    if (!shouldOfferFastTravel(currentGeo, target)) {
      this.hud.updateFastTravel(undefined, undefined);
      return;
    }
    const fastTravelPoint = createFastTravelPoint(currentGeo, waypoint);
    this.hud.updateFastTravel(fastTravelPoint, () => void this.fastTravelTo(fastTravelPoint));
  }

  private async fastTravelTo(point: { target: { lat: number; lng: number } }): Promise<void> {
    this.worldAnchor = createWorldAnchor(point.target, this.worldAnchor.version + 1);
    this.vehicle.teleportLocal(0, 0, this.vehicle.state.rotation, 0);
    this.renderer.setWorldOriginOffset(this.worldAnchor);
    this.physics.clearRoadTiles();
    this.detailRequest = undefined;
    await this.updateStreaming(true);
  }
}
