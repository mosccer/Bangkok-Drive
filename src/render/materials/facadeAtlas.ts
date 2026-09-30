import * as THREE from "three";
import { FACADE_COLUMNS, FACADE_ROWS } from "../world/facadeStyles";

// Procedural façade atlas (see `facadeStyles.ts`). Every style is painted into four layers at once:
// colour (tinted per building by vertex colour), lit windows for night glow, a height field that
// becomes a normal map (recessed windows and doors, raised frames, sills, ledges, balcony slabs,
// pilasters, corrugation) and a surface map with roughness in G and metalness in B (glossy glass,
// metal shutters, matte plaster). Each cell tiles seamlessly and covers 28 world units across by
// four 6.6-unit floors.

export interface FacadeAtlas {
  color: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  surface: THREE.CanvasTexture;
  cell: number;
}

interface Layers {
  color: CanvasRenderingContext2D;
  emissive: CanvasRenderingContext2D;
  height: CanvasRenderingContext2D;
  surface: CanvasRenderingContext2D;
}

interface Paint {
  color?: string;
  // 0 = deep recess, 0.5 = wall plane, 1 = most protruding.
  height?: number;
  rough?: number;
  metal?: number;
  glow?: string;
}

const WALL = 0.5;
const warmLights = ["#ffd89a", "#fff1c9", "#ffe2b0", "#f9f3e3", "#cfe8ff"];
const signColors = ["#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#0891b2", "#dc2626"];
const shutterColors = ["#7c4a2d", "#355e3b", "#1e3a5f", "#8a8f94", "#6b7280"];

function seeded(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return value / 2147483647;
  };
}

class CellPainter {
  constructor(
    private readonly layers: Layers,
    private readonly ox: number,
    private readonly oy: number,
    readonly size: number,
    readonly random: () => number,
  ) {}

  get row(): number {
    return this.size / 4;
  }

  pick<T>(list: T[]): T {
    return list[Math.floor(this.random() * list.length) % list.length];
  }

  fill(x: number, y: number, w: number, h: number, paint: Paint): void {
    const X = this.ox + x;
    const Y = this.oy + y;
    if (w <= 0 || h <= 0) return;
    if (paint.color) {
      this.layers.color.fillStyle = paint.color;
      this.layers.color.fillRect(X, Y, w, h);
    }
    if (paint.height !== undefined) {
      const value = Math.round(Math.max(0, Math.min(1, paint.height)) * 255);
      this.layers.height.fillStyle = `rgb(${value},${value},${value})`;
      this.layers.height.fillRect(X, Y, w, h);
    }
    if (paint.rough !== undefined || paint.metal !== undefined) {
      this.layers.surface.fillStyle = `rgb(0,${Math.round((paint.rough ?? 0.88) * 255)},${Math.round((paint.metal ?? 0) * 255)})`;
      this.layers.surface.fillRect(X, Y, w, h);
    }
    if (paint.glow) {
      const emissive = this.layers.emissive;
      emissive.fillStyle = paint.glow;
      emissive.fillRect(X, Y, w, h);
      // Rooms are brightest under the ceiling light, and some have a curtain half drawn.
      if (w > 8 && h > 12) {
        const falloff = emissive.createLinearGradient(0, Y, 0, Y + h);
        falloff.addColorStop(0, "rgba(0,0,0,0)");
        falloff.addColorStop(1, "rgba(0,0,0,0.55)");
        emissive.fillStyle = falloff;
        emissive.fillRect(X, Y, w, h);
        if (this.random() > 0.5) {
          const curtain = w * (0.25 + this.random() * 0.3);
          emissive.fillStyle = "rgba(0,0,0,0.4)";
          emissive.fillRect(this.random() > 0.5 ? X : X + w - curtain, Y, curtain, h);
        }
      }
    }
  }

  // Plaster with faint stains and an occlusion shadow under each floor line.
  wall(): void {
    const { size, row } = this;
    this.fill(0, 0, size, size, { color: "#f4f1ea", height: WALL, rough: 0.9, metal: 0 });
    for (let i = 0; i < size * 1.2; i += 1) {
      const shade = 225 + Math.floor(this.random() * 25);
      this.fill(this.random() * size, this.random() * size, 1 + this.random() * 3, 1 + this.random() * 3, { color: `rgba(${shade},${shade - 4},${shade - 10},0.5)` });
    }
    for (let r = 0; r < 4; r += 1) {
      this.fill(0, r * row, size, row * 0.08, { color: "rgba(60,55,48,0.12)" });
    }
  }

  // A window recessed into the wall with a raised frame, a sill and a glass pane.
  window(x: number, y: number, w: number, h: number, options: { glass?: string; frame?: string; lit?: boolean; sill?: boolean } = {}): void {
    const frame = options.frame ?? "#f1eee8";
    this.fill(x - 3, y - 3, w + 6, h + 6, { color: frame, height: 0.62, rough: 0.7 });
    this.fill(x, y, w, h, {
      color: options.glass ?? "#40596a",
      height: 0.16,
      rough: 0.1,
      metal: 0.35,
      glow: options.lit ? this.pick(warmLights) : undefined,
    });
    // Sky reflection on the upper part of the pane and a shadow under the lintel.
    this.fill(x, y + h * 0.08, w, h * 0.22, { color: "rgba(255,255,255,0.16)" });
    this.fill(x, y, w, Math.max(1, h * 0.08), { color: "rgba(0,0,0,0.25)", height: 0.08 });
    if (options.sill !== false) this.fill(x - 4, y + h + 2, w + 8, Math.max(2, h * 0.07), { color: "#fbf9f4", height: 0.8, rough: 0.7 });
  }
}

// 0 shopfront: pillars, signboards, roller shutters, open shops with goods, glazed shops, kerb.
function paintShopfront(p: CellPainter): void {
  const { size, row } = p;
  p.wall();
  const bay = size / 4;
  for (let r = 0; r < 4; r += 1) {
    const top = r * row;
    for (let c = 0; c < 4; c += 1) {
      const bx = c * bay + bay * 0.09;
      const bw = bay * 0.82;
      p.fill(c * bay, top, bay * 0.09, row, { color: "#ddd6ca", height: 0.62, rough: 0.85 });
      const sign = p.pick(signColors);
      p.fill(bx, top + row * 0.05, bw, row * 0.16, { color: sign, height: 0.7, rough: 0.5, glow: `${sign}66` });
      p.fill(bx + bw * 0.1, top + row * 0.1, bw * 0.55, row * 0.05, { color: "rgba(255,255,255,0.85)", height: 0.72, glow: "#ffffff55" });
      const oy = top + row * 0.24;
      const oh = row * 0.72;
      const kind = p.random();
      if (kind < 0.38) {
        p.fill(bx, oy, bw, oh, { color: "#a3aab1", height: 0.34, rough: 0.45, metal: 0.65 });
        for (let line = 0; line < oh; line += 3) {
          p.fill(bx, oy + line, bw, 1, { color: "rgba(50,56,62,0.45)", height: 0.3 });
        }
      } else if (kind < 0.8) {
        p.fill(bx, oy, bw, oh, { color: "#2e2924", height: 0.06, rough: 0.9, glow: "#ffcf8a" });
        for (let i = 0; i < 9; i += 1) {
          p.fill(bx + p.random() * bw * 0.86, oy + oh * (0.3 + p.random() * 0.55), bw * 0.12, oh * 0.14, {
            color: p.pick(["#fbbf24", "#f87171", "#60a5fa", "#86efac", "#f5f5f4", "#fb923c"]),
            height: 0.14,
          });
        }
        p.fill(bx, oy, bw, oh * 0.06, { color: "#fff3d6", height: 0.08, glow: "#fff1c9" });
      } else {
        p.fill(bx, oy, bw, oh, { color: "#3b5667", height: 0.22, rough: 0.08, metal: 0.45, glow: "#ffe2b0" });
        p.fill(bx + bw * 0.48, oy, 2, oh, { color: "#c7ccd1", height: 0.4, metal: 0.6, rough: 0.4 });
        p.fill(bx, oy + oh * 0.1, bw, oh * 0.2, { color: "rgba(255,255,255,0.18)" });
      }
      p.fill(bx, oy, bw, row * 0.03, { color: "rgba(0,0,0,0.35)", height: 0.04 });
    }
    p.fill(0, top + row * 0.96, size, row * 0.04, { color: "#cfc8bc", height: 0.58, rough: 0.9 });
  }
}

// 1 shophouse upper floors: floor ledges, framed windows with grilles, shutters, AC units, plants.
function paintShophouse(p: CellPainter): void {
  const { size, row } = p;
  p.wall();
  const col = size / 4;
  for (let r = 0; r < 4; r += 1) {
    const top = r * row;
    p.fill(0, top + row * 0.88, size, row * 0.08, { color: "#e7e2d8", height: 0.78, rough: 0.8 });
    p.fill(0, top + row * 0.96, size, row * 0.04, { color: "rgba(40,36,30,0.3)", height: 0.44 });
    for (let c = 0; c < 4; c += 1) {
      const wx = c * col + col * 0.2;
      const wy = top + row * 0.2;
      const ww = col * 0.6;
      const wh = row * 0.52;
      const choice = p.random();
      if (choice < 0.22) {
        p.window(wx, wy, ww, wh, { lit: false });
        const shutter = p.pick(shutterColors);
        p.fill(wx, wy, ww / 2 - 1, wh, { color: shutter, height: 0.42, rough: 0.7 });
        p.fill(wx + ww / 2 + 1, wy, ww / 2 - 1, wh, { color: shutter, height: 0.42, rough: 0.7 });
        for (let slat = wy + 3; slat < wy + wh; slat += 4) p.fill(wx, slat, ww, 1, { color: "rgba(0,0,0,0.25)", height: 0.36 });
      } else {
        p.window(wx, wy, ww, wh, { lit: p.random() > 0.5 });
        for (let bar = 0; bar <= 6; bar += 1) p.fill(wx + (bar * ww) / 6 - 0.5, wy, 1.5, wh, { color: "#2b2f33", height: 0.5, rough: 0.5, metal: 0.5 });
        p.fill(wx, wy + wh * 0.5, ww, 1.5, { color: "#2b2f33", height: 0.5, metal: 0.5 });
      }
      const extra = p.random();
      if (extra < 0.28) {
        p.fill(wx + ww * 0.1, wy + wh + row * 0.07, ww * 0.55, row * 0.14, { color: "#d9dde0", height: 0.92, rough: 0.6, metal: 0.2 });
        for (let fin = 0; fin < 5; fin += 1) p.fill(wx + ww * 0.12, wy + wh + row * 0.08 + fin * 2, ww * 0.5, 1, { color: "rgba(0,0,0,0.25)", height: 0.88 });
      } else if (extra < 0.45) {
        for (let leaf = 0; leaf < 6; leaf += 1) p.fill(wx + p.random() * ww * 0.9, wy + wh - 4 + p.random() * 5, 4, 4, { color: p.pick(["#3f7d3a", "#4d8b3c", "#5b9442"]), height: 0.9 });
      } else if (extra < 0.55) {
        p.fill(wx + ww * 0.15, wy + wh * 0.1, ww * 0.12, wh * 0.45, { color: p.pick(["#f472b6", "#60a5fa", "#fde047", "#f5f5f4"]), height: 0.3 });
      }
    }
  }
}

// 2 condo: projecting balcony slabs with glass railings in front of recessed sliding doors.
function paintCondo(p: CellPainter): void {
  const { size, row } = p;
  p.wall();
  const units = 3;
  const unit = size / units;
  for (let r = 0; r < 4; r += 1) {
    const top = r * row;
    for (let u = 0; u < units; u += 1) {
      const x = u * unit;
      p.fill(x + unit * 0.06, top + row * 0.08, unit * 0.88, row * 0.72, { color: "#314f60", height: 0.12, rough: 0.08, metal: 0.5, glow: p.random() > 0.5 ? p.pick(warmLights) : undefined });
      p.fill(x + unit * 0.5 - 1, top + row * 0.08, 2, row * 0.72, { color: "#c9d1d6", height: 0.3, metal: 0.6, rough: 0.4 });
      if (p.random() < 0.4) p.fill(x + unit * 0.08, top + row * 0.1, unit * 0.2, row * 0.66, { color: p.pick(["#e7e5e4", "#fde68a", "#bfdbfe", "#fecaca"]), height: 0.14 });
      p.fill(x, top, unit * 0.05, row, { color: "#ebe7df", height: 0.9, rough: 0.85 });
    }
    p.fill(0, top + row * 0.56, size, row * 0.26, { color: "rgba(190,215,222,0.55)", height: 0.84, rough: 0.15, metal: 0.2 });
    p.fill(0, top + row * 0.55, size, 2, { color: "#8d969d", height: 0.95, metal: 0.7, rough: 0.35 });
    p.fill(0, top + row * 0.82, size, row * 0.12, { color: "#f3f1ec", height: 1, rough: 0.8 });
    p.fill(0, top + row * 0.94, size, row * 0.06, { color: "rgba(30,28,24,0.45)", height: 0.86 });
  }
}

// 3 glass curtain wall: glossy panels, metal mullions and spandrels.
function paintGlass(p: CellPainter): void {
  const { size, row } = p;
  const cols = 6;
  const col = size / cols;
  for (let r = 0; r < 4; r += 1) {
    const top = r * row;
    for (let c = 0; c < cols; c += 1) {
      const light = p.random();
      const tone = light > 0.82 ? "#9cc4dc" : light > 0.4 ? "#4f7896" : "#3a5f7c";
      p.fill(c * col, top, col, row, { color: tone, height: 0.42, rough: 0.05, metal: 0.45, glow: p.random() > 0.68 ? p.pick(["#b9d3e6", "#e6d6ae", "#d5dde3"]) : undefined });
      p.fill(c * col, top + row * 0.1, col, row * 0.25, { color: "rgba(255,255,255,0.12)" });
    }
    p.fill(0, top + row * 0.88, size, row * 0.12, { color: "#1d2c38", height: 0.5, rough: 0.55, metal: 0.2 });
    for (let c = 0; c <= cols; c += 1) p.fill(c * col - 2, top, 4, row, { color: "#dfe5e9", height: 0.64, rough: 0.7, metal: 0.1 });
    p.fill(0, top + row * 0.87, size, 3, { color: "#e8edf0", height: 0.66, metal: 0.1, rough: 0.7 });
  }
}

// 4 ribbon windows between projecting spandrels (hotels, hospitals, schools, offices).
function paintRibbon(p: CellPainter): void {
  const { size, row } = p;
  p.wall();
  for (let r = 0; r < 4; r += 1) {
    const top = r * row;
    const ry = top + row * 0.2;
    const rh = row * 0.48;
    p.fill(0, ry - 2, size, rh + 4, { color: "#dcdcd6", height: 0.3 });
    for (let c = 0; c < 8; c += 1) {
      p.fill((c * size) / 8 + 1, ry, size / 8 - 2, rh, { color: "#38525f", height: 0.18, rough: 0.08, metal: 0.45, glow: p.random() > 0.5 ? p.pick(warmLights) : undefined });
      p.fill((c * size) / 8 + 1, ry + rh * 0.08, size / 8 - 2, rh * 0.2, { color: "rgba(255,255,255,0.15)" });
    }
    for (let c = 0; c <= 8; c += 1) p.fill((c * size) / 8 - 1, ry, 2, rh, { color: "#e7ecef", height: 0.36, metal: 0.4, rough: 0.4 });
    p.fill(0, ry + rh, size, row * 0.06, { color: "#faf8f3", height: 0.76, rough: 0.7 });
    p.fill(0, ry + rh + row * 0.06, size, row * 0.03, { color: "rgba(0,0,0,0.2)", height: 0.5 });
  }
}

// 5 house: three framed windows per floor with shutters and sills, and a thin floor line.
function paintHouse(p: CellPainter): void {
  const { size, row } = p;
  p.wall();
  for (let r = 0; r < 4; r += 1) {
    const top = r * row;
    p.fill(0, top + row * 0.93, size, row * 0.04, { color: "#ece7dc", height: 0.66 });
    for (const t of [0.1, 0.43, 0.76]) {
      const wx = size * t;
      const ww = size * 0.14;
      const wy = top + row * 0.24;
      const wh = row * 0.46;
      if (p.random() < 0.15) {
        p.fill(wx, wy - row * 0.04, ww, row * 0.7, { color: p.pick(shutterColors), height: 0.3, rough: 0.7 });
        p.fill(wx + ww * 0.7, wy + row * 0.3, 2, 2, { color: "#d4af37", height: 0.45, metal: 0.8 });
        continue;
      }
      p.window(wx, wy, ww, wh, { lit: p.random() > 0.6, glass: "#4d5f6b" });
      const shutter = p.pick(shutterColors);
      p.fill(wx - ww * 0.36, wy, ww * 0.32, wh, { color: shutter, height: 0.6, rough: 0.7 });
      p.fill(wx + ww * 1.04, wy, ww * 0.32, wh, { color: shutter, height: 0.6, rough: 0.7 });
      for (let slat = wy + 2; slat < wy + wh; slat += 3) {
        p.fill(wx - ww * 0.36, slat, ww * 0.32, 1, { color: "rgba(0,0,0,0.22)", height: 0.55 });
        p.fill(wx + ww * 1.04, slat, ww * 0.32, 1, { color: "rgba(0,0,0,0.22)", height: 0.55 });
      }
    }
  }
}

// 6 warehouse: corrugated metal, a ribbed roller door and a high window strip.
function paintWarehouse(p: CellPainter): void {
  const { size, row } = p;
  for (let x = 0; x < size; x += 1) {
    const wave = Math.sin((x / 6) * Math.PI * 2);
    const shade = Math.round(208 + wave * 22);
    p.fill(x, 0, 1, size, { color: `rgb(${shade},${shade + 2},${shade + 4})`, height: 0.5 + wave * 0.14, rough: 0.5, metal: 0.55 });
  }
  const door = size * (0.12 + p.random() * 0.36);
  p.fill(door - 4, size - row * 1.35 - 4, size * 0.4 + 8, row * 1.35 + 4, { color: "#8a8f94", height: 0.6, metal: 0.6, rough: 0.4 });
  p.fill(door, size - row * 1.35, size * 0.4, row * 1.35, { color: "#6b7280", height: 0.3, metal: 0.6, rough: 0.45 });
  for (let line = size - row * 1.35; line < size; line += 3) p.fill(door, line, size * 0.4, 1, { color: "rgba(20,24,28,0.4)", height: 0.26 });
  for (let r = 0; r < 4; r += 1) {
    p.fill(0, r * row + row * 0.06, size, row * 0.1, { color: "#4f5d66", height: 0.24, rough: 0.12, metal: 0.4, glow: r % 2 ? "#3b3326" : undefined });
  }
  p.fill(0, size - 6, size, 6, { color: "#7a7f84", height: 0.6, rough: 0.8 });
}

// 7 ornate: pilasters, tall framed windows with gold trim and moulded bands (temples, malls, halls).
function paintOrnate(p: CellPainter): void {
  const { size, row } = p;
  p.wall();
  for (let r = 0; r < 4; r += 1) {
    const top = r * row;
    for (let c = 0; c < 2; c += 1) {
      const pilaster = (c * size) / 2;
      p.fill(pilaster, top, size * 0.08, row, { color: "#f8f5ee", height: 0.78, rough: 0.8 });
      p.fill(pilaster + size * 0.01, top + row * 0.08, size * 0.06, row * 0.05, { color: "#d4af37", height: 0.85, metal: 0.8, rough: 0.3 });
      const wx = pilaster + size * 0.17;
      const ww = size * 0.16;
      const wy = top + row * 0.22;
      const wh = row * 0.62;
      p.fill(wx - 4, wy - 7, ww + 8, wh + 10, { color: "#c9a227", height: 0.66, metal: 0.8, rough: 0.3 });
      p.fill(wx, wy, ww, wh, { color: "#5a2a1c", height: 0.14, rough: 0.6, glow: p.random() > 0.5 ? "#ffcf8a" : undefined });
      p.fill(wx + ww / 2 - 1, wy, 2, wh, { color: "#3b1a10", height: 0.12 });
      p.fill(wx + ww * 0.1, wy - 6, ww * 0.8, 3, { color: "#e6c65c", height: 0.75, metal: 0.8, rough: 0.3 });
    }
    p.fill(0, top + row * 0.03, size, row * 0.07, { color: "#d9b44a", height: 0.8, metal: 0.7, rough: 0.35 });
    p.fill(0, top + row * 0.1, size, row * 0.02, { color: "rgba(0,0,0,0.25)", height: 0.5 });
  }
}

const painters = [paintShopfront, paintShophouse, paintCondo, paintGlass, paintRibbon, paintHouse, paintWarehouse, paintOrnate];

function canvasTexture(canvas: HTMLCanvasElement, colorSpace: THREE.ColorSpace): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  return texture;
}

// Sobel-style normals from the height field, wrapping inside each cell so tiles stay seamless.
function heightToNormals(height: CanvasRenderingContext2D, width: number, h: number, cell: number, strength: number): HTMLCanvasElement {
  const source = height.getImageData(0, 0, width, h).data;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const out = ctx.createImageData(width, h);
  const sample = (x: number, y: number) => source[(y * width + x) * 4] / 255;
  for (let y = 0; y < h; y += 1) {
    const cy = Math.floor(y / cell) * cell;
    const up = cy + ((y - cy - 1 + cell) % cell);
    const down = cy + ((y - cy + 1) % cell);
    for (let x = 0; x < width; x += 1) {
      const cx = Math.floor(x / cell) * cell;
      const left = cx + ((x - cx - 1 + cell) % cell);
      const right = cx + ((x - cx + 1) % cell);
      const dx = (sample(right, y) - sample(left, y)) * strength;
      // Canvas y grows downwards while texture v grows upwards.
      const dy = (sample(x, down) - sample(x, up)) * strength;
      const length = Math.hypot(dx, dy, 1);
      const index = (y * width + x) * 4;
      out.data[index] = Math.round(((-dx / length) * 0.5 + 0.5) * 255);
      out.data[index + 1] = Math.round(((dy / length) * 0.5 + 0.5) * 255);
      out.data[index + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      out.data[index + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

export function createFacadeAtlas(cell: number): FacadeAtlas {
  const width = cell * FACADE_COLUMNS;
  const height = cell * FACADE_ROWS;
  const make = () => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas texture context unavailable");
    return { canvas, ctx };
  };
  const color = make();
  const emissive = make();
  const heightLayer = make();
  const surface = make();
  emissive.ctx.fillStyle = "#000000";
  emissive.ctx.fillRect(0, 0, width, height);
  heightLayer.ctx.fillStyle = "rgb(128,128,128)";
  heightLayer.ctx.fillRect(0, 0, width, height);
  surface.ctx.fillStyle = `rgb(0,${Math.round(0.88 * 255)},0)`;
  surface.ctx.fillRect(0, 0, width, height);
  const layers: Layers = { color: color.ctx, emissive: emissive.ctx, height: heightLayer.ctx, surface: surface.ctx };
  painters.forEach((paint, index) => {
    // Atlas row 0 is the bottom of the texture (v up), i.e. the lower half of the canvas.
    const x = (index % FACADE_COLUMNS) * cell;
    const y = height - (Math.floor(index / FACADE_COLUMNS) + 1) * cell;
    for (const ctx of Object.values(layers)) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, cell, cell);
      ctx.clip();
    }
    // Painters draw in 256-pixel units; scale them to the cell size.
    const scale = cell / 256;
    for (const ctx of Object.values(layers)) {
      ctx.translate(x, y);
      ctx.scale(scale, scale);
    }
    paint(new CellPainter(layers, 0, 0, 256, seeded(101 + index * 17)));
    for (const ctx of Object.values(layers)) ctx.restore();
  });
  const normalCanvas = heightToNormals(heightLayer.ctx, width, height, cell, 3.2 * (cell / 256));
  return {
    color: canvasTexture(color.canvas, THREE.SRGBColorSpace),
    emissive: canvasTexture(emissive.canvas, THREE.SRGBColorSpace),
    normal: canvasTexture(normalCanvas, THREE.NoColorSpace),
    surface: canvasTexture(surface.canvas, THREE.NoColorSpace),
    cell,
  };
}
