import * as THREE from "three";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

type Color3 = THREE.Color | [THREE.Color, THREE.Color, THREE.Color];
type Color4 = THREE.Color | [THREE.Color, THREE.Color, THREE.Color, THREE.Color];

// Growable Float32Array, so building a tile never goes through large JS number arrays.
class FloatBuilder {
  data = new Float32Array(1024);
  length = 0;

  reserve(extra: number): void {
    if (this.length + extra <= this.data.length) return;
    let size = this.data.length * 2;
    while (size < this.length + extra) size *= 2;
    const next = new Float32Array(size);
    next.set(this.data.subarray(0, this.length));
    this.data = next;
  }

  toAttribute(itemSize: number): THREE.BufferAttribute {
    return new THREE.BufferAttribute(this.data.slice(0, this.length), itemSize);
  }
}

// Accumulates triangles for one merged mesh. Triangles are re-wound to face `normal`,
// so callers never have to reason about winding order. An optional per-vertex `facadeCell`
// attribute picks the façade style from the building texture atlas.
export class GeometryBuffer {
  private readonly positions = new FloatBuilder();
  private readonly normals = new FloatBuilder();
  private readonly uvs = new FloatBuilder();
  private readonly colors = new FloatBuilder();
  private readonly cells = new FloatBuilder();

  constructor(
    private readonly withColors = false,
    private readonly withCells = false,
  ) {}

  get isEmpty(): boolean {
    return this.positions.length === 0;
  }

  addTriangle(a: Vec3, b: Vec3, c: Vec3, normal: Vec3, uv: [number, number][], color?: Color3, cell = 0): void {
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
    this.positions.reserve(9);
    this.normals.reserve(9);
    this.uvs.reserve(6);
    if (this.withColors) this.colors.reserve(9);
    if (this.withCells) this.cells.reserve(3);
    this.pushVertex(a, normal, uv[0], Array.isArray(color) ? color[0] : color, cell);
    if (flip) {
      this.pushVertex(c, normal, uv[2], Array.isArray(color) ? color[2] : color, cell);
      this.pushVertex(b, normal, uv[1], Array.isArray(color) ? color[1] : color, cell);
    } else {
      this.pushVertex(b, normal, uv[1], Array.isArray(color) ? color[1] : color, cell);
      this.pushVertex(c, normal, uv[2], Array.isArray(color) ? color[2] : color, cell);
    }
  }

  addQuad(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, normal: Vec3, uv: [[number, number], [number, number], [number, number], [number, number]], color?: Color4, cell = 0): void {
    const c0 = Array.isArray(color) ? color[0] : color;
    const c1 = Array.isArray(color) ? color[1] : color;
    const c2 = Array.isArray(color) ? color[2] : color;
    const c3 = Array.isArray(color) ? color[3] : color;
    const acx = p2.x - p0.x;
    const acy = p2.y - p0.y;
    const acz = p2.z - p0.z;
    // Winding from the first triangle, or the second when the first is degenerate.
    const second = p1.x === p0.x && p1.y === p0.y && p1.z === p0.z;
    const edge = second ? p3 : p1;
    const sign = second ? -1 : 1;
    const abx = edge.x - p0.x;
    const aby = edge.y - p0.y;
    const abz = edge.z - p0.z;
    const flip = sign * ((aby * acz - abz * acy) * normal.x + (abz * acx - abx * acz) * normal.y + (abx * acy - aby * acx) * normal.z) < 0;
    this.positions.reserve(18);
    this.normals.reserve(18);
    this.uvs.reserve(12);
    if (this.withColors) this.colors.reserve(18);
    if (this.withCells) this.cells.reserve(6);
    // Both triangles of a planar quad share the winding decision.
    if (flip) {
      this.pushVertex(p0, normal, uv[0], c0, cell);
      this.pushVertex(p2, normal, uv[2], c2, cell);
      this.pushVertex(p1, normal, uv[1], c1, cell);
      this.pushVertex(p0, normal, uv[0], c0, cell);
      this.pushVertex(p3, normal, uv[3], c3, cell);
      this.pushVertex(p2, normal, uv[2], c2, cell);
    } else {
      this.pushVertex(p0, normal, uv[0], c0, cell);
      this.pushVertex(p1, normal, uv[1], c1, cell);
      this.pushVertex(p2, normal, uv[2], c2, cell);
      this.pushVertex(p0, normal, uv[0], c0, cell);
      this.pushVertex(p2, normal, uv[2], c2, cell);
      this.pushVertex(p3, normal, uv[3], c3, cell);
    }
  }

  private pushVertex(vertex: Vec3, normal: Vec3, uv: [number, number], color: THREE.Color | undefined, cell: number): void {
    const positions = this.positions;
    positions.data[positions.length++] = vertex.x;
    positions.data[positions.length++] = vertex.y;
    positions.data[positions.length++] = vertex.z;
    const normals = this.normals;
    normals.data[normals.length++] = normal.x;
    normals.data[normals.length++] = normal.y;
    normals.data[normals.length++] = normal.z;
    const uvs = this.uvs;
    uvs.data[uvs.length++] = uv[0];
    uvs.data[uvs.length++] = uv[1];
    if (this.withColors) {
      const colors = this.colors;
      colors.data[colors.length++] = color?.r ?? 1;
      colors.data[colors.length++] = color?.g ?? 1;
      colors.data[colors.length++] = color?.b ?? 1;
    }
    if (this.withCells) this.cells.data[this.cells.length++] = cell;
  }

  toGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", this.positions.toAttribute(3));
    geometry.setAttribute("normal", this.normals.toAttribute(3));
    geometry.setAttribute("uv", this.uvs.toAttribute(2));
    if (this.withColors) geometry.setAttribute("color", this.colors.toAttribute(3));
    if (this.withCells) geometry.setAttribute("facadeCell", this.cells.toAttribute(1));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}

export const UP: Vec3 = { x: 0, y: 1, z: 0 };
