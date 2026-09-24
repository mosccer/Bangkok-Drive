import type { CameraMode, DailyChallengeKind, GhostPlayerState, Mission, PlaceQuery, PlaceSummary, PlayerProfile, RoadTile, SaveGame, UpgradeSlot, VehicleDefinition } from "../../types";
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
import { loadSave, mergeCloudSave, saveGame } from "../../simulation/saveGame";
import { matchesPlaceCategory, placeDisplayName } from "../../simulation/placeQueries";
import { mpsToKmh } from "../../simulation/speed";
import { TrafficSystem } from "../../simulation/traffic";
import { applyUpgrades, getUpgradeLevels, purchaseUpgrade, upgradeLabels } from "../../simulation/upgrades";
import { VehicleController } from "../../simulation/VehicleController";
import { pruneStaleGhosts } from "../../simulation/ghosts";
import { createOnlineService, type OnlineService } from "../../services/onlineService";
import { MapStreamingService } from "../../services/MapStreamingService";
import { CachedPlacesService, GooglePlacesProxyService, type PlacesService } from "../../services/placesService";
import { Hud, MINIMAP_ZOOM_LEVELS, type MinimapOverlay, type MissionBoardEntry } from "../../ui/Hud";
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
  private currentChunkId = "real-phra-nakhon-00";
  private ghostStates: GhostPlayerState[] = [];
  private lastGhostTrack = 0;
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
      onPanelOpen: () => this.refreshPanels(true),
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
    await this.joinGhostChunk(this.currentChunkId);
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
    const waypoint = activeWaypoint(activeMission, progress, this.places);
    const waypointLocal = waypoint ? geoToLocal(waypoint, this.worldAnchor) : undefined;
    const nearby = this.findNearbyPlace();
    const missionHud = {
      waitingForStart: Boolean(activeMission.timeLimit) && !this.missionTimer,
      remainingSeconds: this.missionTimer ? remainingSeconds(this.missionTimer, activeMission) : undefined,
      elapsedSeconds: this.missionTimer ? totalRunSeconds(this.missionTimer) : undefined,
    };
    this.hud.update(this.vehicle.state, activeMission, this.save, nearby, waypoint, waypointLocal, missionHud);
    this.hud.updateNitro(this.nitro.charge, this.nitroActive, this.nitro.locked);
    this.hud.updateDrift(this.drift);
    this.hud.drawMinimap(this.vehicle.state, this.visiblePlaces, (place) => geoToLocal(place, this.worldAnchor), waypoint, this.minimapOverlay());
    this.updateFastTravelPrompt(waypoint);
    this.renderer.setVisiblePlaces(this.visiblePlaces);
    this.renderer.setActiveWaypoint(waypoint);
    this.renderer.setGhostCars(pruneStaleGhosts(this.ghostStates, performance.now()));
    if (this.panelsDirty && time - this.lastPanelRefresh > 1000) {
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
      this.hud.openDetail(detail);
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
      zoom: MINIMAP_ZOOM_LEVELS[this.minimapZoomIndex],
    };
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
    this.hud.updateFastTravel(fastTravelPoint, () => void this.fastTravelTo(fastTravelPoint), this.missionTimer ? FAST_TRAVEL_PENALTY_SECONDS : 0);
  }

  private async fastTravelTo(point: { target: { lat: number; lng: number } }): Promise<void> {
    if (this.missionTimer) {
      this.missionTimer = addMissionPenalty(this.missionTimer, FAST_TRAVEL_PENALTY_SECONDS);
      this.hud.toast("Fast travel penalty", `+${FAST_TRAVEL_PENALTY_SECONDS}s on the clock`, "warning");
    }
    this.commitSave(addStat(this.save, "fastTravels", 1));
    this.worldAnchor = createWorldAnchor(point.target, this.worldAnchor.version + 1);
    this.vehicle.teleportLocal(0, 0, this.vehicle.state.rotation, 0);
    this.renderer.setWorldOriginOffset(this.worldAnchor);
    this.physics.clearRoadTiles();
    this.traffic.clear();
    this.drift = createDriftState();
    this.detailRequest = undefined;
    this.lastPickupRefresh = 0;
    await this.updateStreaming(true);
  }
}
