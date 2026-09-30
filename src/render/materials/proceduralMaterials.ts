import * as THREE from "three";
import { FACADE_COLUMNS, FACADE_ROWS } from "../world/facadeStyles";

function makeCanvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void, colorSpace = THREE.SRGBColorSpace): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas texture context unavailable");
  }
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function seeded(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return value / 2147483647;
  };
}

// Textures carry the colour; material colours stay white so they don't darken the map twice.
export function createAsphaltMaterial(highDetail: boolean): THREE.MeshStandardMaterial {
  const random = seeded(11);
  const map = makeCanvasTexture(highDetail ? 512 : 256, (ctx, size) => {
    ctx.fillStyle = "#4b5256";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < size * size * 0.06; i += 1) {
      const shade = 58 + Math.floor(random() * 50);
      ctx.fillStyle = `rgba(${shade}, ${shade + 2}, ${shade + 4}, ${0.25 + random() * 0.35})`;
      ctx.fillRect(random() * size, random() * size, 1 + random() * 2, 1 + random() * 2);
    }
    for (let i = 0; i < 6; i += 1) {
      ctx.fillStyle = `rgba(20, 24, 28, ${0.08 + random() * 0.1})`;
      ctx.beginPath();
      ctx.ellipse(random() * size, random() * size, 10 + random() * 40, 6 + random() * 18, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(15, 18, 20, 0.35)";
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i += 1) {
      let x = random() * size;
      let y = random() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let step = 0; step < 6; step += 1) {
        x += (random() - 0.5) * 30;
        y += (random() - 0.5) * 30;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
  return new THREE.MeshStandardMaterial({ color: "#ffffff", map, roughness: 0.86, metalness: 0.02 });
}

export function createBridgeMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: "#8a939a", roughness: 0.6, metalness: 0.12 });
}

export function createSidewalkMaterial(): THREE.MeshStandardMaterial {
  const map = makeCanvasTexture(128, (ctx, size) => {
    ctx.fillStyle = "#b9b6ad";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(70, 66, 60, 0.35)";
    ctx.lineWidth = 2;
    for (let i = 0; i <= size; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(160, 60, 50, 0.22)";
    ctx.fillRect(0, 0, size, 10);
  });
  return new THREE.MeshStandardMaterial({ color: "#ffffff", map, roughness: 0.82 });
}

export function createMarkingMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.55, emissive: "#ffffff", emissiveIntensity: 0.05 });
}

export function createWaterMaterial(): THREE.MeshStandardMaterial {
  const map = makeCanvasTexture(256, (ctx, size) => {
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, "#4f8a8b");
    gradient.addColorStop(1, "#3b6f78");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    const random = seeded(5);
    ctx.strokeStyle = "rgba(220, 245, 255, 0.28)";
    for (let i = 0; i < 70; i += 1) {
      const x = random() * size;
      const y = random() * size;
      ctx.lineWidth = 1 + random() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 8, y - 3, x + 16 + random() * 10, y);
      ctx.stroke();
    }
  });
  map.repeat.set(1 / 60, 1 / 60);
  return new THREE.MeshStandardMaterial({ color: "#ffffff", map, roughness: 0.16, metalness: 0.35, envMapIntensity: 1.2 });
}

export function createGrassMaterial(): THREE.MeshStandardMaterial {
  const random = seeded(23);
  const map = makeCanvasTexture(256, (ctx, size) => {
    ctx.fillStyle = "#5b8a3c";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 4000; i += 1) {
      const g = 110 + Math.floor(random() * 60);
      ctx.fillStyle = `rgba(${60 + Math.floor(random() * 40)}, ${g}, ${40 + Math.floor(random() * 30)}, 0.5)`;
      ctx.fillRect(random() * size, random() * size, 1.5, 3);
    }
  });
  map.repeat.set(1 / 25, 1 / 25);
  return new THREE.MeshStandardMaterial({ color: "#ffffff", map, roughness: 0.95 });
}

export function createGroundMaterial(): THREE.MeshStandardMaterial {
  const random = seeded(31);
  const map = makeCanvasTexture(256, (ctx, size) => {
    // Dusty city lots: worn concrete and packed earth with the odd tuft of grass (parks have their own material).
    ctx.fillStyle = "#8b877b";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 3200; i += 1) {
      const tone = random();
      ctx.fillStyle = tone > 0.75 ? "rgba(96, 112, 78, 0.3)" : tone > 0.4 ? "rgba(122, 116, 102, 0.35)" : "rgba(158, 152, 138, 0.3)";
      ctx.fillRect(random() * size, random() * size, 2 + random() * 3, 2 + random() * 3);
    }
    ctx.strokeStyle = "rgba(70, 66, 58, 0.18)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i += 1) {
      const x = random() * size;
      const y = random() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (random() - 0.5) * 40, y + (random() - 0.5) * 40);
      ctx.stroke();
    }
  });
  map.repeat.set(60, 60);
  return new THREE.MeshStandardMaterial({ color: "#ffffff", map, roughness: 0.95 });
}

export interface FacadeMaterials {
  walls: THREE.MeshStandardMaterial;
  roofs: THREE.MeshStandardMaterial;
}

// One shared façade atlas with eight styles (see `facadeStyles.ts`): colour in the map, lit windows in
// the emissive map (night glow). Each vertex carries a `facadeCell`; the patched shader wraps the
// repeating wall UVs inside that cell and samples with explicit gradients so there are no mip seams.
type CellPainter = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, emissive: boolean, random: () => number) => void;

const warmLights = ["#ffd89a", "#fff1c9", "#ffe2b0", "#f9f3e3"];

function paintWindow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, glass: string, emissive: boolean, lit: boolean, random: () => number): void {
  if (emissive) {
    if (!lit) return;
    ctx.fillStyle = warmLights[Math.floor(random() * warmLights.length)];
    ctx.fillRect(x, y, w, h);
    return;
  }
  ctx.fillStyle = glass;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(x, y, w, Math.max(1, h * 0.12));
}

const cellPainters: CellPainter[] = [
  // 0 shopfront: roller shutters and open shops with goods and a sign strip over each bay.
  (ctx, x, y, size, emissive, random) => {
    const row = size / 4;
    const bay = size / 4;
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        const bx = x + c * bay + bay * 0.08;
        const by = y + r * row + row * 0.22;
        const bw = bay * 0.84;
        const bh = row * 0.78;
        const open = random() > 0.42;
        if (emissive) {
          if (!open) continue;
          ctx.fillStyle = "#ffcf8a";
          ctx.fillRect(bx, by, bw, bh);
          continue;
        }
        ctx.fillStyle = ["#e11d48", "#2563eb", "#16a34a", "#f59e0b", "#7c3aed"][Math.floor(random() * 5)];
        ctx.fillRect(bx, y + r * row + row * 0.06, bw, row * 0.12);
        if (open) {
          ctx.fillStyle = "#3b342d";
          ctx.fillRect(bx, by, bw, bh);
          for (let i = 0; i < 7; i += 1) {
            ctx.fillStyle = ["#fbbf24", "#f87171", "#60a5fa", "#86efac", "#f5f5f4"][Math.floor(random() * 5)];
            ctx.fillRect(bx + random() * bw * 0.85, by + bh * (0.25 + random() * 0.55), bw * 0.12, bh * 0.14);
          }
          ctx.fillStyle = "#8a8378";
          ctx.fillRect(bx, by + bh * 0.9, bw, bh * 0.1);
        } else {
          ctx.fillStyle = "#a8aeb4";
          ctx.fillRect(bx, by, bw, bh);
          ctx.fillStyle = "rgba(60, 66, 72, 0.45)";
          for (let line = by + 2; line < by + bh; line += Math.max(2, bh / 14)) ctx.fillRect(bx, line, bw, 1);
        }
      }
    }
  },
  // 1 shophouse upper floors: grilled windows, AC units, plants and laundry.
  (ctx, x, y, size, emissive, random) => {
    const row = size / 4;
    const col = size / 4;
    for (let r = 0; r < 4; r += 1) {
      if (!emissive) {
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.fillRect(x, y + r * row + row * 0.9, size, row * 0.05);
      }
      for (let c = 0; c < 4; c += 1) {
        const wx = x + c * col + col * 0.2;
        const wy = y + r * row + row * 0.2;
        const ww = col * 0.6;
        const wh = row * 0.52;
        paintWindow(ctx, wx, wy, ww, wh, "#4f6470", emissive, random() > 0.55, random);
        if (emissive) continue;
        ctx.fillStyle = "rgba(40,44,48,0.75)";
        for (let bar = wx + ww / 6; bar < wx + ww; bar += ww / 6) ctx.fillRect(bar, wy, 1, wh);
        const extra = random();
        if (extra < 0.3) {
          ctx.fillStyle = "#d9dde0";
          ctx.fillRect(wx + ww * 0.15, wy + wh + row * 0.04, ww * 0.5, row * 0.13);
        } else if (extra < 0.5) {
          ctx.fillStyle = "#4d7c3a";
          ctx.fillRect(wx, wy + wh, ww, row * 0.07);
        } else if (extra < 0.62) {
          ctx.fillStyle = ["#f472b6", "#60a5fa", "#fde047"][Math.floor(random() * 3)];
          ctx.fillRect(wx + ww * 0.2, wy + wh * 0.15, ww * 0.15, wh * 0.4);
        }
      }
    }
  },
  // 2 condo: balcony slabs, sliding glass doors and railings.
  (ctx, x, y, size, emissive, random) => {
    const row = size / 4;
    const bays = 3;
    const bay = size / bays;
    for (let r = 0; r < 4; r += 1) {
      const ry = y + r * row;
      for (let c = 0; c < bays; c += 1) {
        paintWindow(ctx, x + c * bay + bay * 0.08, ry + row * 0.12, bay * 0.84, row * 0.66, "#35566a", emissive, random() > 0.5, random);
        if (emissive) continue;
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.fillRect(x + c * bay + bay * 0.5, ry + row * 0.12, 1.5, row * 0.66);
        if (random() < 0.35) {
          ctx.fillStyle = ["#e7e5e4", "#fde68a", "#bfdbfe"][Math.floor(random() * 3)];
          ctx.fillRect(x + c * bay + bay * 0.1, ry + row * 0.14, bay * 0.18, row * 0.6);
        }
      }
      if (emissive) continue;
      ctx.fillStyle = "#f1f1ef";
      ctx.fillRect(x, ry + row * 0.84, size, row * 0.16);
      ctx.fillStyle = "rgba(90, 96, 104, 0.8)";
      ctx.fillRect(x, ry + row * 0.62, size, 1.5);
      for (let post = x; post < x + size; post += size / 24) ctx.fillRect(post, ry + row * 0.62, 1, row * 0.22);
    }
  },
  // 3 glass curtain wall: reflective panels with mullions.
  (ctx, x, y, size, emissive, random) => {
    const row = size / 4;
    const cols = 6;
    const col = size / cols;
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const px = x + c * col;
        const py = y + r * row;
        if (emissive) {
          if (random() > 0.6) {
            ctx.fillStyle = random() > 0.5 ? "#e0f2fe" : "#fef3c7";
            ctx.fillRect(px + 1, py + row * 0.08, col - 2, row * 0.84);
          }
          continue;
        }
        const gradient = ctx.createLinearGradient(px, py, px + col, py + row);
        const light = random() > 0.8;
        gradient.addColorStop(0, light ? "#7fa8c4" : "#2c4a63");
        gradient.addColorStop(1, light ? "#a9cde0" : "#3f6a85");
        ctx.fillStyle = gradient;
        ctx.fillRect(px, py, col, row);
      }
      if (emissive) continue;
      ctx.fillStyle = "#c9d3da";
      ctx.fillRect(x, y + r * row + row * 0.92, size, row * 0.08);
      for (let c = 0; c <= cols; c += 1) ctx.fillRect(x + c * col - 1, y + r * row, 2, row);
    }
  },
  // 4 ribbon windows over light spandrels (hotels, hospitals, schools, offices).
  (ctx, x, y, size, emissive, random) => {
    const row = size / 4;
    for (let r = 0; r < 4; r += 1) {
      const ry = y + r * row + row * 0.18;
      const rh = row * 0.5;
      for (let c = 0; c < 8; c += 1) {
        paintWindow(ctx, x + (c * size) / 8, ry, size / 8, rh, "#3a5566", emissive, random() > 0.5, random);
      }
      if (emissive) continue;
      ctx.fillStyle = "rgba(230, 236, 240, 0.9)";
      for (let c = 0; c <= 8; c += 1) ctx.fillRect(x + (c * size) / 8 - 1, ry, 2, rh);
      ctx.fillStyle = "rgba(0,0,0,0.1)";
      ctx.fillRect(x, ry + rh, size, row * 0.04);
    }
  },
  // 5 house: two shuttered windows per floor.
  (ctx, x, y, size, emissive, random) => {
    const row = size / 4;
    for (let r = 0; r < 4; r += 1) {
      for (const c of [0.5, 2.5]) {
        const wx = x + (c * size) / 4;
        const wy = y + r * row + row * 0.24;
        const ww = size / 4;
        const wh = row * 0.46;
        paintWindow(ctx, wx, wy, ww, wh, "#51606a", emissive, random() > 0.6, random);
        if (emissive) continue;
        ctx.fillStyle = "#f8f5ef";
        ctx.fillRect(wx - 2, wy - 2, ww + 4, 2);
        ctx.fillRect(wx - 2, wy + wh, ww + 4, 3);
        ctx.fillStyle = ["#7c4a2d", "#355e3b", "#1e3a5f"][Math.floor(random() * 3)];
        ctx.fillRect(wx - ww * 0.28, wy, ww * 0.24, wh);
        ctx.fillRect(wx + ww * 1.04, wy, ww * 0.24, wh);
      }
    }
  },
  // 6 warehouse: corrugated metal with a roller door and a high window strip.
  (ctx, x, y, size, emissive, random) => {
    if (emissive) {
      ctx.fillStyle = "#3b3326";
      ctx.fillRect(x, y + size * 0.06, size, size * 0.04);
      return;
    }
    for (let stripe = 0; stripe < size; stripe += 4) {
      ctx.fillStyle = stripe % 8 === 0 ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.12)";
      ctx.fillRect(x + stripe, y, 2, size);
    }
    const door = x + size * (0.1 + random() * 0.4);
    ctx.fillStyle = "#6b7280";
    ctx.fillRect(door, y + size * 0.78, size * 0.4, size * 0.22);
    ctx.fillStyle = "rgba(20,24,28,0.35)";
    for (let line = y + size * 0.78; line < y + size; line += 3) ctx.fillRect(door, line, size * 0.4, 1);
    ctx.fillStyle = "#58656e";
    ctx.fillRect(x, y + size * 0.06, size, size * 0.04);
  },
  // 7 ornate: white walls, tall framed windows and gold bands (temples, malls, civic halls).
  (ctx, x, y, size, emissive, random) => {
    const row = size / 4;
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 2; c += 1) {
        const wx = x + ((c + 0.32) * size) / 2;
        const wy = y + r * row + row * 0.2;
        const ww = (size / 2) * 0.36;
        const wh = row * 0.62;
        if (emissive) {
          if (random() > 0.5) {
            ctx.fillStyle = "#ffcf8a";
            ctx.fillRect(wx, wy, ww, wh);
          }
          continue;
        }
        ctx.fillStyle = "#c9a227";
        ctx.fillRect(wx - 3, wy - 5, ww + 6, wh + 8);
        ctx.fillStyle = "#6b2d1f";
        ctx.fillRect(wx, wy, ww, wh);
      }
      if (emissive) continue;
      ctx.fillStyle = "#d4af37";
      ctx.fillRect(x, y + r * row + row * 0.04, size, row * 0.06);
    }
  },
];

export function createFacadeMaterials(highDetail: boolean): FacadeMaterials {
  const cell = highDetail ? 256 : 128;
  const drawAtlas = (emissive: boolean) => {
    const canvas = document.createElement("canvas");
    canvas.width = cell * FACADE_COLUMNS;
    canvas.height = cell * FACADE_ROWS;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas texture context unavailable");
    ctx.fillStyle = emissive ? "#000000" : "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    cellPainters.forEach((paint, index) => {
      // Atlas row 0 is the bottom of the texture (v up), i.e. the lower half of the canvas.
      const column = index % FACADE_COLUMNS;
      const row = Math.floor(index / FACADE_COLUMNS);
      const x = column * cell;
      const y = canvas.height - (row + 1) * cell;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, cell, cell);
      ctx.clip();
      paint(ctx, x, y, cell, emissive, seeded(101 + index * 17));
      ctx.restore();
    });
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 8;
    return texture;
  };
  const walls = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: drawAtlas(false),
    emissive: "#ffffff",
    emissiveMap: drawAtlas(true),
    emissiveIntensity: 0,
    vertexColors: true,
    roughness: 0.62,
    metalness: 0.08,
  });
  const pad = (2 / cell).toFixed(5);
  walls.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <uv_pars_vertex>", "#include <uv_pars_vertex>\nattribute float facadeCell;\nvarying float vFacadeCell;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvFacadeCell = facadeCell;");
    const atlas = `
      varying float vFacadeCell;
      const vec2 facadeCellSize = vec2(${(1 / FACADE_COLUMNS).toFixed(5)}, ${(1 / FACADE_ROWS).toFixed(5)});
      vec2 facadeAtlasUv(vec2 uv) {
        vec2 cell = vec2(mod(floor(vFacadeCell + 0.5), ${FACADE_COLUMNS.toFixed(1)}), floor((vFacadeCell + 0.5) / ${FACADE_COLUMNS.toFixed(1)}));
        return (fract(uv) * (1.0 - 2.0 * ${pad}) + ${pad} + cell) * facadeCellSize;
      }
      vec4 facadeSample(sampler2D atlasMap, vec2 uv) {
        return textureGrad(atlasMap, facadeAtlasUv(uv), dFdx(uv) * facadeCellSize, dFdy(uv) * facadeCellSize);
      }
    `;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <uv_pars_fragment>", `#include <uv_pars_fragment>\n${atlas}`)
      .replace("vec4 sampledDiffuseColor = texture2D( map, vMapUv );", "vec4 sampledDiffuseColor = facadeSample( map, vMapUv );")
      .replace("vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );", "vec4 emissiveColor = facadeSample( emissiveMap, vEmissiveMapUv );");
  };
  walls.customProgramCacheKey = () => "facade-atlas-v1";
  const roofs = new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.9 });
  return { walls, roofs };
}
