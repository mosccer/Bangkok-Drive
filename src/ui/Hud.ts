import { isVehicleUnlocked } from "../data/vehicles";
import { bangkokDistricts } from "../data/bangkokDistricts";
import { achievementDefinitions } from "../simulation/achievements";
import { MAX_DRIFT_MULTIPLIER, type DriftState } from "../simulation/drift";
import { formatRaceTime } from "../simulation/missionTimer";
import { placeDisplayName } from "../simulation/placeQueries";
import { levelProgress } from "../simulation/progression";
import { mpsToKmh } from "../simulation/speed";
import { getUpgradeLevels, MAX_UPGRADE_LEVEL, paintPalette, upgradeCost, upgradeLabels, upgradeSlots } from "../simulation/upgrades";
import type {
  CameraMode,
  GuideReview,
  Mission,
  PlaceCategory,
  PlaceDetail,
  PlaceQuery,
  PlaceSummary,
  SaveGame,
  UpgradeSlot,
  VehicleDefinition,
  VehicleState,
} from "../types";
import { bearingDegrees, cardinalFor, escapeHtml, formatNumber, headingDegrees, relativeBearing } from "./format";

export const MINIMAP_ZOOM_LEVELS = [0.12, 0.28, 0.05];
const MINIMAP_WORLD_SCALE = MINIMAP_ZOOM_LEVELS[0];
const COMPASS_PIXELS_PER_DEGREE = 2;

// Heading-up projection: forward is screen-up and the driver's right side is screen-right.
export function minimapWorldToScreen(
  vehicle: Pick<VehicleState, "position" | "rotation">,
  world: { x: number; z: number },
  width: number,
  height: number,
  scale = MINIMAP_WORLD_SCALE,
): { x: number; y: number } {
  const dx = world.x - vehicle.position.x;
  const dz = world.z - vehicle.position.z;
  const forward = dx * Math.sin(vehicle.rotation) + dz * Math.cos(vehicle.rotation);
  const right = -dx * Math.cos(vehicle.rotation) + dz * Math.sin(vehicle.rotation);
  return {
    x: width / 2 + right * scale,
    y: height / 2 - forward * scale,
  };
}

export type MissionBoardStatus = "locked" | "available" | "active" | "completed";

export interface MissionBoardEntry {
  mission: Mission;
  status: MissionBoardStatus;
  bestTimeMs?: number;
  lockReason?: string;
  reward: { xp: number; coins: number };
  replay: boolean;
}

export interface MinimapOverlay {
  roads: Array<{ ax: number; az: number; bx: number; bz: number; width: number; kind: string }>;
  traffic: Array<{ x: number; z: number }>;
  pickups: Array<{ x: number; z: number; kind: "coin" | "nitro" }>;
  zoom: number;
}

export interface MissionHudState {
  remainingSeconds?: number;
  elapsedSeconds?: number;
  waitingForStart: boolean;
}

export type ToastTone = "info" | "reward" | "warning" | "danger";

export interface GuideEntry {
  place: PlaceSummary;
  review?: GuideReview;
  distanceMeters: number;
}

type GuideTab = "all" | "temple" | "cafe" | "attraction" | "food";

const guideTabs: Array<{ id: GuideTab; label: string }> = [
  { id: "all", label: "ทั้งหมด" },
  { id: "temple", label: "วัด" },
  { id: "cafe", label: "คาเฟ่" },
  { id: "attraction", label: "เที่ยว" },
  { id: "food", label: "อาหาร" },
];

const tabCategories: Record<Exclude<GuideTab, "all">, PlaceCategory[]> = {
  temple: ["temple"],
  cafe: ["cafe", "bakery", "dessert"],
  attraction: ["tourist_attraction", "museum", "park", "shopping_mall", "market", "night_market"],
  food: ["street_food", "restaurant"],
};

const categoryLabels: Record<PlaceCategory, string> = {
  tourist_attraction: "แหล่งท่องเที่ยว",
  temple: "วัด",
  museum: "พิพิธภัณฑ์",
  park: "สวนสาธารณะ",
  shopping_mall: "ห้างสรรพสินค้า",
  market: "ตลาด",
  night_market: "ตลาดกลางคืน",
  restaurant: "ร้านอาหาร",
  street_food: "สตรีทฟู้ด",
  cafe: "คาเฟ่",
  bakery: "เบเกอรี่",
  dessert: "ของหวาน",
};

export function filterGuideEntries(entries: GuideEntry[], tab: GuideTab, search: string, sort: "near" | "score"): GuideEntry[] {
  const query = search.trim().toLowerCase();
  return entries
    .filter((entry) => tab === "all" || tabCategories[tab].includes(entry.place.category))
    .filter(
      (entry) =>
        !query ||
        [entry.place.nameTh, entry.place.nameEn ?? "", entry.place.name, entry.place.districtName, ...entry.place.tags].some((text) => text.toLowerCase().includes(query)),
    )
    .sort((a, b) =>
      sort === "score"
        ? (b.review?.score ?? b.place.rating ?? 0) - (a.review?.score ?? a.place.rating ?? 0) || a.distanceMeters - b.distanceMeters
        : a.distanceMeters - b.distanceMeters,
    );
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} ม.` : `${(meters / 1000).toFixed(1)} กม.`;
}

function stars(score: number): string {
  const full = Math.round(score);
  return "★".repeat(full) + "☆".repeat(Math.max(0, 5 - full));
}

export interface HudHandlers {
  onSelectVehicle: (id: string) => void;
  onUpgrade: (slot: UpgradeSlot) => void;
  onPaint: (color: string) => void;
  onStartMission: (missionId: string) => void;
  onSettingsChange: (patch: Partial<SaveGame["settings"]>) => void;
  onResume: () => void;
  onPanelOpen: () => void;
  onNavigate: (placeId: string) => void;
  onCancelNavigation: () => void;
  onOpenPlace: (placeId: string) => void;
}

type PanelName = "garage" | "missions" | "settings" | "guide";

const cameraLabels: Record<CameraMode, string> = {
  chase: "Chase",
  far: "Far chase",
  hood: "Hood",
  drone: "Drone",
};

export class Hud {
  readonly root: HTMLDivElement;
  private readonly speed: HTMLElement;
  private readonly gear: HTMLElement;
  private readonly nitroFill: HTMLElement;
  private readonly nitroMeter: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly objectiveTimer: HTMLElement;
  private readonly poiPrompt: HTMLElement;
  private readonly drawer: HTMLElement;
  private readonly drawerBody: HTMLElement;
  private readonly levelBadge: HTMLElement;
  private readonly levelFill: HTMLElement;
  private readonly coinsLabel: HTMLElement;
  private readonly foundLabel: HTMLElement;
  private readonly driftPopup: HTMLElement;
  private readonly toastStack: HTMLElement;
  private readonly fastTravelButton: HTMLButtonElement;
  private readonly categorySelect: HTMLSelectElement;
  private readonly districtSelect: HTMLSelectElement;
  private readonly panels: Record<PanelName, HTMLElement>;
  private readonly garageBody: HTMLElement;
  private readonly missionsBody: HTMLElement;
  private readonly settingsBody: HTMLElement;
  private readonly guideList: HTMLElement;
  private readonly navChip: HTMLElement;
  private readonly navText: HTMLElement;
  private guideEntries: GuideEntry[] = [];
  private guideTab: GuideTab = "all";
  private guideSearch = "";
  private guideSort: "near" | "score" = "near";
  private guideHtml = "";
  private pointerOverPanel = false;
  private readonly pauseOverlay: HTMLElement;
  private readonly minimap: HTMLCanvasElement;
  private readonly minimapContext: CanvasRenderingContext2D;
  private readonly minimapZoomLabel: HTMLElement;
  private readonly compassTape: HTMLElement;
  private readonly compassWaypoint: HTMLElement;
  private readonly compassVal: HTMLElement;
  private handlers?: HudHandlers;
  private lastCareerKey = "";

  constructor(host: HTMLElement, onPlaceFiltersChange: (query: PlaceQuery) => void = () => undefined) {
    this.root = document.createElement("div");
    this.root.className = "hud";
    this.root.innerHTML = `
      <div class="objective-chip" data-ui="objective-wrap">
        <span data-ui="objective">Loading Bangkok route...</span>
        <span class="objective-timer hidden" data-ui="objective-timer"></span>
      </div>
      <div class="nav-chip hidden" data-ui="nav-chip">
        <span data-ui="nav-text"></span>
        <button class="nav-cancel" data-ui="nav-cancel" aria-label="Stop navigation">×</button>
      </div>
      <div class="compass-wrapper">
        <div class="compass-needle">▼</div>
        <div class="compass-viewport">
          <div class="compass-tape" data-ui="compass-tape"></div>
          <div class="compass-waypoint-marker hidden" data-ui="compass-waypoint">◆</div>
        </div>
        <div class="compass-heading-text" data-ui="compass-val">000° N</div>
      </div>
      <div class="menu-row">
        <button class="icon-button pause-button" data-control="pause" aria-label="Pause">II</button>
        <button class="menu-button" data-ui="garage-button" title="Garage (G)">Garage</button>
        <button class="menu-button" data-ui="missions-button" title="Missions (J)">Missions</button>
        <button class="menu-button" data-ui="guide-button" title="Bangkok Guide (B)">Guide</button>
        <button class="icon-button" data-ui="settings-button" aria-label="Settings" title="Settings">⚙</button>
      </div>
      <div class="minimap-wrap">
        <canvas class="minimap" width="360" height="360" data-ui="minimap"></canvas>
        <span class="minimap-zoom" data-ui="minimap-zoom">M · 1x</span>
      </div>
      <div class="speedometer">
        <strong data-ui="speed">0</strong><span>km/h · <b data-ui="gear">N</b></span>
        <div class="nitro-meter" data-ui="nitro-meter" title="Nitro (Shift)">
          <i data-ui="nitro-fill"></i>
          <em>N₂O</em>
        </div>
      </div>
      <div class="career-strip" data-ui="career">
        <span class="level-badge" data-ui="level">LV 1</span>
        <span class="level-bar"><i data-ui="level-fill"></i></span>
        <span class="coin-label" data-ui="coins">฿ 0</span>
        <span class="found-label" data-ui="found">Found 0</span>
      </div>
      <div class="drift-popup hidden" data-ui="drift"></div>
      <div class="toast-stack" data-ui="toasts" aria-live="polite"></div>
      <button class="fast-travel-button hidden" data-ui="fast-travel">Fast travel</button>
      <div class="place-toolbar">
        <select data-ui="category-filter" aria-label="Place category">
          <option value="">All</option>
          <option value="tourist_attraction">Tour</option>
          <option value="temple">Temples</option>
          <option value="museum">Museums</option>
          <option value="park">Parks</option>
          <option value="shopping_mall">Malls</option>
          <option value="market">Markets</option>
          <option value="night_market">Night</option>
          <option value="restaurant">Food</option>
          <option value="street_food">Street</option>
          <option value="cafe">Cafe</option>
          <option value="bakery">Bakery</option>
          <option value="dessert">Dessert</option>
        </select>
        <select data-ui="district-filter" aria-label="Bangkok district">
          <option value="">Bangkok</option>
          ${bangkokDistricts.map((district) => `<option value="${district.id}">${district.nameEn}</option>`).join("")}
        </select>
        <button data-ui="preset-food">Nearby food</button>
        <button data-ui="preset-cafe">Cafe trail</button>
        <button data-ui="preset-tour">Tour spots</button>
        <button data-ui="preset-temple">Temples</button>
      </div>
      <div class="rotate-hint">Rotate for landscape driving</div>
      <div class="map-attribution hidden" data-ui="map-attribution"></div>
      <button class="poi-prompt hidden" data-ui="poi-prompt"></button>
      <aside class="poi-drawer" data-ui="drawer" aria-live="polite">
        <div class="drawer-head">
          <strong>Bangkok Guide</strong>
          <button class="icon-button" data-ui="close-drawer" aria-label="Close">x</button>
        </div>
        <div class="drawer-body" data-ui="drawer-body"></div>
      </aside>
      <aside class="side-panel" data-ui="garage-panel">
        <div class="drawer-head">
          <strong>Bangkok Garage</strong>
          <button class="icon-button" data-close-panel aria-label="Close">x</button>
        </div>
        <div class="panel-body" data-ui="garage-body"></div>
      </aside>
      <aside class="side-panel" data-ui="missions-panel">
        <div class="drawer-head">
          <strong>Missions &amp; Career</strong>
          <button class="icon-button" data-close-panel aria-label="Close">x</button>
        </div>
        <div class="panel-body" data-ui="missions-body"></div>
      </aside>
      <aside class="side-panel guide-panel" data-ui="guide-panel">
        <div class="drawer-head">
          <strong>Bangkok Guide · แนะนำที่เที่ยว</strong>
          <button class="icon-button" data-close-panel aria-label="Close">x</button>
        </div>
        <div class="guide-controls">
          <div class="guide-tabs" data-ui="guide-tabs">
            ${guideTabs.map((tab) => `<button data-tab="${tab.id}" class="${tab.id === "all" ? "active" : ""}">${tab.label}</button>`).join("")}
          </div>
          <div class="guide-filters">
            <input type="search" placeholder="ค้นหาชื่อ ย่าน หรือแท็ก" data-ui="guide-search" aria-label="Search places" />
            <select data-ui="guide-sort" aria-label="Sort">
              <option value="near">ใกล้ที่สุด</option>
              <option value="score">คะแนนสูงสุด</option>
            </select>
          </div>
        </div>
        <div class="panel-body guide-list" data-ui="guide-list"></div>
      </aside>
      <aside class="side-panel" data-ui="settings-panel">
        <div class="drawer-head">
          <strong>Settings</strong>
          <button class="icon-button" data-close-panel aria-label="Close">x</button>
        </div>
        <div class="panel-body" data-ui="settings-body"></div>
      </aside>
      <div class="pause-overlay hidden" data-ui="pause-overlay">
        <div class="pause-card">
          <h2>Paused</h2>
          <button class="primary-button" data-ui="resume">Resume</button>
          <div class="controls-help">
            <span><kbd>W</kbd><kbd>S</kbd> Drive / brake</span>
            <span><kbd>A</kbd><kbd>D</kbd> Steer</span>
            <span><kbd>Space</kbd> Drift</span>
            <span><kbd>Shift</kbd> Nitro</span>
            <span><kbd>C</kbd> Camera</span>
            <span><kbd>M</kbd> Map zoom</span>
            <span><kbd>R</kbd> Back to road</span>
            <span><kbd>H</kbd> Horn</span>
            <span><kbd>G</kbd> Garage</span>
            <span><kbd>J</kbd> Missions</span>
          </div>
        </div>
      </div>
      <div class="mobile-controls">
        <div class="touch-stick" data-control="stick"><span></span></div>
        <div class="mobile-utility">
          <button data-control="camera" aria-label="Camera">CAM</button>
          <button data-control="horn" aria-label="Horn">HORN</button>
        </div>
        <div class="pedals">
          <button data-control="boost">N₂O</button>
          <button data-control="throttle">GO</button>
          <button data-control="brake">BRK</button>
          <button data-control="drift">DRIFT</button>
        </div>
      </div>
    `;
    host.append(this.root);

    this.speed = this.mustFind("[data-ui='speed']");
    this.gear = this.mustFind("[data-ui='gear']");
    this.nitroFill = this.mustFind("[data-ui='nitro-fill']");
    this.nitroMeter = this.mustFind("[data-ui='nitro-meter']");
    this.objective = this.mustFind("[data-ui='objective']");
    this.objectiveTimer = this.mustFind("[data-ui='objective-timer']");
    this.poiPrompt = this.mustFind("[data-ui='poi-prompt']");
    this.drawer = this.mustFind("[data-ui='drawer']");
    this.drawerBody = this.mustFind("[data-ui='drawer-body']");
    this.levelBadge = this.mustFind("[data-ui='level']");
    this.levelFill = this.mustFind("[data-ui='level-fill']");
    this.coinsLabel = this.mustFind("[data-ui='coins']");
    this.foundLabel = this.mustFind("[data-ui='found']");
    this.driftPopup = this.mustFind("[data-ui='drift']");
    this.toastStack = this.mustFind("[data-ui='toasts']");
    this.fastTravelButton = this.mustFind<HTMLButtonElement>("[data-ui='fast-travel']");
    this.categorySelect = this.mustFind<HTMLSelectElement>("[data-ui='category-filter']");
    this.districtSelect = this.mustFind<HTMLSelectElement>("[data-ui='district-filter']");
    this.panels = {
      garage: this.mustFind("[data-ui='garage-panel']"),
      missions: this.mustFind("[data-ui='missions-panel']"),
      settings: this.mustFind("[data-ui='settings-panel']"),
      guide: this.mustFind("[data-ui='guide-panel']"),
    };
    this.guideList = this.mustFind("[data-ui='guide-list']");
    this.navChip = this.mustFind("[data-ui='nav-chip']");
    this.navText = this.mustFind("[data-ui='nav-text']");
    this.garageBody = this.mustFind("[data-ui='garage-body']");
    this.missionsBody = this.mustFind("[data-ui='missions-body']");
    this.settingsBody = this.mustFind("[data-ui='settings-body']");
    this.pauseOverlay = this.mustFind("[data-ui='pause-overlay']");
    this.minimap = this.mustFind<HTMLCanvasElement>("[data-ui='minimap']");
    this.minimapZoomLabel = this.mustFind("[data-ui='minimap-zoom']");
    const ctx = this.minimap.getContext("2d");
    if (!ctx) throw new Error("Minimap canvas context unavailable");
    this.minimapContext = ctx;

    this.compassTape = this.mustFind("[data-ui='compass-tape']");
    this.compassWaypoint = this.mustFind("[data-ui='compass-waypoint']");
    this.compassVal = this.mustFind("[data-ui='compass-val']");
    this.initCompassTape();

    this.mustFind("[data-ui='close-drawer']").addEventListener("click", () => this.closeDrawer());
    this.mustFind("[data-ui='garage-button']").addEventListener("click", () => this.togglePanel("garage"));
    this.mustFind("[data-ui='missions-button']").addEventListener("click", () => this.togglePanel("missions"));
    this.mustFind("[data-ui='settings-button']").addEventListener("click", () => this.togglePanel("settings"));
    this.mustFind("[data-ui='guide-button']").addEventListener("click", () => this.togglePanel("guide"));
    this.mustFind("[data-ui='nav-cancel']").addEventListener("click", () => this.handlers?.onCancelNavigation());
    for (const tab of this.root.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
      tab.addEventListener("click", () => {
        this.guideTab = tab.dataset.tab as GuideTab;
        for (const other of this.root.querySelectorAll("[data-tab]")) other.classList.toggle("active", other === tab);
        this.renderGuide();
        tab.blur();
      });
    }
    const search = this.mustFind<HTMLInputElement>("[data-ui='guide-search']");
    search.addEventListener("input", () => {
      this.guideSearch = search.value;
      this.renderGuide();
    });
    const sort = this.mustFind<HTMLSelectElement>("[data-ui='guide-sort']");
    sort.addEventListener("change", () => {
      this.guideSort = sort.value === "score" ? "score" : "near";
      this.renderGuide();
      sort.blur();
    });
    for (const panel of Object.values(this.panels)) {
      panel.addEventListener("pointerenter", () => {
        this.pointerOverPanel = true;
      });
      panel.addEventListener("pointerleave", () => {
        this.pointerOverPanel = false;
      });
    }
    this.guideList.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>("[data-open], [data-go]");
      if (!button) return;
      if (button.dataset.open) {
        this.handlers?.onOpenPlace(button.dataset.open);
      } else if (button.dataset.go) {
        this.handlers?.onNavigate(button.dataset.go);
        this.closePanels();
      }
    });
    this.drawerBody.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-navigate]");
      if (target?.dataset.navigate) {
        this.handlers?.onNavigate(target.dataset.navigate);
        this.closeDrawer();
      }
    });
    this.mustFind("[data-ui='resume']").addEventListener("click", () => this.handlers?.onResume());
    for (const button of this.root.querySelectorAll<HTMLElement>("[data-close-panel]")) {
      button.addEventListener("click", () => this.closePanels());
    }
    const emitFilter = () => {
      onPlaceFiltersChange({
        category: (this.categorySelect.value || undefined) as PlaceCategory | undefined,
        districtId: this.districtSelect.value || undefined,
        limit: 150,
        lang: "th",
      });
      this.categorySelect.blur();
      this.districtSelect.blur();
    };
    this.categorySelect.addEventListener("change", emitFilter);
    this.districtSelect.addEventListener("change", emitFilter);
    const presets: Array<[string, PlaceCategory]> = [
      ["preset-food", "street_food"],
      ["preset-cafe", "cafe"],
      ["preset-tour", "tourist_attraction"],
      ["preset-temple", "temple"],
    ];
    for (const [ui, category] of presets) {
      this.mustFind(`[data-ui='${ui}']`).addEventListener("click", (event) => {
        this.categorySelect.value = category;
        emitFilter();
        (event.currentTarget as HTMLElement).blur();
      });
    }
  }

  setMapAttribution(text?: string): void {
    const label = this.mustFind("[data-ui='map-attribution']");
    label.textContent = text ? `Map data ${text}` : "";
    label.classList.toggle("hidden", !text);
  }

  setHandlers(handlers: HudHandlers): void {
    this.handlers = handlers;
  }

  update(
    vehicle: VehicleState,
    mission: Mission,
    save: SaveGame,
    nearby?: PlaceSummary,
    waypoint?: PlaceSummary,
    waypointLocal?: { x: number; z: number },
    missionState?: MissionHudState,
    missionStop: PlaceSummary | undefined = waypoint,
  ): void {
    this.speed.textContent = Math.round(Math.abs(mpsToKmh(vehicle.speed))).toString();
    this.gear.textContent = vehicle.gearMode === "reverse" ? "R" : vehicle.gearMode === "neutral" ? "N" : "D";
    const progress = save.player.missionProgress;
    const completed = progress?.missionId === mission.id && progress.completedAt !== undefined;
    const stopText = completed
      ? "Complete"
      : progress
        ? `${Math.min(progress.reachedWaypointIds.length + 1, mission.waypoints.length)}/${mission.waypoints.length}`
        : `${mission.waypoints.length} stops`;
    const objectiveText = `${mission.title} | ${stopText}${missionStop ? ` → ${placeDisplayName(missionStop)}` : ""}`;
    if (this.objective.textContent !== objectiveText) this.objective.textContent = objectiveText;
    this.updateMissionTimer(mission, missionState);
    this.updateCareer(save);

    if (nearby) {
      this.poiPrompt.classList.remove("hidden");
      this.poiPrompt.textContent = `Open ${placeDisplayName(nearby)}`;
      this.poiPrompt.onclick = () => this.handlers?.onOpenPlace(nearby.id);
    } else {
      this.poiPrompt.classList.add("hidden");
      this.poiPrompt.onclick = null;
    }

    const degrees = headingDegrees(vehicle.rotation);
    const roundDeg = Math.round(degrees) % 360;
    this.compassVal.textContent = `${roundDeg.toString().padStart(3, "0")}° ${cardinalFor(degrees)}`;
    const shift = -COMPASS_PIXELS_PER_DEGREE * degrees - 180;
    this.compassTape.style.transform = `translateX(${shift}px)`;

    if (waypoint && waypointLocal) {
      const dx = waypointLocal.x - vehicle.position.x;
      const dz = waypointLocal.z - vehicle.position.z;
      const relAngle = Math.hypot(dx, dz) > 1 ? relativeBearing(bearingDegrees(dx, dz), degrees) : 999;
      if (Math.abs(relAngle) <= 75) {
        this.compassWaypoint.classList.remove("hidden");
        this.compassWaypoint.style.transform = `translateX(${relAngle * COMPASS_PIXELS_PER_DEGREE}px)`;
      } else {
        this.compassWaypoint.classList.add("hidden");
      }
    } else {
      this.compassWaypoint.classList.add("hidden");
    }
  }

  updateNitro(charge: number, active: boolean, locked: boolean): void {
    this.nitroFill.style.transform = `scaleX(${Math.max(0, Math.min(1, charge)).toFixed(3)})`;
    this.nitroMeter.classList.toggle("active", active);
    this.nitroMeter.classList.toggle("locked", locked);
  }

  updateDrift(state: DriftState): void {
    if (!state.active || state.score < 20) {
      this.driftPopup.classList.add("hidden");
      return;
    }
    this.driftPopup.classList.remove("hidden");
    this.driftPopup.classList.toggle("max", state.multiplier >= MAX_DRIFT_MULTIPLIER);
    this.driftPopup.innerHTML = `<small>DRIFT</small><strong>${formatNumber(state.score)}</strong><em>x${state.multiplier}</em>`;
  }

  toast(title: string, detail = "", tone: ToastTone = "info"): void {
    const toast = document.createElement("div");
    toast.className = `toast toast-${tone}`;
    toast.innerHTML = `<strong>${escapeHtml(title)}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ""}`;
    this.toastStack.prepend(toast);
    while (this.toastStack.children.length > 4) {
      this.toastStack.lastElementChild?.remove();
    }
    window.setTimeout(() => toast.classList.add("leaving"), 3200);
    window.setTimeout(() => toast.remove(), 3700);
  }

  setPaused(paused: boolean): void {
    this.pauseOverlay.classList.toggle("hidden", !paused);
  }

  togglePanel(name: PanelName): void {
    const open = !this.panels[name].classList.contains("open");
    this.closePanels();
    if (open) {
      this.panels[name].classList.add("open");
      this.handlers?.onPanelOpen();
    }
  }

  closePanels(): void {
    for (const panel of Object.values(this.panels)) {
      panel.classList.remove("open");
    }
  }

  private updateMissionTimer(mission: Mission, state?: MissionHudState): void {
    if (!mission.timeLimit || !state) {
      this.objectiveTimer.classList.add("hidden");
      return;
    }
    this.objectiveTimer.classList.remove("hidden");
    if (state.waitingForStart) {
      this.objectiveTimer.textContent = `⏱ ${formatRaceTime(mission.timeLimit)} · reach start`;
      this.objectiveTimer.classList.remove("warning");
      return;
    }
    const remaining = state.remainingSeconds ?? 0;
    this.objectiveTimer.textContent = `⏱ ${formatRaceTime(remaining)}`;
    this.objectiveTimer.classList.toggle("warning", remaining < 20);
  }

  private updateCareer(save: SaveGame): void {
    const key = `${save.player.xp}|${save.career.coins}|${save.discoveredPlaceIds.length}`;
    if (key === this.lastCareerKey) return;
    this.lastCareerKey = key;
    const level = levelProgress(save.player.xp);
    this.levelBadge.textContent = `LV ${level.level}`;
    this.levelFill.style.transform = `scaleX(${level.fraction.toFixed(3)})`;
    this.levelBadge.title = `${formatNumber(save.player.xp)} / ${formatNumber(level.nextLevelXp)} XP`;
    this.coinsLabel.textContent = `฿ ${formatNumber(save.career.coins)}`;
    this.foundLabel.textContent = `Found ${save.discoveredPlaceIds.length}`;
  }

  private initCompassTape(): void {
    const tapeHtml: string[] = [];
    for (let deg = -90; deg <= 450; deg += 15) {
      let label = "";
      let tickClass = "tick-small";
      const normalizedDeg = (deg + 360) % 360;
      if (normalizedDeg % 90 === 0) {
        label = cardinalFor(normalizedDeg);
        tickClass = "tick-large cardinal";
      } else if (normalizedDeg % 45 === 0) {
        label = cardinalFor(normalizedDeg);
        tickClass = "tick-large";
      } else if (deg % 30 === 0) {
        label = normalizedDeg.toString();
        tickClass = "tick-medium";
      }
      const left = (deg + 90) * COMPASS_PIXELS_PER_DEGREE;
      tapeHtml.push(`
        <div class="compass-tick ${tickClass}" style="left: ${left}px">
          <span class="compass-tick-line"></span>
          ${label ? `<span class="compass-tick-label">${label}</span>` : ""}
        </div>
      `);
    }
    this.compassTape.innerHTML = tapeHtml.join("");
    this.compassTape.style.width = `${540 * COMPASS_PIXELS_PER_DEGREE}px`;
  }

  updateFastTravel(target: { label: string; distanceMeters: number } | undefined, onFastTravel: (() => void) | undefined, penaltySeconds = 0): void {
    if (!target || !onFastTravel) {
      this.fastTravelButton.classList.add("hidden");
      this.fastTravelButton.onclick = null;
      return;
    }
    this.fastTravelButton.classList.remove("hidden");
    const text = `Jump ${Math.round(target.distanceMeters / 100) / 10} km to ${target.label}${penaltySeconds ? ` (+${penaltySeconds}s)` : ""}`;
    if (this.fastTravelButton.textContent !== text) this.fastTravelButton.textContent = text;
    this.fastTravelButton.onclick = onFastTravel;
  }

  drawMinimap(
    vehicle: VehicleState,
    places: PlaceSummary[],
    worldPosition: (place: PlaceSummary) => { x: number; z: number },
    target?: PlaceSummary,
    overlay?: MinimapOverlay,
  ): void {
    const ctx = this.minimapContext;
    const width = this.minimap.width;
    const height = this.minimap.height;
    const scale = overlay?.zoom ?? MINIMAP_WORLD_SCALE;
    const project = (point: { x: number; z: number }) => minimapWorldToScreen(vehicle, point, width, height, scale);
    const inside = ({ x, y }: { x: number; y: number }, margin = 4) => x >= margin && x <= width - margin && y >= margin && y <= height - margin;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(11, 14, 18, 0.78)";
    ctx.fillRect(0, 0, width, height);

    if (overlay) {
      ctx.lineCap = "round";
      for (const road of overlay.roads) {
        const a = project({ x: road.ax, z: road.az });
        const b = project({ x: road.bx, z: road.bz });
        if (Math.max(a.x, b.x) < 0 || Math.min(a.x, b.x) > width || Math.max(a.y, b.y) < 0 || Math.min(a.y, b.y) > height) continue;
        ctx.strokeStyle = road.kind === "motorway" ? "rgba(250, 204, 21, 0.75)" : road.width >= 14 ? "rgba(226, 232, 240, 0.62)" : "rgba(148, 163, 184, 0.5)";
        ctx.lineWidth = Math.max(1.5, road.width * scale);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (const pickup of overlay.pickups) {
        const point = project(pickup);
        if (!inside(point)) continue;
        ctx.fillStyle = pickup.kind === "nitro" ? "#38bdf8" : "#fbbf24";
        ctx.fillRect(point.x - 1.5, point.y - 1.5, 3, 3);
      }
      ctx.fillStyle = "#e2e8f0";
      for (const car of overlay.traffic) {
        const point = project(car);
        if (!inside(point)) continue;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const place of places) {
      const point = project(worldPosition(place));
      if (!inside(point)) continue;
      ctx.fillStyle = this.placeColor(place.category);
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (target) {
      const { x, y } = project(worldPosition(target));
      const clampedX = Math.max(8, Math.min(width - 8, x));
      const clampedY = Math.max(8, Math.min(height - 8, y));
      ctx.strokeStyle = "#67e8f9";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(width / 2, height / 2);
      ctx.lineTo(clampedX, clampedY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#67e8f9";
      ctx.beginPath();
      ctx.arc(clampedX, clampedY, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);
    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.moveTo(width / 2, height / 2 - 8);
    ctx.lineTo(width / 2 - 5, height / 2 + 6);
    ctx.lineTo(width / 2 + 5, height / 2 + 6);
    ctx.closePath();
    ctx.fill();
  }

  setMinimapZoomLabel(zoomIndex: number): void {
    this.minimapZoomLabel.textContent = `M · ${["1x", "2x", "½x"][zoomIndex] ?? "1x"}`;
  }

  openDetail(detail: PlaceDetail, distanceMeters?: number): void {
    const review = detail.guideReview;
    const secondaryName = detail.nameEn && detail.nameEn !== placeDisplayName(detail) ? detail.nameEn : "";
    const description = review ? "" : (detail.descriptionTh ?? detail.description ?? "");
    this.drawerBody.innerHTML = `
      <h2>${escapeHtml(placeDisplayName(detail))}</h2>
      <p class="place-sub">${escapeHtml([secondaryName, categoryLabels[detail.category], detail.districtName, distanceMeters !== undefined ? formatDistance(distanceMeters) : ""].filter(Boolean).join(" · "))}</p>
      ${
        review
          ? `<section class="review-card">
        <div class="review-score"><span class="stars">${stars(review.score)}</span><strong>${review.score.toFixed(1)}</strong><small>คะแนนไกด์ MOSGAME</small></div>
        <p>${escapeHtml(review.summaryTh)}</p>
        <p class="review-en">${escapeHtml(review.summaryEn)}</p>
        <ul>${review.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        <p class="review-tip"><b>เคล็ดลับ</b> ${escapeHtml(review.tipTh)}</p>
        <p class="review-tip"><b>ช่วงเวลาแนะนำ</b> ${escapeHtml(review.bestTime)}</p>
      </section>`
          : description
            ? `<p>${escapeHtml(description)}</p>`
            : ""
      }
      <div class="drawer-actions">
        <button class="primary-button" data-navigate="${escapeHtml(detail.id)}">นำทางไปที่นี่</button>
        <a class="drawer-link" href="${escapeHtml(detail.googleMapsUri ?? "#")}" target="_blank" rel="noreferrer">Google Maps</a>
      </div>
      <dl>
        ${detail.rating ? `<dt>Google</dt><dd>★ ${detail.rating} (${formatNumber(detail.userRatingCount ?? 0)} รีวิว)</dd>` : ""}
        ${detail.openingHours?.length ? `<dt>เวลาเปิด</dt><dd>${escapeHtml(detail.openingHours[0])}</dd>` : ""}
        ${detail.addressTh || detail.addressEn ? `<dt>ที่อยู่</dt><dd>${escapeHtml(detail.addressTh ?? detail.addressEn ?? "")}</dd>` : ""}
      </dl>
      ${
        detail.userReviews?.length
          ? `<section class="user-reviews"><h3>รีวิวจากผู้ใช้ Google</h3>${detail.userReviews
              .map(
                (item) => `<article>
            <div><a href="${escapeHtml(item.authorUri ?? "#")}" target="_blank" rel="noreferrer">${escapeHtml(item.authorName)}</a>${item.rating ? ` <span class="stars">${stars(item.rating)}</span>` : ""}${item.relativeTime ? ` <small>${escapeHtml(item.relativeTime)}</small>` : ""}</div>
            <p>${escapeHtml(item.text)}</p>
          </article>`,
              )
              .join("")}</section>`
          : ""
      }
      ${detail.sourceAttributions.length ? `<p class="attribution">${detail.sourceAttributions.map((item) => escapeHtml(item.provider)).join(" | ")}</p>` : ""}
    `;
    this.drawer.classList.add("open");
  }

  updateGarage(vehicles: VehicleDefinition[], save: SaveGame): void {
    this.garageBody.innerHTML = "";
    const list = document.createElement("div");
    list.className = "garage-list";
    for (const vehicle of vehicles) {
      const unlocked = save.unlockedVehicles.includes(vehicle.id) || isVehicleUnlocked(vehicle, save.player.xp, save.completedMissionIds);
      const levels = getUpgradeLevels(save, vehicle.id);
      const tuned = upgradeSlots.reduce((sum, slot) => sum + levels[slot], 0);
      const lockText = vehicle.unlockRequirement.missionId
        ? `Clear ${vehicle.unlockRequirement.missionId.replace(/-/g, " ")}`
        : `Needs ${vehicle.unlockRequirement.xp ?? 0} XP`;
      const button = document.createElement("button");
      button.className = `garage-card ${vehicle.id === save.activeVehicleId ? "selected" : ""}`;
      button.disabled = !unlocked;
      button.innerHTML = `
        <span class="garage-swatch" style="--car-color:${save.vehiclePaint[vehicle.id] ?? vehicle.color}"></span>
        <strong>${escapeHtml(vehicle.brand)} ${escapeHtml(vehicle.model)}</strong>
        <small>${vehicle.class.toUpperCase()} | ${unlocked ? (tuned ? `Tuned +${tuned}` : "Ready") : escapeHtml(lockText)}</small>
        <span>ACC ${vehicle.stats.accelerationMps2.toFixed(1)} | GRIP ${vehicle.stats.grip.toFixed(2)} | TOP ${vehicle.stats.maxSpeedKmh}</span>
      `;
      button.addEventListener("click", () => this.handlers?.onSelectVehicle(vehicle.id));
      list.append(button);
    }
    this.garageBody.append(list);

    const active = vehicles.find((vehicle) => vehicle.id === save.activeVehicleId);
    if (!active) return;
    const levels = getUpgradeLevels(save, active.id);
    const tuning = document.createElement("section");
    tuning.className = "panel-section";
    tuning.innerHTML = `<h3>Tuning · ${escapeHtml(active.brand)} ${escapeHtml(active.model)} <span class="coin-pill">฿ ${formatNumber(save.career.coins)}</span></h3>`;
    for (const slot of upgradeSlots) {
      const cost = upgradeCost(levels[slot]);
      const row = document.createElement("div");
      row.className = "upgrade-row";
      const pips = Array.from({ length: MAX_UPGRADE_LEVEL }, (_, index) => `<i class="${index < levels[slot] ? "on" : ""}"></i>`).join("");
      row.innerHTML = `
        <span class="upgrade-name">${upgradeLabels[slot].en}<small>${upgradeLabels[slot].th}</small></span>
        <span class="upgrade-pips">${pips}</span>
      `;
      const buy = document.createElement("button");
      buy.className = "buy-button";
      buy.textContent = cost === undefined ? "MAX" : `฿ ${formatNumber(cost)}`;
      buy.disabled = cost === undefined || save.career.coins < cost;
      buy.addEventListener("click", () => this.handlers?.onUpgrade(slot));
      row.append(buy);
      tuning.append(row);
    }
    this.garageBody.append(tuning);

    const paint = document.createElement("section");
    paint.className = "panel-section";
    paint.innerHTML = "<h3>Paint shop</h3>";
    const swatches = document.createElement("div");
    swatches.className = "paint-swatches";
    const currentPaint = save.vehiclePaint[active.id] ?? active.color;
    for (const color of [active.color, ...paintPalette.filter((candidate) => candidate !== active.color)]) {
      const swatch = document.createElement("button");
      swatch.className = `paint-swatch ${color === currentPaint ? "selected" : ""}`;
      swatch.style.setProperty("--swatch", color);
      swatch.setAttribute("aria-label", `Paint ${color}`);
      swatch.addEventListener("click", () => this.handlers?.onPaint(color));
      swatches.append(swatch);
    }
    paint.append(swatches);
    this.garageBody.append(paint);
  }

  updateMissions(entries: MissionBoardEntry[], save: SaveGame): void {
    const daily = save.career.daily;
    const level = levelProgress(save.player.xp);
    const stats = save.career.stats;
    const owned = new Set(save.career.achievements);
    this.missionsBody.innerHTML = `
      <section class="panel-section profile-card">
        <div><span class="level-badge">LV ${level.level}</span> <strong>${formatNumber(save.player.xp)} XP</strong> <span class="coin-pill">฿ ${formatNumber(save.career.coins)}</span></div>
        <div class="stat-grid">
          <span>Distance<b>${(stats.distanceMeters / 1000).toFixed(1)} km</b></span>
          <span>Best drift<b>${formatNumber(stats.bestDrift)}</b></span>
          <span>Near misses<b>${formatNumber(stats.nearMisses)}</b></span>
          <span>Coins picked<b>${formatNumber(stats.coinsCollected)}</b></span>
          <span>Top speed<b>${Math.round(stats.topSpeedKmh)} km/h</b></span>
          <span>Crashes<b>${formatNumber(stats.crashes)}</b></span>
        </div>
      </section>
      <section class="panel-section">
        <h3>Daily challenges</h3>
        ${(daily?.challenges ?? [])
          .map(
            (challenge) => `
          <div class="challenge ${challenge.completed ? "done" : ""}">
            <span>${escapeHtml(challenge.title)}<small>฿ ${challenge.rewardCoins} · ${challenge.rewardXp} XP</small></span>
            <span class="challenge-bar"><i style="transform:scaleX(${(challenge.progress / challenge.target).toFixed(3)})"></i></span>
          </div>`,
          )
          .join("")}
      </section>
      <section class="panel-section">
        <h3>Missions</h3>
        <div class="mission-list" data-ui="mission-list"></div>
      </section>
      <section class="panel-section">
        <h3>Achievements · ${owned.size}/${achievementDefinitions.length}</h3>
        <div class="achievement-grid">
          ${achievementDefinitions
            .map(
              (achievement) => `
            <span class="achievement ${owned.has(achievement.id) ? "owned" : ""}" title="${escapeHtml(achievement.description)} · ฿ ${achievement.rewardCoins}">
              <strong>${escapeHtml(achievement.title)}</strong><small>${escapeHtml(achievement.description)}</small>
            </span>`,
            )
            .join("")}
        </div>
      </section>
    `;
    const list = this.missionsBody.querySelector<HTMLElement>("[data-ui='mission-list']");
    for (const entry of entries) {
      const card = document.createElement("div");
      card.className = `mission-card status-${entry.status}`;
      const badge = { locked: "Locked", available: "Available", active: "Active", completed: "Cleared" }[entry.status];
      card.innerHTML = `
        <div class="mission-head"><strong>${escapeHtml(entry.mission.title)}</strong><em>${badge}</em></div>
        <small>${escapeHtml(entry.mission.type.replace("_", " "))} · ${entry.mission.waypoints.length} stops${entry.mission.timeLimit ? ` · ${formatRaceTime(entry.mission.timeLimit)} limit` : ""}</small>
        <small>Reward ${entry.reward.xp} XP · ฿ ${entry.reward.coins}${entry.replay ? " (replay)" : ""}${entry.mission.reward.unlockVehicle && !entry.replay ? " · unlocks car" : ""}</small>
        ${entry.bestTimeMs !== undefined ? `<small class="best-time">Best ${formatRaceTime(entry.bestTimeMs / 1000)}</small>` : ""}
        ${entry.lockReason ? `<small class="lock-reason">${escapeHtml(entry.lockReason)}</small>` : ""}
      `;
      if (entry.status !== "locked") {
        const start = document.createElement("button");
        start.className = "primary-button small";
        start.textContent = entry.status === "active" ? "Restart" : entry.status === "completed" ? "Replay" : "Start";
        start.addEventListener("click", () => this.handlers?.onStartMission(entry.mission.id));
        card.append(start);
      }
      list?.append(card);
    }
  }

  isPanelOpen(name: PanelName): boolean {
    return this.panels[name].classList.contains("open");
  }

  // Background refreshes skip while the pointer is over the panel so buttons are never swapped mid-click.
  updateGuide(entries: GuideEntry[], background = false): void {
    this.guideEntries = entries;
    if (background && this.pointerOverPanel) return;
    this.renderGuide();
  }

  isPointerOverPanel(): boolean {
    return this.pointerOverPanel;
  }

  setNavigation(text?: string): void {
    this.navChip.classList.toggle("hidden", !text);
    if (text && this.navText.textContent !== text) this.navText.textContent = text;
  }

  private renderGuide(): void {
    const filtered = filterGuideEntries(this.guideEntries, this.guideTab, this.guideSearch, this.guideSort);
    const shown = filtered.slice(0, 60);
    const html = `
      <p class="guide-count">${filtered.length} แห่ง${filtered.length > shown.length ? ` · แสดง ${shown.length} แห่งแรก` : ""}</p>
      ${shown
        .map(
          ({ place, review, distanceMeters }) => `
        <article class="guide-card">
          <div class="guide-card-head">
            <strong>${escapeHtml(placeDisplayName(place))}</strong>
            ${review ? `<span class="guide-score" title="คะแนนไกด์">★ ${review.score.toFixed(1)}</span>` : place.rating ? `<span class="guide-score google" title="Google rating">G ${place.rating.toFixed(1)}</span>` : ""}
          </div>
          <small>${escapeHtml(place.nameEn && place.nameEn !== placeDisplayName(place) ? `${place.nameEn} · ` : "")}${escapeHtml(categoryLabels[place.category])} · ${escapeHtml(place.districtName)} · ${formatDistance(Math.round(distanceMeters / 100) * 100)}</small>
          ${review ? `<p>${escapeHtml(review.summaryTh)}</p>` : ""}
          <div class="guide-actions">
            <button class="ghost-button" data-open="${escapeHtml(place.id)}">รีวิว</button>
            <button class="primary-button small" data-go="${escapeHtml(place.id)}">นำทาง</button>
          </div>
        </article>`,
        )
        .join("")}
      <p class="guide-note">รีวิวในเกมเขียนโดยทีมไกด์ · ดูรีวิวผู้ใช้จริงผ่าน Google Maps · นำเข้าวัดทั้งหมดจาก OpenStreetMap ด้วย npm run osm:import</p>
    `;
    if (html === this.guideHtml) return;
    this.guideHtml = html;
    const scrollTop = this.panels.guide.scrollTop;
    this.guideList.innerHTML = html;
    this.panels.guide.scrollTop = scrollTop;
  }

  updateSettings(settings: SaveGame["settings"]): void {
    const option = (value: string, label: string, current: string) => `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`;
    this.settingsBody.innerHTML = `
      <section class="panel-section settings-grid">
        <label>Graphics
          <select data-setting="graphicsQuality">
            ${option("low", "Low (fast)", settings.graphicsQuality)}
            ${option("medium", "Medium", settings.graphicsQuality)}
            ${option("high", "High (bloom)", settings.graphicsQuality)}
          </select>
        </label>
        <label>Time of day
          <select data-setting="visualMood">
            ${option("day_festival", "Day", settings.visualMood)}
            ${option("boost_arcade", "Golden hour", settings.visualMood)}
            ${option("neon_night", "Neon night", settings.visualMood)}
          </select>
        </label>
        <label>Camera
          <select data-setting="cameraMode">
            ${(Object.keys(cameraLabels) as CameraMode[]).map((mode) => option(mode, cameraLabels[mode], settings.cameraMode)).join("")}
          </select>
        </label>
        <label class="toggle"><input type="checkbox" data-setting="soundEnabled" ${settings.soundEnabled ? "checked" : ""}/> Sound</label>
        <label class="toggle"><input type="checkbox" data-setting="cameraShake" ${settings.cameraShake ? "checked" : ""}/> Camera shake</label>
        <label class="toggle"><input type="checkbox" data-setting="speedEffects" ${settings.speedEffects ? "checked" : ""}/> Speed effects</label>
        <label class="toggle"><input type="checkbox" data-setting="reduceMotion" ${settings.reduceMotion ? "checked" : ""}/> Reduce motion</label>
      </section>
      <section class="panel-section controls-help">
        <span><kbd>Space</kbd> Drift for points + nitro</span>
        <span><kbd>Shift</kbd> Nitro</span>
        <span><kbd>C</kbd> Camera</span>
        <span><kbd>M</kbd> Map zoom</span>
        <span><kbd>R</kbd> Back to road</span>
        <span><kbd>H</kbd> Horn</span>
      </section>
    `;
    for (const input of this.settingsBody.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-setting]")) {
      input.addEventListener("change", () => {
        const key = input.dataset.setting as keyof SaveGame["settings"];
        const value = input instanceof HTMLInputElement && input.type === "checkbox" ? input.checked : input.value;
        this.handlers?.onSettingsChange({ [key]: value } as Partial<SaveGame["settings"]>);
        input.blur();
      });
    }
  }

  closeDrawer(): void {
    this.drawer.classList.remove("open");
  }

  private mustFind<T extends HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) {
      throw new Error(`Missing HUD element ${selector}`);
    }
    return element;
  }

  private placeColor(category: PlaceCategory): string {
    if (category === "cafe" || category === "bakery" || category === "dessert") return "#67e8f9";
    if (category === "restaurant" || category === "street_food" || category === "market" || category === "night_market") return "#f97316";
    if (category === "park") return "#84cc16";
    if (category === "temple") return "#fbbf24";
    return "#facc15";
  }
}
