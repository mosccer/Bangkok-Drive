import * as THREE from "three";
import { MAP_SCALE } from "../../data/coordinates";
import { hashString } from "../../simulation/hash";
import type { MapArea, MapBuildingKind, RenderQualityProfile, RoadSegment, RoadTile, WorldMeters } from "../../types";
import { GeometryBuffer, UP, type Vec3 } from "./GeometryBuffer";

export interface WorldMaterials {
  asphalt: THREE.Material;
  bridge: THREE.Material;
  sidewalk: THREE.Material;
  markings: THREE.Material;
  walls: THREE.Material;
  roofs: THREE.Material;
  treeTrunk: THREE.Material;
  treeLeaves: THREE.Material;
  lampPole: THREE.Material;
  lampHead: THREE.Material;
}

export interface TileBuildContext {
  materials: WorldMaterials;
  quality: RenderQualityProfile;
  blockers: MapArea[];
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

interface Footprint {
  points: WorldMeters[];
  height: number;
  kind: MapBuildingKind;
  seed: number;
}

const ROAD_Y = 0.06;
const BRIDGE_Y = 0.08;
const SIDEWALK_Y = 0.16;
const MARKING_Y = 0.075;
const SIDEWALK_WIDTH = 3.2;
const ROAD_UV_SCALE = 1 / 12;
const FACADE_U = 1 / 28;
const FACADE_V = 1 / 25.6;

const wallPalettes: Record<MapBuildingKind | "shophouse" | "tower", string[]> = {
  shophouse: ["#eadfc8", "#dcc6a6", "#cdd9e1", "#e9cdbb", "#d4dbc6", "#f2e8d5", "#c3ccd3", "#e6bba8", "#f0d9a8"],
  tower: ["#a8bccd", "#bcc7cf", "#8a9eb1", "#cbd6de", "#98aebd", "#d8dde2"],
  commercial: ["#b7c6d3", "#d4dbe1", "#9fb3c4", "#e2e5e8"],
  residential: ["#efe4cf", "#e2d2b8", "#d9e1e4", "#f1e0d0", "#dfe6d8"],
  temple: ["#f7f1e3"],
  civic: ["#e8d8b8", "#dccdb0", "#efe7d6"],
  industrial: ["#a9adb2", "#b8b3a8"],
  generic: ["#dcd3c3", "#cfd5da", "#e6dccb", "#c9c4bb", "#d8cbb8"],
};
const roofPalettes: Record<MapBuildingKind | "shophouse" | "tower", string[]> = {
  shophouse: ["#7b6f63", "#8a5a44", "#6b7280", "#9a3412"],
  tower: ["#4b5563", "#596270", "#3f4652"],
  commercial: ["#525a66", "#646c78"],
  residential: ["#9a3412", "#7c2d12", "#6b7280", "#8b5e3c"],
  temple: ["#c2410c", "#b45309", "#15803d"],
  civic: ["#7c4a2d", "#6b7280"],
  industrial: ["#7c8087"],
  generic: ["#6b7280", "#5b616b", "#7b6f63"],
};

function pick<T>(list: T[], seed: number): T {
  return list[seed % list.length];
}

export function buildTileGroup(tile: RoadTile, context: TileBuildContext): THREE.Group {
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

  const addMesh = (buffer: GeometryBuffer, material: THREE.Material, receive: boolean, cast: boolean) => {
    if (buffer.isEmpty) return;
    const mesh = new THREE.Mesh(buffer.toGeometry(), material);
    mesh.receiveShadow = receive;
    mesh.castShadow = cast;
    group.add(mesh);
  };
  addMesh(asphalt, context.materials.asphalt, true, false);
  addMesh(bridges, context.materials.bridge, true, true);
  addMesh(sidewalks, context.materials.sidewalk, true, false);
  addMesh(markings, context.materials.markings, true, false);

  const localBlockers = context.blockers.map((area) => ({ ...area, outer: area.outer.map((point) => ({ x: point.x - origin.x, z: point.z - origin.z })) }));
  const footprints = tile.buildings?.length
    ? tile.buildings.map((building) => ({
        points: building.footprint.map((point) => ({ x: point.x - origin.x, z: point.z - origin.z })),
        height: building.heightMeters * MAP_SCALE,
        kind: building.kind,
        seed: hashString(building.id),
      }))
    : proceduralFootprints(tile.id, segments, junctionTrim, localBlockers, detail);
  const walls = new GeometryBuffer(true);
  const roofs = new GeometryBuffer(true);
  for (const footprint of footprints) extrudeFootprint(walls, roofs, footprint, !tile.buildings?.length);
  addMesh(walls, context.materials.walls, true, detail !== "low");
  addMesh(roofs, context.materials.roofs, true, false);

  if (detail !== "low") {
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

function pointInPolygon(point: WorldMeters, polygon: WorldMeters[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.z > point.z !== b.z > point.z && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToSegment(point: WorldMeters, road: LocalSegment): number {
  const t = Math.max(0, Math.min(road.length, (point.x - road.a.x) * road.dx + (point.z - road.a.z) * road.dz));
  return Math.hypot(point.x - (road.a.x + road.dx * t), point.z - (road.a.z + road.dz * t));
}

// Bangkok street frontage: contiguous shophouse rows with the odd tower on main roads.
function proceduralFootprints(
  tileId: string,
  segments: LocalSegment[],
  junctionTrim: (id: string, extra: number) => number,
  blockers: MapArea[],
  detail: RenderQualityProfile["quality"],
): Footprint[] {
  const cap = detail === "low" ? 260 : detail === "medium" ? 650 : 1200;
  const footprints: Footprint[] = [];
  const blockerBoxes = blockers.map((area) => {
    const xs = area.outer.map((point) => point.x);
    const zs = area.outer.map((point) => point.z);
    return { area, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  });
  const blocked = (point: WorldMeters) =>
    blockerBoxes.some((box) => point.x >= box.minX && point.x <= box.maxX && point.z >= box.minZ && point.z <= box.maxZ && pointInPolygon(point, box.area.outer));

  for (const road of segments) {
    const kind = road.segment.kind;
    if (kind === "motorway" || kind === "bridge" || kind === "service" || road.length < 25) continue;
    const mainRoad = kind === "primary" || kind === "arterial" || kind === "secondary";
    for (const side of [-1, 1]) {
      let along = junctionTrim(road.a.id, SIDEWALK_WIDTH + 3) + 2;
      const end = road.length - junctionTrim(road.b.id, SIDEWALK_WIDTH + 3) - 2;
      let index = 0;
      while (along < end && footprints.length < cap) {
        const seed = hashString(`${tileId}:${road.segment.id}:${side}:${index++}`);
        const tower = mainRoad && seed % 100 < 14;
        const width = tower ? 26 + (seed % 16) : 8 + (seed % 5);
        const depth = tower ? 24 + ((seed >>> 5) % 18) : 18 + ((seed >>> 5) % 10);
        const gap = tower ? 8 + ((seed >>> 9) % 10) : (seed >>> 9) % 9 === 0 ? 5 + ((seed >>> 12) % 8) : 0.4;
        if (along + width > end) break;
        const offset = (road.half + SIDEWALK_WIDTH + 1.2 + depth / 2) * side;
        const center = { x: road.a.x + road.dx * (along + width / 2) + road.nx * offset, z: road.a.z + road.dz * (along + width / 2) + road.nz * offset };
        const clear =
          !blocked(center) &&
          segments.every((other) => other === road || distanceToSegment(center, other) > other.half + SIDEWALK_WIDTH + Math.max(width, depth) * 0.55);
        if (clear) {
          const hw = width / 2;
          const hd = depth / 2;
          const corner = (u: number, v: number) => ({
            x: center.x + road.dx * u + road.nx * v * side,
            z: center.z + road.dz * u + road.nz * v * side,
          });
          const floors = tower ? 12 + ((seed >>> 14) % 34) : 3 + ((seed >>> 14) % 3);
          footprints.push({
            points: [corner(-hw, -hd), corner(hw, -hd), corner(hw, hd), corner(-hw, hd)],
            height: floors * 3.3 * MAP_SCALE,
            kind: tower ? "commercial" : "generic",
            seed: tower ? seed : seed | 1,
          });
        }
        along += width + gap;
      }
    }
  }
  return footprints;
}

function signedArea(points: WorldMeters[]): number {
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    area += points[j].x * points[i].z - points[i].x * points[j].z;
  }
  return area / 2;
}

function extrudeFootprint(walls: GeometryBuffer, roofs: GeometryBuffer, footprint: Footprint, procedural: boolean): void {
  const points = footprint.points;
  if (points.length < 3) return;
  const paletteKey = procedural ? (footprint.kind === "commercial" ? "tower" : "shophouse") : footprint.kind;
  const wallColor = new THREE.Color(pick(wallPalettes[paletteKey], footprint.seed));
  const baseColor = wallColor.clone().multiplyScalar(0.72);
  const roofColor = new THREE.Color(pick(roofPalettes[paletteKey], footprint.seed >>> 3));
  const height = Math.max(4, footprint.height);
  const orientation = Math.sign(signedArea(points)) || 1;
  let perimeter = (footprint.seed % 7) * 3;
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
      { x: p.x, y: 0, z: p.z },
      { x: q.x, y: 0, z: q.z },
      { x: q.x, y: height, z: q.z },
      { x: p.x, y: height, z: p.z },
      normal,
      [
        [u0, 0],
        [u1, 0],
        [u1, height * FACADE_V],
        [u0, height * FACADE_V],
      ],
      [baseColor, baseColor, wallColor, wallColor],
    );
    perimeter += length;
  }
  const contour = points.map((point) => new THREE.Vector2(point.x, point.z));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  for (const [i, j, k] of triangles) {
    const a = { x: points[i].x, y: height, z: points[i].z };
    const b = { x: points[j].x, y: height, z: points[j].z };
    const c = { x: points[k].x, y: height, z: points[k].z };
    roofs.addTriangle(a, b, c, UP, [
      [a.x / 8, a.z / 8],
      [b.x / 8, b.z / 8],
      [c.x / 8, c.z / 8],
    ], roofColor);
  }
}

const treeTrunkGeometry = new THREE.CylinderGeometry(0.2, 0.32, 2.8, 6).translate(0, 1.4, 0);
const treeCanopyGeometry = new THREE.IcosahedronGeometry(2.1, 0).translate(0, 4.1, 0);
const lampPoleGeometry = new THREE.CylinderGeometry(0.09, 0.12, 7.2, 6).translate(0, 3.6, 0);
const lampHeadGeometry = new THREE.BoxGeometry(0.5, 0.2, 1.1).translate(0, 7.2, 0);
for (const geometry of [treeTrunkGeometry, treeCanopyGeometry, lampPoleGeometry, lampHeadGeometry]) {
  geometry.userData.shared = true;
}
const leafColors = ["#3f7d3a", "#4d8b3c", "#2f6b35", "#5b9442", "#3a7446"].map((color) => new THREE.Color(color));

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
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const road of segments) {
    const kind = road.segment.kind;
    if (kind === "motorway" || kind === "bridge" || kind === "service" || kind === "alley" || road.segment.width < 10) continue;
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
}

export function disposeGroup(group: THREE.Object3D): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh && !child.geometry.userData.shared) {
      child.geometry.dispose();
    }
  });
}
