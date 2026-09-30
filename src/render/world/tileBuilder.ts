import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MAP_SCALE } from "../../data/coordinates";
import { hashString } from "../../simulation/hash";
import type { BuildingUse, MapBuilding, MapBuildingKind, RenderQualityProfile, RoadSegment, RoadTile, WorldMeters } from "../../types";
import { FacadeStyle, type FacadeStyleId } from "./facadeStyles";
import { GeometryBuffer, UP, type Vec3 } from "./GeometryBuffer";

export interface WorldMaterials {
  asphalt: THREE.Material;
  bridge: THREE.Material;
  sidewalk: THREE.Material;
  markings: THREE.Material;
  walls: THREE.Material;
  roofs: THREE.Material;
  signs: THREE.Material;
  props: THREE.Material;
  gold: THREE.Material;
  concrete: THREE.Material;
  wires: THREE.Material;
  treeTrunk: THREE.Material;
  treeLeaves: THREE.Material;
  lampPole: THREE.Material;
  lampHead: THREE.Material;
}

export interface TileBuildContext {
  materials: WorldMaterials;
  quality: RenderQualityProfile;
}

interface LocalSegment {
  segment: RoadSegment;
  a: WorldMeters & { id: string };
  b: WorldMeters & { id: string };
  length: number;
  dx: number;
  dz: number;
  nx: number;
  nz: number;
  half: number;
}

interface BuildingBuffers {
  walls: GeometryBuffer;
  roofs: GeometryBuffer;
  signs: GeometryBuffer;
  tanks: THREE.Matrix4[];
  boxes: THREE.Matrix4[];
  antennas: THREE.Matrix4[];
  masts: THREE.Matrix4[];
  spires: THREE.Matrix4[];
}

const ROAD_Y = 0.06;
const BRIDGE_Y = 0.08;
const SIDEWALK_Y = 0.16;
const MARKING_Y = 0.075;
const SIDEWALK_WIDTH = 3.2;
const ROAD_UV_SCALE = 1 / 12;
const FACADE_U = 1 / 28;
const FACADE_V = 1 / 25.6;

type PaletteKey = MapBuildingKind | BuildingUse;

const wallPalettes: Record<PaletteKey, string[]> = {
  shophouse: ["#eadfc8", "#dcc6a6", "#cdd9e1", "#e9cdbb", "#d4dbc6", "#f2e8d5", "#c3ccd3", "#e6bba8", "#f0d9a8", "#f4c7c3", "#cde8d6", "#f6e3a1", "#cfe3f1", "#f5d0b0", "#e2d4ee", "#bfe0dc"],
  townhouse: ["#efe4cf", "#e2d2b8", "#d9e1e4", "#f1e0d0", "#dfe6d8", "#e8d7c4", "#f3d9d0", "#dcebd8", "#f5ecc2"],
  house: ["#f4ead8", "#e8dcc6", "#dbe4e0", "#f2e2cf", "#e0e8d4", "#f6efe2", "#f7e1d7", "#e3eef7", "#f9f1c9"],
  condo: ["#e8e2d6", "#d9dee3", "#cfd8dc", "#f1ece4", "#c9d3db", "#e3d5c3", "#e9eef2", "#d6cbbd"],
  office: ["#a8bccd", "#bcc7cf", "#8a9eb1", "#cbd6de", "#98aebd", "#d8dde2", "#9fb6c9", "#b4d0cc", "#c7c3d9", "#e0e4e8"],
  hotel: ["#e9dcc4", "#d8c8b0", "#c8d2d8", "#ede3d3", "#d6c2a8"],
  mall: ["#e5e7eb", "#d1d5db", "#f3f4f6", "#e7e2d8"],
  temple: ["#f7f1e3"],
  school: ["#f2d8a7", "#e9c996", "#f5e6c8"],
  hospital: ["#f4f6f8", "#e8eef2", "#eef2f0"],
  market: ["#d6cfc2", "#c8c0b0", "#ddd3c1"],
  warehouse: ["#a9adb2", "#b8b3a8", "#9ca3af"],
  government: ["#e8d8b8", "#dccdb0", "#efe7d6"],
  convenience: ["#f8fafc", "#f1f5f9"],
  commercial: ["#b7c6d3", "#d4dbe1", "#9fb3c4", "#e2e5e8"],
  residential: ["#efe4cf", "#e2d2b8", "#d9e1e4", "#f1e0d0", "#dfe6d8"],
  civic: ["#e8d8b8", "#dccdb0", "#efe7d6"],
  industrial: ["#a9adb2", "#b8b3a8"],
  generic: ["#dcd3c3", "#cfd5da", "#e6dccb", "#c9c4bb", "#d8cbb8"],
};
const roofPalettes: Record<PaletteKey, string[]> = {
  shophouse: ["#7b6f63", "#8a5a44", "#6b7280", "#9a3412"],
  townhouse: ["#8b5e3c", "#7c2d12", "#6b7280"],
  house: ["#9a3412", "#7c2d12", "#b45309", "#8b5e3c", "#475569", "#1d4ed8", "#166534", "#b91c1c"],
  condo: ["#6b7280", "#596270", "#78716c"],
  office: ["#4b5563", "#596270", "#3f4652"],
  hotel: ["#57534e", "#64748b"],
  mall: ["#525a66", "#646c78"],
  temple: ["#c2410c", "#b45309", "#ea580c"],
  school: ["#9a3412", "#b45309"],
  hospital: ["#94a3b8", "#cbd5e1"],
  market: ["#64748b", "#78716c"],
  warehouse: ["#7c8087", "#64748b", "#94a3b8"],
  government: ["#7c4a2d", "#6b7280"],
  convenience: ["#475569"],
  commercial: ["#525a66", "#646c78"],
  residential: ["#9a3412", "#7c2d12", "#6b7280", "#8b5e3c"],
  civic: ["#7c4a2d", "#6b7280"],
  industrial: ["#7c8087"],
  generic: ["#6b7280", "#5b616b", "#7b6f63"],
};
const awningColors = ["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#0891b2", "#e11d48", "#ea580c", "#0f766e"].map((color) => new THREE.Color(color));
const signColors = ["#facc15", "#f472b6", "#38bdf8", "#4ade80", "#fb923c", "#f87171", "#ffffff", "#a78bfa"].map((color) => new THREE.Color(color));

function pick<T>(list: T[], seed: number): T {
  return list[seed % list.length];
}

export function buildTileGroup(tile: RoadTile, context: TileBuildContext): THREE.Group {
  const steps = tileGroupSteps(tile, context);
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

const BUILDINGS_PER_STEP = 70;

// The same build split into resumable steps (roads, then buildings in batches, then street
// furniture) so the renderer can spread one tile over several frames.
export function* tileGroupSteps(tile: RoadTile, context: TileBuildContext): Generator<void, THREE.Group> {
  const group = new THREE.Group();
  group.userData.tileId = tile.id;
  const origin = tile.originMeters;
  const nodeMap = new Map(tile.nodes.map((node) => [node.id, { id: node.id, x: node.x - origin.x, z: node.z - origin.z }]));
  const segments: LocalSegment[] = [];
  const degree = new Map<string, number>();
  const nodeWidth = new Map<string, number>();
  const nodeSegments = new Map<string, LocalSegment[]>();
  for (const segment of tile.segments) {
    const a = nodeMap.get(segment.from);
    const b = nodeMap.get(segment.to);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.05) continue;
    const local: LocalSegment = { segment, a, b, length, dx: dx / length, dz: dz / length, nx: -dz / length, nz: dx / length, half: segment.width / 2 };
    segments.push(local);
    for (const id of [a.id, b.id]) {
      degree.set(id, (degree.get(id) ?? 0) + 1);
      nodeWidth.set(id, Math.max(nodeWidth.get(id) ?? 0, segment.width));
      const list = nodeSegments.get(id);
      if (list) list.push(local);
      else nodeSegments.set(id, [local]);
    }
  }
  const isJunction = (id: string) => (degree.get(id) ?? 0) >= 3;
  const junctionTrim = (id: string, extra: number) => (isJunction(id) ? (nodeWidth.get(id) ?? 0) / 2 + extra : 0);
  const worldU = (x: number) => (x + origin.x) * ROAD_UV_SCALE;
  const worldV = (z: number) => (z + origin.z) * ROAD_UV_SCALE;

  const asphalt = new GeometryBuffer();
  const bridges = new GeometryBuffer();
  const sidewalks = new GeometryBuffer();
  const markings = new GeometryBuffer(true);
  const yellow = new THREE.Color("#f2c230");
  const white = new THREE.Color("#f4f4f0");
  const detail = context.quality.quality;

  for (const road of segments) {
    const { a, b, nx, nz, half } = road;
    const bridge = road.segment.kind === "bridge";
    const y = bridge ? BRIDGE_Y : ROAD_Y;
    const corners: Vec3[] = [
      { x: a.x + nx * half, y, z: a.z + nz * half },
      { x: b.x + nx * half, y, z: b.z + nz * half },
      { x: b.x - nx * half, y, z: b.z - nz * half },
      { x: a.x - nx * half, y, z: a.z - nz * half },
    ];
    (bridge ? bridges : asphalt).addQuad(
      corners[0],
      corners[1],
      corners[2],
      corners[3],
      UP,
      corners.map((corner) => [worldU(corner.x), worldV(corner.z)]) as [[number, number], [number, number], [number, number], [number, number]],
    );

    if (road.segment.kind !== "motorway" && road.segment.kind !== "bridge") {
      addSidewalks(sidewalks, road, junctionTrim(a.id, SIDEWALK_WIDTH + 0.5), junctionTrim(b.id, SIDEWALK_WIDTH + 0.5), detail !== "low");
    }
    if (road.segment.kind !== "service" && road.segment.kind !== "alley" && road.segment.width >= 9) {
      addLaneMarkings(markings, road, junctionTrim(a.id, 1.5), junctionTrim(b.id, 1.5), yellow, white);
    }
  }

  // Round caps fill the wedges where road segments meet at bends and junctions.
  for (const [id, list] of nodeSegments) {
    const node = nodeMap.get(id);
    if (!node) continue;
    if (list.length === 2) {
      const [first, second] = list;
      const cos = Math.abs(first.dx * second.dx + first.dz * second.dz);
      if (cos > 0.99) continue;
    }
    const radius = (nodeWidth.get(id) ?? 8) / 2;
    const bridge = list.every((road) => road.segment.kind === "bridge");
    addDisc(bridge ? bridges : asphalt, node, radius, bridge ? BRIDGE_Y : ROAD_Y, worldU, worldV);
    if (detail !== "low" && isJunction(id)) {
      for (const road of list) addCrosswalk(markings, road, node, radius + 1.2, white);
    }
  }

  const addMesh = (buffer: GeometryBuffer, material: THREE.Material, receive: boolean, cast: boolean): THREE.Mesh | undefined => {
    if (buffer.isEmpty) return undefined;
    const mesh = new THREE.Mesh(buffer.toGeometry(), material);
    mesh.receiveShadow = receive;
    mesh.castShadow = cast;
    group.add(mesh);
    return mesh;
  };
  addMesh(asphalt, context.materials.asphalt, true, false);
  addMesh(bridges, context.materials.bridge, true, true);
  addMesh(sidewalks, context.materials.sidewalk, true, false);
  addMesh(markings, context.materials.markings, true, false);
  yield;

  const buildings: BuildingBuffers = {
    walls: new GeometryBuffer(true, true),
    roofs: new GeometryBuffer(true),
    signs: new GeometryBuffer(true),
    tanks: [],
    boxes: [],
    antennas: [],
    masts: [],
    spires: [],
  };
  const tileBuildings = tile.buildings ?? [];
  for (let index = 0; index < tileBuildings.length; index += 1) {
    addBuilding(buildings, tileBuildings[index], origin, detail);
    if (index % BUILDINGS_PER_STEP === BUILDINGS_PER_STEP - 1) yield;
  }
  const wallMesh = addMesh(buildings.walls, context.materials.walls, true, detail !== "low");
  const roofMesh = addMesh(buildings.roofs, context.materials.roofs, true, detail === "high");
  addMesh(buildings.signs, context.materials.signs, false, false);
  for (const mesh of [wallMesh, roofMesh]) {
    if (mesh) mesh.userData.pickable = "building";
  }
  if (detail !== "low") {
    addInstances(group, rooftopTankGeometry, context.materials.props, buildings.tanks);
    addInstances(group, rooftopBoxGeometry, context.materials.props, buildings.boxes);
    addInstances(group, antennaGeometry, context.materials.lampPole, buildings.antennas);
    addInstances(group, spireGeometry, context.materials.lampPole, buildings.masts);
  }
  addInstances(group, spireGeometry, context.materials.gold, buildings.spires);

  if (detail !== "low") {
    yield;
    addStreetFurniture(group, segments, junctionTrim, context, detail === "high" ? 15 : 22);
  }
  return group;
}

function addSidewalks(buffer: GeometryBuffer, road: LocalSegment, trimA: number, trimB: number, curbs: boolean): void {
  if (road.length <= trimA + trimB + 1) return;
  const { a, dx, dz, nx, nz, half } = road;
  const start = trimA;
  const end = road.length - trimB;
  for (const side of [-1, 1]) {
    const inner = half * side;
    const outer = (half + SIDEWALK_WIDTH) * side;
    const p = (along: number, offset: number, y: number): Vec3 => ({ x: a.x + dx * along + nx * offset, y, z: a.z + dz * along + nz * offset });
    const quad = [p(start, inner, SIDEWALK_Y), p(end, inner, SIDEWALK_Y), p(end, outer, SIDEWALK_Y), p(start, outer, SIDEWALK_Y)];
    buffer.addQuad(quad[0], quad[1], quad[2], quad[3], UP, [
      [start / 4, 0],
      [end / 4, 0],
      [end / 4, 1],
      [start / 4, 1],
    ]);
    if (curbs) {
      const normal = { x: -nx * side, y: 0, z: -nz * side };
      buffer.addQuad(p(start, inner, ROAD_Y), p(end, inner, ROAD_Y), p(end, inner, SIDEWALK_Y), p(start, inner, SIDEWALK_Y), normal, [
        [start / 4, 0],
        [end / 4, 0],
        [end / 4, 0.05],
        [start / 4, 0.05],
      ]);
    }
  }
}

function addStrip(buffer: GeometryBuffer, road: LocalSegment, from: number, to: number, offset: number, width: number, color: THREE.Color): void {
  const { a, dx, dz, nx, nz } = road;
  const p = (along: number, lateral: number): Vec3 => ({ x: a.x + dx * along + nx * lateral, y: MARKING_Y, z: a.z + dz * along + nz * lateral });
  buffer.addQuad(p(from, offset - width / 2), p(to, offset - width / 2), p(to, offset + width / 2), p(from, offset + width / 2), UP, [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ], color);
}

function addLaneMarkings(buffer: GeometryBuffer, road: LocalSegment, trimA: number, trimB: number, yellow: THREE.Color, white: THREE.Color): void {
  const start = trimA;
  const end = road.length - trimB;
  if (end - start < 2) return;
  const width = road.segment.width;
  const dashed = (offset: number, color: THREE.Color) => {
    for (let along = start + 1; along + 3 <= end; along += 9) addStrip(buffer, road, along, along + 3, offset, 0.2, color);
  };
  if (width >= 16) {
    addStrip(buffer, road, start, end, -0.18, 0.16, yellow);
    addStrip(buffer, road, start, end, 0.18, 0.16, yellow);
    dashed(width / 4, white);
    dashed(-width / 4, white);
  } else {
    dashed(0, white);
  }
  if (width >= 12) {
    addStrip(buffer, road, start, end, width / 2 - 0.45, 0.16, white);
    addStrip(buffer, road, start, end, -width / 2 + 0.45, 0.16, white);
  }
}

function addCrosswalk(buffer: GeometryBuffer, road: LocalSegment, node: WorldMeters & { id: string }, distance: number, white: THREE.Color): void {
  if (road.segment.width < 10 || road.length < distance + 5) return;
  const fromA = road.a.id === node.id;
  const along = fromA ? distance : road.length - distance - 3;
  for (let lateral = -road.half + 0.8; lateral <= road.half - 0.8; lateral += 1.3) {
    addStrip(buffer, road, along, along + 3, lateral, 0.65, white);
  }
}

function addDisc(buffer: GeometryBuffer, center: WorldMeters, radius: number, y: number, u: (x: number) => number, v: (z: number) => number): void {
  const steps = 14;
  const middle = { x: center.x, y, z: center.z };
  for (let i = 0; i < steps; i += 1) {
    const a0 = (i / steps) * Math.PI * 2;
    const a1 = ((i + 1) / steps) * Math.PI * 2;
    const p0 = { x: center.x + Math.cos(a0) * radius, y, z: center.z + Math.sin(a0) * radius };
    const p1 = { x: center.x + Math.cos(a1) * radius, y, z: center.z + Math.sin(a1) * radius };
    buffer.addTriangle(middle, p0, p1, UP, [
      [u(middle.x), v(middle.z)],
      [u(p0.x), v(p0.z)],
      [u(p1.x), v(p1.z)],
    ]);
  }
}

// ---------------------------------------------------------------------------------------------
// Buildings. Walls sample a façade style from the texture atlas (shopfronts on the ground floor,
// grilled shophouse windows, condo balconies, glass curtain walls, ribbon windows, houses,
// corrugated warehouses, ornate temple walls). Towers come in podium / setback / slab variants with
// box crowns, masts, helipads or rooftop pools; low roofs get parapets, water tanks and billboards;
// shophouse fronts get awnings, shop signs, blade signs and wall-mounted AC units; temples get
// tiered roofs and gold spires.

const rooftopTankGeometry = new THREE.CylinderGeometry(1.1, 1.1, 2.2, 6).translate(0, 1.1, 0);
const rooftopBoxGeometry = new THREE.BoxGeometry(2.2, 1.4, 1.8).translate(0, 0.7, 0);
const antennaGeometry = new THREE.CylinderGeometry(0.12, 0.34, 14, 6).translate(0, 7, 0);
const spireGeometry = new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0);
for (const geometry of [rooftopTankGeometry, rooftopBoxGeometry, antennaGeometry, spireGeometry]) {
  geometry.userData.shared = true;
}
const FLOOR = 3.3 * MAP_SCALE;
const AWNING_Y = 2.9 * MAP_SCALE;
const glassColor = new THREE.Color("#23405c");
const crossRed = new THREE.Color("#dc2626");
const white = new THREE.Color("#ffffff");
const poolBlue = new THREE.Color("#38bdf8");
const deckColor = new THREE.Color("#d6c7a8");
const helipadYellow = new THREE.Color("#facc15");
const helipadGrey = new THREE.Color("#3f4652");
const stripeColors = ["#16a34a", "#f97316", "#dc2626"].map((color) => new THREE.Color(color));

function signedArea(points: WorldMeters[]): number {
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    area += points[j].x * points[i].z - points[i].x * points[j].z;
  }
  return area / 2;
}

function centroidOf(points: WorldMeters[]): WorldMeters {
  let x = 0;
  let z = 0;
  for (const point of points) {
    x += point.x;
    z += point.z;
  }
  return { x: x / points.length, z: z / points.length };
}

function scaledAround(points: WorldMeters[], factor: number): WorldMeters[] {
  const center = centroidOf(points);
  return points.map((point) => ({ x: center.x + (point.x - center.x) * factor, z: center.z + (point.z - center.z) * factor }));
}

// Shrinks a ring by a fixed distance (approximately, via the centroid), for parapets and pools.
function insetRing(points: WorldMeters[], distance: number): WorldMeters[] {
  const center = centroidOf(points);
  const radius = Math.min(...points.map((point) => Math.hypot(point.x - center.x, point.z - center.z)));
  return scaledAround(points, Math.max(0.1, 1 - distance / Math.max(radius, distance * 2)));
}

function addWalls(walls: GeometryBuffer, points: WorldMeters[], y0: number, y1: number, bottom: THREE.Color, top: THREE.Color, seed: number, cell: number): void {
  if (y1 - y0 < 0.05) return;
  const orientation = Math.sign(signedArea(points)) || 1;
  let perimeter = (seed % 7) * 3;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const length = Math.hypot(dx, dz);
    if (length < 0.05) continue;
    // Outward normal: right-hand side of a counter-clockwise ring in the x/z plane.
    const normal = { x: (orientation * -dz) / length, y: 0, z: (orientation * dx) / length };
    const u0 = perimeter * FACADE_U;
    const u1 = (perimeter + length) * FACADE_U;
    walls.addQuad(
      { x: p.x, y: y0, z: p.z },
      { x: q.x, y: y0, z: q.z },
      { x: q.x, y: y1, z: q.z },
      { x: p.x, y: y1, z: p.z },
      normal,
      [
        [u0, y0 * FACADE_V],
        [u1, y0 * FACADE_V],
        [u1, y1 * FACADE_V],
        [u0, y1 * FACADE_V],
      ],
      [bottom, bottom, top, top],
      cell,
    );
    perimeter += length;
  }
}

const QUAD_TRIANGLES = [
  [0, 1, 2],
  [0, 2, 3],
];

function addCap(roofs: GeometryBuffer, points: WorldMeters[], y: number, color: THREE.Color): void {
  // Generated footprints are convex quads; only imported OSM outlines need real triangulation.
  const triangles = points.length === 4 ? QUAD_TRIANGLES : THREE.ShapeUtils.triangulateShape(points.map((point) => new THREE.Vector2(point.x, point.z)), []);
  for (const [i, j, k] of triangles) {
    const a = { x: points[i].x, y, z: points[i].z };
    const b = { x: points[j].x, y, z: points[j].z };
    const c = { x: points[k].x, y, z: points[k].z };
    roofs.addTriangle(a, b, c, UP, [
      [a.x / 8, a.z / 8],
      [b.x / 8, b.z / 8],
      [c.x / 8, c.z / 8],
    ], color);
  }
}

// Low wall around a flat roof: outer face and a coping on top (the inner face is never seen from the street).
function addParapet(roofs: GeometryBuffer, points: WorldMeters[], y: number, height: number, color: THREE.Color): void {
  const inner = insetRing(points, 0.45);
  const orientation = Math.sign(signedArea(points)) || 1;
  const top = y + height;
  const coping = color.clone().lerp(white, 0.25);
  const flat: [[number, number], [number, number], [number, number], [number, number]] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const ip = inner[i];
    const iq = inner[(i + 1) % inner.length];
    const length = Math.hypot(q.x - p.x, q.z - p.z);
    if (length < 0.05) continue;
    const normal = { x: (orientation * -(q.z - p.z)) / length, y: 0, z: (orientation * (q.x - p.x)) / length };
    roofs.addQuad({ x: p.x, y, z: p.z }, { x: q.x, y, z: q.z }, { x: q.x, y: top, z: q.z }, { x: p.x, y: top, z: p.z }, normal, flat, color);
    roofs.addQuad({ x: p.x, y: top, z: p.z }, { x: q.x, y: top, z: q.z }, { x: iq.x, y: top, z: iq.z }, { x: ip.x, y: top, z: ip.z }, UP, flat, coping);
  }
}

function upwardNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const uz = b.z - a.z;
  const vx = c.x - a.x;
  const vy = c.y - a.y;
  const vz = c.z - a.z;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz) || 1;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
    nz = -nz;
  }
  return { x: nx / length, y: ny / length, z: nz / length };
}

// Pitched roof with the ridge along the longer side of a four-cornered footprint. Returns the ridge ends.
function addGableRoof(
  buffers: BuildingBuffers,
  points: WorldMeters[],
  eave: number,
  rise: number,
  roofColor: THREE.Color,
  gableColor: THREE.Color,
  overhang: number,
  cell: number,
): [WorldMeters, WorldMeters] {
  const [p0, p1, p2, p3] = points;
  const longFirst = Math.hypot(p1.x - p0.x, p1.z - p0.z) >= Math.hypot(p2.x - p1.x, p2.z - p1.z);
  const [a, b, c, d] = longFirst ? [p0, p1, p2, p3] : [p1, p2, p3, p0];
  const mid = (m: WorldMeters, n: WorldMeters) => ({ x: (m.x + n.x) / 2, z: (m.z + n.z) / 2 });
  const ridge0 = mid(d, a);
  const ridge1 = mid(b, c);
  const [oa, ob, oc, od] = scaledAround([a, b, c, d], overhang);
  const [or0, or1] = scaledAround([ridge0, ridge1], overhang);
  const v = (point: WorldMeters, y: number): Vec3 => ({ x: point.x, y, z: point.z });
  const top = eave + rise;
  const eaveDrop = eave - 0.4;
  for (const [q0, q1, q2, q3] of [
    [v(oa, eaveDrop), v(ob, eaveDrop), v(or1, top), v(or0, top)],
    [v(oc, eaveDrop), v(od, eaveDrop), v(or0, top), v(or1, top)],
  ]) {
    buffers.roofs.addQuad(q0, q1, q2, q3, upwardNormal(q0, q1, q2), [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ], roofColor);
  }
  const center = centroidOf(points);
  for (const [e0, e1, ridge] of [
    [d, a, ridge0],
    [b, c, ridge1],
  ] as const) {
    const out = { x: ridge.x - center.x, z: ridge.z - center.z };
    const length = Math.hypot(out.x, out.z) || 1;
    buffers.walls.addTriangle(v(e0, eave), v(e1, eave), v(ridge, top), { x: out.x / length, y: 0, z: out.z / length }, [
      [0, eave * FACADE_V],
      [0.02, eave * FACADE_V],
      [0.01, eave * FACADE_V + 0.01],
    ], gableColor, cell);
  }
  return [or0, or1];
}

function frontEdge(points: WorldMeters[]): { p: WorldMeters; q: WorldMeters; nx: number; nz: number; length: number; dx: number; dz: number } {
  const p = points[0];
  const q = points[1];
  const length = Math.hypot(q.x - p.x, q.z - p.z) || 1;
  const center = centroidOf(points);
  let nx = -(q.z - p.z) / length;
  let nz = (q.x - p.x) / length;
  if (nx * ((p.x + q.x) / 2 - center.x) + nz * ((p.z + q.z) / 2 - center.z) < 0) {
    nx = -nx;
    nz = -nz;
  }
  return { p, q, nx, nz, length, dx: (q.x - p.x) / length, dz: (q.z - p.z) / length };
}

// A flat panel standing just in front of the street-facing wall.
function addFacadePanel(buffer: GeometryBuffer, points: WorldMeters[], from: number, to: number, y0: number, y1: number, color: THREE.Color, offset = 0.14): void {
  const { p, nx, nz, length, dx, dz } = frontEdge(points);
  const at = (t: number, y: number): Vec3 => ({ x: p.x + dx * length * t + nx * offset, y, z: p.z + dz * length * t + nz * offset });
  buffer.addQuad(at(from, y0), at(to, y0), at(to, y1), at(from, y1), { x: nx, y: 0, z: nz }, [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ], color);
}

// Vertical sign sticking out from the facade, readable from along the street.
function addBladeSign(buffer: GeometryBuffer, points: WorldMeters[], t: number, y0: number, y1: number, color: THREE.Color): void {
  const { p, nx, nz, length, dx, dz } = frontEdge(points);
  const base = { x: p.x + dx * length * t, z: p.z + dz * length * t };
  const at = (out: number, y: number): Vec3 => ({ x: base.x + nx * out, y, z: base.z + nz * out });
  buffer.addQuad(at(0.3, y0), at(2.1, y0), at(2.1, y1), at(0.3, y1), { x: dx, y: 0, z: dz }, [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ], color);
  const band = color.clone().lerp(white, 0.7);
  const mid = (y0 + y1) / 2;
  buffer.addQuad(at(0.5, mid - 0.4), at(1.9, mid - 0.4), at(1.9, mid + 0.4), at(0.5, mid + 0.4), { x: dx, y: 0, z: dz }, [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ], band);
}

function addAwning(buffer: GeometryBuffer, points: WorldMeters[], color: THREE.Color, depth: number): void {
  const { p, q, nx, nz, length, dx, dz } = frontEdge(points);
  const inset = Math.min(0.3, length * 0.05);
  const a = { x: p.x + dx * inset, z: p.z + dz * inset };
  const b = { x: q.x - dx * inset, z: q.z - dz * inset };
  const quad: [Vec3, Vec3, Vec3, Vec3] = [
    { x: a.x, y: AWNING_Y, z: a.z },
    { x: b.x, y: AWNING_Y, z: b.z },
    { x: b.x + nx * depth, y: AWNING_Y - 0.9, z: b.z + nz * depth },
    { x: a.x + nx * depth, y: AWNING_Y - 0.9, z: a.z + nz * depth },
  ];
  buffer.addQuad(quad[0], quad[1], quad[2], quad[3], upwardNormal(quad[0], quad[1], quad[2]), [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ], color);
}

// Advertising hoarding on a low roof, facing the street, with its two legs.
function addBillboard(buffers: BuildingBuffers, points: WorldMeters[], roofTop: number, seed: number): void {
  const { p, nx, nz, length, dx, dz } = frontEdge(points);
  const width = Math.min(length * 0.9, 16);
  const start = (length - width) / 2;
  const back = -2.5;
  const base = roofTop + 1.6;
  const height = 5 + (seed % 3);
  const at = (along: number, y: number): Vec3 => ({ x: p.x + dx * along + nx * back, y, z: p.z + dz * along + nz * back });
  const colors = [pick(signColors, seed), pick(awningColors, seed >>> 3), white];
  const normal = { x: nx, y: 0, z: nz };
  const uv: [[number, number], [number, number], [number, number], [number, number]] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  buffers.signs.addQuad(at(start, base), at(start + width, base), at(start + width, base + height), at(start, base + height), normal, uv, colors[0]);
  const bandY = base + height * (0.25 + ((seed >>> 5) % 3) * 0.15);
  buffers.signs.addQuad(at(start + width * 0.08, bandY), at(start + width * 0.62, bandY), at(start + width * 0.62, bandY + 1.2), at(start + width * 0.08, bandY + 1.2), normal, uv, colors[2]);
  buffers.signs.addQuad(at(start + width * 0.66, base + 0.6), at(start + width * 0.94, base + 0.6), at(start + width * 0.94, base + height - 0.6), at(start + width * 0.66, base + height - 0.6), normal, uv, colors[1]);
  for (const along of [start + width * 0.2, start + width * 0.8]) {
    const leg = at(along, roofTop);
    buffers.antennas.push(new THREE.Matrix4().compose(new THREE.Vector3(leg.x, roofTop, leg.z), new THREE.Quaternion(), new THREE.Vector3(1.6, (base - roofTop + 0.4) / 14, 1.6)));
  }
}

function prop(list: THREE.Matrix4[], point: WorldMeters, y: number, yaw: number, scale: number | THREE.Vector3 = 1): void {
  const size = typeof scale === "number" ? new THREE.Vector3(scale, scale, scale) : scale;
  list.push(new THREE.Matrix4().compose(new THREE.Vector3(point.x, y, point.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), size));
}

function facadeStylesFor(building: MapBuilding, seed: number): { ground: FacadeStyleId; upper: FacadeStyleId } {
  const tall = building.heightMeters >= 30;
  switch (building.use) {
    case "shophouse":
      return { ground: FacadeStyle.shopfront, upper: FacadeStyle.shophouse };
    case "townhouse":
      return { ground: seed % 3 === 0 ? FacadeStyle.shopfront : FacadeStyle.house, upper: seed % 2 ? FacadeStyle.house : FacadeStyle.shophouse };
    case "house":
      return { ground: FacadeStyle.house, upper: FacadeStyle.house };
    case "condo":
      return { ground: seed % 2 ? FacadeStyle.shopfront : FacadeStyle.glass, upper: seed % 4 === 0 ? FacadeStyle.ribbon : FacadeStyle.condo };
    case "office":
      return { ground: FacadeStyle.glass, upper: seed % 3 === 0 ? FacadeStyle.ribbon : FacadeStyle.glass };
    case "hotel":
      return { ground: FacadeStyle.glass, upper: seed % 2 ? FacadeStyle.condo : FacadeStyle.ribbon };
    case "mall":
      return { ground: FacadeStyle.shopfront, upper: FacadeStyle.ornate };
    case "temple":
      return { ground: FacadeStyle.ornate, upper: FacadeStyle.ornate };
    case "school":
    case "hospital":
    case "government":
      return { ground: FacadeStyle.ribbon, upper: FacadeStyle.ribbon };
    case "market":
      return { ground: FacadeStyle.shopfront, upper: FacadeStyle.warehouse };
    case "warehouse":
      return { ground: FacadeStyle.warehouse, upper: FacadeStyle.warehouse };
    case "convenience":
      return { ground: FacadeStyle.shopfront, upper: FacadeStyle.ribbon };
    default:
      break;
  }
  switch (building.kind) {
    case "commercial":
      return tall ? { ground: FacadeStyle.glass, upper: FacadeStyle.glass } : { ground: FacadeStyle.shopfront, upper: FacadeStyle.shophouse };
    case "residential":
      return tall ? { ground: FacadeStyle.ribbon, upper: FacadeStyle.condo } : { ground: FacadeStyle.house, upper: FacadeStyle.house };
    case "temple":
      return { ground: FacadeStyle.ornate, upper: FacadeStyle.ornate };
    case "industrial":
      return { ground: FacadeStyle.warehouse, upper: FacadeStyle.warehouse };
    case "civic":
      return { ground: FacadeStyle.ribbon, upper: FacadeStyle.ribbon };
    default:
      return tall ? { ground: FacadeStyle.ribbon, upper: FacadeStyle.condo } : { ground: FacadeStyle.shopfront, upper: FacadeStyle.shophouse };
  }
}

// Ground-floor band in its own style, then the rest of the height.
function addStyledWalls(buffers: BuildingBuffers, points: WorldMeters[], y0: number, y1: number, bottom: THREE.Color, top: THREE.Color, seed: number, styles: { ground: FacadeStyleId; upper: FacadeStyleId }): void {
  if (y0 < FLOOR && y1 > FLOOR + 1) {
    const split = bottom.clone().lerp(top, (FLOOR - y0) / (y1 - y0));
    addWalls(buffers.walls, points, y0, FLOOR, bottom, split, seed, styles.ground);
    addWalls(buffers.walls, points, FLOOR, y1, split, top, seed, styles.upper);
  } else {
    addWalls(buffers.walls, points, y0, y1, bottom, top, seed, y0 < FLOOR ? styles.ground : styles.upper);
  }
}

function addTower(buffers: BuildingBuffers, building: MapBuilding, points: WorldMeters[], height: number, seed: number, wallColor: THREE.Color, baseColor: THREE.Color, roofColor: THREE.Color, styles: { ground: FacadeStyleId; upper: FacadeStyleId }): { roofTop: number; top: WorldMeters[] } {
  const use = building.use;
  const floors = building.floors ?? 10;
  const variant = (seed >>> 7) % 3;
  const podiumStyles = { ground: styles.ground, upper: use === "office" ? FacadeStyle.ribbon : styles.ground === FacadeStyle.shopfront ? FacadeStyle.ribbon : FacadeStyle.glass };
  let base = 0;
  let ring = points;
  if (variant !== 2) {
    base = Math.min(height * 0.3, (use === "condo" ? 3 : 4) * FLOOR);
    addStyledWalls(buffers, points, 0, base, baseColor, wallColor.clone().multiplyScalar(0.9), seed, podiumStyles);
    addCap(buffers.roofs, points, base, roofColor.clone().lerp(white, 0.35));
    addParapet(buffers.roofs, points, base, 1.1, wallColor.clone().multiplyScalar(0.85));
    ring = scaledAround(points, use === "office" ? 0.76 : use === "hotel" ? 0.8 : 0.82);
  }
  if (variant === 1 && floors >= 20) {
    const split = base + (height - base) * 0.68;
    addStyledWalls(buffers, ring, base, split, wallColor.clone().multiplyScalar(0.92), wallColor, seed >>> 2, styles);
    addCap(buffers.roofs, ring, split, roofColor);
    addParapet(buffers.roofs, ring, split, 1, wallColor.clone().multiplyScalar(0.88));
    ring = scaledAround(ring, 0.78);
    addWalls(buffers.walls, ring, split, height, wallColor.clone().multiplyScalar(0.95), wallColor, seed >>> 3, styles.upper);
  } else {
    addStyledWalls(buffers, ring, base, height, base ? wallColor.clone().multiplyScalar(0.92) : baseColor, wallColor, seed >>> 2, styles);
  }
  addCap(buffers.roofs, ring, height, roofColor);
  addParapet(buffers.roofs, ring, height, 1.2, wallColor.clone().multiplyScalar(0.85));
  return { roofTop: height, top: ring };
}

function addRoofTopFeature(buffers: BuildingBuffers, building: MapBuilding, ring: WorldMeters[], roofTop: number, seed: number, wallColor: THREE.Color, roofColor: THREE.Color): number {
  const floors = building.floors ?? 0;
  const center = centroidOf(ring);
  const crown = (seed >>> 11) % 4;
  if (floors >= 24 && crown === 0) {
    const crownRing = scaledAround(ring, 0.55);
    const crownHeight = 2.4 * MAP_SCALE;
    addWalls(buffers.walls, crownRing, roofTop, roofTop + crownHeight, wallColor.clone().multiplyScalar(0.85), wallColor, seed >>> 4, FacadeStyle.glass);
    addCap(buffers.roofs, crownRing, roofTop + crownHeight, roofColor);
    prop(buffers.antennas, center, roofTop + crownHeight, 0, 0.8 + ((seed >>> 8) % 5) / 10);
    return roofTop + crownHeight;
  }
  if (floors >= 24 && crown === 1) {
    prop(buffers.masts, center, roofTop, 0, new THREE.Vector3(2.4, 10 + floors * 0.35, 2.4));
    return roofTop;
  }
  if (floors >= 24 && crown === 2) {
    // Helipad: yellow ring with a dark pad.
    const radius = Math.min(7, Math.min(...ring.map((point) => Math.hypot(point.x - center.x, point.z - center.z))) * 0.7);
    addDiscCap(buffers.signs, center, radius, roofTop + 0.08, helipadYellow);
    addDiscCap(buffers.signs, center, radius * 0.82, roofTop + 0.1, helipadGrey);
    return roofTop;
  }
  if ((building.use === "condo" || building.use === "hotel") && (crown === 3 || floors < 24) && seed % 5 < 2) {
    const deck = insetRing(ring, 2);
    addCap(buffers.roofs, deck, roofTop + 0.06, deckColor);
    addCap(buffers.signs, scaledAround(deck, 0.6), roofTop + 0.1, poolBlue);
    return roofTop;
  }
  return roofTop;
}

function addDiscCap(buffer: GeometryBuffer, center: WorldMeters, radius: number, y: number, color: THREE.Color): void {
  const steps = 18;
  for (let i = 0; i < steps; i += 1) {
    const a0 = (i / steps) * Math.PI * 2;
    const a1 = ((i + 1) / steps) * Math.PI * 2;
    buffer.addTriangle(
      { x: center.x, y, z: center.z },
      { x: center.x + Math.cos(a0) * radius, y, z: center.z + Math.sin(a0) * radius },
      { x: center.x + Math.cos(a1) * radius, y, z: center.z + Math.sin(a1) * radius },
      UP,
      [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
      color,
    );
  }
}

function addBuilding(buffers: BuildingBuffers, building: MapBuilding, origin: WorldMeters, detail: RenderQualityProfile["quality"]): void {
  const points = building.footprint.map((point) => ({ x: point.x - origin.x, z: point.z - origin.z }));
  if (points.length < 3) return;
  const seed = hashString(building.id);
  const key: PaletteKey = building.use ?? building.kind;
  const wallColor = new THREE.Color(pick(wallPalettes[key], seed));
  const baseColor = wallColor.clone().multiplyScalar(0.72);
  const roofColor = new THREE.Color(pick(roofPalettes[key], seed >>> 3));
  const height = Math.max(4, building.heightMeters * MAP_SCALE);
  const use = building.use;
  const quad = points.length === 4;
  const center = centroidOf(points);
  const yaw = ((seed >>> 5) % 628) / 100;
  const styles = facadeStylesFor(building, seed);
  const floors = building.floors ?? Math.max(1, Math.round(building.heightMeters / 3.3));
  let roofTop = height;
  let roofRing = points;
  let flatRoof = true;

  if ((use === "condo" || use === "office" || use === "hotel") && floors >= 8) {
    const tower = addTower(buffers, building, points, height, seed, wallColor, baseColor, roofColor, styles);
    roofRing = tower.top;
    roofTop = addRoofTopFeature(buffers, building, roofRing, tower.roofTop, seed, wallColor, roofColor);
    flatRoof = false;
    if (use === "hotel" && building.facesStreet && quad) addFacadePanel(buffers.signs, points, 0.3, 0.7, FLOOR * 2.2, FLOOR * 2.2 + 2.6, pick(signColors, seed >>> 6));
  } else if (quad && (use === "house" || use === "warehouse" || use === "school")) {
    const rise = use === "warehouse" ? Math.min(3.5, height * 0.2) : use === "school" ? 3.2 : 3.6 * MAP_SCALE * 0.6;
    const eave = Math.max(3, height - (use === "house" ? 0 : rise * 0.3));
    addStyledWalls(buffers, points, 0, eave, baseColor, wallColor, seed, styles);
    addGableRoof(buffers, points, eave, rise, roofColor, wallColor, use === "warehouse" ? 1.02 : 1.08, styles.upper);
    roofTop = eave + rise;
    flatRoof = false;
  } else if (quad && use === "temple") {
    const eave = height * 0.42;
    const rise = height * 0.3;
    addWalls(buffers.walls, points, 0, eave, wallColor.clone().multiplyScalar(0.9), wallColor, seed, FacadeStyle.ornate);
    const [lowEnd0, lowEnd1] = addGableRoof(buffers, points, eave, rise, roofColor, wallColor, 1.14, FacadeStyle.ornate);
    const upper = scaledAround(points, 0.66);
    const upperBase = eave + rise * 0.55;
    addWalls(buffers.walls, upper, upperBase, upperBase + height * 0.12, wallColor, wallColor, seed >>> 3, FacadeStyle.ornate);
    const [end0, end1] = addGableRoof(buffers, upper, upperBase + height * 0.12, rise * 1.1, new THREE.Color(seed % 2 ? "#15803d" : "#c2410c"), wallColor, 1.1, FacadeStyle.ornate);
    roofTop = upperBase + height * 0.12 + rise * 1.1;
    // Chofa finials on the gable ends and a gold spire on the ridge.
    for (const end of [end0, end1]) prop(buffers.spires, end, roofTop - 0.2, 0, new THREE.Vector3(0.35, 3.4, 0.35));
    for (const end of [lowEnd0, lowEnd1]) prop(buffers.spires, end, eave + rise - 0.2, 0, new THREE.Vector3(0.3, 2.6, 0.3));
    prop(buffers.spires, center, roofTop - 1, 0, new THREE.Vector3(1.4, height * 0.55, 1.4));
    flatRoof = false;
  } else {
    addStyledWalls(buffers, points, 0, height, baseColor, wallColor, seed, styles);
    addCap(buffers.roofs, points, height, roofColor);
  }
  if (flatRoof && detail !== "low" && floors >= 2 && use !== "house") addParapet(buffers.roofs, points, height, use === "mall" || use === "government" ? 1.4 : 0.9, wallColor.clone().multiplyScalar(0.86));

  if (quad && building.facesStreet) {
    if (use === "shophouse" || use === "market" || (use === "townhouse" && seed % 3 === 0)) {
      addAwning(buffers.roofs, points, pick(awningColors, seed >>> 2), use === "market" ? 3.2 : 1.9);
      if (use !== "townhouse") addFacadePanel(buffers.signs, points, 0.12, 0.88, AWNING_Y + 0.4, AWNING_Y + 2.2, pick(signColors, seed >>> 7));
      if (use === "shophouse" && floors >= 3 && seed % 2 === 0) {
        addBladeSign(buffers.signs, points, (seed >>> 4) % 2 ? 0.08 : 0.92, AWNING_Y + 3, Math.min(height - 1, AWNING_Y + 3 + FLOOR * 1.4), pick(signColors, seed >>> 9));
      }
    } else if (use === "convenience") {
      stripeColors.forEach((color, index) => addFacadePanel(buffers.signs, points, 0.04, 0.96, AWNING_Y + 0.5 + index * 0.55, AWNING_Y + 1.05 + index * 0.55, color));
    } else if (use === "hospital") {
      const y = height * 0.82;
      addFacadePanel(buffers.signs, points, 0.44, 0.56, y - 3, y + 3, white);
      addFacadePanel(buffers.signs, points, 0.475, 0.525, y - 2.4, y + 2.4, crossRed, 0.2);
      addFacadePanel(buffers.signs, points, 0.455, 0.545, y - 0.8, y + 0.8, crossRed, 0.2);
    } else if (use === "mall") {
      addFacadePanel(buffers.signs, points, 0.3, 0.7, height * 0.72, height * 0.72 + 5, pick(signColors, seed >>> 7), 0.2);
      addFacadePanel(buffers.signs, points, 0.05, 0.95, FLOOR - 0.2, FLOOR + 0.6, pick(awningColors, seed >>> 3), 0.25);
    }
  }
  if (use === "mall" && quad) {
    const ring = scaledAround(points, 1.004);
    addWalls(buffers.roofs, ring, height * 0.25, height * 0.6, glassColor, glassColor, seed, 0);
  }

  if (detail === "low") return;
  // Wall-mounted AC units on the street side of shophouses and small condos.
  if (quad && building.facesStreet && (use === "shophouse" || use === "townhouse" || (use === "condo" && floors < 8))) {
    const front = frontEdge(points);
    for (let floor = 1; floor < floors; floor += 1) {
      const unitSeed = hashString(`${building.id}:ac${floor}`);
      if (unitSeed % 100 > 30) continue;
      const t = 0.2 + ((unitSeed >>> 8) % 60) / 100;
      const at = { x: front.p.x + front.dx * front.length * t + front.nx * 0.4, z: front.p.z + front.dz * front.length * t + front.nz * 0.4 };
      prop(buffers.boxes, at, floor * FLOOR + 0.8, Math.atan2(front.nx, front.nz), 0.42);
    }
  }
  // Low roofs facing the street sometimes carry a billboard.
  if (quad && building.facesStreet && flatRoof && floors <= 6 && seed % 9 === 0 && use !== "temple") addBillboard(buffers, points, height, seed);

  const roofSpot = (dx: number, dz: number) => ({ x: center.x + dx, z: center.z + dz });
  if (flatRoof && (use === "shophouse" || use === "townhouse" || use === undefined) && seed % 3 === 0) {
    prop(buffers.tanks, roofSpot(((seed >>> 3) % 5) - 2, ((seed >>> 6) % 5) - 2), roofTop, yaw, 0.7 + ((seed >>> 9) % 5) / 10);
  }
  if (use === "office" || use === "mall" || use === "hotel" || use === "hospital" || use === "condo" || use === "government") {
    const ringCenter = centroidOf(roofRing);
    const count = 1 + ((seed >>> 4) % 3);
    for (let i = 0; i < count; i += 1) {
      const angle = yaw + (i * Math.PI * 2) / count;
      prop(buffers.boxes, { x: ringCenter.x + Math.cos(angle) * 4, z: ringCenter.z + Math.sin(angle) * 4 }, roofTop, yaw);
    }
    if (use === "condo") prop(buffers.tanks, { x: ringCenter.x - 3, z: ringCenter.z + 2 }, roofTop, yaw, 1.3);
  }
}

function addInstances(group: THREE.Group, geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[]): void {
  if (!matrices.length) return;
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  matrices.forEach((value, index) => mesh.setMatrixAt(index, value));
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  group.add(mesh);
}

const treeTrunkGeometry = new THREE.CylinderGeometry(0.2, 0.32, 2.8, 6).translate(0, 1.4, 0);
const treeCanopyGeometry = new THREE.IcosahedronGeometry(2.1, 0).translate(0, 4.1, 0);
const lampPoleGeometry = new THREE.CylinderGeometry(0.09, 0.12, 7.2, 6).translate(0, 3.6, 0);
const lampHeadGeometry = new THREE.BoxGeometry(0.5, 0.2, 1.1).translate(0, 7.2, 0);
for (const geometry of [treeTrunkGeometry, treeCanopyGeometry, lampPoleGeometry, lampHeadGeometry]) {
  geometry.userData.shared = true;
}
const leafColors = ["#3f7d3a", "#4d8b3c", "#2f6b35", "#5b9442", "#3a7446"].map((color) => new THREE.Color(color));
// Concrete utility pole with a cross-arm (local z runs along the street) and a transformer on some.
const utilityPoleGeometry = mergeGeometries([
  new THREE.CylinderGeometry(0.16, 0.26, 9.4, 5, 1, true).translate(0, 4.7, 0).toNonIndexed(),
  new THREE.BoxGeometry(1.8, 0.14, 0.14).translate(0, 8.3, 0).toNonIndexed(),
]);
const transformerGeometry = new THREE.CylinderGeometry(0.42, 0.42, 1.1, 6).translate(0.55, 6.2, 0);
utilityPoleGeometry.userData.shared = true;
transformerGeometry.userData.shared = true;
const POLE_SPACING = 30;
const WIRE_HEIGHTS = [7.6, 8.3, 8.3];
const WIRE_OFFSETS = [0, -0.8, 0.8];

function addStreetFurniture(
  group: THREE.Group,
  segments: LocalSegment[],
  junctionTrim: (id: string, extra: number) => number,
  context: TileBuildContext,
  treeSpacing: number,
): void {
  const trees: THREE.Matrix4[] = [];
  const treeColors: THREE.Color[] = [];
  const lamps: THREE.Matrix4[] = [];
  const poles: THREE.Matrix4[] = [];
  const transformers: THREE.Matrix4[] = [];
  const wires: number[] = [];
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const road of segments) {
    const kind = road.segment.kind;
    if (kind === "motorway" || kind === "bridge" || kind === "service") continue;
    if (kind === "alley" || road.segment.width < 10) {
      addPolesAndWires(road, junctionTrim, poles, transformers, wires);
      continue;
    }
    const start = junctionTrim(road.a.id, SIDEWALK_WIDTH + 2) + 3;
    const end = road.length - junctionTrim(road.b.id, SIDEWALK_WIDTH + 2) - 3;
    let index = 0;
    for (let along = start; along < end; along += treeSpacing, index += 1) {
      const seed = hashString(`${road.segment.id}:t${index}`);
      for (const side of [-1, 1]) {
        if ((seed >>> (side > 0 ? 3 : 7)) % 5 === 0) continue;
        const offset = (road.half + SIDEWALK_WIDTH * 0.62) * side;
        const scale = 0.8 + ((seed >>> 11) % 60) / 100;
        rotation.setFromAxisAngle(up, (seed % 628) / 100);
        matrix.compose(new THREE.Vector3(road.a.x + road.dx * along + road.nx * offset, SIDEWALK_Y, road.a.z + road.dz * along + road.nz * offset), rotation, new THREE.Vector3(scale, scale, scale));
        trees.push(matrix.clone());
        treeColors.push(leafColors[(seed >>> 5) % leafColors.length]);
      }
    }
    addPolesAndWires(road, junctionTrim, poles, transformers, wires);
    if (road.segment.width >= 14) {
      let lampIndex = 0;
      for (let along = start + 8; along < end; along += 36, lampIndex += 1) {
        const side = lampIndex % 2 === 0 ? 1 : -1;
        const offset = (road.half + 0.6) * side;
        rotation.setFromAxisAngle(up, Math.atan2(road.dx, road.dz));
        matrix.compose(new THREE.Vector3(road.a.x + road.dx * along + road.nx * offset, SIDEWALK_Y, road.a.z + road.dz * along + road.nz * offset), rotation, new THREE.Vector3(1, 1, 1));
        lamps.push(matrix.clone());
      }
    }
  }
  const instanced = (geometry: THREE.BufferGeometry, material: THREE.Material, matrices: THREE.Matrix4[], cast: boolean, colors?: THREE.Color[]) => {
    if (!matrices.length) return;
    const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
    matrices.forEach((value, index) => {
      mesh.setMatrixAt(index, value);
      if (colors) mesh.setColorAt(index, colors[index]);
    });
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  };
  instanced(treeTrunkGeometry, context.materials.treeTrunk, trees, true);
  instanced(treeCanopyGeometry, context.materials.treeLeaves, trees, true, treeColors);
  instanced(lampPoleGeometry, context.materials.lampPole, lamps, false);
  instanced(lampHeadGeometry, context.materials.lampHead, lamps, false);
  instanced(utilityPoleGeometry, context.materials.concrete, poles, true);
  instanced(transformerGeometry, context.materials.lampPole, transformers, false);
  if (wires.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(wires, 3));
    geometry.computeBoundingSphere();
    group.add(new THREE.LineSegments(geometry, context.materials.wires));
  }
}

// Bangkok's overhead cables: concrete poles on one sidewalk with three sagging wires between them.
function addPolesAndWires(
  road: LocalSegment,
  junctionTrim: (id: string, extra: number) => number,
  poles: THREE.Matrix4[],
  transformers: THREE.Matrix4[],
  wires: number[],
): void {
  const start = junctionTrim(road.a.id, SIDEWALK_WIDTH + 1) + 3;
  const end = road.length - junctionTrim(road.b.id, SIDEWALK_WIDTH + 1) - 3;
  if (end - start < 12) return;
  const seed = hashString(`${road.segment.id}:poles`);
  const side = seed % 2 ? 1 : -1;
  const offset = (road.half + SIDEWALK_WIDTH - 0.4) * side;
  const count = Math.max(1, Math.round((end - start) / POLE_SPACING));
  const step = (end - start) / count;
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(road.dx, road.dz));
  let previous: THREE.Vector3 | undefined;
  for (let i = 0; i <= count; i += 1) {
    const along = start + step * i;
    const position = new THREE.Vector3(road.a.x + road.dx * along + road.nx * offset, SIDEWALK_Y, road.a.z + road.dz * along + road.nz * offset);
    const matrix = new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(1, 1, 1));
    poles.push(matrix);
    if (hashString(`${road.segment.id}:tr${i}`) % 7 === 0) transformers.push(matrix);
    if (previous) {
      WIRE_HEIGHTS.forEach((height, index) => {
        const lateral = WIRE_OFFSETS[index];
        const lx = road.nx * lateral;
        const lz = road.nz * lateral;
        const segments = 4;
        for (let k = 0; k < segments; k += 1) {
          const t0 = k / segments;
          const t1 = (k + 1) / segments;
          const sag = (t: number) => SIDEWALK_Y + height - 0.9 * 4 * t * (1 - t);
          wires.push(
            previous!.x + (position.x - previous!.x) * t0 + lx,
            sag(t0),
            previous!.z + (position.z - previous!.z) * t0 + lz,
            previous!.x + (position.x - previous!.x) * t1 + lx,
            sag(t1),
            previous!.z + (position.z - previous!.z) * t1 + lz,
          );
        }
      });
    }
    previous = position;
  }
}

export function disposeGroup(group: THREE.Object3D): void {
  group.traverse((child) => {
    if ((child instanceof THREE.Mesh || child instanceof THREE.LineSegments) && !child.geometry.userData.shared) {
      child.geometry.dispose();
    }
  });
}
