import type { GeoPoint, MapArea, RoadNode, RoadSegment, RoadTile, RoadTileManifest, WorldMeters } from "../types";
import { hashString } from "../simulation/hash";
import {
  clipSegmentToRect,
  closestPointOnSegment,
  distanceToSegment,
  lerpPoint,
  pointInPolygon,
  polygonBounds,
  rectsOverlap,
  segmentIntersection,
  type Rect,
} from "../simulation/geometry2d";
import { bangkokArteries } from "./bangkokArteries";
import { bangkokDistricts, type BangkokDistrict } from "./bangkokDistricts";
import { latLngToWorld, MAP_SCALE, worldToLatLng } from "./coordinates";
import { curatedPlaces } from "./curatedPlaces";
import { fallbackMapAreas } from "./fallbackMapAreas";
import { generateCityBuildings, type CityCell } from "./cityBuildings";

// A deterministic, streamable Bangkok: hand-traced main roads plus a jittered superblock grid with
// sois, cut by the river and parks. Every tile is generated on demand from world coordinates alone,
// so neighbouring tiles agree on shared roads and buildings without any stored data.

export const CITY_BOUNDS = { south: 13.665, north: 13.86, west: 100.405, east: 100.665 };
export const CITY_TILE_SIZE = 512;
export const CITY_BLOCK = 440;
const PIECE_LENGTH = 120;
const GENERATED_AT = "2026-09-30T00:00:00.000+07:00";

export interface CityRoadEdge {
  id: string;
  roadId: string;
  source: "artery" | "grid" | "soi" | "spur";
  a: WorldMeters;
  b: WorldMeters;
  kind: RoadSegment["kind"];
  width: number;
  name: string;
}

export interface CityRoadPiece extends CityRoadEdge {
  edgeId: string;
  index: number;
  kept: boolean;
}

const southWest = latLngToWorld(CITY_BOUNDS.south, CITY_BOUNDS.west);
const northEast = latLngToWorld(CITY_BOUNDS.north, CITY_BOUNDS.east);
export const CITY_RECT: Rect = { minX: southWest.x, maxX: northEast.x, minZ: northEast.z, maxZ: southWest.z };

const insideCity = (point: WorldMeters, margin = 0) =>
  point.x >= CITY_RECT.minX - margin && point.x <= CITY_RECT.maxX + margin && point.z >= CITY_RECT.minZ - margin && point.z <= CITY_RECT.maxZ + margin;

// ---------------------------------------------------------------------------------------------
// Water, parks and plazas

interface Blocker {
  area: MapArea;
  bounds: Rect;
}

const blockers: Blocker[] = fallbackMapAreas.map((area) => ({ area, bounds: polygonBounds(area.outer) }));
const MASK_CELL = 24;
// Per-blocker memo of 24 m cells known to be fully inside (1) or outside (0); edge cells (2) fall
// back to an exact point-in-polygon test. Keeps the building placer's many water checks cheap.
const blockerMasks = blockers.map(() => new Map<string, 0 | 1 | 2>());

function maskState(index: number, cx: number, cz: number): 0 | 1 | 2 {
  const mask = blockerMasks[index];
  const key = `${cx}:${cz}`;
  const cached = mask.get(key);
  if (cached !== undefined) return cached;
  const polygon = blockers[index].area.outer;
  const center = { x: (cx + 0.5) * MASK_CELL, z: (cz + 0.5) * MASK_CELL };
  let edgeDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polygon.length; i += 1) {
    edgeDistance = Math.min(edgeDistance, distanceToSegment(center, polygon[i], polygon[(i + 1) % polygon.length]));
  }
  const state: 0 | 1 | 2 = edgeDistance < MASK_CELL * 0.75 ? 2 : pointInPolygon(center, polygon) ? 1 : 0;
  if (mask.size > 200_000) mask.clear();
  mask.set(key, state);
  return state;
}

export function blockingAreaAt(point: WorldMeters): MapArea | undefined {
  for (let index = 0; index < blockers.length; index += 1) {
    const { bounds, area } = blockers[index];
    if (point.x < bounds.minX || point.x > bounds.maxX || point.z < bounds.minZ || point.z > bounds.maxZ) continue;
    const state = maskState(index, Math.floor(point.x / MASK_CELL), Math.floor(point.z / MASK_CELL));
    if (state === 1 || (state === 2 && pointInPolygon(point, area.outer))) return area;
  }
  return undefined;
}

export interface CityPlaza {
  placeId: string;
  name: string;
  x: number;
  z: number;
  radius: number;
}

const plazas: CityPlaza[] = curatedPlaces.map((place) => ({ placeId: place.id, name: place.nameTh, radius: 46, ...latLngToWorld(place.lat, place.lng) }));

const PLAZA_BIN = 512;
const plazaBins = new Map<string, CityPlaza[]>();
for (const plaza of plazas) {
  const key = `${Math.floor(plaza.x / PLAZA_BIN)}:${Math.floor(plaza.z / PLAZA_BIN)}`;
  const bucket = plazaBins.get(key);
  if (bucket) bucket.push(plaza);
  else plazaBins.set(key, [plaza]);
}

export function plazaNear(point: WorldMeters, extra = 0): CityPlaza | undefined {
  const cx = Math.floor(point.x / PLAZA_BIN);
  const cz = Math.floor(point.z / PLAZA_BIN);
  for (let x = cx - 1; x <= cx + 1; x += 1) {
    for (let z = cz - 1; z <= cz + 1; z += 1) {
      const found = plazaBins.get(`${x}:${z}`)?.find((plaza) => Math.hypot(plaza.x - point.x, plaza.z - point.z) < plaza.radius + extra);
      if (found) return found;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Districts and density

const districtWorld = bangkokDistricts.map((district) => ({ district, ...latLngToWorld(district.center.lat, district.center.lng) }));

export function districtAt(point: WorldMeters): BangkokDistrict {
  let best = districtWorld[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of districtWorld) {
    const distance = (entry.x - point.x) ** 2 + (entry.z - point.z) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }
  return best.district;
}

const hotspots = [
  [13.746, 100.534, 1500, 1],
  [13.7467, 100.54, 1200, 1],
  [13.751, 100.5405, 1000, 0.8],
  [13.7275, 100.53, 1500, 1],
  [13.722, 100.53, 1500, 0.9],
  [13.7372, 100.5605, 1800, 1],
  [13.7305, 100.5693, 1500, 0.8],
  [13.73, 100.58, 1200, 0.7],
  [13.7575, 100.5655, 1500, 0.9],
  [13.778, 100.574, 1200, 0.5],
  [13.8025, 100.5535, 1500, 0.6],
  [13.765, 100.5383, 1200, 0.6],
  [13.724, 100.515, 1000, 0.6],
  [13.7265, 100.5105, 800, 0.7],
  [13.668, 100.6045, 1500, 0.5],
  [13.7055, 100.601, 1200, 0.5],
  [13.7795, 100.5446, 1000, 0.4],
].map(([lat, lng, radius, weight]) => ({ ...latLngToWorld(lat, lng), radius: radius * MAP_SCALE, weight }));
const oldTown = { ...latLngToWorld(13.753, 100.496), radius: 1600 * MAP_SCALE };

export interface CityDensity {
  cbd: number;
  oldTown: boolean;
}

export function densityAt(point: WorldMeters): CityDensity {
  let cbd = 0;
  for (const spot of hotspots) {
    const d = Math.hypot(spot.x - point.x, spot.z - point.z);
    if (d < spot.radius) cbd = Math.max(cbd, spot.weight * (1 - d / spot.radius));
  }
  return { cbd, oldTown: Math.hypot(oldTown.x - point.x, oldTown.z - point.z) < oldTown.radius };
}

// ---------------------------------------------------------------------------------------------
// Street names

const namePrefixes = ["ประชา", "สุข", "ร่วม", "เจริญ", "ศรี", "นวม", "พัฒนา", "สามัคคี", "อุดม", "รุ่ง", "มิตร", "สันติ", "ชัย", "มงคล", "ทอง", "วิภา", "บุญ", "พร", "สว่าง", "เพิ่ม"];
const nameSuffixes = ["ราษฎร์", "สุข", "มิตร", "พัฒนา", "เจริญ", "ทรัพย์", "ธรรม", "นคร", "วงศ์", "อุทิศ", "ใจ", "ประชา", "ชัย", "ทอง", "สาร", "นิมิต"];

function streetName(seed: number): string {
  return `${namePrefixes[seed % namePrefixes.length]}${nameSuffixes[(seed >>> 7) % nameSuffixes.length]}`;
}

// ---------------------------------------------------------------------------------------------
// Grid

const jitter = (seed: number, amount: number) => ((seed % 1000) / 1000 - 0.5) * amount;
const gridX = (i: number) => i * CITY_BLOCK + jitter(hashString(`gx${i}`), 110);
const gridZ = (j: number) => j * CITY_BLOCK + jitter(hashString(`gz${j}`), 110);

function memo<T>(cache: Map<string, T>, key: string, limit: number, build: () => T): T {
  if (cache.has(key)) return cache.get(key) as T;
  const value = build();
  if (cache.size >= limit) cache.clear();
  cache.set(key, value);
  return value;
}

const nodeCache = new Map<string, WorldMeters>();
const edgeCache = new Map<string, CityRoadEdge | undefined>();
const soiCache = new Map<string, CityRoadEdge[]>();

export function gridNode(i: number, j: number): WorldMeters {
  return memo(nodeCache, `${i}:${j}`, 60_000, () => {
    const seed = hashString(`gn${i}:${j}`);
    return { x: gridX(i) + jitter(seed, 38), z: gridZ(j) + jitter(seed >>> 10, 38) };
  });
}

function lineClass(index: number): { kind: RoadSegment["kind"]; width: number } {
  if (index % 4 === 0) return { kind: "secondary", width: 16 };
  if (index % 2 === 0) return { kind: "tertiary", width: 13 };
  return { kind: "residential", width: 10 };
}

// Residential grid links are sometimes missing so blocks merge like real Bangkok superblocks.
function gridEdge(axis: "x" | "z", i: number, j: number): CityRoadEdge | undefined {
  return memo(edgeCache, `${axis}${i}:${j}`, 60_000, () => buildGridEdge(axis, i, j));
}

function buildGridEdge(axis: "x" | "z", i: number, j: number): CityRoadEdge | undefined {
  const a = gridNode(i, j);
  const b = axis === "x" ? gridNode(i, j + 1) : gridNode(i + 1, j);
  if (!insideCity(a) || !insideCity(b)) return undefined;
  const lineIndex = axis === "x" ? i : j;
  const along = axis === "x" ? j : i;
  const { kind, width } = lineClass(lineIndex);
  const seed = hashString(`ge${axis}${i}:${j}`);
  if (kind === "residential" && seed % 100 < 11) return undefined;
  const nameSeed = hashString(`gl${axis}${lineIndex}:${Math.floor(along / 6)}`);
  const base = streetName(nameSeed);
  const name = kind === "secondary" ? `ถนน${base}` : `ซอย${base} ${(Math.abs(along) % 40) + 1}`;
  return { id: `g${axis}${i}_${j}`, roadId: `g${axis}${lineIndex}:${Math.floor(along / 6)}`, source: "grid", a, b, kind, width, name };
}

// Sois branch into each superblock from one side, as dead ends or through lanes.
function cellSois(i: number, j: number): CityRoadEdge[] {
  return memo(soiCache, `${i}:${j}`, 30_000, () => buildCellSois(i, j));
}

function buildCellSois(i: number, j: number): CityRoadEdge[] {
  const seed = hashString(`cs${i}:${j}`);
  const density = densityAt(gridNode(i, j));
  const count = Math.min(3, (seed % 3) + (density.cbd > 0.4 ? 1 : 0));
  if (!count) return [];
  const vertical = (seed >>> 4) % 2 === 0;
  const parentAxis = vertical ? "z" : "x";
  const parent = gridEdge(parentAxis, i, j);
  if (!parent) return [];
  const opposite = vertical ? gridEdge("z", i, j + 1) : gridEdge("x", i + 1, j);
  const sois: CityRoadEdge[] = [];
  for (let s = 0; s < count; s += 1) {
    const soiSeed = hashString(`soi${i}:${j}:${s}`);
    const fraction = (s + 1) / (count + 1) + jitter(soiSeed, 0.12);
    const start = lerpPoint(parent.a, parent.b, fraction);
    const through = opposite !== undefined && soiSeed % 3 === 0;
    let end: WorldMeters;
    if (through && opposite) {
      end = lerpPoint(opposite.a, opposite.b, fraction);
    } else {
      const far = vertical ? gridNode(i, j + 1).z - start.z : gridNode(i + 1, j).x - start.x;
      const length = far * (0.45 + ((soiSeed >>> 6) % 30) / 100);
      end = vertical ? { x: start.x, z: start.z + length } : { x: start.x + length, z: start.z };
    }
    const alley = (soiSeed >>> 12) % 4 === 0;
    sois.push({
      id: `s${i}_${j}_${s}`,
      roadId: `s${i}_${j}_${s}`,
      source: "soi",
      a: start,
      b: end,
      kind: alley ? "alley" : "residential",
      width: alley ? 7 : 9,
      name: `${parent.name.replace(/ \d+$/, "")} แยก ${((soiSeed >>> 3) % 30) + 1}`,
    });
  }
  return sois;
}

// ---------------------------------------------------------------------------------------------
// Arteries (hand-traced, never cut by water so bridges survive)

const ARTERY_BIN = 1024;
let arteryEdgesCache: { edges: CityRoadEdge[]; bins: Map<string, CityRoadEdge[]> } | undefined;

function arteryIndex(): { edges: CityRoadEdge[]; bins: Map<string, CityRoadEdge[]> } {
  if (arteryEdgesCache) return arteryEdgesCache;
  const edges: CityRoadEdge[] = [];
  for (const road of bangkokArteries) {
    const points = road.points.map((point) => latLngToWorld(point.lat, point.lng));
    for (let k = 0; k < points.length - 1; k += 1) {
      edges.push({ id: `a${road.id}_${k}`, roadId: `a${road.id}`, source: "artery", a: points[k], b: points[k + 1], kind: road.kind, width: road.width, name: road.nameTh });
    }
  }
  const bins = new Map<string, CityRoadEdge[]>();
  for (const edge of edges) {
    const bounds = edgeBounds(edge);
    for (let x = Math.floor(bounds.minX / ARTERY_BIN); x <= Math.floor(bounds.maxX / ARTERY_BIN); x += 1) {
      for (let z = Math.floor(bounds.minZ / ARTERY_BIN); z <= Math.floor(bounds.maxZ / ARTERY_BIN); z += 1) {
        const key = `${x}:${z}`;
        const bucket = bins.get(key);
        if (bucket) bucket.push(edge);
        else bins.set(key, [edge]);
      }
    }
  }
  arteryEdgesCache = { edges, bins };
  return arteryEdgesCache;
}

function arteriesInRect(rect: Rect): CityRoadEdge[] {
  const { bins } = arteryIndex();
  const found = new Set<CityRoadEdge>();
  for (let x = Math.floor(rect.minX / ARTERY_BIN); x <= Math.floor(rect.maxX / ARTERY_BIN); x += 1) {
    for (let z = Math.floor(rect.minZ / ARTERY_BIN); z <= Math.floor(rect.maxZ / ARTERY_BIN); z += 1) {
      for (const edge of bins.get(`${x}:${z}`) ?? []) {
        if (rectsOverlap(edgeBounds(edge), rect)) found.add(edge);
      }
    }
  }
  return [...found];
}

export function edgeBounds(edge: { a: WorldMeters; b: WorldMeters; width?: number }): Rect {
  const pad = (edge.width ?? 0) / 2;
  return {
    minX: Math.min(edge.a.x, edge.b.x) - pad,
    maxX: Math.max(edge.a.x, edge.b.x) + pad,
    minZ: Math.min(edge.a.z, edge.b.z) - pad,
    maxZ: Math.max(edge.a.z, edge.b.z) + pad,
  };
}

export const expandRect = (rect: Rect, by: number): Rect => ({ minX: rect.minX - by, maxX: rect.maxX + by, minZ: rect.minZ - by, maxZ: rect.maxZ + by });

// ---------------------------------------------------------------------------------------------
// Edge queries

export function cellsInRect(rect: Rect): Array<{ i: number; j: number }> {
  const cells: Array<{ i: number; j: number }> = [];
  const pad = CITY_BLOCK * 0.5;
  for (let i = Math.floor((rect.minX - pad) / CITY_BLOCK); i <= Math.ceil((rect.maxX + pad) / CITY_BLOCK); i += 1) {
    for (let j = Math.floor((rect.minZ - pad) / CITY_BLOCK); j <= Math.ceil((rect.maxZ + pad) / CITY_BLOCK); j += 1) {
      cells.push({ i, j });
    }
  }
  return cells;
}

function baseEdgesInRect(rect: Rect): CityRoadEdge[] {
  const edges: CityRoadEdge[] = [...arteriesInRect(rect)];
  for (const { i, j } of cellsInRect(rect)) {
    for (const edge of [gridEdge("x", i, j), gridEdge("z", i, j), ...cellSois(i, j)]) {
      if (edge && rectsOverlap(edgeBounds(edge), rect)) edges.push(edge);
    }
  }
  return edges;
}

const pieceCache = new Map<string, CityRoadPiece[]>();

// Splits an edge into short pieces and marks the ones that fall in the river, a park or run
// alongside a main road (so grid streets never double up on an artery).
function edgePieces(edge: CityRoadEdge): CityRoadPiece[] {
  const cached = pieceCache.get(edge.id);
  if (cached) return cached;
  const length = Math.hypot(edge.b.x - edge.a.x, edge.b.z - edge.a.z);
  const count = Math.max(1, Math.ceil(length / PIECE_LENGTH));
  const pieces: CityRoadPiece[] = [];
  const dx = (edge.b.x - edge.a.x) / (length || 1);
  const dz = (edge.b.z - edge.a.z) / (length || 1);
  const nearbyArteries = edge.source === "artery" ? [] : arteriesInRect(expandRect(edgeBounds(edge), 60));
  for (let k = 0; k < count; k += 1) {
    const a = lerpPoint(edge.a, edge.b, k / count);
    const b = lerpPoint(edge.a, edge.b, (k + 1) / count);
    let kept = true;
    if (edge.source !== "artery") {
      const mid = lerpPoint(a, b, 0.5);
      if (blockingAreaAt(mid) || blockingAreaAt(a) || blockingAreaAt(b)) kept = false;
      for (const artery of nearbyArteries) {
        if (!kept) break;
        const al = Math.hypot(artery.b.x - artery.a.x, artery.b.z - artery.a.z) || 1;
        const cos = Math.abs(((artery.b.x - artery.a.x) / al) * dx + ((artery.b.z - artery.a.z) / al) * dz);
        const gap = artery.width / 2 + edge.width / 2 + 34;
        if (cos > 0.82 && distanceToSegment(mid, artery.a, artery.b) < gap) kept = false;
      }
    }
    pieces.push({ ...edge, id: `${edge.id}.${k}`, edgeId: edge.id, index: k, a, b, kept });
  }
  if (pieceCache.size > 40_000) pieceCache.clear();
  pieceCache.set(edge.id, pieces);
  return pieces;
}

// Access lanes so every curated place (and its mission waypoint) can be reached by car.
let spurCache: CityRoadEdge[] | undefined;

function placeSpurs(): CityRoadEdge[] {
  if (spurCache) return spurCache;
  spurCache = [];
  for (const plaza of plazas) {
    const point = { x: plaza.x, z: plaza.z };
    if (!insideCity(point, 200)) continue;
    let best: { x: number; z: number; distance: number } | undefined;
    for (const edge of baseEdgesInRect(expandRect({ minX: point.x, maxX: point.x, minZ: point.z, maxZ: point.z }, 420))) {
      for (const piece of edgePieces(edge)) {
        if (!piece.kept || piece.kind === "bridge") continue;
        const hit = closestPointOnSegment(point, piece.a, piece.b);
        if (!best || hit.distance < best.distance) best = hit;
      }
    }
    if (!best || best.distance < 24) continue;
    spurCache.push({
      id: `p${hashString(plaza.placeId).toString(36)}`,
      roadId: `p${plaza.placeId}`,
      source: "spur",
      a: { x: best.x, z: best.z },
      b: point,
      kind: "service",
      width: 9,
      name: `ทางเข้า${plaza.name}`,
    });
  }
  return spurCache;
}

export function edgesInRect(rect: Rect): CityRoadEdge[] {
  const edges = baseEdgesInRect(rect);
  for (const edge of placeSpurs()) {
    if (rectsOverlap(edgeBounds(edge), rect)) edges.push(edge);
  }
  return edges;
}

export function piecesInRect(rect: Rect, keptOnly = true): CityRoadPiece[] {
  const pieces: CityRoadPiece[] = [];
  for (const edge of edgesInRect(rect)) {
    for (const piece of edgePieces(edge)) {
      if ((!keptOnly || piece.kept) && rectsOverlap(edgeBounds(piece), rect)) pieces.push(piece);
    }
  }
  return pieces;
}

// Main roads only, for the zoomed-out full-screen map (no tile generation needed).
export function majorRoadsInRect(rect: Rect): CityRoadPiece[] {
  const pieces: CityRoadPiece[] = [];
  for (const edge of arteriesInRect(rect)) pieces.push(...edgePieces(edge));
  const span = Math.max(rect.maxX - rect.minX, rect.maxZ - rect.minZ);
  const step = span > 30_000 ? 8 : 4;
  for (const { i, j } of cellsInRect(rect)) {
    const candidates: Array<CityRoadEdge | undefined> = [];
    if (((i % step) + step) % step === 0) candidates.push(gridEdge("x", i, j));
    if (((j % step) + step) % step === 0) candidates.push(gridEdge("z", i, j));
    for (const edge of candidates) {
      if (!edge) continue;
      for (const piece of edgePieces(edge)) if (piece.kept) pieces.push(piece);
    }
  }
  return pieces;
}

// ---------------------------------------------------------------------------------------------
// Tiles

export function cityTileId(ix: number, iz: number): string {
  return `city_${ix}_${iz}`;
}

export function parseCityTileId(id: string): { ix: number; iz: number } | undefined {
  const match = /^city_(-?\d+)_(-?\d+)$/.exec(id);
  return match ? { ix: Number(match[1]), iz: Number(match[2]) } : undefined;
}

export function cityTileRect(ix: number, iz: number): Rect {
  return { minX: ix * CITY_TILE_SIZE, maxX: (ix + 1) * CITY_TILE_SIZE, minZ: iz * CITY_TILE_SIZE, maxZ: (iz + 1) * CITY_TILE_SIZE };
}

export function cityTileAt(point: WorldMeters): string {
  return cityTileId(Math.floor(point.x / CITY_TILE_SIZE), Math.floor(point.z / CITY_TILE_SIZE));
}

function boundsLatLng(rect: Rect): RoadTile["boundsLatLng"] {
  const nw = worldToLatLng(rect.minX, rect.minZ);
  const se = worldToLatLng(rect.maxX, rect.maxZ);
  return { south: se.lat, west: nw.lng, north: nw.lat, east: se.lng };
}

function tileDistricts(rect: Rect): string[] {
  const ids = new Set<string>();
  for (const [x, z] of [
    [rect.minX, rect.minZ],
    [rect.maxX, rect.minZ],
    [rect.minX, rect.maxZ],
    [rect.maxX, rect.maxZ],
    [(rect.minX + rect.maxX) / 2, (rect.minZ + rect.maxZ) / 2],
  ]) {
    ids.add(districtAt({ x, z }).id);
  }
  return [...ids];
}

let manifestCache: RoadTileManifest | undefined;

export function cityRoadTileManifest(): RoadTileManifest {
  if (manifestCache) return manifestCache;
  const tiles: RoadTileManifest["tiles"] = [];
  for (let ix = Math.floor(CITY_RECT.minX / CITY_TILE_SIZE); ix <= Math.floor(CITY_RECT.maxX / CITY_TILE_SIZE); ix += 1) {
    for (let iz = Math.floor(CITY_RECT.minZ / CITY_TILE_SIZE); iz <= Math.floor(CITY_RECT.maxZ / CITY_TILE_SIZE); iz += 1) {
      const rect = cityTileRect(ix, iz);
      tiles.push({ id: cityTileId(ix, iz), href: "", boundsLatLng: boundsLatLng(rect), boundsMeters: rect, districtIds: [] });
    }
  }
  manifestCache = {
    scaleMode: "real_1_1",
    tileSizeMeters: CITY_TILE_SIZE,
    generatedAt: GENERATED_AT,
    source: "procedural",
    mapScale: MAP_SCALE,
    tiles,
  };
  return manifestCache;
}

interface ClippedRoad {
  a: WorldMeters;
  b: WorldMeters;
  piece: CityRoadPiece;
  splits: number[];
}

const JOIN_TOLERANCE = 0.8;

export function generateCityTile(id: string): RoadTile | undefined {
  const parsed = parseCityTileId(id);
  if (!parsed) return undefined;
  const rect = cityTileRect(parsed.ix, parsed.iz);
  const roads: ClippedRoad[] = [];
  for (const piece of piecesInRect(expandRect(rect, 2))) {
    const clip = clipSegmentToRect(piece.a, piece.b, rect);
    if (!clip) continue;
    const a = lerpPoint(piece.a, piece.b, clip.t0);
    const b = lerpPoint(piece.a, piece.b, clip.t1);
    if (Math.hypot(b.x - a.x, b.z - a.z) < 0.3) continue;
    roads.push({ a, b, piece, splits: [] });
  }

  // Crossings and T-junctions become shared nodes so the renderer, routing and traffic see junctions.
  for (let m = 0; m < roads.length; m += 1) {
    for (let n = m + 1; n < roads.length; n += 1) {
      const p = roads[m];
      const q = roads[n];
      if (!rectsOverlap(expandRect(edgeBounds(p), 1), edgeBounds(q))) continue;
      if (p.piece.edgeId === q.piece.edgeId) continue;
      const hit = segmentIntersection(p.a, p.b, q.a, q.b);
      if (hit) {
        p.splits.push(hit.t);
        q.splits.push(hit.u);
        continue;
      }
      for (const [host, guest] of [
        [p, q],
        [q, p],
      ] as const) {
        for (const end of [guest.a, guest.b]) {
          const touch = closestPointOnSegment(end, host.a, host.b);
          if (touch.distance < JOIN_TOLERANCE && touch.t > 0.002 && touch.t < 0.998) host.splits.push(touch.t);
        }
      }
    }
  }

  const nodes: RoadNode[] = [];
  const nodeIndex = new Map<string, RoadNode[]>();
  const nodeFor = (point: WorldMeters): string => {
    const cx = Math.floor(point.x);
    const cz = Math.floor(point.z);
    for (let x = cx - 1; x <= cx + 1; x += 1) {
      for (let z = cz - 1; z <= cz + 1; z += 1) {
        for (const node of nodeIndex.get(`${x}:${z}`) ?? []) {
          if (Math.hypot(node.x - point.x, node.z - point.z) < JOIN_TOLERANCE) return node.id;
        }
      }
    }
    const node = { id: `${id}:n${nodes.length}`, x: point.x, z: point.z };
    nodes.push(node);
    const key = `${cx}:${cz}`;
    const bucket = nodeIndex.get(key);
    if (bucket) bucket.push(node);
    else nodeIndex.set(key, [node]);
    return node.id;
  };

  const districtName = districtAt({ x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2 }).nameEn;
  const segments: RoadSegment[] = [];
  for (const road of roads) {
    const params = [0, ...road.splits.sort((x, y) => x - y), 1];
    for (let k = 0; k < params.length - 1; k += 1) {
      const a = lerpPoint(road.a, road.b, params[k]);
      const b = lerpPoint(road.a, road.b, params[k + 1]);
      if (Math.hypot(b.x - a.x, b.z - a.z) < 0.3) continue;
      const from = nodeFor(a);
      const to = nodeFor(b);
      if (from === to) continue;
      segments.push({
        id: `${road.piece.id}#${k}`,
        from,
        to,
        width: road.piece.width,
        district: districtName,
        name: road.piece.name,
        kind: road.piece.kind,
      });
    }
  }

  const cells: CityCell[] = cellsInRect(rect).map(({ i, j }) => ({
    id: `${i}_${j}`,
    corners: [gridNode(i, j), gridNode(i + 1, j), gridNode(i + 1, j + 1), gridNode(i, j + 1)],
  }));
  const buildings = generateCityBuildings({
    tileId: id,
    rect,
    cells,
    edgesNear: (query) => edgesInRect(query).filter((edge) => edge.source !== "spur"),
    piecesNear: (query) => piecesInRect(query),
    piecesOfEdge: edgePieces,
    blocked: (point, radius) => Boolean(blockingAreaAt(point) || plazaNear(point, radius)),
    density: densityAt,
    district: districtAt,
  });

  return {
    id,
    boundsLatLng: boundsLatLng(rect),
    boundsMeters: rect,
    originMeters: { x: (rect.minX + rect.maxX) / 2, z: (rect.minZ + rect.maxZ) / 2 },
    nodes,
    segments,
    buildings,
    districtIds: tileDistricts(rect),
    loadedAt: 0,
  };
}

export function cityTileAtGeo(geo: GeoPoint): RoadTile | undefined {
  return generateCityTile(cityTileAt(latLngToWorld(geo.lat, geo.lng)));
}
