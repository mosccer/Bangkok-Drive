import { isVehicleUnlocked } from "../data/vehicles";
import { bangkokDistricts } from "../data/bangkokDistricts";
import { placeDisplayName } from "../simulation/placeQueries";
import { mpsToKmh } from "../simulation/speed";
import type { Mission, PlaceCategory, PlaceDetail, PlaceQuery, PlaceSummary, SaveGame, VehicleDefinition, VehicleState } from "../types";

const MINIMAP_WORLD_SCALE = 0.12;

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
  const right = dx * Math.cos(vehicle.rotation) - dz * Math.sin(vehicle.rotation);
  return {
    x: width / 2 + right * scale,
    y: height / 2 - forward * scale,
  };
}

export class Hud {
  readonly root: HTMLDivElement;
  private readonly speed: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly poiPrompt: HTMLElement;
  private readonly drawer: HTMLElement;
  private readonly drawerBody: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly fastTravelButton: HTMLButtonElement;
  private readonly categorySelect: HTMLSelectElement;
  private readonly districtSelect: HTMLSelectElement;
  private readonly garagePanel: HTMLElement;
  private readonly garageBody: HTMLElement;
  private readonly minimap: HTMLCanvasElement;
  private readonly minimapContext: CanvasRenderingContext2D;
  private readonly compassTape: HTMLElement;
  private readonly compassWaypoint: HTMLElement;
  private readonly compassVal: HTMLElement;

  constructor(host: HTMLElement, onPlaceFiltersChange: (query: PlaceQuery) => void = () => undefined) {
    this.root = document.createElement("div");
    this.root.className = "hud";
    this.root.innerHTML = `
      <div class="objective-chip" data-ui="objective">Loading Bangkok route...</div>
      <div class="compass-wrapper">
        <div class="compass-needle">▼</div>
        <div class="compass-viewport">
          <div class="compass-tape" data-ui="compass-tape"></div>
          <div class="compass-waypoint-marker hidden" data-ui="compass-waypoint">◆</div>
        </div>
        <div class="compass-heading-text" data-ui="compass-val">000° N</div>
      </div>
      <button class="icon-button pause-button" data-control="pause" aria-label="Pause">II</button>
      <button class="garage-button" data-ui="garage-button">Garage</button>
      <canvas class="minimap" width="360" height="360" data-ui="minimap"></canvas>
      <div class="speedometer"><strong data-ui="speed">0</strong><span>km/h</span></div>
      <div class="stats-strip" data-ui="stats">XP 0 | Bangkok guide cache ready</div>
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
      </div>
      <div class="rotate-hint">Rotate for landscape driving</div>
      <button class="poi-prompt hidden" data-ui="poi-prompt"></button>
      <aside class="poi-drawer" data-ui="drawer" aria-live="polite">
        <div class="drawer-head">
          <strong>Bangkok Guide</strong>
          <button class="icon-button" data-ui="close-drawer" aria-label="Close">x</button>
        </div>
        <div class="drawer-body" data-ui="drawer-body"></div>
      </aside>
      <aside class="garage-panel" data-ui="garage-panel">
        <div class="drawer-head">
          <strong>Bangkok Garage</strong>
          <button class="icon-button" data-ui="close-garage" aria-label="Close">x</button>
        </div>
        <div class="garage-body" data-ui="garage-body"></div>
      </aside>
      <div class="mobile-controls">
        <div class="touch-stick" data-control="stick"><span></span></div>
        <div class="pedals">
          <button data-control="boost">BST</button>
          <button data-control="throttle">GO</button>
          <button data-control="brake">BRK</button>
        </div>
      </div>
    `;
    host.append(this.root);

    this.speed = this.mustFind("[data-ui='speed']");
    this.objective = this.mustFind("[data-ui='objective']");
    this.poiPrompt = this.mustFind("[data-ui='poi-prompt']");
    this.drawer = this.mustFind("[data-ui='drawer']");
    this.drawerBody = this.mustFind("[data-ui='drawer-body']");
    this.stats = this.mustFind("[data-ui='stats']");
    this.fastTravelButton = this.mustFind<HTMLButtonElement>("[data-ui='fast-travel']");
    this.categorySelect = this.mustFind<HTMLSelectElement>("[data-ui='category-filter']");
    this.districtSelect = this.mustFind<HTMLSelectElement>("[data-ui='district-filter']");
    this.garagePanel = this.mustFind("[data-ui='garage-panel']");
    this.garageBody = this.mustFind("[data-ui='garage-body']");
    this.minimap = this.mustFind<HTMLCanvasElement>("[data-ui='minimap']");
    const ctx = this.minimap.getContext("2d");
    if (!ctx) throw new Error("Minimap canvas context unavailable");
    this.minimapContext = ctx;

    this.compassTape = this.mustFind("[data-ui='compass-tape']");
    this.compassWaypoint = this.mustFind("[data-ui='compass-waypoint']");
    this.compassVal = this.mustFind("[data-ui='compass-val']");
    this.initCompassTape();

    this.mustFind("[data-ui='close-drawer']").addEventListener("click", () => this.closeDrawer());
    this.mustFind("[data-ui='garage-button']").addEventListener("click", () => this.garagePanel.classList.toggle("open"));
    this.mustFind("[data-ui='close-garage']").addEventListener("click", () => this.garagePanel.classList.remove("open"));
    const emitFilter = () => {
      onPlaceFiltersChange({
        category: (this.categorySelect.value || undefined) as PlaceCategory | undefined,
        districtId: this.districtSelect.value || undefined,
        limit: 150,
        lang: "th",
      });
    };
    this.categorySelect.addEventListener("change", emitFilter);
    this.districtSelect.addEventListener("change", emitFilter);
    this.mustFind("[data-ui='preset-food']").addEventListener("click", () => {
      this.categorySelect.value = "street_food";
      emitFilter();
    });
    this.mustFind("[data-ui='preset-cafe']").addEventListener("click", () => {
      this.categorySelect.value = "cafe";
      emitFilter();
    });
    this.mustFind("[data-ui='preset-tour']").addEventListener("click", () => {
      this.categorySelect.value = "tourist_attraction";
      emitFilter();
    });
  }

  update(
    vehicle: VehicleState,
    mission: Mission,
    save: SaveGame,
    nearby?: PlaceSummary,
    waypoint?: PlaceSummary,
    waypointLocal?: { x: number; z: number },
  ): void {
    this.speed.textContent = Math.round(Math.abs(mpsToKmh(vehicle.speed))).toString();
    const progress = save.player.missionProgress;
    const stopText = progress ? `${Math.min(progress.reachedWaypointIds.length + 1, mission.waypoints.length)}/${mission.waypoints.length}` : `${mission.waypoints.length} stops`;
    this.objective.textContent = `${mission.title} | ${stopText}`;
    this.stats.textContent = `XP ${save.player.xp} | Found ${save.discoveredPlaceIds.length} | ${vehicle.gearMode.toUpperCase()}`;

    if (nearby) {
      this.poiPrompt.classList.remove("hidden");
      this.poiPrompt.textContent = `Open ${placeDisplayName(nearby)}`;
      this.poiPrompt.onclick = () => this.openSummary(nearby);
    } else {
      this.poiPrompt.classList.add("hidden");
      this.poiPrompt.onclick = null;
    }

    // Compass calculations
    const yaw = vehicle.rotation;
    let degrees = (-yaw * 180 / Math.PI + 180) % 360;
    if (degrees < 0) degrees += 360;

    const roundDeg = Math.round(degrees);
    let cardinal = "N";
    if (roundDeg >= 338 || roundDeg < 23) cardinal = "N";
    else if (roundDeg >= 23 && roundDeg < 68) cardinal = "NE";
    else if (roundDeg >= 68 && roundDeg < 113) cardinal = "E";
    else if (roundDeg >= 113 && roundDeg < 158) cardinal = "SE";
    else if (roundDeg >= 158 && roundDeg < 203) cardinal = "S";
    else if (roundDeg >= 203 && roundDeg < 248) cardinal = "SW";
    else if (roundDeg >= 248 && roundDeg < 293) cardinal = "W";
    else if (roundDeg >= 293 && roundDeg < 338) cardinal = "NW";

    this.compassVal.textContent = `${roundDeg.toString().padStart(3, "0")}° ${cardinal}`;

    const pixelsPerDegree = 2;
    const shift = -pixelsPerDegree * degrees - 180;
    this.compassTape.style.transform = `translateX(${shift}px)`;

    if (waypoint && waypointLocal) {
      const dx = waypointLocal.x - vehicle.position.x;
      const dz = waypointLocal.z - vehicle.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1) {
        const angle = -Math.atan2(dz, dx);
        let targetDegrees = (-angle * 180 / Math.PI + 180) % 360;
        if (targetDegrees < 0) targetDegrees += 360;

        let relAngle = targetDegrees - degrees;
        if (relAngle > 180) relAngle -= 360;
        if (relAngle < -180) relAngle += 360;

        if (Math.abs(relAngle) <= 75) {
          this.compassWaypoint.classList.remove("hidden");
          const offset = relAngle * pixelsPerDegree;
          this.compassWaypoint.style.transform = `translateX(${offset}px)`;
        } else {
          this.compassWaypoint.classList.add("hidden");
        }
      } else {
        this.compassWaypoint.classList.add("hidden");
      }
    } else {
      this.compassWaypoint.classList.add("hidden");
    }
  }

  private initCompassTape(): void {
    const tapeHtml: string[] = [];
    const pixelsPerDegree = 2;
    for (let deg = -90; deg <= 450; deg += 15) {
      let label = "";
      let tickClass = "tick-small";
      const normalizedDeg = (deg + 360) % 360;
      if (normalizedDeg === 0) { label = "N"; tickClass = "tick-large cardinal"; }
      else if (normalizedDeg === 45) { label = "NE"; tickClass = "tick-large"; }
      else if (normalizedDeg === 90) { label = "E"; tickClass = "tick-large cardinal"; }
      else if (normalizedDeg === 135) { label = "SE"; tickClass = "tick-large"; }
      else if (normalizedDeg === 180) { label = "S"; tickClass = "tick-large cardinal"; }
      else if (normalizedDeg === 225) { label = "SW"; tickClass = "tick-large"; }
      else if (normalizedDeg === 270) { label = "W"; tickClass = "tick-large cardinal"; }
      else if (normalizedDeg === 315) { label = "NW"; tickClass = "tick-large"; }
      else if (deg % 30 === 0) {
        label = normalizedDeg.toString();
        tickClass = "tick-medium";
      }
      const left = (deg + 90) * pixelsPerDegree;
      tapeHtml.push(`
        <div class="compass-tick ${tickClass}" style="left: ${left}px">
          <span class="compass-tick-line"></span>
          ${label ? `<span class="compass-tick-label">${label}</span>` : ""}
        </div>
      `);
    }
    this.compassTape.innerHTML = tapeHtml.join("");
    this.compassTape.style.width = `${540 * pixelsPerDegree}px`;
  }

  updateFastTravel(target: { label: string; distanceMeters: number } | undefined, onFastTravel: (() => void) | undefined): void {
    if (!target || !onFastTravel) {
      this.fastTravelButton.classList.add("hidden");
      this.fastTravelButton.onclick = null;
      return;
    }
    this.fastTravelButton.classList.remove("hidden");
    this.fastTravelButton.textContent = `Jump ${Math.round(target.distanceMeters / 100) / 10} km to ${target.label}`;
    this.fastTravelButton.onclick = onFastTravel;
  }

  drawMinimap(
    vehicle: VehicleState,
    places: PlaceSummary[],
    worldPosition: (place: PlaceSummary) => { x: number; z: number },
    target?: PlaceSummary,
  ): void {
    const ctx = this.minimapContext;
    const width = this.minimap.width;
    const height = this.minimap.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "rgba(11, 14, 18, 0.78)";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    for (const place of places) {
      const { x, y } = minimapWorldToScreen(vehicle, worldPosition(place), width, height);
      if (x < 4 || x > width - 4 || y < 4 || y > height - 4) continue;
      ctx.fillStyle = this.placeColor(place.category);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (target) {
      const { x, y } = minimapWorldToScreen(vehicle, worldPosition(target), width, height);
      ctx.strokeStyle = "#67e8f9";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(width / 2, height / 2);
      ctx.lineTo(Math.max(8, Math.min(width - 8, x)), Math.max(8, Math.min(height - 8, y)));
      ctx.stroke();
    }

    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.moveTo(width / 2, height / 2 - 8);
    ctx.lineTo(width / 2 - 5, height / 2 + 6);
    ctx.lineTo(width / 2 + 5, height / 2 + 6);
    ctx.closePath();
    ctx.fill();
  }

  openDetail(detail: PlaceDetail): void {
    this.drawerBody.innerHTML = `
      <h2>${placeDisplayName(detail)}</h2>
      <p>${detail.descriptionTh ?? detail.description ?? "ครอบคลุมข้อมูลจากแหล่งทางการและ Google Places ตามหมวดที่รองรับ"}</p>
      <dl>
        <dt>District</dt><dd>${detail.districtName}</dd>
        <dt>Category</dt><dd>${detail.category.replace("_", " ")}</dd>
        <dt>Rating</dt><dd>${detail.rating ?? "N/A"} (${detail.userRatingCount ?? 0})</dd>
        ${detail.openingHours?.length ? `<dt>Hours</dt><dd>${detail.openingHours[0]}</dd>` : ""}
      </dl>
      <a class="drawer-link" href="${detail.googleMapsUri ?? "#"}" target="_blank" rel="noreferrer">Open in Google Maps</a>
      ${detail.sourceAttributions.length ? `<p class="attribution">${detail.sourceAttributions.map((item) => item.provider).join(" | ")}</p>` : ""}
    `;
    this.drawer.classList.add("open");
  }

  updateGarage(vehicles: VehicleDefinition[], save: SaveGame, onSelect: (id: string) => void): void {
    this.garageBody.innerHTML = "";
    for (const vehicle of vehicles) {
      const unlocked = save.unlockedVehicles.includes(vehicle.id) || isVehicleUnlocked(vehicle, save.player.xp, save.completedMissionIds);
      const button = document.createElement("button");
      button.className = `garage-card ${vehicle.id === save.activeVehicleId ? "selected" : ""}`;
      button.disabled = !unlocked;
      button.innerHTML = `
        <span class="garage-swatch" style="--car-color:${vehicle.color}"></span>
        <strong>${vehicle.brand} ${vehicle.model}</strong>
        <small>${vehicle.class.toUpperCase()} | ${unlocked ? "Ready" : "Locked"}</small>
        <span>ACC ${vehicle.stats.accelerationMps2.toFixed(1)} | SPD ${vehicle.stats.maxSpeedKmh}</span>
      `;
      button.addEventListener("click", () => onSelect(vehicle.id));
      this.garageBody.append(button);
    }
  }

  private openSummary(place: PlaceSummary): void {
    this.drawerBody.innerHTML = `
      <h2>${placeDisplayName(place)}</h2>
      <p>ครอบคลุมข้อมูลจากแหล่งทางการและ Google Places ตามหมวดที่รองรับ</p>
      <dl>
        <dt>District</dt><dd>${place.districtName}</dd>
        <dt>Category</dt><dd>${place.category.replace("_", " ")}</dd>
        <dt>Rating</dt><dd>${place.rating ?? "N/A"}</dd>
      </dl>
      ${place.attributionRequired ? `<p class="attribution">Google Maps</p>` : ""}
    `;
    this.drawer.classList.add("open");
  }

  private closeDrawer(): void {
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
    return "#facc15";
  }
}
