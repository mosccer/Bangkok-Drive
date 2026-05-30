import { isVehicleUnlocked } from "../data/vehicles";
import { mpsToKmh } from "../simulation/speed";
import type { Mission, PlaceDetail, PlaceSummary, SaveGame, VehicleDefinition, VehicleState } from "../types";

export class Hud {
  readonly root: HTMLDivElement;
  private readonly speed: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly poiPrompt: HTMLElement;
  private readonly drawer: HTMLElement;
  private readonly drawerBody: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly garagePanel: HTMLElement;
  private readonly garageBody: HTMLElement;
  private readonly minimap: HTMLCanvasElement;
  private readonly minimapContext: CanvasRenderingContext2D;

  constructor(host: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "hud";
    this.root.innerHTML = `
      <div class="objective-chip" data-ui="objective">Loading Bangkok route...</div>
      <button class="icon-button pause-button" data-control="pause" aria-label="Pause">II</button>
      <button class="garage-button" data-ui="garage-button">Garage</button>
      <canvas class="minimap" width="180" height="180" data-ui="minimap"></canvas>
      <div class="speedometer"><strong data-ui="speed">0</strong><span>km/h</span></div>
      <div class="stats-strip" data-ui="stats">XP 0 | Bangkok guide cache ready</div>
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
    this.garagePanel = this.mustFind("[data-ui='garage-panel']");
    this.garageBody = this.mustFind("[data-ui='garage-body']");
    this.minimap = this.mustFind<HTMLCanvasElement>("[data-ui='minimap']");
    const ctx = this.minimap.getContext("2d");
    if (!ctx) throw new Error("Minimap canvas context unavailable");
    this.minimapContext = ctx;
    this.mustFind("[data-ui='close-drawer']").addEventListener("click", () => this.closeDrawer());
    this.mustFind("[data-ui='garage-button']").addEventListener("click", () => this.garagePanel.classList.toggle("open"));
    this.mustFind("[data-ui='close-garage']").addEventListener("click", () => this.garagePanel.classList.remove("open"));
  }

  update(vehicle: VehicleState, mission: Mission, save: SaveGame, nearby?: PlaceSummary): void {
    this.speed.textContent = Math.round(Math.abs(mpsToKmh(vehicle.speed))).toString();
    const progress = save.player.missionProgress;
    const stopText = progress ? `${Math.min(progress.reachedWaypointIds.length + 1, mission.waypoints.length)}/${mission.waypoints.length}` : `${mission.waypoints.length} stops`;
    this.objective.textContent = `${mission.title} | ${stopText}`;
    this.stats.textContent = `XP ${save.player.xp} | Found ${save.discoveredPlaceIds.length} | ${vehicle.gearMode.toUpperCase()}`;

    if (nearby) {
      this.poiPrompt.classList.remove("hidden");
      this.poiPrompt.textContent = `Open ${nearby.name}`;
      this.poiPrompt.onclick = () => this.openSummary(nearby);
    } else {
      this.poiPrompt.classList.add("hidden");
      this.poiPrompt.onclick = null;
    }
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
      const pos = worldPosition(place);
      const x = width / 2 + (pos.x - vehicle.position.x) * 0.12;
      const y = height / 2 + (pos.z - vehicle.position.z) * 0.12;
      if (x < 4 || x > width - 4 || y < 4 || y > height - 4) continue;
      ctx.fillStyle = place.category === "cafe" ? "#67e8f9" : place.category === "restaurant" ? "#f97316" : "#facc15";
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (target) {
      const pos = worldPosition(target);
      const x = width / 2 + (pos.x - vehicle.position.x) * 0.12;
      const y = height / 2 + (pos.z - vehicle.position.z) * 0.12;
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
      <h2>${detail.name}</h2>
      <p>${detail.description ?? "Bangkok place detail"}</p>
      <dl>
        <dt>District</dt><dd>${detail.district}</dd>
        <dt>Category</dt><dd>${detail.category.replace("_", " ")}</dd>
        <dt>Rating</dt><dd>${detail.rating ?? "N/A"} (${detail.userRatingCount ?? 0})</dd>
      </dl>
      <a class="drawer-link" href="${detail.googleMapsUri ?? "#"}" target="_blank" rel="noreferrer">Open in Google Maps</a>
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
      <h2>${place.name}</h2>
      <p>Open this place while driving to view details from the Google Places proxy/cache.</p>
      <dl>
        <dt>District</dt><dd>${place.district}</dd>
        <dt>Category</dt><dd>${place.category.replace("_", " ")}</dd>
        <dt>Rating</dt><dd>${place.rating ?? "N/A"}</dd>
      </dl>
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
}
