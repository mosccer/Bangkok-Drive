import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { TrafficVehicleType } from "../../simulation/traffic";

// Low-poly AI vehicles: a handful of merged meshes per vehicle (body, dark parts, lights) instead of
// the ~25 parts of the player car, so dozens of cars, tuk-tuks, motorbikes and buses stay cheap.

type PartName = "body" | "dark" | "accent" | "headLight" | "brakeLight";

interface TrafficShape {
  parts: Partial<Record<PartName, THREE.BufferGeometry>>;
  accent?: string;
}

const box = (w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const wheel = (radius: number, width: number, x: number, z: number): THREE.BufferGeometry => new THREE.CylinderGeometry(radius, radius, width, 10).rotateZ(Math.PI / 2).translate(x, radius, z);

function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(list.map((geometry) => geometry.toNonIndexed()));
  for (const geometry of list) geometry.dispose();
  merged.userData.shared = true;
  return merged;
}

function carShape(kind: "car" | "taxi" | "pickup"): TrafficShape {
  const body = [box(2, 0.72, 4.2, 0, 0.78, 0)];
  const dark = [wheel(0.36, 0.3, -0.95, 1.35), wheel(0.36, 0.3, 0.95, 1.35), wheel(0.36, 0.3, -0.95, -1.35), wheel(0.36, 0.3, 0.95, -1.35)];
  if (kind === "pickup") {
    dark.push(box(1.74, 0.62, 1.7, 0, 1.44, 0.65));
    body.push(box(0.1, 0.36, 1.7, -0.95, 1.32, -1.2), box(0.1, 0.36, 1.7, 0.95, 1.32, -1.2), box(2, 0.36, 0.1, 0, 1.32, -2.05));
  } else {
    dark.push(box(1.72, 0.6, 2.2, 0, 1.43, -0.2));
    body.push(box(1.6, 0.08, 1.9, 0, 1.76, -0.25));
  }
  const shape: TrafficShape = {
    parts: {
      body: merge(body),
      dark: merge(dark),
      headLight: merge([box(0.4, 0.14, 0.06, -0.62, 0.9, 2.12), box(0.4, 0.14, 0.06, 0.62, 0.9, 2.12)]),
      brakeLight: merge([box(0.4, 0.14, 0.06, -0.62, 0.9, -2.12), box(0.4, 0.14, 0.06, 0.62, 0.9, -2.12)]),
    },
  };
  if (kind === "taxi") {
    shape.parts.accent = merge([box(0.9, 0.24, 0.34, 0, 1.92, -0.2)]);
    shape.accent = "#fde047";
  }
  return shape;
}

function tuktukShape(): TrafficShape {
  return {
    parts: {
      body: merge([box(1.3, 0.55, 2.4, 0, 0.62, -0.2), box(0.62, 0.85, 0.6, 0, 0.95, 1.2), box(1.55, 0.12, 2.3, 0, 2.05, -0.15)]),
      dark: merge([
        wheel(0.3, 0.24, 0, 1.25),
        wheel(0.3, 0.24, -0.62, -0.95),
        wheel(0.3, 0.24, 0.62, -0.95),
        box(0.08, 1.1, 0.08, -0.7, 1.45, 0.85),
        box(0.08, 1.1, 0.08, 0.7, 1.45, 0.85),
        box(0.08, 1.1, 0.08, -0.7, 1.45, -1.2),
        box(0.08, 1.1, 0.08, 0.7, 1.45, -1.2),
        box(1.2, 0.5, 0.2, 0, 1.15, -0.7),
      ]),
      accent: merge([box(1.58, 0.18, 2.34, 0, 2.18, -0.15)]),
      headLight: merge([box(0.3, 0.16, 0.06, 0, 1.2, 1.52)]),
      brakeLight: merge([box(0.3, 0.12, 0.06, -0.5, 0.75, -1.42), box(0.3, 0.12, 0.06, 0.5, 0.75, -1.42)]),
    },
    accent: "#facc15",
  };
}

function motorbikeShape(): TrafficShape {
  return {
    parts: {
      body: merge([box(0.34, 0.42, 1.5, 0, 0.66, 0), box(0.36, 0.3, 0.5, 0, 0.95, -0.35)]),
      dark: merge([wheel(0.32, 0.12, 0, 0.62), wheel(0.32, 0.12, 0, -0.62), box(0.5, 0.2, 0.3, 0, 0.62, 0.05), box(0.14, 0.62, 0.14, -0.1, 0.62, -0.1), box(0.14, 0.62, 0.14, 0.1, 0.62, -0.1)]),
      accent: merge([box(0.46, 0.66, 0.32, 0, 1.38, -0.12), box(0.3, 0.3, 0.3, 0, 1.87, -0.08)]),
      headLight: merge([box(0.16, 0.12, 0.06, 0, 1.0, 0.78)]),
      brakeLight: merge([box(0.18, 0.1, 0.06, 0, 0.9, -0.77)]),
    },
    accent: "#f97316",
  };
}

function busShape(): TrafficShape {
  return {
    parts: {
      body: merge([box(2.5, 2.3, 10.4, 0, 1.75, 0)]),
      dark: merge([
        box(2.54, 0.85, 9.4, 0, 2.3, -0.2),
        box(2.3, 0.9, 0.08, 0, 2.35, 5.21),
        wheel(0.5, 0.36, -1.1, 3.6),
        wheel(0.5, 0.36, 1.1, 3.6),
        wheel(0.5, 0.36, -1.1, -3.4),
        wheel(0.5, 0.36, 1.1, -3.4),
      ]),
      accent: merge([box(2.52, 0.3, 10.42, 0, 1.0, 0)]),
      headLight: merge([box(0.45, 0.2, 0.06, -0.8, 1.0, 5.21), box(0.45, 0.2, 0.06, 0.8, 1.0, 5.21)]),
      brakeLight: merge([box(0.3, 0.3, 0.06, -1.0, 1.1, -5.21), box(0.3, 0.3, 0.06, 1.0, 1.1, -5.21)]),
    },
    accent: "#f8fafc",
  };
}

let shapes: Record<TrafficVehicleType, TrafficShape> | undefined;

function shapeFor(type: TrafficVehicleType): TrafficShape {
  shapes ??= {
    car: carShape("car"),
    taxi: carShape("taxi"),
    pickup: carShape("pickup"),
    tuktuk: tuktukShape(),
    motorbike: motorbikeShape(),
    bus: busShape(),
  };
  return shapes[type];
}

const sharedMaterials = new Map<string, THREE.Material>();

function sharedMaterial(key: string, create: () => THREE.Material): THREE.Material {
  let material = sharedMaterials.get(key);
  if (!material) {
    material = create();
    material.userData.shared = true;
    sharedMaterials.set(key, material);
  }
  return material;
}

export function createTrafficMesh(type: TrafficVehicleType, color: string): THREE.Group {
  const shape = shapeFor(type);
  const group = new THREE.Group();
  const materials: Record<PartName, () => THREE.Material> = {
    body: () => sharedMaterial(`body:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.25 })),
    dark: () => sharedMaterial("dark", () => new THREE.MeshStandardMaterial({ color: "#16191e", roughness: 0.6, metalness: 0.3 })),
    accent: () => sharedMaterial(`accent:${shape.accent ?? color}`, () => new THREE.MeshStandardMaterial({ color: shape.accent ?? color, roughness: 0.5, emissive: shape.accent === "#fde047" ? "#fde047" : "#000000", emissiveIntensity: 0.4 })),
    headLight: () => new THREE.MeshStandardMaterial({ color: "#fff7cc", emissive: "#fff1c2", emissiveIntensity: 0.9, roughness: 0.2 }),
    brakeLight: () => new THREE.MeshStandardMaterial({ color: "#ef4444", emissive: "#ff2d2d", emissiveIntensity: 0.55, roughness: 0.2 }),
  };
  for (const [part, geometry] of Object.entries(shape.parts) as Array<[PartName, THREE.BufferGeometry]>) {
    const mesh = new THREE.Mesh(geometry, materials[part]());
    mesh.castShadow = part === "body" && type !== "motorbike";
    if (part === "headLight" || part === "brakeLight") mesh.userData.vehiclePart = part;
    group.add(mesh);
  }
  return group;
}
