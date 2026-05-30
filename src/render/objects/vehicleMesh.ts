import * as THREE from "three";
import type { VehicleDefinition } from "../../types";
import { getVehicleDefinition } from "../../data/vehicles";

export function createVehicleMesh(definition: VehicleDefinition = getVehicleDefinition("krung-compact"), ghost = false): THREE.Group {
  const group = new THREE.Group();
  const scale = definition.class === "pickup" ? { x: 1.12, z: 1.18 } : definition.class === "sport" ? { x: 1.08, z: 0.92 } : { x: 1, z: 1 };
  const opacity = ghost ? 0.42 : 1;
  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: definition.color,
    roughness: 0.24,
    metalness: 0.42,
    clearcoat: ghost ? 0.2 : 0.72,
    clearcoatRoughness: 0.22,
    transparent: ghost,
    opacity,
  });
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.2 * scale.x, definition.class === "sport" ? 0.58 : 0.75, 4.2 * scale.z),
    bodyMaterial,
  );
  body.position.y = 0.72;
  body.castShadow = true;
  group.add(body);

  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.65 * scale.x, definition.class === "pickup" ? 0.72 : 0.62, definition.class === "pickup" ? 1.25 : 1.75),
    new THREE.MeshStandardMaterial({ color: ghost ? "#dbeafe" : "#101827", roughness: 0.18, metalness: 0.2, transparent: ghost, opacity }),
  );
  cabin.position.set(0, 1.22, -0.3);
  cabin.castShadow = true;
  group.add(cabin);

  const wheelMaterial = new THREE.MeshStandardMaterial({ color: ghost ? "#94a3b8" : "#101010", roughness: 0.8, transparent: ghost, opacity });
  for (const x of [-1.15, 1.15]) {
    for (const z of [-1.45, 1.45]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 18), wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.35, z);
      wheel.castShadow = true;
      wheel.userData.vehiclePart = "wheel";
      group.add(wheel);
    }
  }

  const headLightMaterial = new THREE.MeshStandardMaterial({
    color: "#fff7cc",
    emissive: "#ffe8a3",
    emissiveIntensity: ghost ? 0.15 : 0.9,
    roughness: 0.18,
    transparent: ghost,
    opacity,
  });
  const brakeLightMaterial = new THREE.MeshStandardMaterial({
    color: "#ef4444",
    emissive: "#ef4444",
    emissiveIntensity: ghost ? 0.1 : 0.55,
    roughness: 0.2,
    transparent: ghost,
    opacity,
  });
  for (const x of [-0.58, 0.58]) {
    const headLight = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), headLightMaterial.clone());
    headLight.position.set(x * scale.x, 0.78, 2.14 * scale.z);
    headLight.userData.vehiclePart = "headLight";
    group.add(headLight);

    const brakeLight = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.08), brakeLightMaterial.clone());
    brakeLight.position.set(x * scale.x, 0.74, -2.14 * scale.z);
    brakeLight.userData.vehiclePart = "brakeLight";
    group.add(brakeLight);
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
  boostGlow.position.set(0, 0.36, -2.8 * scale.z);
  boostGlow.userData.vehiclePart = "boostGlow";
  group.add(boostGlow);

  return group;
}
