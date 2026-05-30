import * as THREE from "three";

function makeCanvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas texture context unavailable");
  }
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function createAsphaltMaterial(highDetail: boolean): THREE.MeshStandardMaterial {
  const map = makeCanvasTexture(highDetail ? 256 : 128, (ctx, size) => {
    ctx.fillStyle = "#252a2d";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < size * 2; i += 1) {
      const shade = 30 + ((i * 17) % 48);
      ctx.fillStyle = `rgba(${shade}, ${shade + 3}, ${shade + 5}, 0.32)`;
      ctx.fillRect((i * 37) % size, (i * 19) % size, 1 + (i % 3), 1 + ((i + 1) % 3));
    }
  });
  map.repeat.set(10, 1);
  return new THREE.MeshStandardMaterial({ color: "#2c3134", map, roughness: 0.88, metalness: 0.02 });
}

export function createSidewalkMaterial(): THREE.MeshStandardMaterial {
  const map = makeCanvasTexture(128, (ctx, size) => {
    ctx.fillStyle = "#73746e";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    for (let i = 0; i <= size; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }
  });
  map.repeat.set(3, 1);
  return new THREE.MeshStandardMaterial({ color: "#8a8a80", map, roughness: 0.78 });
}

export function createWaterMaterial(): THREE.MeshStandardMaterial {
  const map = makeCanvasTexture(128, (ctx, size) => {
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, "#2f7287");
    gradient.addColorStop(1, "#184a63");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(190,235,255,0.22)";
    for (let y = 12; y < size; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.25, y - 8, size * 0.6, y + 8, size, y);
      ctx.stroke();
    }
  });
  map.repeat.set(2, 10);
  return new THREE.MeshStandardMaterial({ color: "#2e7189", map, roughness: 0.32, metalness: 0.18 });
}

export function createBuildingMaterial(color: string, highDetail: boolean): THREE.MeshStandardMaterial {
  const map = makeCanvasTexture(highDetail ? 128 : 64, (ctx, size) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "rgba(195, 220, 230, 0.32)";
    const cols = 4;
    const rows = 8;
    const cellW = size / cols;
    const cellH = size / rows;
    for (let y = 1; y < rows - 1; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        if ((x + y) % 5 === 0) continue;
        ctx.fillRect(x * cellW + cellW * 0.22, y * cellH + cellH * 0.22, cellW * 0.46, cellH * 0.34);
      }
    }
  });
  map.repeat.set(1, 2);
  return new THREE.MeshStandardMaterial({ color, map, roughness: 0.52, metalness: 0.08 });
}
