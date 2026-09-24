import * as THREE from "three";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// Accumulates triangles for one merged mesh. Triangles are re-wound to face `normal`,
// so callers never have to reason about winding order.
export class GeometryBuffer {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly colors: number[] = [];

  constructor(private readonly withColors = false) {}

  get isEmpty(): boolean {
    return this.positions.length === 0;
  }

  addTriangle(a: Vec3, b: Vec3, c: Vec3, normal: Vec3, uv: [number, number][], color?: THREE.Color | [THREE.Color, THREE.Color, THREE.Color]): void {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abz = b.z - a.z;
    const acx = c.x - a.x;
    const acy = c.y - a.y;
    const acz = c.z - a.z;
    const faceX = aby * acz - abz * acy;
    const faceY = abz * acx - abx * acz;
    const faceZ = abx * acy - aby * acx;
    const flip = faceX * normal.x + faceY * normal.y + faceZ * normal.z < 0;
    const order = flip ? [0, 2, 1] : [0, 1, 2];
    const verts = [a, b, c];
    for (const index of order) {
      const vertex = verts[index];
      this.positions.push(vertex.x, vertex.y, vertex.z);
      this.normals.push(normal.x, normal.y, normal.z);
      this.uvs.push(uv[index][0], uv[index][1]);
      if (this.withColors) {
        const vertexColor = Array.isArray(color) ? color[index] : color;
        this.colors.push(vertexColor?.r ?? 1, vertexColor?.g ?? 1, vertexColor?.b ?? 1);
      }
    }
  }

  addQuad(
    p0: Vec3,
    p1: Vec3,
    p2: Vec3,
    p3: Vec3,
    normal: Vec3,
    uv: [[number, number], [number, number], [number, number], [number, number]],
    color?: THREE.Color | [THREE.Color, THREE.Color, THREE.Color, THREE.Color],
  ): void {
    const colorAt = (index: number) => (Array.isArray(color) ? color[index] : color);
    const tri = (i: number, j: number, k: number) => {
      const c = color === undefined ? undefined : ([colorAt(i)!, colorAt(j)!, colorAt(k)!] as [THREE.Color, THREE.Color, THREE.Color]);
      this.addTriangle([p0, p1, p2, p3][i], [p0, p1, p2, p3][j], [p0, p1, p2, p3][k], normal, [uv[i], uv[j], uv[k]], c);
    };
    tri(0, 1, 2);
    tri(0, 2, 3);
  }

  toGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    if (this.withColors) {
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    }
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}

export const UP: Vec3 = { x: 0, y: 1, z: 0 };
