import type { BangkokWorldData, PlaceSummary } from "../types";
import { getDistrictById } from "./bangkokDistricts";
import { curatedPlaces } from "./curatedPlaces";

export const BANGKOK_ORIGIN = { lat: 13.7563, lng: 100.5018 };

const nodes = [
  ["n0", -360, -80],
  ["n1", -220, -80],
  ["n2", -60, -80],
  ["n3", 120, -80],
  ["n4", 300, -80],
  ["n5", -220, -250],
  ["n6", -60, -250],
  ["n7", 120, -250],
  ["n8", 300, -250],
  ["n9", -220, 100],
  ["n10", -60, 100],
  ["n11", 120, 100],
  ["n12", 300, 100],
  ["n13", -60, 280],
  ["n14", 120, 280],
  ["n15", 300, 280],
] as const;

const segment = (
  id: string,
  from: string,
  to: string,
  district: string,
  kind: "arterial" | "street" | "bridge" | "alley" = "arterial",
) => ({ id, from, to, width: kind === "alley" ? 8 : kind === "street" ? 12 : 18, district, kind });

export const bangkokWorld: BangkokWorldData = {
  origin: BANGKOK_ORIGIN,
  districts: [
    { id: "phra-nakhon", name: "Phra Nakhon", center: { lat: 13.7527, lng: 100.4940 }, bounds: { minX: -420, maxX: -160, minZ: -180, maxZ: 40 } },
    { id: "samphanthawong", name: "Samphanthawong", center: { lat: 13.7400, lng: 100.5088 }, bounds: { minX: -160, maxX: 40, minZ: -180, maxZ: 40 } },
    { id: "pathum-wan", name: "Pathum Wan", center: { lat: 13.7466, lng: 100.5347 }, bounds: { minX: 40, maxX: 240, minZ: -180, maxZ: 40 } },
    { id: "sathorn-silom", name: "Sathorn / Silom", center: { lat: 13.7246, lng: 100.5342 }, bounds: { minX: 40, maxX: 360, minZ: -330, maxZ: -180 } },
    { id: "ari-chatuchak", name: "Ari / Chatuchak", center: { lat: 13.7900, lng: 100.5480 }, bounds: { minX: -120, maxX: 360, minZ: 40, maxZ: 340 } },
    { id: "khlong-san", name: "Khlong San", center: { lat: 13.7266, lng: 100.5102 }, bounds: { minX: -360, maxX: -120, minZ: -330, maxZ: -180 } },
  ],
  roadNodes: nodes.map(([id, x, z]) => ({ id, x, z })),
  roadSegments: [
    segment("r0", "n0", "n1", "Phra Nakhon"),
    segment("r1", "n1", "n2", "Samphanthawong"),
    segment("r2", "n2", "n3", "Pathum Wan"),
    segment("r3", "n3", "n4", "Pathum Wan"),
    segment("r4", "n1", "n5", "Khlong San", "bridge"),
    segment("r5", "n2", "n6", "Samphanthawong", "street"),
    segment("r6", "n3", "n7", "Sathorn / Silom"),
    segment("r7", "n4", "n8", "Sukhumvit", "street"),
    segment("r8", "n1", "n9", "Phra Nakhon"),
    segment("r9", "n2", "n10", "Phaya Thai", "street"),
    segment("r10", "n3", "n11", "Phaya Thai"),
    segment("r11", "n4", "n12", "Chatuchak"),
    segment("r12", "n10", "n13", "Phaya Thai", "street"),
    segment("r13", "n11", "n14", "Chatuchak"),
    segment("r14", "n12", "n15", "Chatuchak"),
    segment("r15", "n5", "n6", "Khlong San", "street"),
    segment("r16", "n6", "n7", "Sathorn / Silom"),
    segment("r17", "n7", "n8", "Sathorn / Silom", "street"),
    segment("r18", "n9", "n10", "Ari", "street"),
    segment("r19", "n10", "n11", "Ari", "street"),
    segment("r20", "n11", "n12", "Chatuchak", "street"),
    segment("r21", "n13", "n14", "Chatuchak"),
    segment("r22", "n14", "n15", "Chatuchak"),
  ],
  places: curatedPlaces,
};

export function placeWorldPosition(place: PlaceSummary): { x: number; z: number } {
  const bangkokDistrict = getDistrictById(place.districtId);
  const zoneId = bangkokDistrict?.playableZoneId ?? place.districtId;
  const district =
    bangkokWorld.districts.find((candidate) => candidate.id === zoneId) ??
    bangkokWorld.districts.find((candidate) => candidate.name === place.district || candidate.name === place.districtName) ??
    nearestPlayableDistrict(place);
  if (!district) {
    return { x: 0, z: 0 };
  }

  const latOffset = (place.lat - district.center.lat) * 9000;
  const lngOffset = (place.lng - district.center.lng) * 9000;
  return {
    x: (district.bounds.minX + district.bounds.maxX) / 2 + lngOffset,
    z: (district.bounds.minZ + district.bounds.maxZ) / 2 - latOffset,
  };
}

function nearestPlayableDistrict(place: PlaceSummary): (typeof bangkokWorld.districts)[number] {
  return bangkokWorld.districts.reduce((nearest, district) => {
    const currentDistance = Math.hypot(place.lat - district.center.lat, place.lng - district.center.lng);
    const nearestDistance = Math.hypot(place.lat - nearest.center.lat, place.lng - nearest.center.lng);
    return currentDistance < nearestDistance ? district : nearest;
  }, bangkokWorld.districts[0]);
}
