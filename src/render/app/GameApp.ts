import type { CameraMode, DailyChallengeKind, MapArea, Mission, WorldMeters, PlaceQuery, PlaceSummary, PlayerProfile, RoadTile, SaveGame, UpgradeSlot, VehicleDefinition } from "../../types";
import { GameAudio } from "../../audio/GameAudio";
import { bangkokWorld } from "../../data/bangkokWorld";
import {
  createWorldAnchor,
  distanceMetersBetweenGeo,
  geoToLocal,
  localToGeo,
  localToWorldMeters,
  recenterAnchor,
  shouldRecenter,
  worldMetersToLocal,
} from "../../data/coordinates";
import { getVehicleDefinition, isVehicleUnlocked, vehicleDefinitions } from "../../data/vehicles";
import { InputController, type UiActions } from "../../input/InputController";
import { PhysicsWorld } from "../../physics/PhysicsWorld";
import { grantAchievements, newlyUnlockedAchievements } from "../../simulation/achievements";
import { addRewards, addStat, maxStat, recordBestTime } from "../../simulation/career";
import { CollectibleField, COIN_VALUE, NITRO_PICKUP_AMOUNT, type Collectible } from "../../simulation/collectibles";
import { advanceDailyChallenges, ensureDailyChallenges, localDateKey } from "../../simulation/dailyChallenges";
import { createDriftState, driftRewards, isDrifting, updateDrift, type DriftState } from "../../simulation/drift";
import {
  activeWaypoint,
  advanceMissionAtWaypoint,
  ensureMissionProgress,
  isMissionComplete,
  missionReward,
  startMission,
} from "../../simulation/missionFlow";
import { createStarterMissions, isMissionAvailable, nextMissionAfter } from "../../simulation/missions";
import {
  addMissionPenalty,
  FAST_TRAVEL_PENALTY_SECONDS,
  formatRaceTime,
  isMissionTimerExpired,
  remainingSeconds,
  startMissionTimer,
  tickMissionTimer,
  totalRunSeconds,
  type MissionRunTimer,
} from "../../simulation/missionTimer";
import { createFastTravelPoint, shouldOfferFastTravel } from "../../simulation/fastTravel";
import { addNitro, createNitroState, nitroTuningForLevel, updateNitro, type NitroState, type NitroTuning } from "../../simulation/nitro";
import { levelForXp, levelUpCoinBonus } from "../../simulation/progression";
import { nearestRoadPoint, roadSegmentsForTiles, yawForDirection, type WorldRoadSegment } from "../../simulation/roadGeometry";
import { buildRoadGraph, findRoute, type RoadGraph } from "../../simulation/routing";
import { loadSave, mergeCloudSave, saveGame } from "../../simulation/saveGame";
import { matchesPlaceCategory, placeDisplayName } from "../../simulation/placeQueries";
import { mpsToKmh } from "../../simulation/speed";
import { TrafficSystem } from "../../simulation/traffic";
import { applyUpgrades, getUpgradeLevels, purchaseUpgrade, upgradeLabels } from "../../simulation/upgrades";
import { VehicleController } from "../../simulation/VehicleController";
import { createRace, isRaceLive, placeFor, raceElapsedMs, raceReward, recordRaceResult, shouldCloseRace, type RaceState } from "../../simulation/race";
import { RemotePlayerBuffer, sanitizePlayerName, sanitizeRoomCode, sanitizeSnapshot } from "../../simulation/remotePlayers";
import { LocalTabTransport, sanitizeRoomEvent, SupabaseRealtimeTransport, type MultiplayerTransport, type RoomEvent } from "../../services/multiplayer";
import { createOnlineService, type OnlineService } from "../../services/onlineService";
import { MapStreamingService } from "../../services/MapStreamingService";
import { CachedPlacesService, GooglePlacesProxyService, type PlacesService } from "../../services/placesService";
import { formatDistance, Hud, MINIMAP_ZOOM_LEVELS, type MinimapOverlay, type MissionBoardEntry, type OnlineHudState } from "../../ui/Hud";
import { guideReviewFor } from "../../data/guideReviews";
import { buildArcadeVisualSettings } from "../arcadeVisuals";
import { WorldRenderer } from "../WorldRenderer";

const WAYPOINT_RADIUS_METERS = 35;
const PICKUP_RADIUS_METERS = 3.4;
const CAMERA_MODES: CameraMode[] = ["chase", "far", "hood", "drone"];
const cameraModeLabels: Record<CameraMode, string> = { chase: "Chase cam", far: "Far chase cam", hood: "Hood cam", drone: "Drone cam" };

// `?start=13.7400,100.4970` spawns the car at a lat/lng (handy for sharing spots and testing districts).
export function parseStartParam(search: string): { lat: number; lng: number } | undefined {
  const value = new URLSearchParams(search).get("start");
  if (!value) return undefined;
  const [lat, lng] = value.split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 13.4 || lat > 14.1 || lng < 100.2 || lng > 100.95) return undefined;
  return { lat, lng };
}

// Per-page identity so two tabs (or two guests sharing an account) show up as separate drivers.
function createSessionPlayerId(): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  return `p-${random}`;
}

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
  private readonly audio = new GameAudio();
  private readonly collectibles = new CollectibleField();
  private readonly traffic = new TrafficSystem();
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
  private readonly remotePlayers = new RemotePlayerBuffer();
  private readonly playerId = createSessionPlayerId();
  private readonly remoteNames = new Map<string, string>();
  private transport?: MultiplayerTransport;
  private snapshotSeq = 0;
  private lastSnapshotSent = 0;
  private lastOnlineHud = 0;
  private race?: RaceState;
  private raceFinished = false;
  private lastCloudSave = 0;
  private lastStreamUpdate = 0;
  private streamInFlight?: Promise<void>;
  private worldAnchor = createWorldAnchor({ lat: 13.7515, lng: 100.4929 });
  private nitro: NitroState = createNitroState();
  private nitroTuning: NitroTuning = nitroTuningForLevel(0);
  private nitroActive = false;
  private drift: DriftState = createDriftState();
  private missionTimer?: MissionRunTimer;
  private roadTileKey = "";
  private roadSegments: WorldRoadSegment[] = [];
  private minimapRoadsKey = "";
  private minimapRoads: MinimapOverlay["roads"] = [];
  private visiblePickups: Collectible[] = [];
  private lastPickupRefresh = 0;
  private minimapZoomIndex = 0;
  private pendingDistance = 0;
  private statsFlushTimer = 0;
  private panelsDirty = true;
  private lastPanelRefresh = 0;
  private guideTarget?: PlaceSummary;
  private lastGuideRefresh = 0;
  private mapAreas: MapArea[] = [];
  private roadGraph?: RoadGraph;
  private routeWorld?: WorldMeters[];
  private routeKey = "";
  private lastRouteTime = 0;
  private minimapTarget?: PlaceSummary;

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
    this.save = this.withDailyChallenges(loadSave());
    this.applySettings();
    this.applyVehicle(this.save.activeVehicleId);
    const fallback = new CachedPlacesService(bangkokWorld.places);
    const placesApiBase = import.meta.env.VITE_PLACES_API_BASE ?? (window.location.port === "5173" ? "" : "/api");
    this.placesService = placesApiBase ? new GooglePlacesProxyService(placesApiBase, fallback) : fallback;
    this.online = createOnlineService();
    this.hud.setHandlers({
      onSelectVehicle: (id) => this.selectVehicle(id),
      onUpgrade: (slot) => this.buyUpgrade(slot),
      onPaint: (color) => this.paintVehicle(color),
      onStartMission: (id) => this.startMissionById(id),
      onSettingsChange: (patch) => this.changeSettings(patch),
      onResume: () => this.setPaused(false),
      onPanelOpen: () => {
        this.refreshPanels(true);
        this.refreshGuide();
      },
      onNavigate: (placeId) => this.navigateTo(placeId),
      onCancelNavigation: () => this.clearNavigation(),
      onOpenPlace: (placeId) => void this.openPlace(placeId),
      onJoinRoom: (name, room) => void this.joinRoom(name, room),
      onEmote: (emote) => this.sendEmote(emote),
      onStartRace: () => this.startRace(),
      onJumpToPlayer: (id) => void this.jumpToPlayer(id),
      onCopyInvite: () => void this.copyInvite(),
    });
    this.refreshPanels(true);
  }

  async start(): Promise<void> {
    await this.refreshPlaces();
    await this.physics.init();
    await this.loadMapLayers();
    const requestedStart = parseStartParam(window.location.search);
    if (requestedStart) {
      this.worldAnchor = createWorldAnchor(requestedStart, this.worldAnchor.version + 1);
      this.renderer.setWorldOriginOffset(this.worldAnchor);
    }
    const startOnRoad = geoToLocal(requestedStart ?? { lat: 13.752, lng: 100.4928 }, this.worldAnchor);
    this.vehicle.teleportLocal(startOnRoad.x, startOnRoad.z, Math.PI / 2, 0);
    await this.updateStreaming(true);
    this.profile = await this.online.ensureProfile();
    const cloud = await this.online.loadCloudSave(this.profile.id);
    this.save = this.withDailyChallenges(mergeCloudSave(this.save, cloud));
    this.resetInterruptedTimedRun();
    this.applySettings();
    this.applyVehicle(this.save.activeVehicleId);
    this.refreshPanels(true);
    await this.joinRoom();
    this.hud.toast("Welcome to Bangkok", "Shift = nitro · Space = drift · J = missions", "info");
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
    const ui = this.input.consumeUiActions();
    if (actions.pause) {
      this.setPaused(!this.paused);
    }
    this.handleUiActions(ui);

    if (!this.paused) {
      const steering = actions.steerLeft !== actions.steerRight;
      const drifting = isDrifting({ handbrake: actions.handbrake, steering, speedMps: this.vehicle.state.speed });
      const nitroUpdate = updateNitro(
        this.nitro,
        dt,
        { wantsBoost: actions.boost, accelerating: actions.accelerate, speedMps: this.vehicle.state.speed, drifting },
        this.nitroTuning,
      );
      this.nitro = nitroUpdate.state;
      this.nitroActive = nitroUpdate.active;
      const vehicleState = this.vehicle.update(dt, { ...actions, boost: nitroUpdate.active });
      this.recenterIfNeeded();
      this.physics.syncVehicle(vehicleState.position.x, vehicleState.position.y, vehicleState.position.z, vehicleState.rotation);
      this.physics.step();
      this.updateDriftScore(dt, actions.handbrake, steering);
      this.updatePickups(time);
      this.updateTraffic(dt);
      this.trackDriving(dt);
      this.checkDiscovery();
      this.checkMissionProgress();
      this.updateMissionTimer(dt);
      this.renderer.update(vehicleState);
      void this.updateStreaming(false, time);
      this.audio.updateEngine({
        speedKmh: mpsToKmh(vehicleState.speed),
        throttle: actions.accelerate,
        boosting: this.nitroActive,
        drifting: this.drift.active,
      });
    }

    this.updateVisiblePlaces();
    const activeMission = this.getActiveMission();
    const progress = ensureMissionProgress(this.save, activeMission);
    const missionStop = activeWaypoint(activeMission, progress, this.places);
    const raceTarget = this.race && this.race.closedAt === undefined ? this.places.find((place) => place.id === this.race?.targetId) : undefined;
    const waypoint = raceTarget ?? this.guideTarget ?? missionStop;
    const waypointLocal = waypoint ? geoToLocal(waypoint, this.worldAnchor) : undefined;
    if (raceTarget) {
      this.updateRace(time, raceTarget);
    } else {
      this.updateNavigation(waypointLocal);
    }
    if (this.hud.isPanelOpen("guide") && time - this.lastGuideRefresh > 1500) {
      this.refreshGuide(true);
    }
    const nearby = this.findNearbyPlace();
    const missionHud = {
      waitingForStart: Boolean(activeMission.timeLimit) && !this.missionTimer,
      remainingSeconds: this.missionTimer ? remainingSeconds(this.missionTimer, activeMission) : undefined,
      elapsedSeconds: this.missionTimer ? totalRunSeconds(this.missionTimer) : undefined,
    };
    this.hud.update(this.vehicle.state, activeMission, this.save, nearby, waypoint, waypointLocal, missionHud, missionStop);
    this.hud.updateNitro(this.nitro.charge, this.nitroActive, this.nitro.locked);
    this.hud.updateDrift(this.drift);
    this.minimapTarget = waypoint;
    this.updateRoute(time, waypoint);
    this.hud.drawMinimap(this.vehicle.state, this.visiblePlaces, (place) => geoToLocal(place, this.worldAnchor), waypoint, this.minimapOverlay());
    this.updateFastTravelPrompt(waypoint);
    this.renderer.setVisiblePlaces(this.visiblePlaces);
    this.renderer.setActiveWaypoint(waypoint);
    this.updateMultiplayer(time);
    if (this.panelsDirty && time - this.lastPanelRefresh > 1000 && !this.hud.isPointerOverPanel()) {
      this.refreshPanels();
    }
    void this.maybeOpenNearbyDetail(nearby);
    void this.tickOnline(time);
    this.renderer.render();
    requestAnimationFrame(this.tick);
  };

  private setPaused(paused: boolean): void {
    this.paused = paused;
    document.body.classList.toggle("paused", paused);
    this.hud.setPaused(paused);
    this.audio.setEnabled(!paused && this.save.settings.soundEnabled);
    this.audio.setHorn(false);
  }

  private handleUiActions(ui: UiActions): void {
    this.audio.setHorn(ui.horn && !this.paused);
    if (ui.toggleGarage) this.hud.togglePanel("garage");
    if (ui.toggleMissions) this.hud.togglePanel("missions");
    if (ui.toggleGuide) this.hud.togglePanel("guide");
    if (ui.toggleOnline) this.hud.togglePanel("online");
    if (ui.zoomMinimap) {
      this.minimapZoomIndex = (this.minimapZoomIndex + 1) % MINIMAP_ZOOM_LEVELS.length;
      this.hud.setMinimapZoomLabel(this.minimapZoomIndex);
    }
    if (ui.cycleCamera) {
      const current = CAMERA_MODES.indexOf(this.save.settings.cameraMode);
      const next = CAMERA_MODES[(current + 1) % CAMERA_MODES.length];
      this.changeSettings({ cameraMode: next });
      this.hud.toast(cameraModeLabels[next]);
    }
    if (ui.respawn && !this.paused) {
      this.respawnOnRoad();
    }
  }

  // Every save mutation that can move XP, coins or unlocks goes through here so level-ups,
  // new cars and achievements are detected in one place.
  private commitSave(next: SaveGame): void {
    let save = next;
    const previousLevel = levelForXp(this.save.player.xp);
    const nextLevel = levelForXp(save.player.xp);
    if (nextLevel > previousLevel) {
      let bonus = 0;
      for (let level = previousLevel + 1; level <= nextLevel; level += 1) bonus += levelUpCoinBonus(level);
      save = addRewards(save, { coins: bonus });
      this.hud.toast(`Level up! LV ${nextLevel}`, `Bonus ฿ ${bonus}`, "reward");
      this.audio.playLevelUp();
    }

    const unlocked = new Set(save.unlockedVehicles);
    for (const vehicle of vehicleDefinitions) {
      if (!unlocked.has(vehicle.id) && isVehicleUnlocked(vehicle, save.player.xp, save.completedMissionIds)) {
        unlocked.add(vehicle.id);
        this.hud.toast("New car unlocked", `${vehicle.brand} ${vehicle.model} is in your garage`, "reward");
      }
    }
    if (unlocked.size !== save.unlockedVehicles.length) {
      save = { ...save, unlockedVehicles: [...unlocked] };
    }

    const achievements = newlyUnlockedAchievements(save);
    if (achievements.length) {
      save = grantAchievements(save, achievements);
      for (const achievement of achievements) {
        this.hud.toast(`Achievement: ${achievement.title}`, `${achievement.titleTh} · ฿ ${achievement.rewardCoins}`, "reward");
      }
    }

    this.save = save;
    saveGame(save);
    this.panelsDirty = true;
  }

  private withDailyChallenges(save: SaveGame): SaveGame {
    const daily = ensureDailyChallenges(save.career.daily, localDateKey());
    return daily === save.career.daily ? save : { ...save, career: { ...save.career, daily } };
  }

  private recordDaily(save: SaveGame, kind: DailyChallengeKind, amount: number): SaveGame {
    const current = this.withDailyChallenges(save);
    const daily = current.career.daily;
    if (!daily) return current;
    const result = advanceDailyChallenges(daily, kind, amount);
    let next: SaveGame = { ...current, career: { ...current.career, daily: result.state } };
    for (const challenge of result.completed) {
      next = addRewards(next, { xp: challenge.rewardXp, coins: challenge.rewardCoins });
      this.hud.toast("Daily challenge complete", `${challenge.title} · ฿ ${challenge.rewardCoins} · ${challenge.rewardXp} XP`, "reward");
      this.audio.playMissionComplete();
    }
    return next;
  }

  private refreshPanels(force = false): void {
    if (!force && !this.panelsDirty) return;
    this.panelsDirty = false;
    this.lastPanelRefresh = performance.now();
    this.hud.updateGarage(vehicleDefinitions, this.save);
    this.hud.updateMissions(this.missionBoardEntries(), this.save);
    this.hud.updateSettings(this.save.settings);
  }

  private missionBoardEntries(): MissionBoardEntry[] {
    const { xp } = this.save.player;
    const completedIds = this.save.completedMissionIds;
    return this.missions.map((mission) => {
      const available = isMissionAvailable(mission, xp, completedIds);
      const completed = completedIds.includes(mission.id);
      const active = mission.id === this.save.player.activeMissionId && !isMissionComplete(this.save, mission);
      const requirements = [
        mission.unlockRequirements.minXp ? `${mission.unlockRequirements.minXp} XP` : "",
        ...(mission.unlockRequirements.completedMissionIds ?? [])
          .filter((id) => !completedIds.includes(id))
          .map((id) => this.missions.find((candidate) => candidate.id === id)?.title ?? id),
      ].filter(Boolean);
      return {
        mission,
        status: !available ? "locked" : active ? "active" : completed ? "completed" : "available",
        lockReason: available ? undefined : `Requires ${requirements.join(", ")}`,
        reward: missionReward(mission, completed),
        replay: completed,
        bestTimeMs: this.save.career.bestTimesMs[mission.id],
      };
    });
  }

  private refreshGuide(background = false): void {
    this.lastGuideRefresh = performance.now();
    const here = localToGeo(this.vehicle.state.position, this.worldAnchor);
    this.hud.updateGuide(
      this.places.map((place) => ({ place, review: guideReviewFor(place.id), distanceMeters: distanceMetersBetweenGeo(here, place) })),
      background,
    );
  }

  private navigateTo(placeId: string): void {
    const place = this.places.find((candidate) => candidate.id === placeId);
    if (!place) return;
    this.guideTarget = place;
    this.hud.toast(`นำทางไป ${placeDisplayName(place)}`, "ตามเข็มทิศและเส้นบนแผนที่ · กด × เพื่อยกเลิก", "info");
    this.audio.playUi();
  }

  private clearNavigation(): void {
    if (this.race && this.race.closedAt === undefined) {
      this.race = { ...this.race, closedAt: performance.now() };
      this.hud.setCountdown(undefined);
      this.hud.toast("ออกจากการแข่งแล้ว", "", "info");
    }
    this.guideTarget = undefined;
    this.hud.setNavigation(undefined);
  }

  private updateNavigation(targetLocal?: { x: number; z: number }): void {
    if (!this.guideTarget || !targetLocal) {
      this.hud.setNavigation(undefined);
      return;
    }
    const here = localToGeo(this.vehicle.state.position, this.worldAnchor);
    const distance = distanceMetersBetweenGeo(here, this.guideTarget);
    const worldDistance = Math.hypot(targetLocal.x - this.vehicle.state.position.x, targetLocal.z - this.vehicle.state.position.z);
    if (worldDistance < WAYPOINT_RADIUS_METERS) {
      const arrived = this.guideTarget;
      this.clearNavigation();
      this.hud.toast(`ถึงแล้ว: ${placeDisplayName(arrived)}`, "เปิดรีวิวในไกด์", "reward");
      this.audio.playCheckpoint();
      void this.openPlace(arrived.id);
      return;
    }
    this.hud.setNavigation(`📍 ${placeDisplayName(this.guideTarget)} · ${formatDistance(distance)}`);
  }

  private async openPlace(placeId: string): Promise<void> {
    const detail = await this.placesService.getDetail(placeId, "th");
    if (!detail) return;
    const here = localToGeo(this.vehicle.state.position, this.worldAnchor);
    this.detailRequest = placeId;
    this.hud.openDetail(detail, distanceMetersBetweenGeo(here, detail));
  }

  private getActiveMission(): Mission {
    return this.missions.find((mission) => mission.id === this.save.player.activeMissionId) ?? this.missions[0];
  }

  private startMissionById(id: string): void {
    const mission = this.missions.find((candidate) => candidate.id === id);
    if (!mission || !isMissionAvailable(mission, this.save.player.xp, this.save.completedMissionIds)) return;
    this.missionTimer = undefined;
    this.commitSave(startMission(this.save, mission));
    this.hud.closePanels();
    this.hud.toast(`Mission: ${mission.title}`, mission.timeLimit ? `Reach the first stop to start the ${formatRaceTime(mission.timeLimit)} clock` : `${mission.waypoints.length} stops`, "info");
    this.audio.playUi();
    this.refreshPanels(true);
  }

  private resetInterruptedTimedRun(): void {
    const mission = this.getActiveMission();
    const progress = this.save.player.missionProgress;
    if (mission.timeLimit && progress?.missionId === mission.id && progress.completedAt === undefined && progress.reachedWaypointIds.length > 0) {
      this.save = startMission(this.save, mission);
      saveGame(this.save);
    }
  }

  private findNearbyPlace(): PlaceSummary | undefined {
    return this.places.find((place) => {
      const pos = geoToLocal(place, this.worldAnchor);
      return Math.hypot(pos.x - this.vehicle.state.position.x, pos.z - this.vehicle.state.position.z) < WAYPOINT_RADIUS_METERS;
    });
  }

  private checkDiscovery(): void {
    const nearby = this.findNearbyPlace();
    if (!nearby || this.save.discoveredPlaceIds.includes(nearby.id)) {
      return;
    }
    const xpReward = this.discoveryXpReward(nearby);
    let next: SaveGame = {
      ...this.save,
      player: {
        ...this.save.player,
        xp: this.save.player.xp + xpReward,
        discoveryDailyXpByDistrict: this.updatedDiscoveryXpLog(nearby, xpReward),
      },
      discoveredPlaceIds: [...this.save.discoveredPlaceIds, nearby.id],
    };
    next = this.recordDaily(next, "discoveries", 1);
    this.hud.toast(`Discovered ${placeDisplayName(nearby)}`, xpReward ? `+${xpReward} XP` : "Daily district XP cap reached", "reward");
    this.audio.playCheckpoint();
    this.commitSave(next);
  }

  private checkMissionProgress(): void {
    const mission = this.getActiveMission();
    const progress = ensureMissionProgress(this.save, mission);
    if (this.save.player.missionProgress !== progress) {
      this.save = { ...this.save, player: { ...this.save.player, missionProgress: progress } };
    }
    const waypoint = activeWaypoint(mission, progress, this.places);
    if (!waypoint) return;
    const pos = geoToLocal(waypoint, this.worldAnchor);
    if (Math.hypot(pos.x - this.vehicle.state.position.x, pos.z - this.vehicle.state.position.z) > WAYPOINT_RADIUS_METERS) {
      return;
    }
    const replay = this.save.completedMissionIds.includes(mission.id);
    const reachedBefore = progress.reachedWaypointIds.length;
    let next = advanceMissionAtWaypoint(this.save, mission, waypoint.id);
    const reachedAfter = next.player.missionProgress?.reachedWaypointIds.length ?? reachedBefore;
    if (reachedAfter === reachedBefore) return;

    if (!isMissionComplete(next, mission)) {
      if (mission.timeLimit && reachedAfter === 1) {
        this.missionTimer = startMissionTimer(mission.id);
        this.hud.toast("GO!", `Clock started: ${formatRaceTime(mission.timeLimit)}`, "warning");
      } else {
        this.hud.toast(`Checkpoint ${reachedAfter}/${mission.waypoints.length}`, placeDisplayName(waypoint), "info");
      }
      this.audio.playCheckpoint();
      this.commitSave(next);
      return;
    }

    const reward = missionReward(mission, replay);
    let detail = `+${reward.xp} XP · ฿ ${reward.coins}`;
    if (mission.timeLimit && this.missionTimer) {
      const timeMs = totalRunSeconds(this.missionTimer) * 1000;
      const best = recordBestTime(next, mission.id, timeMs);
      next = best.save;
      detail += ` · ${formatRaceTime(timeMs / 1000)}${best.improved ? " NEW BEST" : ""}`;
      if (this.profile) {
        void this.online.submitLeaderboardRun({
          missionId: mission.id,
          profileId: this.profile.id,
          vehicleId: this.save.activeVehicleId,
          timeMs: Math.round(timeMs),
          createdAt: new Date().toISOString(),
        });
      }
    }
    this.missionTimer = undefined;
    next = this.recordDaily(next, "missions", 1);
    this.hud.toast(`Mission complete: ${mission.title}`, detail, "reward");
    this.audio.playMissionComplete();
    this.commitSave(next);

    const upcoming = nextMissionAfter(this.missions, mission.id, this.save.player.xp, this.save.completedMissionIds);
    if (upcoming) {
      this.commitSave(startMission(this.save, upcoming));
      this.hud.toast(`Next mission: ${upcoming.title}`, "Open Missions (J) to pick another", "info");
    }
  }

  private updateMissionTimer(dt: number): void {
    if (!this.missionTimer) return;
    const mission = this.getActiveMission();
    if (mission.id !== this.missionTimer.missionId) {
      this.missionTimer = undefined;
      return;
    }
    this.missionTimer = tickMissionTimer(this.missionTimer, dt);
    if (isMissionTimerExpired(this.missionTimer, mission)) {
      this.missionTimer = undefined;
      this.commitSave(startMission(this.save, mission));
      this.hud.toast("Time's up!", "Head back to the first stop to retry", "danger");
      this.audio.playFail();
    }
  }

  private updateDriftScore(dt: number, handbrake: boolean, steering: boolean): void {
    const result = updateDrift(this.drift, dt, { handbrake, steering, speedMps: this.vehicle.state.speed });
    this.drift = result.state;
    if (!result.banked) return;
    const { points, multiplier } = result.banked;
    const rewards = driftRewards(points);
    let next = addRewards(this.save, rewards);
    next = maxStat(next, "bestDrift", points);
    next = addStat(next, "totalDrift", points);
    next = this.recordDaily(next, "drift_points", points);
    if (points >= 150) {
      this.hud.toast(`Drift ${points.toLocaleString("en-US")} x${multiplier}`, `+${rewards.xp} XP · ฿ ${rewards.coins}`, "reward");
    }
    this.commitSave(next);
  }

  private updatePickups(time: number): void {
    const vehicleWorld = localToWorldMeters(this.vehicle.state.position, this.worldAnchor);
    const picked = this.collectibles.collect(vehicleWorld, PICKUP_RADIUS_METERS, time);
    if (picked.length) {
      const coins = picked.filter((item) => item.kind === "coin").length;
      const nitroCans = picked.length - coins;
      let next = this.save;
      if (coins) {
        next = addRewards(next, { coins: coins * COIN_VALUE });
        next = addStat(next, "coinsCollected", coins);
        next = this.recordDaily(next, "coins", coins);
        this.audio.playCoin();
      }
      if (nitroCans) {
        this.nitro = addNitro(this.nitro, NITRO_PICKUP_AMOUNT * nitroCans);
        this.audio.playNitroPickup();
        this.hud.toast("Nitro refill", `+${Math.round(NITRO_PICKUP_AMOUNT * nitroCans * 100)}%`, "info");
      }
      this.commitSave(next);
      this.lastPickupRefresh = 0;
    }

    if (time - this.lastPickupRefresh > 120) {
      this.lastPickupRefresh = time;
      this.visiblePickups = this.collectibles.nearby(vehicleWorld, this.isMobileViewport() ? 160 : 240, this.isMobileViewport() ? 40 : 70, time);
      this.renderer.setPickups(this.visiblePickups.map((item) => ({ ...item, ...worldMetersToLocal(item, this.worldAnchor) })));
    }
  }

  private updateTraffic(dt: number): void {
    const vehicleWorld = localToWorldMeters(this.vehicle.state.position, this.worldAnchor);
    const events = this.traffic.update(dt, {
      x: vehicleWorld.x,
      z: vehicleWorld.z,
      yaw: this.vehicle.state.rotation,
      speed: this.vehicle.state.speed,
    });
    for (const event of events) {
      if (event.kind === "crash") {
        this.vehicle.applyImpact(event.impactSpeed > 12 ? -0.2 : 0.3);
        this.renderer.triggerImpact(Math.min(1.2, event.impactSpeed / 18));
        this.audio.playCrash(event.impactSpeed);
        if (this.drift.active) {
          this.drift = createDriftState();
          this.hud.toast("Drift lost", "Crashed into traffic", "danger");
        } else if (event.impactSpeed > 8) {
          this.hud.toast("Crash!", "Watch the traffic", "danger");
        }
        this.commitSave(addStat(this.save, "crashes", 1));
      } else {
        this.nitro = addNitro(this.nitro, 0.12);
        let next = addRewards(this.save, { xp: 10, coins: 5 });
        next = addStat(next, "nearMisses", 1);
        next = this.recordDaily(next, "near_misses", 1);
        this.hud.toast("Near miss!", "+10 XP · ฿ 5 · nitro", "reward");
        this.audio.playNearMiss();
        this.commitSave(next);
      }
    }
    this.renderer.setTrafficCars(
      this.traffic.cars.map((car) => ({ id: car.id, yaw: car.yaw, colorIndex: car.colorIndex, braking: car.braking, ...worldMetersToLocal(car, this.worldAnchor) })),
    );
  }

  private trackDriving(dt: number): void {
    this.pendingDistance += Math.abs(this.vehicle.state.speed) * dt;
    this.statsFlushTimer += dt;
    if (this.statsFlushTimer < 2) return;
    this.statsFlushTimer = 0;
    const distance = Math.round(this.pendingDistance);
    this.pendingDistance -= distance;
    let next = maxStat(this.save, "topSpeedKmh", Math.abs(mpsToKmh(this.vehicle.state.speed)));
    if (distance > 0) {
      next = addStat(next, "distanceMeters", distance);
      next = this.recordDaily(next, "distance", distance);
    }
    if (next !== this.save) this.commitSave(next);
  }

  private respawnOnRoad(): void {
    const vehicleWorld = localToWorldMeters(this.vehicle.state.position, this.worldAnchor);
    const nearest = nearestRoadPoint(this.roadSegments, vehicleWorld);
    if (!nearest || nearest.distance > 3_000) {
      this.hud.toast("No road nearby", "Try fast travel to a mission stop", "warning");
      return;
    }
    const { segment } = nearest;
    const forwardYaw = yawForDirection(segment.bx - segment.ax, segment.bz - segment.az);
    const headingDelta = Math.abs(Math.atan2(Math.sin(forwardYaw - this.vehicle.state.rotation), Math.cos(forwardYaw - this.vehicle.state.rotation)));
    const yaw = headingDelta > Math.PI / 2 ? forwardYaw + Math.PI : forwardYaw;
    const local = worldMetersToLocal(nearest, this.worldAnchor);
    this.vehicle.teleportLocal(local.x, local.z, yaw, 0);
    this.drift = createDriftState();
    this.hud.toast("Back on the road", `${Math.round(nearest.distance)} m`, "info");
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
      this.hud.openDetail(detail, 0);
    }
  }

  private selectVehicle(id: string): void {
    if (!this.save.unlockedVehicles.includes(id) && !isVehicleUnlocked(getVehicleDefinition(id), this.save.player.xp, this.save.completedMissionIds)) return;
    const unlockedVehicles = this.save.unlockedVehicles.includes(id) ? this.save.unlockedVehicles : [...this.save.unlockedVehicles, id];
    this.commitSave({ ...this.save, activeVehicleId: id, unlockedVehicles });
    this.applyVehicle(id);
    this.audio.playUi();
    this.refreshPanels(true);
  }

  private buyUpgrade(slot: UpgradeSlot): void {
    const result = purchaseUpgrade(this.save, this.save.activeVehicleId, slot);
    if (!result.ok) {
      this.hud.toast(result.reason === "max_level" ? "Already maxed" : "Not enough coins", "Collect coins, drift and clear missions", "warning");
      return;
    }
    this.commitSave(result.save);
    const level = getUpgradeLevels(this.save, this.save.activeVehicleId)[slot];
    this.hud.toast(`${upgradeLabels[slot].en} upgraded`, `Level ${level} · ฿ ${result.cost}`, "reward");
    this.audio.playLevelUp();
    this.applyVehicle(this.save.activeVehicleId);
    this.refreshPanels(true);
  }

  private paintVehicle(color: string): void {
    const vehicleId = this.save.activeVehicleId;
    this.commitSave({ ...this.save, vehiclePaint: { ...this.save.vehiclePaint, [vehicleId]: color } });
    this.applyVehicle(vehicleId);
    this.audio.playUi();
    this.refreshPanels(true);
  }

  private effectiveVehicle(id: string): VehicleDefinition {
    const definition = getVehicleDefinition(id);
    return {
      ...definition,
      stats: applyUpgrades(definition.stats, getUpgradeLevels(this.save, definition.id)),
      color: this.save.vehiclePaint[definition.id] ?? definition.color,
    };
  }

  private applyVehicle(id: string): void {
    const definition = this.effectiveVehicle(id);
    this.vehicle.setVehicle(definition);
    this.renderer.setVehicleDefinition(definition);
    this.nitroTuning = nitroTuningForLevel(getUpgradeLevels(this.save, definition.id).nitro);
  }

  private changeSettings(patch: Partial<SaveGame["settings"]>): void {
    this.commitSave({ ...this.save, settings: { ...this.save.settings, ...patch } });
    this.applySettings();
  }

  private applySettings(): void {
    const settings = this.save.settings;
    this.renderer.setGraphicsQuality(settings.graphicsQuality);
    this.renderer.setArcadeVisualSettings(buildArcadeVisualSettings(settings));
    this.renderer.setCameraMode(settings.cameraMode);
    this.audio.setEnabled(settings.soundEnabled && !this.paused);
    const mobile = this.isMobileViewport();
    this.traffic.setMaxCars(settings.graphicsQuality === "low" ? 8 : mobile ? 10 : 16);
    const viewRadius = { low: 700, medium: 1_000, high: 1_400 }[settings.graphicsQuality];
    this.mapStreaming.setViewRadius(mobile ? Math.min(viewRadius, 800) : viewRadius);
  }

  private minimapOverlay(): MinimapOverlay {
    const key = `${this.roadTileKey}|${this.worldAnchor.version}|${this.worldAnchor.worldMeters.x}|${this.worldAnchor.worldMeters.z}`;
    if (key !== this.minimapRoadsKey) {
      this.minimapRoadsKey = key;
      this.minimapRoads = this.roadSegments.map((segment) => {
        const a = worldMetersToLocal({ x: segment.ax, z: segment.az }, this.worldAnchor);
        const b = worldMetersToLocal({ x: segment.bx, z: segment.bz }, this.worldAnchor);
        return { ax: a.x, az: a.z, bx: b.x, bz: b.z, width: segment.width, kind: segment.kind };
      });
    }
    return {
      roads: this.minimapRoads,
      traffic: this.traffic.cars.map((car) => worldMetersToLocal(car, this.worldAnchor)),
      pickups: this.visiblePickups.map((item) => ({ kind: item.kind, ...worldMetersToLocal(item, this.worldAnchor) })),
      players: this.remotePlayers.views(performance.now()).map((view) => ({ color: view.color, name: view.name, ...geoToLocal(view, this.worldAnchor) })),
      areas: this.minimapAreas(),
      route: this.routeWorld?.map((point) => worldMetersToLocal(point, this.worldAnchor)),
      targetDistanceMeters: this.minimapTarget ? distanceMetersBetweenGeo(localToGeo(this.vehicle.state.position, this.worldAnchor), this.minimapTarget) : undefined,
      speedKmh: Math.abs(mpsToKmh(this.vehicle.state.speed)),
      theme: this.save.settings.visualMood === "neon_night" ? "dark" : "light",
      zoom: MINIMAP_ZOOM_LEVELS[this.minimapZoomIndex],
    };
  }

  // Road route from the car to the current target over the loaded road graph, refreshed every ~1.2 s.
  private updateRoute(time: number, target?: PlaceSummary): void {
    if (!target || !this.roadGraph) {
      this.routeWorld = undefined;
      this.routeKey = "";
      return;
    }
    const key = `${target.id}|${this.roadTileKey}`;
    if (key === this.routeKey && time - this.lastRouteTime < 1200) return;
    this.routeKey = key;
    this.lastRouteTime = time;
    const from = localToWorldMeters(this.vehicle.state.position, this.worldAnchor);
    const to = localToWorldMeters(geoToLocal(target, this.worldAnchor), this.worldAnchor);
    const path = findRoute(this.roadGraph, from, to);
    this.routeWorld = path ? [from, ...path, to] : undefined;
  }

  private minimapAreaCache?: { key: string; areas: NonNullable<MinimapOverlay["areas"]> };

  private minimapAreas(): MinimapOverlay["areas"] {
    const key = `${this.worldAnchor.version}|${this.worldAnchor.worldMeters.x}|${this.worldAnchor.worldMeters.z}|${this.mapAreas.length}`;
    if (this.minimapAreaCache?.key !== key) {
      this.minimapAreaCache = {
        key,
        areas: this.mapAreas.map((area) => ({ kind: area.kind, points: area.outer.map((point) => worldMetersToLocal(point, this.worldAnchor)) })),
      };
    }
    return this.minimapAreaCache.areas;
  }

  private async tickOnline(time: number): Promise<void> {
    if (!this.profile) return;
    if (time - this.lastCloudSave > 10000) {
      this.lastCloudSave = time;
      await this.online.saveCloud(this.profile.id, this.save);
    }
  }

  private async joinRoom(name?: string, room?: string): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const playerName = sanitizePlayerName(name ?? this.save.settings.playerName, `Driver ${this.playerId.slice(-4).toUpperCase()}`);
    const roomCode = sanitizeRoomCode(room ?? params.get("room") ?? this.save.settings.multiplayerRoom);
    if (playerName !== this.save.settings.playerName || roomCode !== this.save.settings.multiplayerRoom) {
      this.commitSave({ ...this.save, settings: { ...this.save.settings, playerName, multiplayerRoom: roomCode } });
    }
    const client = this.online.realtimeClient();
    this.transport ??= client ? new SupabaseRealtimeTransport(client) : new LocalTabTransport();
    for (const id of this.remotePlayers.ids()) this.remotePlayers.remove(id);
    await this.transport.join(roomCode, { id: this.playerId, name: playerName }, {
      onSnapshot: (raw) => {
        const snapshot = sanitizeSnapshot(raw);
        if (!snapshot || snapshot.id === this.playerId) return;
        if (!this.remoteNames.has(snapshot.id)) this.remoteNames.set(snapshot.id, snapshot.name);
        this.remotePlayers.push(snapshot, performance.now());
      },
      onEvent: (raw) => {
        const event = sanitizeRoomEvent(raw);
        if (event && event.from !== this.playerId) this.handleRoomEvent(event);
      },
      onJoin: (id, joinedName) => {
        if (id === this.playerId) return;
        this.remoteNames.set(id, sanitizePlayerName(joinedName));
        this.hud.toast(`${sanitizePlayerName(joinedName)} เข้าห้องแล้ว`, "กด O เพื่อดูผู้เล่น", "info");
      },
      onLeave: (id) => {
        const leftName = this.remoteNames.get(id);
        this.remotePlayers.remove(id);
        this.remoteNames.delete(id);
        if (leftName) this.hud.toast(`${leftName} ออกจากห้อง`, "", "info");
      },
    });
    if (name !== undefined || room !== undefined) {
      this.hud.toast(`เข้าห้อง ${roomCode}`, this.transport.kind === "supabase" ? "ออนไลน์ผ่าน Supabase" : "โหมดเครื่องเดียว: เปิดเกมอีกแท็บเพื่อเล่นด้วยกัน", "info");
    }
    this.lastOnlineHud = 0;
  }

  private updateMultiplayer(time: number): void {
    if (this.transport && time - this.lastSnapshotSent > 140) {
      this.lastSnapshotSent = time;
      const geo = localToGeo(this.vehicle.state.position, this.worldAnchor);
      this.transport.sendSnapshot({
        id: this.playerId,
        name: this.save.settings.playerName,
        vehicleId: this.save.activeVehicleId,
        color: this.save.vehiclePaint[this.save.activeVehicleId] ?? getVehicleDefinition(this.save.activeVehicleId).color,
        lat: geo.lat,
        lng: geo.lng,
        yaw: this.vehicle.state.rotation,
        speed: this.vehicle.state.speed,
        seq: this.snapshotSeq++,
      });
    }
    const views = this.remotePlayers.views(time);
    this.renderer.setRemotePlayers(
      views.map((view) => ({ ...view, ...geoToLocal(view, this.worldAnchor), emote: view.emote?.text })),
    );
    if (time - this.lastOnlineHud > 800) {
      this.lastOnlineHud = time;
      this.hud.updateOnline(this.onlineHudState(time), true);
    }
  }

  private onlineHudState(time: number): OnlineHudState {
    const here = localToGeo(this.vehicle.state.position, this.worldAnchor);
    const race = this.race;
    const target = race ? this.places.find((place) => place.id === race.targetId) : undefined;
    return {
      transport: this.transport?.kind ?? "offline",
      room: this.save.settings.multiplayerRoom,
      name: this.save.settings.playerName,
      players: this.remotePlayers
        .views(time)
        .map((view) => ({
          id: view.id,
          name: view.name,
          vehicleName: `${getVehicleDefinition(view.vehicleId).brand} ${getVehicleDefinition(view.vehicleId).model}`,
          distanceMeters: distanceMetersBetweenGeo(here, view),
        }))
        .sort((a, b) => a.distanceMeters - b.distanceMeters),
      race:
        race && target
          ? {
              targetName: placeDisplayName(target),
              status: race.closedAt !== undefined ? "closed" : time < race.startsAt ? "countdown" : "live",
              seconds: time < race.startsAt ? (race.startsAt - time) / 1000 : raceElapsedMs(race, time) / 1000,
              results: race.results.map((result) => ({ name: result.name, timeMs: result.timeMs, self: result.playerId === this.playerId })),
            }
          : undefined,
    };
  }

  private handleRoomEvent(event: RoomEvent): void {
    if (event.kind === "emote") {
      this.remotePlayers.setEmote(event.from, event.emote, performance.now() + 3500);
      this.hud.toast(`${sanitizePlayerName(event.name)} ${event.emote}`, "", "info");
      return;
    }
    if (event.kind === "race_start") {
      this.beginRace(event.raceId, event.targetId, sanitizePlayerName(event.name), event.countdownMs);
      return;
    }
    if (event.kind === "race_finish" && this.race?.raceId === event.raceId) {
      this.race = recordRaceResult(this.race, { playerId: event.from, name: sanitizePlayerName(event.name), timeMs: event.timeMs });
      const place = placeFor(this.race, event.from);
      this.hud.toast(`🏁 ${sanitizePlayerName(event.name)} เข้าเส้นชัยอันดับ ${place}`, formatRaceTime(event.timeMs / 1000), "info");
      this.lastOnlineHud = 0;
    }
  }

  private sendEmote(emote: string): void {
    this.transport?.sendEvent({ kind: "emote", from: this.playerId, name: this.save.settings.playerName, emote });
    this.hud.toast(`คุณส่ง ${emote}`, this.remotePlayers.ids().length ? "" : "ยังไม่มีเพื่อนในห้อง", "info");
  }

  private startRace(): void {
    if (this.race && this.race.closedAt === undefined) {
      this.hud.toast("มีการแข่งอยู่แล้ว", "รอให้จบก่อนเริ่มใหม่", "warning");
      return;
    }
    const here = localToGeo(this.vehicle.state.position, this.worldAnchor);
    const candidates = this.places
      .filter((place) => place.source === "curated")
      .map((place) => ({ place, distance: distanceMetersBetweenGeo(here, place) }))
      .filter(({ distance }) => distance >= 900 && distance <= 3_000);
    const pool = candidates.length
      ? candidates
      : this.places
          .filter((place) => place.source === "curated")
          .map((place) => ({ place, distance: distanceMetersBetweenGeo(here, place) }))
          .filter(({ distance }) => distance >= 400)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 5);
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (!pick) {
      this.hud.toast("ไม่พบจุดหมายสำหรับแข่ง", "ลองขับไปย่านอื่นก่อน", "warning");
      return;
    }
    const raceId = `${this.playerId}-${Date.now()}`;
    const countdownMs = 5_000;
    this.transport?.sendEvent({ kind: "race_start", from: this.playerId, name: this.save.settings.playerName, raceId, targetId: pick.place.id, countdownMs });
    this.beginRace(raceId, pick.place.id, this.save.settings.playerName, countdownMs);
  }

  private beginRace(raceId: string, targetId: string, hostName: string, countdownMs: number): void {
    if (this.race && this.race.closedAt === undefined && this.race.raceId !== raceId) return;
    const target = this.places.find((place) => place.id === targetId);
    if (!target) return;
    this.race = createRace(raceId, targetId, hostName, performance.now(), countdownMs);
    this.raceFinished = false;
    this.guideTarget = undefined;
    this.hud.closePanels();
    this.hud.toast(`🏁 ${hostName} ท้าแข่งไป ${placeDisplayName(target)}`, `เริ่มใน ${Math.round(countdownMs / 1000)} วินาที · ห้ามวาร์ป`, "warning");
    this.lastOnlineHud = 0;
  }

  private updateRace(time: number, target: PlaceSummary): void {
    const race = this.race;
    if (!race) return;
    if (time < race.startsAt) {
      this.hud.setCountdown(String(Math.ceil((race.startsAt - time) / 1000)));
    } else if (time - race.startsAt < 900) {
      this.hud.setCountdown("GO!");
    } else {
      this.hud.setCountdown(undefined);
    }
    const here = localToGeo(this.vehicle.state.position, this.worldAnchor);
    const elapsed = raceElapsedMs(race, time);
    this.hud.setNavigation(`🏁 ${placeDisplayName(target)} · ${formatDistance(distanceMetersBetweenGeo(here, target))} · ${formatRaceTime(elapsed / 1000)}`);

    const local = geoToLocal(target, this.worldAnchor);
    const arrived = Math.hypot(local.x - this.vehicle.state.position.x, local.z - this.vehicle.state.position.z) < WAYPOINT_RADIUS_METERS;
    if (isRaceLive(race, time) && arrived && !this.raceFinished) {
      this.raceFinished = true;
      const name = this.save.settings.playerName;
      this.race = recordRaceResult(race, { playerId: this.playerId, name, timeMs: elapsed });
      this.transport?.sendEvent({ kind: "race_finish", from: this.playerId, name, raceId: race.raceId, timeMs: elapsed });
      const place = placeFor(this.race, this.playerId);
      const reward = raceReward(place);
      this.hud.toast(`🏁 เข้าเส้นชัยอันดับ ${place}!`, `${formatRaceTime(elapsed / 1000)} · +${reward.xp} XP · ฿ ${reward.coins}`, "reward");
      this.audio.playMissionComplete();
      this.commitSave(addRewards(this.save, reward));
      this.lastOnlineHud = 0;
    }

    if (this.race && shouldCloseRace(this.race, time)) {
      this.race = { ...this.race, closedAt: time };
      const podium = this.race.results.slice(0, 3).map((result, index) => `${index + 1}. ${result.name}`).join("  ");
      this.hud.toast("การแข่งจบแล้ว", podium || "ไม่มีใครเข้าเส้นชัย", "info");
      this.hud.setCountdown(undefined);
      this.hud.setNavigation(undefined);
      this.lastOnlineHud = 0;
    }
  }

  private async jumpToPlayer(playerId: string): Promise<void> {
    if (this.race && this.race.closedAt === undefined) {
      this.hud.toast("ห้ามวาร์ประหว่างแข่ง", "", "warning");
      return;
    }
    const snapshot = this.remotePlayers.latest(playerId);
    if (!snapshot) return;
    this.hud.closePanels();
    await this.fastTravelTo({ target: { lat: snapshot.lat, lng: snapshot.lng } }, snapshot.yaw);
    this.hud.toast(`วาร์ปไปหา ${snapshot.name}`, "", "info");
  }

  private async copyInvite(): Promise<void> {
    const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(this.save.settings.multiplayerRoom)}`;
    try {
      await navigator.clipboard.writeText(url);
      this.hud.toast("คัดลอกลิงก์แล้ว", url, "reward");
    } catch {
      this.hud.toast("ลิงก์ชวนเพื่อน", url, "info");
    }
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
    this.lastPickupRefresh = 0;
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
      this.renderer.setWorldOriginOffset(this.worldAnchor);
      this.renderer.setVisibleRoadTiles(state.loadedTiles);
      this.physics.setRoadTiles(state.loadedTiles, this.worldAnchor);
      this.setRoadTiles(state.loadedTiles);
      this.renderer.updateAreas(this.vehicle.state.position);
      const geo = localToGeo(this.vehicle.state.position, this.worldAnchor);
      void this.loadNearbyPlaces(geo.lat, geo.lng, isMobile ? 1_500 : 2_500);
    })().finally(() => {
      this.streamInFlight = undefined;
    });

    return this.streamInFlight;
  }

  private async loadMapLayers(): Promise<void> {
    const [areas, osmPlaces, attribution] = await Promise.all([
      this.mapStreaming.loadAreas(),
      this.mapStreaming.loadOsmPlaces(),
      this.mapStreaming.attribution(),
    ]);
    this.renderer.setMapAreas(areas);
    this.mapAreas = areas;
    this.hud.setMapAttribution(attribution);
    if (osmPlaces.length) {
      this.mergePlaces(osmPlaces);
    }
  }

  // Curated entries win over OSM duplicates (same name within 150 m) so guide reviews stay attached.
  private mergePlaces(incoming: PlaceSummary[]): void {
    const byId = new Map(this.places.map((place) => [place.id, place]));
    const curated = this.places.filter((place) => place.source === "curated");
    for (const place of incoming) {
      const duplicate = curated.some(
        (existing) =>
          distanceMetersBetweenGeo(existing, place) < 150 &&
          (existing.nameTh === place.nameTh || (existing.nameEn && existing.nameEn.toLowerCase() === place.nameEn?.toLowerCase())),
      );
      if (!duplicate && !byId.has(place.id)) byId.set(place.id, place);
    }
    this.places = [...byId.values()];
    this.placesService.addPlaces?.(incoming);
  }

  private setRoadTiles(tiles: RoadTile[]): void {
    const key = tiles
      .map((tile) => tile.id)
      .sort()
      .join(",");
    if (key === this.roadTileKey) return;
    this.roadTileKey = key;
    this.roadSegments = roadSegmentsForTiles(tiles);
    this.roadGraph = buildRoadGraph(this.roadSegments);
    this.routeKey = "";
    this.collectibles.setTiles(tiles);
    this.traffic.setRoads(this.roadSegments);
    this.lastPickupRefresh = 0;
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
    if (!waypoint || (this.race && this.race.closedAt === undefined)) {
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
    this.hud.updateFastTravel(fastTravelPoint, () => void this.fastTravelTo(fastTravelPoint), this.missionTimer ? FAST_TRAVEL_PENALTY_SECONDS : 0);
  }

  private async fastTravelTo(point: { target: { lat: number; lng: number } }, yaw = this.vehicle.state.rotation): Promise<void> {
    if (this.missionTimer) {
      this.missionTimer = addMissionPenalty(this.missionTimer, FAST_TRAVEL_PENALTY_SECONDS);
      this.hud.toast("Fast travel penalty", `+${FAST_TRAVEL_PENALTY_SECONDS}s on the clock`, "warning");
    }
    this.commitSave(addStat(this.save, "fastTravels", 1));
    this.worldAnchor = createWorldAnchor(point.target, this.worldAnchor.version + 1);
    this.vehicle.teleportLocal(0, 0, yaw, 0);
    this.renderer.setWorldOriginOffset(this.worldAnchor);
    this.physics.clearRoadTiles();
    this.traffic.clear();
    this.drift = createDriftState();
    this.detailRequest = undefined;
    this.lastPickupRefresh = 0;
    await this.updateStreaming(true);
  }
}
