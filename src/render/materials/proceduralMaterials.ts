import * as THREE from "three";
import { FACADE_COLUMNS, FACADE_ROWS } from "../world/facadeStyles";
import { createFacadeAtlas } from "./facadeAtlas";

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

// Forecourts and five-foot ways in front of buildings: worn square pavers with a few stains.
export function createPavingMaterial(): THREE.MeshStandardMaterial {
  const random = seeded(47);
  const map = makeCanvasTexture(128, (ctx, size) => {
    ctx.fillStyle = "#a9a59b";
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 32) {
      for (let x = 0; x < size; x += 32) {
        const shade = 156 + Math.floor(random() * 12);
        ctx.fillStyle = `rgb(${shade + 8},${shade + 5},${shade - 2})`;
        ctx.fillRect(x + 1, y + 1, 30, 30);
      }
    }
    for (let i = 0; i < 14; i += 1) {
      ctx.fillStyle = `rgba(80, 74, 64, ${0.04 + random() * 0.06})`;
      ctx.beginPath();
      ctx.arc(random() * size, random() * size, 2 + random() * 7, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return new THREE.MeshStandardMaterial({ color: "#ffffff", map, roughness: 0.9 });
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

// Texture lookups in three's shader chunks that the façade shader sends through the atlas instead.
const FACADE_LOOKUPS: Array<[chunk: string, lookup: string]> = [
  ["map_fragment", "texture2D( map, vMapUv )"],
  ["emissivemap_fragment", "texture2D( emissiveMap, vEmissiveMapUv )"],
  ["normal_fragment_maps", "texture2D( normalMap, vNormalMapUv )"],
  ["roughnessmap_fragment", "texture2D( roughnessMap, vRoughnessMapUv )"],
  ["metalnessmap_fragment", "texture2D( metalnessMap, vMetalnessMapUv )"],
];

export function patchFacadeVertexShader(source: string): string {
  return source
    .replace("#include <uv_pars_vertex>", "#include <uv_pars_vertex>\nattribute float facadeCell;\nvarying float vFacadeCell;")
    .replace("#include <uv_vertex>", "#include <uv_vertex>\nvFacadeCell = facadeCell;");
}

// At onBeforeCompile time the shader still holds `#include <chunk>` lines, so each chunk is inlined
// here with its lookup swapped for `facadeSample`, which wraps the repeating wall UV inside the
// vertex's atlas cell.
export function patchFacadeFragmentShader(source: string, cell: number): string {
  const pad = (2 / cell).toFixed(5);
  const atlasCode = `
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
  let patched = source.replace("#include <uv_pars_fragment>", `#include <uv_pars_fragment>\n${atlasCode}`);
  for (const [chunk, lookup] of FACADE_LOOKUPS) {
    const code = (THREE.ShaderChunk as Record<string, string>)[chunk].split(lookup).join(lookup.replace("texture2D(", "facadeSample("));
    patched = patched.replace(`#include <${chunk}>`, code);
  }
  return patched;
}

// One shared façade atlas with eight styles (see `facadeAtlas.ts`): colour, lit windows (night glow),
// a normal map for recesses, frames, ledges and balconies, and roughness/metalness so glass shines.
// Each vertex carries a `facadeCell`; the patched shader wraps the repeating wall UVs inside that
// cell and samples with explicit gradients so there are no mip seams.
export function createFacadeMaterials(highDetail: boolean): FacadeMaterials {
  const atlas = createFacadeAtlas(highDetail ? 256 : 192);
  const walls = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: atlas.color,
    emissive: "#ffffff",
    emissiveMap: atlas.emissive,
    emissiveIntensity: 0,
    normalMap: atlas.normal,
    normalScale: new THREE.Vector2(1.25, 1.25),
    roughnessMap: atlas.surface,
    metalnessMap: atlas.surface,
    roughness: 1,
    metalness: 1,
    envMapIntensity: 0.9,
    vertexColors: true,
  });
  walls.onBeforeCompile = (shader) => {
    shader.vertexShader = patchFacadeVertexShader(shader.vertexShader);
    shader.fragmentShader = patchFacadeFragmentShader(shader.fragmentShader, atlas.cell);
  };
  walls.customProgramCacheKey = () => "facade-atlas-v3";
  const roofs = new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness: 0.9, side: THREE.FrontSide });
  return { walls, roofs };
}
