import type { VehicleDefinition, VehicleStats } from "../types";

export const vehicleDefinitions: VehicleDefinition[] = [
  {
    id: "krung-compact",
    brand: "Krung",
    model: "Compact",
    class: "compact",
    stats: { maxSpeedKmh: 120, accelerationMps2: 11.6, brakeMps2: 18.5, grip: 1.08, drift: 0.65, mass: 980 },
    unlockRequirement: {},
    meshKey: "procedural-compact",
    color: "#d92332",
  },
  {
    id: "siam-taxi",
    brand: "Siam",
    model: "Taxi",
    class: "taxi",
    stats: { maxSpeedKmh: 120, accelerationMps2: 10.2, brakeMps2: 19.5, grip: 1.0, drift: 0.55, mass: 1180 },
    unlockRequirement: { xp: 100 },
    meshKey: "procedural-sedan",
    color: "#22c55e",
  },
  {
    id: "chao-phraya-sport",
    brand: "Chao Phraya",
    model: "Sport",
    class: "sport",
    stats: { maxSpeedKmh: 120, accelerationMps2: 15.8, brakeMps2: 22.5, grip: 1.12, drift: 0.9, mass: 1120 },
    unlockRequirement: { missionId: "landmark-time-trial" },
    meshKey: "procedural-sport",
    color: "#f97316",
  },
  {
    id: "thonburi-pickup",
    brand: "Thonburi",
    model: "Pickup",
    class: "pickup",
    stats: { maxSpeedKmh: 120, accelerationMps2: 9.4, brakeMps2: 17.5, grip: 1.18, drift: 0.42, mass: 1580 },
    unlockRequirement: { xp: 250 },
    meshKey: "procedural-pickup",
    color: "#64748b",
  },
  {
    id: "ari-ev",
    brand: "Ari",
    model: "EV",
    class: "ev",
    stats: { maxSpeedKmh: 120, accelerationMps2: 13.4, brakeMps2: 20.5, grip: 1.04, drift: 0.58, mass: 1320 },
    unlockRequirement: { missionId: "ari-cafe-trail" },
    meshKey: "procedural-ev",
    color: "#06b6d4",
  },
];

export function getVehicleDefinition(id: string): VehicleDefinition {
  return vehicleDefinitions.find((vehicle) => vehicle.id === id) ?? vehicleDefinitions[0];
}

export function getEffectiveVehicleStats(id: string): VehicleStats {
  return getVehicleDefinition(id).stats;
}

export function isVehicleUnlocked(vehicle: VehicleDefinition, xp: number, completedMissionIds: string[]): boolean {
  const requiredXp = vehicle.unlockRequirement.xp ?? 0;
  const requiredMission = vehicle.unlockRequirement.missionId;
  return xp >= requiredXp && (!requiredMission || completedMissionIds.includes(requiredMission));
}
