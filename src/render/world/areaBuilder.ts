import * as THREE from "three";
import { hashString } from "../../simulation/hash";
import type { MapArea } from "../../types";

export interface AreaMaterials {
  water: THREE.Material;
  park: THREE.Material;
  templeGround: THREE.Material;
  treeTrunk: THREE.Material;
  treeLeaves: THREE.Material;
}

const areaHeights: Record<MapArea["kind"], number> = { water: 0.02, park: 0.035, temple_ground: 0.04 };
const treeTrunk = new THREE.CylinderGeometry(0.22, 0.34, 3, 6).translate(0, 1.5, 0);
const treeCanopy = new THREE.IcosahedronGeometry(2.6, 0).translate(0, 4.6, 0);
treeTrunk.userData.shared = true;
treeCanopy.userData.shared = true;

export function areaBounds(area: MapArea): { minX: number; maxX: number; minZ: number; maxZ: number } {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const point of area.outer) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  return { minX, maxX, minZ, maxZ };
}

// Geometry is in world meters; the caller offsets the parent group by the floating origin.
export function buildAreaObject(area: MapArea, materials: AreaMaterials, withTrees: boolean): THREE.Object3D {
  const shape = new THREE.Shape(area.outer.map((point) => new THREE.Vector2(point.x, -point.z)));
  for (const hole of area.holes ?? []) {
    shape.holes.push(new THREE.Path(hole.map((point) => new THREE.Vector2(point.x, -point.z))));
  }
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  const material = area.kind === "water" ? materials.water : area.kind === "park" ? materials.park : materials.templeGround;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = areaHeights[area.kind];
  mesh.receiveShadow = area.kind !== "water";
  if (!withTrees || area.kind !== "park") return mesh;

  const group = new THREE.Group();
  group.add(mesh);
  const bounds = areaBounds(area);
  const spacing = 22;
  const matrices: THREE.Matrix4[] = [];
  const colors: THREE.Color[] = [];
  const shades = ["#3b7a37", "#4b8a3a", "#2c6532", "#5a9244"].map((color) => new THREE.Color(color));
  for (let x = bounds.minX; x <= bounds.maxX && matrices.length < 500; x += spacing) {
    for (let z = bounds.minZ; z <= bounds.maxZ && matrices.length < 500; z += spacing) {
      const seed = hashString(`${area.id}:${Math.round(x)}:${Math.round(z)}`);
      if (seed % 3 === 0) continue;
      const px = x + ((seed % 100) / 100 - 0.5) * spacing * 0.8;
      const pz = z + (((seed >>> 8) % 100) / 100 - 0.5) * spacing * 0.8;
      if (!insidePolygon(px, pz, area)) continue;
      const scale = 0.85 + ((seed >>> 16) % 70) / 100;
      matrices.push(new THREE.Matrix4().compose(new THREE.Vector3(px, 0, pz), new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale)));
      colors.push(shades[(seed >>> 4) % shades.length]);
    }
  }
  if (matrices.length) {
    const trunks = new THREE.InstancedMesh(treeTrunk, materials.treeTrunk, matrices.length);
    const canopies = new THREE.InstancedMesh(treeCanopy, materials.treeLeaves, matrices.length);
    matrices.forEach((matrix, index) => {
      trunks.setMatrixAt(index, matrix);
      canopies.setMatrixAt(index, matrix);
      canopies.setColorAt(index, colors[index]);
    });
    canopies.castShadow = true;
    trunks.computeBoundingSphere();
    canopies.computeBoundingSphere();
    group.add(trunks, canopies);
  }
  return group;
}

function insidePolygon(x: number, z: number, area: MapArea): boolean {
  const test = (ring: MapArea["outer"]) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const a = ring[i];
      const b = ring[j];
      if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
  };
  return test(area.outer) && !(area.holes ?? []).some(test);
}
