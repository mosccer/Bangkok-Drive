import type { GeoPoint, MapArea, MapBuilding, NavTarget, PlaceSummary, WorldMeters } from "../types";
import { bangkokDistricts } from "../data/bangkokDistricts";
import { buildingUseLabels, inferBuildingUse } from "../data/buildingDetails";
import { MAP_SCALE } from "../data/coordinates";
import { pointInPolygon, type Rect } from "../simulation/geometry2d";
import { placeDisplayName } from "../simulation/placeQueries";
import { categoryGlyphs, categoryLabels, formatDistance, placeCategoryColor } from "./Hud";
import { escapeHtml } from "./format";

export interface MapRoad {
  a: WorldMeters;
  b: WorldMeters;
  width: number;
  kind: string;
}

// What the map reads from the game. Coordinates are global world meters (not floating-origin local).
export interface WorldMapData {
  vehicle: () => { position: WorldMeters; yaw: number };
  areas: () => MapArea[];
  majorRoads: (rect: Rect) => MapRoad[];
  // Full street detail from generated/downloaded tiles; `pending` asks the map to redraw later.
  detailTiles: (rect: Rect) => Promise<{ roads: MapRoad[]; buildings: MapBuilding[]; pending: boolean }>;
  places: () => PlaceSummary[];
  players: () => Array<{ position: WorldMeters; color: string; name: string }>;
  route: () => WorldMeters[] | undefined;
  target: () => NavTarget | undefined;
  favorites: () => NavTarget[];
  recent: () => NavTarget[];
  roadNameNear: (world: WorldMeters) => string | undefined;
  toWorld: (geo: GeoPoint) => WorldMeters;
  toGeo: (world: WorldMeters) => GeoPoint;
  insideWorld: (world: WorldMeters) => boolean;
  distanceMeters: (geo: GeoPoint) => number;
  canFastTravel: () => boolean;
}

export interface WorldMapActions {
  onNavigate: (target: NavTarget) => void;
  onFastTravel: (target: NavTarget) => void;
  onToggleFavorite: (target: NavTarget) => void;
  onCancelNavigation: () => void;
  onOpenPlace: (placeId: string) => void;
  onOpenBuilding: (buildingId: string) => void;
  onClose: () => void;
}

const MIN_SCALE = 0.012;
const MAX_SCALE = 1.6;
const DETAIL_SCALE = 0.09;
const BUILDING_SCALE = 0.32;
const DEFAULT_SCALE = 0.14;

const mapColors = {
  land: "#ece6d6",
  water: "#8ec5e8",
  park: "#b7dca0",
  temple: "#f0d9a3",
  road: "#ffffff",
  casing: "#bdb09b",
  major: "#fbbf5a",
  majorCasing: "#c9821a",
  building: "#d6ccbc",
  buildingEdge: "#b8ab96",
  landmark: "#c7b8e8",
  route: "#1d8fe0",
  routeCasing: "#0b4f86",
};

type Selection =
  | { kind: "place"; place: PlaceSummary }
  | { kind: "building"; building: MapBuilding }
  | { kind: "pin"; world: WorldMeters };

export class WorldMap {
  readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly card: HTMLElement;
  private readonly sideActive: HTMLElement;
  private readonly sideFavorites: HTMLElement;
  private readonly sideRecent: HTMLElement;
  private readonly searchInput: HTMLInputElement;
  private readonly searchResults: HTMLElement;
  private center: WorldMeters = { x: 0, z: 0 };
  private scale = DEFAULT_SCALE;
  private openState = false;
  private dirty = true;
  private frame = 0;
  private selection?: Selection;
  private detail: { key: string; roads: MapRoad[]; buildings: MapBuilding[] } = { key: "", roads: [], buildings: [] };
  private detailRequest = "";
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private dragStart?: { x: number; y: number; center: WorldMeters; moved: boolean };
  private pinchStart?: { distance: number; scale: number };
  private lastLiveRefresh = 0;
  private lastTargetId = "";

  constructor(
    host: HTMLElement,
    private readonly data: WorldMapData,
    private readonly actions: WorldMapActions,
  ) {
    this.root = document.createElement("section");
    this.root.className = "world-map hidden";
    this.root.setAttribute("aria-label", "แผนที่กรุงเทพฯ");
    this.root.innerHTML = `
      <canvas class="world-map-canvas" data-map="canvas"></canvas>
      <header class="world-map-top">
        <strong>🗺 แผนที่กรุงเทพฯ</strong>
        <div class="world-map-search">
          <input type="search" placeholder="ค้นหาสถานที่ ย่าน หรือแท็ก" data-map="search" aria-label="ค้นหาสถานที่" />
          <div class="world-map-results" data-map="results"></div>
        </div>
        <button class="icon-button" data-map="close" aria-label="ปิดแผนที่ (N / Esc)" title="ปิดแผนที่ (N / Esc)">×</button>
      </header>
      <div class="world-map-controls">
        <button data-map="zoom-in" aria-label="ซูมเข้า">+</button>
        <button data-map="zoom-out" aria-label="ซูมออก">−</button>
        <button data-map="center" aria-label="กลับมาที่รถ" title="กลับมาที่รถ">◎</button>
        <button data-map="overview" aria-label="ดูทั้งเมือง" title="ดูทั้งเมือง">⤢</button>
      </div>
      <aside class="world-map-side">
        <div data-map="active"></div>
        <h3>★ รายการโปรด</h3>
        <div class="world-map-list" data-map="favorites"></div>
        <h3>🕘 ล่าสุด</h3>
        <div class="world-map-list" data-map="recent"></div>
      </aside>
      <div class="world-map-card hidden" data-map="card" aria-live="polite"></div>
      <p class="world-map-hint">แตะที่ใดก็ได้เพื่อปักหมุด · ลากเพื่อเลื่อน · ล้อเมาส์/บีบนิ้วเพื่อซูม · ลูกศร/+/− บนคีย์บอร์ด</p>
    `;
    host.append(this.root);
    this.canvas = this.find<HTMLCanvasElement>("canvas");
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("World map canvas unavailable");
    this.ctx = ctx;
    this.card = this.find("card");
    this.sideActive = this.find("active");
    this.sideFavorites = this.find("favorites");
    this.sideRecent = this.find("recent");
    this.searchInput = this.find<HTMLInputElement>("search");
    this.searchResults = this.find("results");

    this.find("close").addEventListener("click", () => this.actions.onClose());
    this.find("zoom-in").addEventListener("click", () => this.zoomBy(1.6));
    this.find("zoom-out").addEventListener("click", () => this.zoomBy(1 / 1.6));
    this.find("center").addEventListener("click", () => this.centerOnCar());
    this.find("overview").addEventListener("click", () => {
      this.scale = 0.022;
      this.center = { ...this.data.vehicle().position };
      this.invalidate();
    });
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.searchInput.addEventListener("input", () => this.renderSearch());
    this.searchResults.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>("[data-place]");
      const place = this.data.places().find((candidate) => candidate.id === button?.dataset.place);
      if (!place) return;
      this.center = this.data.toWorld(place);
      this.scale = Math.max(this.scale, 0.45);
      this.select({ kind: "place", place });
      this.searchInput.value = "";
      this.searchResults.innerHTML = "";
      this.searchInput.blur();
    });
    this.card.addEventListener("click", (event) => this.onCardClick(event));
    this.root.querySelector(".world-map-side")?.addEventListener("click", (event) => this.onSideClick(event));
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("resize", () => this.invalidate());
  }

  get isOpen(): boolean {
    return this.openState;
  }

  open(): void {
    this.openState = true;
    this.root.classList.remove("hidden");
    this.centerOnCar(true);
    this.selection = undefined;
    this.renderCard();
    this.renderSide();
    this.invalidate();
  }

  close(): void {
    this.openState = false;
    this.root.classList.add("hidden");
    this.pointers.clear();
    this.dragStart = undefined;
    this.pinchStart = undefined;
    cancelAnimationFrame(this.frame);
  }

  // Favorites, the active destination or the route changed.
  refresh(): void {
    if (!this.openState) return;
    this.renderSide();
    this.renderCard();
    this.invalidate();
  }

  private find<T extends HTMLElement = HTMLElement>(name: string): T {
    const element = this.root.querySelector<T>(`[data-map='${name}']`);
    if (!element) throw new Error(`Missing map element ${name}`);
    return element;
  }

  private centerOnCar(resetZoom = false): void {
    this.center = { ...this.data.vehicle().position };
    if (resetZoom) this.scale = DEFAULT_SCALE;
    this.invalidate();
  }

  private zoomBy(factor: number, anchor?: { x: number; y: number }): void {
    const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.scale * factor));
    if (anchor) {
      const before = this.screenToWorld(anchor.x, anchor.y);
      this.scale = next;
      const after = this.screenToWorld(anchor.x, anchor.y);
      this.center = { x: this.center.x + before.x - after.x, z: this.center.z + before.z - after.z };
    } else {
      this.scale = next;
    }
    this.invalidate();
  }

  private invalidate(): void {
    this.dirty = true;
    if (!this.openState) return;
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(this.draw);
  }

  private viewSize(): { width: number; height: number } {
    return { width: this.canvas.clientWidth || window.innerWidth, height: this.canvas.clientHeight || window.innerHeight };
  }

  private worldToScreen(point: WorldMeters): { x: number; y: number } {
    const { width, height } = this.viewSize();
    return { x: (point.x - this.center.x) * this.scale + width / 2, y: (point.z - this.center.z) * this.scale + height / 2 };
  }

  private screenToWorld(x: number, y: number): WorldMeters {
    const { width, height } = this.viewSize();
    return { x: (x - width / 2) / this.scale + this.center.x, z: (y - height / 2) / this.scale + this.center.z };
  }

  private viewRect(margin = 0): Rect {
    const { width, height } = this.viewSize();
    const halfW = width / 2 / this.scale + margin;
    const halfH = height / 2 / this.scale + margin;
    return { minX: this.center.x - halfW, maxX: this.center.x + halfW, minZ: this.center.z - halfH, maxZ: this.center.z + halfH };
  }

  private readonly draw = (): void => {
    if (!this.openState) return;
    this.dirty = false;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const { width, height } = this.viewSize();
    if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
      this.canvas.width = Math.round(width * ratio);
      this.canvas.height = Math.round(height * ratio);
    }
    const ctx = this.ctx;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = mapColors.land;
    ctx.fillRect(0, 0, width, height);
    const view = this.viewRect(40);

    for (const area of this.data.areas()) {
      if (area.outer.length < 3) continue;
      ctx.fillStyle = area.kind === "water" ? mapColors.water : area.kind === "park" ? mapColors.park : mapColors.temple;
      ctx.beginPath();
      area.outer.forEach((point, index) => {
        const p = this.worldToScreen(point);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fill();
    }

    const detailed = this.scale >= DETAIL_SCALE;
    if (detailed) this.requestDetail(view);
    if (detailed && this.scale >= BUILDING_SCALE) this.drawBuildings(this.detail.buildings);
    const roads = detailed && this.detail.roads.length ? [...this.detail.roads, ...this.data.majorRoads(view)] : this.data.majorRoads(view);
    this.drawRoads(roads);
    this.drawRoute();
    if (this.scale < 0.2) this.drawDistrictLabels();
    this.drawPlaces();
    this.drawFavorites();
    for (const player of this.data.players()) this.drawDot(this.worldToScreen(player.position), player.color, 6);
    this.drawTarget();
    this.drawSelection();
    this.drawCar();
    this.drawScaleBar(width, height);
  };

  // Street detail comes from tiles; generation is incremental, so keep redrawing while tiles arrive.
  private requestDetail(view: Rect): void {
    const key = `${Math.round(view.minX / 256)}:${Math.round(view.minZ / 256)}:${Math.round(view.maxX / 256)}:${Math.round(view.maxZ / 256)}`;
    if (key === this.detailRequest) return;
    this.detailRequest = key;
    void this.data.detailTiles(view).then((result) => {
      if (this.detailRequest !== key) return;
      this.detail = { key, roads: result.roads, buildings: result.buildings };
      if (result.pending) this.detailRequest = "";
      this.invalidate();
    });
  }

  private drawRoads(roads: MapRoad[]): void {
    const ctx = this.ctx;
    const { width, height } = this.viewSize();
    const major = (kind: string) => kind === "motorway" || kind === "primary" || kind === "arterial" || kind === "bridge";
    const batches = new Map<string, { major: boolean; width: number; lines: Array<[number, number, number, number]> }>();
    for (const road of roads) {
      const a = this.worldToScreen(road.a);
      const b = this.worldToScreen(road.b);
      if (Math.max(a.x, b.x) < -20 || Math.min(a.x, b.x) > width + 20 || Math.max(a.y, b.y) < -20 || Math.min(a.y, b.y) > height + 20) continue;
      const isMajor = major(road.kind);
      const lineWidth = Math.round(Math.max(isMajor ? 2.6 : 1.2, road.width * this.scale) * 2) / 2;
      const key = `${isMajor ? 1 : 0}:${lineWidth}`;
      const batch = batches.get(key) ?? { major: isMajor, width: lineWidth, lines: [] };
      batch.lines.push([a.x, a.y, b.x, b.y]);
      batches.set(key, batch);
    }
    const ordered = [...batches.values()].sort((x, y) => Number(x.major) - Number(y.major) || x.width - y.width);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const pass of ["casing", "fill"] as const) {
      for (const batch of ordered) {
        ctx.strokeStyle = pass === "casing" ? (batch.major ? mapColors.majorCasing : mapColors.casing) : batch.major ? mapColors.major : mapColors.road;
        ctx.lineWidth = batch.width + (pass === "casing" ? 1.6 : 0);
        ctx.beginPath();
        for (const [ax, ay, bx, by] of batch.lines) {
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
        }
        ctx.stroke();
      }
    }
  }

  private drawBuildings(buildings: MapBuilding[]): void {
    const ctx = this.ctx;
    ctx.lineWidth = 0.8;
    for (const landmark of [false, true]) {
      ctx.fillStyle = landmark ? mapColors.landmark : mapColors.building;
      ctx.strokeStyle = mapColors.buildingEdge;
      ctx.beginPath();
      for (const building of buildings) {
        if (Boolean(building.landmark) !== landmark) continue;
        building.footprint.forEach((point, index) => {
          const p = this.worldToScreen(point);
          if (index === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
      }
      ctx.fill();
      if (this.scale > 0.6) ctx.stroke();
    }
  }

  private drawRoute(): void {
    const route = this.data.route();
    if (!route || route.length < 2) return;
    const ctx = this.ctx;
    const points = route.map((point) => this.worldToScreen(point));
    for (const [color, width] of [
      [mapColors.routeCasing, 8],
      [mapColors.route, 5],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      points.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
      ctx.stroke();
    }
  }

  private drawDistrictLabels(): void {
    const ctx = this.ctx;
    ctx.font = "700 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const { width, height } = this.viewSize();
    for (const district of bangkokDistricts) {
      const world = this.data.toWorld(district.center);
      if (!this.data.insideWorld(world)) continue;
      const p = this.worldToScreen(world);
      if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) continue;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.strokeText(district.nameTh, p.x, p.y);
      ctx.fillStyle = "rgba(51, 65, 85, 0.85)";
      ctx.fillText(district.nameTh, p.x, p.y);
    }
  }

  private visiblePlaces(): Array<{ place: PlaceSummary; point: { x: number; y: number } }> {
    const { width, height } = this.viewSize();
    const curatedOnly = this.scale < 0.05;
    return this.data
      .places()
      .filter((place) => !curatedOnly || place.source === "curated")
      .map((place) => ({ place, point: this.worldToScreen(this.data.toWorld(place)) }))
      .filter(({ point }) => point.x > -20 && point.y > -20 && point.x < width + 20 && point.y < height + 20);
  }

  private drawPlaces(): void {
    const ctx = this.ctx;
    const glyphs = this.scale >= 0.05;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "12px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
    for (const { place, point } of this.visiblePlaces()) {
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = placeCategoryColor(place.category);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, glyphs ? 9 : 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const glyph = categoryGlyphs[place.category];
      if (glyphs && glyph) ctx.fillText(glyph, point.x, point.y + 0.5);
      if (this.scale >= 0.3) {
        ctx.font = "700 11px system-ui, sans-serif";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.strokeText(placeDisplayName(place), point.x, point.y + 18);
        ctx.fillStyle = "#1e293b";
        ctx.fillText(placeDisplayName(place), point.x, point.y + 18);
        ctx.font = "12px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif";
      }
    }
  }

  private drawFavorites(): void {
    const ctx = this.ctx;
    ctx.font = "900 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const favorite of this.data.favorites()) {
      const p = this.worldToScreen(this.data.toWorld(favorite));
      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#facc15";
      ctx.fillText("★", p.x, p.y + 1);
    }
  }

  private drawDot(point: { x: number; y: number }, color: string, radius: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  private drawPin(point: { x: number; y: number }, color: string): void {
    const ctx = this.ctx;
    const { x, y } = point;
    ctx.fillStyle = color;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - 11, y - 12, x - 11, y - 27, x, y - 27);
    ctx.bezierCurveTo(x + 11, y - 27, x + 11, y - 12, x, y);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y - 18, 3.8, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawTarget(): void {
    const target = this.data.target();
    if (target) this.drawPin(this.worldToScreen(this.data.toWorld(target)), "#ef4444");
  }

  private drawSelection(): void {
    const selection = this.selection;
    if (!selection) return;
    if (selection.kind === "pin") {
      this.drawPin(this.worldToScreen(selection.world), "#8b5cf6");
    } else if (selection.kind === "building") {
      const ctx = this.ctx;
      ctx.fillStyle = "rgba(34, 211, 238, 0.35)";
      ctx.strokeStyle = "#0891b2";
      ctx.lineWidth = 2;
      ctx.beginPath();
      selection.building.footprint.forEach((point, index) => {
        const p = this.worldToScreen(point);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      const p = this.worldToScreen(this.data.toWorld(selection.place));
      const ctx = this.ctx;
      ctx.strokeStyle = "#8b5cf6";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawCar(): void {
    const { position, yaw } = this.data.vehicle();
    const p = this.worldToScreen(position);
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(p.x, p.y);
    // Forward is (sin yaw, cos yaw) in world x/z, which is screen x/y on this north-up map.
    ctx.rotate(Math.PI - yaw);
    ctx.fillStyle = "#0ea5e9";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(-9, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(9, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawScaleBar(width: number, height: number): void {
    const ctx = this.ctx;
    const targetPx = Math.min(160, width * 0.25);
    const realPerPx = 1 / this.scale / MAP_SCALE;
    const steps = [50, 100, 200, 500, 1000, 2000, 5000, 10000];
    const meters = steps.find((step) => step / realPerPx >= targetPx * 0.5) ?? 10000;
    const px = meters / realPerPx;
    const x = 16;
    const y = height - 34;
    ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
    ctx.fillRect(x, y, px, 5);
    ctx.font = "700 11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(formatDistance(meters), x, y - 3);
  }

  // ---------------------------------------------------------------------------------------------
  // Interaction

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.canvas.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.offsetX, y: event.offsetY });
    if (this.pointers.size === 1) {
      this.dragStart = { x: event.offsetX, y: event.offsetY, center: { ...this.center }, moved: false };
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchStart = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: this.scale };
      if (this.dragStart) this.dragStart.moved = true;
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.pointers.has(event.pointerId)) return;
    this.pointers.set(event.pointerId, { x: event.offsetX, y: event.offsetY });
    if (this.pointers.size >= 2 && this.pinchStart) {
      const [a, b] = [...this.pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const target = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.pinchStart.scale * (distance / Math.max(1, this.pinchStart.distance))));
      this.zoomBy(target / this.scale, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      return;
    }
    const drag = this.dragStart;
    if (!drag) return;
    const dx = event.offsetX - drag.x;
    const dy = event.offsetY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    this.center = { x: drag.center.x - dx / this.scale, z: drag.center.z - dy / this.scale };
    this.invalidate();
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const drag = this.dragStart;
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinchStart = undefined;
    if (this.pointers.size > 0) return;
    this.dragStart = undefined;
    if (drag && !drag.moved && event.type === "pointerup") this.tap(event.offsetX, event.offsetY);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    this.zoomBy(event.deltaY < 0 ? 1.25 : 0.8, { x: event.offsetX, y: event.offsetY });
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.openState || event.target instanceof HTMLInputElement) return;
    const step = 120 / this.scale;
    const moves: Record<string, [number, number]> = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
    const move = moves[event.code];
    if (move) {
      event.preventDefault();
      this.center = { x: this.center.x + move[0], z: this.center.z + move[1] };
      this.invalidate();
    } else if (event.code === "Equal" || event.code === "NumpadAdd") {
      this.zoomBy(1.4);
    } else if (event.code === "Minus" || event.code === "NumpadSubtract") {
      this.zoomBy(1 / 1.4);
    } else if (event.code === "Enter") {
      this.select({ kind: "pin", world: { ...this.center } });
    }
  };

  private tap(x: number, y: number): void {
    const hitPlace = this.visiblePlaces()
      .map((entry) => ({ ...entry, distance: Math.hypot(entry.point.x - x, entry.point.y - y) }))
      .filter((entry) => entry.distance < 16)
      .sort((a, b) => a.distance - b.distance)[0];
    if (hitPlace) {
      this.select({ kind: "place", place: hitPlace.place });
      return;
    }
    const world = this.screenToWorld(x, y);
    if (this.scale >= BUILDING_SCALE) {
      const building = this.detail.buildings.find((candidate) => pointInPolygon(world, candidate.footprint));
      if (building) {
        this.select({ kind: "building", building });
        return;
      }
    }
    this.select({ kind: "pin", world });
  }

  private select(selection?: Selection): void {
    this.selection = selection;
    this.renderCard();
    this.invalidate();
  }

  private selectionTarget(): NavTarget | undefined {
    const selection = this.selection;
    if (!selection) return undefined;
    if (selection.kind === "place") {
      const place = selection.place;
      return { id: `place:${place.id}`, kind: "place", label: placeDisplayName(place), lat: place.lat, lng: place.lng, placeId: place.id };
    }
    if (selection.kind === "building") {
      const building = selection.building;
      const center = building.footprint.reduce((sum, point) => ({ x: sum.x + point.x / building.footprint.length, z: sum.z + point.z / building.footprint.length }), { x: 0, z: 0 });
      const geo = this.data.toGeo(center);
      return { id: `building:${building.id}`, kind: "building", label: building.name ?? buildingUseLabels[inferBuildingUse(building)].th, ...geo, buildingId: building.id };
    }
    const geo = this.data.toGeo(selection.world);
    const road = this.data.roadNameNear(selection.world);
    return { id: `pin:${geo.lat.toFixed(5)},${geo.lng.toFixed(5)}`, kind: "pin", label: road ? `หมุดใกล้${road}` : "หมุดที่ปักไว้", ...geo };
  }

  private renderCard(): void {
    const target = this.selectionTarget();
    const selection = this.selection;
    if (!target || !selection) {
      this.card.classList.add("hidden");
      this.card.innerHTML = "";
      return;
    }
    const world = this.data.toWorld(target);
    const inside = this.data.insideWorld(world);
    const favorite = this.data.favorites().some((item) => item.id === target.id);
    let icon = "📍";
    let subtitle: string;
    if (selection.kind === "place") {
      icon = categoryGlyphs[selection.place.category] ?? "📍";
      subtitle = [categoryLabels[selection.place.category], selection.place.districtName].filter(Boolean).join(" · ");
    } else if (selection.kind === "building") {
      const use = inferBuildingUse(selection.building);
      icon = buildingUseLabels[use].icon;
      subtitle = [buildingUseLabels[use].th, selection.building.floors ? `${selection.building.floors} ชั้น` : "", selection.building.roadName].filter(Boolean).join(" · ");
    } else {
      subtitle = `${target.lat.toFixed(5)}, ${target.lng.toFixed(5)}`;
    }
    const distance = formatDistance(this.data.distanceMeters(target));
    this.card.classList.remove("hidden");
    this.card.innerHTML = `
      <div class="world-map-card-head">
        <span class="world-map-card-icon">${escapeHtml(icon)}</span>
        <span><strong>${escapeHtml(target.label)}</strong><small>${escapeHtml([subtitle, distance].filter(Boolean).join(" · "))}</small></span>
        <button class="icon-button" data-card="dismiss" aria-label="ปิด">×</button>
      </div>
      ${inside ? "" : `<p class="world-map-warning">จุดนี้อยู่นอกพื้นที่แผนที่ที่ขับได้</p>`}
      <div class="world-map-card-actions">
        <button class="primary-button small" data-card="navigate" ${inside ? "" : "disabled"}>🧭 นำทาง</button>
        <button class="ghost-button" data-card="warp" ${inside && this.data.canFastTravel() ? "" : "disabled"}>⚡ วาร์ป</button>
        <button class="ghost-button" data-card="favorite">${favorite ? "★ บันทึกแล้ว" : "☆ บันทึก"}</button>
        ${selection.kind === "place" ? `<button class="ghost-button" data-card="details">รีวิว</button>` : ""}
        ${selection.kind === "building" ? `<button class="ghost-button" data-card="details">รายละเอียด</button>` : ""}
      </div>
    `;
  }

  private onCardClick(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-card]");
    if (!button || button.disabled) return;
    const target = this.selectionTarget();
    const action = button.dataset.card;
    if (action === "dismiss" || !target) {
      this.select(undefined);
      return;
    }
    if (action === "navigate") {
      this.actions.onNavigate(target);
      this.select(undefined);
      this.renderSide();
    } else if (action === "warp") {
      this.actions.onFastTravel(target);
    } else if (action === "favorite") {
      this.actions.onToggleFavorite(target);
      this.renderCard();
      this.renderSide();
      this.invalidate();
    } else if (action === "details") {
      if (this.selection?.kind === "place") this.actions.onOpenPlace(this.selection.place.id);
      if (this.selection?.kind === "building") this.actions.onOpenBuilding(this.selection.building.id);
    }
  }

  private renderSide(): void {
    const target = this.data.target();
    this.sideActive.innerHTML = target
      ? `<div class="world-map-active">
          <small>กำลังนำทางไป</small>
          <strong>${escapeHtml(target.label)}</strong>
          <span>${escapeHtml(formatDistance(this.data.distanceMeters(target)))}</span>
          <div class="world-map-card-actions">
            <button class="ghost-button" data-side="show-target">ดูบนแผนที่</button>
            <button class="danger-button" data-side="cancel">✕ ยกเลิกเส้นทาง</button>
          </div>
        </div>`
      : `<p class="world-map-empty">ยังไม่มีจุดหมาย — แตะแผนที่เพื่อปักหมุด</p>`;
    const row = (item: NavTarget, list: "favorite" | "recent") => `
      <div class="world-map-row">
        <button class="world-map-row-main" data-side="go" data-list="${list}" data-id="${escapeHtml(item.id)}">
          <strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(formatDistance(this.data.distanceMeters(item)))}</small>
        </button>
        <button class="icon-button" data-side="${list === "favorite" ? "unfavorite" : "locate"}" data-list="${list}" data-id="${escapeHtml(item.id)}" aria-label="${list === "favorite" ? "ลบออกจากรายการโปรด" : "ดูบนแผนที่"}">${list === "favorite" ? "✕" : "◎"}</button>
      </div>`;
    const favorites = this.data.favorites();
    const recent = this.data.recent();
    this.sideFavorites.innerHTML = favorites.length ? favorites.map((item) => row(item, "favorite")).join("") : `<p class="world-map-empty">กด ☆ บันทึก ที่การ์ดเพื่อเก็บจุดโปรด</p>`;
    this.sideRecent.innerHTML = recent.length ? recent.map((item) => row(item, "recent")).join("") : `<p class="world-map-empty">ยังไม่มีประวัติการนำทาง</p>`;
  }

  private onSideClick(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-side]");
    if (!button) return;
    const action = button.dataset.side;
    if (action === "cancel") {
      this.actions.onCancelNavigation();
      this.renderSide();
      this.invalidate();
      return;
    }
    if (action === "show-target") {
      const target = this.data.target();
      if (target) {
        this.center = this.data.toWorld(target);
        this.invalidate();
      }
      return;
    }
    const list = button.dataset.list === "favorite" ? this.data.favorites() : this.data.recent();
    const item = list.find((candidate) => candidate.id === button.dataset.id);
    if (!item) return;
    if (action === "go") {
      this.actions.onNavigate(item);
      this.renderSide();
      this.invalidate();
    } else if (action === "unfavorite") {
      this.actions.onToggleFavorite(item);
      this.renderSide();
      this.renderCard();
      this.invalidate();
    } else if (action === "locate") {
      this.center = this.data.toWorld(item);
      this.scale = Math.max(this.scale, 0.3);
      this.invalidate();
    }
  }

  private renderSearch(): void {
    const query = this.searchInput.value.trim().toLowerCase();
    if (!query) {
      this.searchResults.innerHTML = "";
      return;
    }
    const matches = this.data
      .places()
      .filter((place) => [place.nameTh, place.nameEn ?? "", place.name, place.districtName, ...place.tags].some((text) => text.toLowerCase().includes(query)))
      .sort((a, b) => this.data.distanceMeters(a) - this.data.distanceMeters(b))
      .slice(0, 8);
    this.searchResults.innerHTML = matches.length
      ? matches
          .map(
            (place) => `<button data-place="${escapeHtml(place.id)}"><span>${escapeHtml(categoryGlyphs[place.category] ?? "📍")}</span><strong>${escapeHtml(placeDisplayName(place))}</strong><small>${escapeHtml(place.districtName)} · ${escapeHtml(formatDistance(this.data.distanceMeters(place)))}</small></button>`,
          )
          .join("")
      : `<p class="world-map-empty">ไม่พบสถานที่</p>`;
  }

  // Keeps the car arrow, friends and route fresh while the map stays open.
  tick(time: number): void {
    if (!this.openState) return;
    const targetId = this.data.target()?.id ?? "";
    if (targetId !== this.lastTargetId) {
      this.lastTargetId = targetId;
      this.renderSide();
    }
    if (time - this.lastLiveRefresh > 500) {
      this.lastLiveRefresh = time;
      this.invalidate();
    } else if (this.dirty) {
      this.invalidate();
    }
  }
}
