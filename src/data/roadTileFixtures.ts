import type { GeoPoint, RoadSegment, RoadTile, RoadTileManifest } from "../types";
import { latLngToWorld } from "./coordinates";

const TILE_SIZE_METERS = 512;
const GENERATED_AT = "2026-05-30T00:00:00.000+07:00";

interface RoadLine {
  id: string;
  kind: RoadSegment["kind"];
  width: number;
  district: string;
  points: GeoPoint[];
}

interface TileSeed {
  id: string;
  districtIds: string[];
  center: GeoPoint;
  roads: RoadLine[];
}

const widthByKind: Record<RoadSegment["kind"], number> = {
  motorway: 24,
  primary: 18,
  secondary: 16,
  tertiary: 14,
  residential: 10,
  service: 8,
  arterial: 18,
  street: 12,
  bridge: 16,
  alley: 7,
};

const seeds: TileSeed[] = [
  {
    id: "real-phra-nakhon-00",
    districtIds: ["phra-nakhon"],
    center: { lat: 13.7515, lng: 100.4932 },
    roads: [
      {
        id: "sanam-chai",
        kind: "primary",
        width: widthByKind.primary,
        district: "Phra Nakhon",
        points: [
          { lat: 13.7456, lng: 100.4931 },
          { lat: 13.7498, lng: 100.4933 },
          { lat: 13.7548, lng: 100.4936 },
        ],
      },
      {
        id: "na-phra-lan",
        kind: "secondary",
        width: widthByKind.secondary,
        district: "Phra Nakhon",
        points: [
          { lat: 13.7522, lng: 100.4888 },
          { lat: 13.7520, lng: 100.4928 },
          { lat: 13.7518, lng: 100.4964 },
        ],
      },
      {
        id: "maharat",
        kind: "tertiary",
        width: widthByKind.tertiary,
        district: "Phra Nakhon",
        points: [
          { lat: 13.7468, lng: 100.4894 },
          { lat: 13.7506, lng: 100.4897 },
          { lat: 13.7540, lng: 100.4902 },
        ],
      },
    ],
  },
  {
    id: "real-yaowarat-00",
    districtIds: ["samphanthawong"],
    center: { lat: 13.7400, lng: 100.5092 },
    roads: [
      {
        id: "yaowarat-road",
        kind: "primary",
        width: widthByKind.primary,
        district: "Samphanthawong",
        points: [
          { lat: 13.7411, lng: 100.5024 },
          { lat: 13.7406, lng: 100.5062 },
          { lat: 13.7400, lng: 100.5100 },
          { lat: 13.7389, lng: 100.5141 },
        ],
      },
      {
        id: "charoen-krung-yaowarat",
        kind: "secondary",
        width: widthByKind.secondary,
        district: "Samphanthawong",
        points: [
          { lat: 13.7362, lng: 100.5052 },
          { lat: 13.7358, lng: 100.5100 },
          { lat: 13.7353, lng: 100.5148 },
        ],
      },
      {
        id: "songwat",
        kind: "residential",
        width: widthByKind.residential,
        district: "Samphanthawong",
        points: [
          { lat: 13.7395, lng: 100.5040 },
          { lat: 13.7388, lng: 100.5084 },
          { lat: 13.7379, lng: 100.5125 },
        ],
      },
    ],
  },
  {
    id: "real-siam-00",
    districtIds: ["pathum-wan", "ratchathewi"],
    center: { lat: 13.7466, lng: 100.5347 },
    roads: [
      {
        id: "rama-one",
        kind: "primary",
        width: widthByKind.primary,
        district: "Pathum Wan",
        points: [
          { lat: 13.7469, lng: 100.5270 },
          { lat: 13.7466, lng: 100.5347 },
          { lat: 13.7459, lng: 100.5410 },
        ],
      },
      {
        id: "phaya-thai-road",
        kind: "primary",
        width: widthByKind.primary,
        district: "Pathum Wan",
        points: [
          { lat: 13.7407, lng: 100.5297 },
          { lat: 13.7448, lng: 100.5298 },
          { lat: 13.7502, lng: 100.5301 },
        ],
      },
      {
        id: "ratchadamri",
        kind: "secondary",
        width: widthByKind.secondary,
        district: "Pathum Wan",
        points: [
          { lat: 13.7418, lng: 100.5402 },
          { lat: 13.7455, lng: 100.5399 },
          { lat: 13.7495, lng: 100.5396 },
        ],
      },
    ],
  },
  {
    id: "real-sathorn-silom-00",
    districtIds: ["sathon", "bang-rak"],
    center: { lat: 13.7246, lng: 100.5342 },
    roads: [
      {
        id: "sathorn-road",
        kind: "primary",
        width: widthByKind.primary,
        district: "Sathon",
        points: [
          { lat: 13.7210, lng: 100.5218 },
          { lat: 13.7215, lng: 100.5300 },
          { lat: 13.7222, lng: 100.5385 },
          { lat: 13.7228, lng: 100.5460 },
        ],
      },
      {
        id: "silom-road",
        kind: "primary",
        width: widthByKind.primary,
        district: "Bang Rak",
        points: [
          { lat: 13.7280, lng: 100.5215 },
          { lat: 13.7272, lng: 100.5305 },
          { lat: 13.7265, lng: 100.5382 },
          { lat: 13.7258, lng: 100.5445 },
        ],
      },
      {
        id: "naradhiwas",
        kind: "secondary",
        width: widthByKind.secondary,
        district: "Sathon",
        points: [
          { lat: 13.7175, lng: 100.5312 },
          { lat: 13.7220, lng: 100.5322 },
          { lat: 13.7284, lng: 100.5334 },
        ],
      },
    ],
  },
  {
    id: "real-khlong-san-00",
    districtIds: ["khlong-san", "thon-buri"],
    center: { lat: 13.7266, lng: 100.5102 },
    roads: [
      {
        id: "charoen-nakhon",
        kind: "primary",
        width: widthByKind.primary,
        district: "Khlong San",
        points: [
          { lat: 13.7188, lng: 100.5079 },
          { lat: 13.7258, lng: 100.5100 },
          { lat: 13.7330, lng: 100.5119 },
        ],
      },
      {
        id: "krung-thonburi",
        kind: "secondary",
        width: widthByKind.secondary,
        district: "Khlong San",
        points: [
          { lat: 13.7199, lng: 100.5012 },
          { lat: 13.7219, lng: 100.5073 },
          { lat: 13.7242, lng: 100.5130 },
        ],
      },
      {
        id: "taksin-bridge-approach",
        kind: "bridge",
        width: widthByKind.bridge,
        district: "Khlong San",
        points: [
          { lat: 13.7186, lng: 100.5108 },
          { lat: 13.7200, lng: 100.5138 },
          { lat: 13.7212, lng: 100.5173 },
        ],
      },
    ],
  },
  {
    id: "real-ari-chatuchak-00",
    districtIds: ["phaya-thai", "chatuchak"],
    center: { lat: 13.7998, lng: 100.5500 },
    roads: [
      {
        id: "phahonyothin",
        kind: "primary",
        width: widthByKind.primary,
        district: "Chatuchak",
        points: [
          { lat: 13.7850, lng: 100.5450 },
          { lat: 13.7960, lng: 100.5483 },
          { lat: 13.8075, lng: 100.5514 },
        ],
      },
      {
        id: "kamphaeng-phet-two",
        kind: "secondary",
        width: widthByKind.secondary,
        district: "Chatuchak",
        points: [
          { lat: 13.7920, lng: 100.5442 },
          { lat: 13.7998, lng: 100.5500 },
          { lat: 13.8075, lng: 100.5551 },
        ],
      },
      {
        id: "ari-local",
        kind: "residential",
        width: widthByKind.residential,
        district: "Phaya Thai",
        points: [
          { lat: 13.7790, lng: 100.5408 },
          { lat: 13.7811, lng: 100.5440 },
          { lat: 13.7835, lng: 100.5470 },
        ],
      },
    ],
  },
];

function buildTile(seed: TileSeed): RoadTile {
  const center = latLngToWorld(seed.center.lat, seed.center.lng, 1);
  const nodes: RoadTile["nodes"] = [];
  const segments: RoadTile["segments"] = [];
  const allPoints = seed.roads.flatMap((road) => road.points);
  const projected = allPoints.map((point) => latLngToWorld(point.lat, point.lng, 1));
  const minX = Math.min(center.x - TILE_SIZE_METERS / 2, ...projected.map((point) => point.x));
  const maxX = Math.max(center.x + TILE_SIZE_METERS / 2, ...projected.map((point) => point.x));
  const minZ = Math.min(center.z - TILE_SIZE_METERS / 2, ...projected.map((point) => point.z));
  const maxZ = Math.max(center.z + TILE_SIZE_METERS / 2, ...projected.map((point) => point.z));

  for (const road of seed.roads) {
    let previousNodeId: string | undefined;
    road.points.forEach((point, pointIndex) => {
      const meters = latLngToWorld(point.lat, point.lng, 1);
      const nodeId = `${seed.id}-${road.id}-n${pointIndex}`;
      nodes.push({ id: nodeId, x: meters.x, z: meters.z });
      if (previousNodeId) {
        segments.push({
          id: `${seed.id}-${road.id}-s${pointIndex - 1}`,
          from: previousNodeId,
          to: nodeId,
          width: road.width,
          district: road.district,
          kind: road.kind,
        });
      }
      previousNodeId = nodeId;
    });
  }

  return {
    id: seed.id,
    boundsLatLng: {
      south: Math.min(...allPoints.map((point) => point.lat), seed.center.lat - 0.003),
      west: Math.min(...allPoints.map((point) => point.lng), seed.center.lng - 0.003),
      north: Math.max(...allPoints.map((point) => point.lat), seed.center.lat + 0.003),
      east: Math.max(...allPoints.map((point) => point.lng), seed.center.lng + 0.003),
    },
    boundsMeters: { minX, maxX, minZ, maxZ },
    originMeters: center,
    nodes,
    segments,
    districtIds: seed.districtIds,
    loadedAt: 0,
  };
}

export const fallbackRoadTiles: RoadTile[] = seeds.map(buildTile);

export const fallbackRoadTileManifest: RoadTileManifest = {
  scaleMode: "real_1_1",
  tileSizeMeters: TILE_SIZE_METERS,
  generatedAt: GENERATED_AT,
  tiles: fallbackRoadTiles.map((tile) => ({
    id: tile.id,
    href: `/data/road-tiles/${tile.id}.json`,
    boundsLatLng: tile.boundsLatLng,
    boundsMeters: tile.boundsMeters,
    districtIds: tile.districtIds,
  })),
};
