import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { VehicleDefinition } from "../../types";
import { getVehicleDefinition } from "../../data/vehicles";

const shared = {
  tire: new THREE.CylinderGeometry(0.37, 0.37, 0.3, 20),
  rim: new THREE.CylinderGeometry(0.23, 0.23, 0.32, 12),
  spoke: new THREE.BoxGeometry(0.34, 0.05, 0.4),
  lightBar: new THREE.BoxGeometry(0.36, 0.14, 0.06),
  mirror: new THREE.BoxGeometry(0.22, 0.12, 0.1),
};
for (const geometry of Object.values(shared)) {
  geometry.userData.shared = true;
}

// Built with +z as the car's forward axis so rotation.y = yaw matches VehicleController.
export function createVehicleMesh(definition: VehicleDefinition = getVehicleDefinition("krung-compact"), ghost = false): THREE.Group {
  const group = new THREE.Group();
  const kind = definition.class;
  const scale = kind === "pickup" ? { x: 1.1, z: 1.18 } : kind === "sport" ? { x: 1.06, z: 0.98 } : { x: 1, z: 1 };
  const opacity = ghost ? 0.45 : 1;
  const bodyHeight = kind === "sport" ? 0.55 : kind === "pickup" ? 0.8 : 0.7;
  const rideHeight = kind === "sport" ? 0.34 : kind === "pickup" ? 0.5 : 0.42;

  const paint = new THREE.MeshPhysicalMaterial({
    color: definition.color,
    roughness: 0.38,
    metalness: 0.2,
    envMapIntensity: 0.55,
    clearcoat: ghost ? 0.2 : 0.8,
    clearcoatRoughness: 0.12,
    transparent: ghost,
    opacity,
  });
  const trim = new THREE.MeshStandardMaterial({ color: "#15181d", roughness: 0.55, metalness: 0.3, transparent: ghost, opacity });
  const glass = new THREE.MeshPhysicalMaterial({
    color: ghost ? "#dbeafe" : "#0f1a24",
    roughness: 0.05,
    metalness: 0.9,
    envMapIntensity: 1.6,
    transparent: true,
    opacity: ghost ? 0.35 : 0.9,
  });

  const body = new THREE.Mesh(new RoundedBoxGeometry(2.1 * scale.x, bodyHeight, 4.3 * scale.z, 3, 0.2), paint);
  body.position.y = rideHeight + bodyHeight / 2;
  body.castShadow = !ghost;
  body.receiveShadow = true;
  group.add(body);

  const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.14 * scale.x, 0.16, 4.1 * scale.z), trim);
  skirt.position.y = rideHeight + 0.06;
  group.add(skirt);

  const cabinLength = kind === "pickup" ? 1.7 : kind === "sport" ? 1.8 : 2.2;
  const cabinZ = kind === "pickup" ? 0.55 : kind === "sport" ? -0.25 : -0.2;
  const cabinHeight = kind === "sport" ? 0.5 : 0.66;
  const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.78 * scale.x, cabinHeight, cabinLength, 3, 0.18), glass);
  cabin.position.set(0, rideHeight + bodyHeight + cabinHeight / 2 - 0.04, cabinZ);
  cabin.castShadow = !ghost;
  group.add(cabin);
  const roof = new THREE.Mesh(new RoundedBoxGeometry(1.62 * scale.x, 0.08, cabinLength - 0.35, 2, 0.04), paint);
  roof.position.set(0, cabin.position.y + cabinHeight / 2, cabinZ - 0.05);
  group.add(roof);

  if (kind === "pickup") {
    const bedLength = 1.6 * scale.z;
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.36, bedLength), paint);
      wall.position.set(side * 1.0 * scale.x, rideHeight + bodyHeight + 0.18, -1.25);
      group.add(wall);
    }
    const tailgate = new THREE.Mesh(new THREE.BoxGeometry(2.0 * scale.x, 0.36, 0.1), paint);
    tailgate.position.set(0, rideHeight + bodyHeight + 0.18, -2.05 * scale.z);
    group.add(tailgate);
  }

  if (kind === "taxi") {
    const sign = new THREE.Mesh(
      new RoundedBoxGeometry(0.9, 0.24, 0.34, 2, 0.06),
      new THREE.MeshStandardMaterial({ color: "#fef9c3", emissive: "#fde047", emissiveIntensity: ghost ? 0.2 : 0.8, transparent: ghost, opacity }),
    );
    sign.position.set(0, roof.position.y + 0.16, cabinZ);
    sign.userData.vehiclePart = "taxiSign";
    group.add(sign);
  }

  if (kind === "sport") {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.36), trim);
    wing.position.set(0, rideHeight + bodyHeight + 0.34, -1.95);
    group.add(wing);
    for (const side of [-0.7, 0.7]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.12), trim);
      post.position.set(side, rideHeight + bodyHeight + 0.17, -1.95);
      group.add(post);
    }
  }

  for (const side of [-1, 1]) {
    const mirror = new THREE.Mesh(shared.mirror, trim);
    mirror.position.set(side * 1.12 * scale.x, rideHeight + bodyHeight + 0.12, cabinZ + cabinLength / 2 - 0.15);
    group.add(mirror);
  }

  const tireMaterial = new THREE.MeshStandardMaterial({ color: ghost ? "#94a3b8" : "#111214", roughness: 0.92, transparent: ghost, opacity });
  const rimMaterial = new THREE.MeshStandardMaterial({ color: kind === "sport" ? "#fbbf24" : "#cbd5e1", roughness: 0.25, metalness: 0.9, transparent: ghost, opacity });
  for (const x of [-1.02, 1.02]) {
    for (const z of [-1.35, 1.35]) {
      const tire = new THREE.Mesh(shared.tire, tireMaterial);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(x * scale.x, 0.37, z * scale.z);
      tire.castShadow = !ghost;
      tire.userData.vehiclePart = "wheel";
      const rim = new THREE.Mesh(shared.rim, rimMaterial);
      tire.add(rim);
      const spoke = new THREE.Mesh(shared.spoke, rimMaterial);
      spoke.rotation.y = Math.PI / 2;
      tire.add(spoke);
      group.add(tire);
    }
  }

  const headLightMaterial = new THREE.MeshStandardMaterial({
    color: "#fff7cc",
    emissive: "#fff1c2",
    emissiveIntensity: ghost ? 0.15 : 0.9,
    roughness: 0.18,
    transparent: ghost,
    opacity,
  });
  const brakeLightMaterial = new THREE.MeshStandardMaterial({
    color: "#ef4444",
    emissive: "#ff2d2d",
    emissiveIntensity: ghost ? 0.1 : 0.55,
    roughness: 0.2,
    transparent: ghost,
    opacity,
  });
  const lightY = rideHeight + bodyHeight * 0.62;
  for (const x of [-0.66, 0.66]) {
    const headLight = new THREE.Mesh(shared.lightBar, headLightMaterial.clone());
    headLight.position.set(x * scale.x, lightY, 2.15 * scale.z);
    headLight.userData.vehiclePart = "headLight";
    group.add(headLight);

    const brakeLight = new THREE.Mesh(shared.lightBar, brakeLightMaterial.clone());
    brakeLight.position.set(x * scale.x, lightY, -2.15 * scale.z);
    brakeLight.userData.vehiclePart = "brakeLight";
    group.add(brakeLight);
  }
  if (kind === "ev") {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.05), headLightMaterial.clone());
    strip.position.set(0, lightY + 0.12, 2.17);
    strip.userData.vehiclePart = "headLight";
    group.add(strip);
  }

  const boostGlow = new THREE.Mesh(
    new THREE.BoxGeometry(1.4 * scale.x, 0.08, 2.2),
    new THREE.MeshBasicMaterial({
      color: "#67e8f9",
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  boostGlow.position.set(0, 0.36, -2.9 * scale.z);
  boostGlow.userData.vehiclePart = "boostGlow";
  group.add(boostGlow);

  return group;
}
