import * as THREE from "three";

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
    ctx.fillStyle = "#6d7a5c";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 3000; i += 1) {
      const tone = random();
      ctx.fillStyle = tone > 0.6 ? "rgba(120, 112, 90, 0.35)" : "rgba(78, 104, 62, 0.35)";
      ctx.fillRect(random() * size, random() * size, 2 + random() * 3, 2 + random() * 3);
    }
  });
  map.repeat.set(60, 60);
  return new THREE.MeshStandardMaterial({ color: "#ffffff", map, roughness: 0.95 });
}

export interface FacadeMaterials {
  walls: THREE.MeshStandardMaterial;
  roofs: THREE.MeshStandardMaterial;
}

// One shared façade: window grid in the colour map, lit windows in the emissive map (night glow).
export function createFacadeMaterials(highDetail: boolean): FacadeMaterials {
  const size = highDetail ? 256 : 128;
  const cols = 4;
  const rows = 4;
  const random = seeded(47);
  const lit: boolean[] = [];
  for (let i = 0; i < cols * rows; i += 1) lit.push(random() > 0.45);
  const drawWindows = (ctx: CanvasRenderingContext2D, textureSize: number, emissive: boolean) => {
    ctx.fillStyle = emissive ? "#000000" : "#ffffff";
    ctx.fillRect(0, 0, textureSize, textureSize);
    const cellW = textureSize / cols;
    const cellH = textureSize / rows;
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const index = y * cols + x;
        if (emissive) {
          if (!lit[index]) continue;
          ctx.fillStyle = index % 3 === 0 ? "#ffd89a" : "#fff1c9";
        } else {
          ctx.fillStyle = "#5d7482";
        }
        ctx.fillRect(x * cellW + cellW * 0.18, y * cellH + cellH * 0.22, cellW * 0.64, cellH * 0.5);
        if (!emissive) {
          ctx.fillStyle = "rgba(255,255,255,0.25)";
          ctx.fillRect(x * cellW + cellW * 0.18, y * cellH + cellH * 0.22, cellW * 0.64, cellH * 0.08);
          ctx.fillStyle = "rgba(0,0,0,0.12)";
          ctx.fillRect(x * cellW, y * cellH + cellH * 0.86, cellW, cellH * 0.06);
        }
      }
    }
  };
  const map = makeCanvasTexture(size, (ctx, textureSize) => drawWindows(ctx, textureSize, false));
  const emissiveMap = makeCanvasTexture(size, (ctx, textureSize) => drawWindows(ctx, textureSize, true));
  const walls = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map,
    emissive: "#ffffff",
    emissiveMap,
    emissiveIntensity: 0,
    vertexColors: true,
    roughness: 0.62,
    metalness: 0.08,
  });
  const roofs = new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.9 });
  return { walls, roofs };
}
