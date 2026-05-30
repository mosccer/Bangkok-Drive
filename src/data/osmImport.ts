import type { RoadChunk, RoadNode, RoadSegment, RoadTile } from "../types";
import { latLngToWorld } from "./coordinates";

export interface OsmNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
}

export interface OsmWay {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  elements: Array<OsmNode | OsmWay>;
}

export interface RoadTileImportZone {
  id: string;
  districtIds: string[];
  south: number;
  west: number;
  north: number;
  east: number;
}

export function normalizeOsmRoadKind(tags: Record<string, string> = {}): RoadSegment["kind"] {
  if (tags.bridge) return "bridge";
  switch (tags.highway) {
    case "motorway":
    case "trunk":
      return "motorway";
    case "primary":
      return "primary";
    case "secondary":
      return "secondary";
    case "tertiary":
      return "tertiary";
    case "residential":
    case "unclassified":
      return "residential";
    case "service":
      return "service";
    case "living_street":
    case "footway":
    case "path":
      return "alley";
    default:
      return "street";
  }
}

export function roadWidthForKind(kind: RoadSegment["kind"]): number {
  switch (kind) {
    case "motorway":
      return 24;
    case "primary":
    case "arterial":
      return 18;
    case "secondary":
    case "bridge":
      return 16;
    case "tertiary":
      return 14;
    case "residential":
    case "street":
      return 10;
    case "service":
      return 8;
    case "alley":
      return 7;
  }
}

export function convertOverpassToRoadChunk(input: OverpassResponse, chunkId: string, district: string): RoadChunk {
  const osmNodes = new Map<number, OsmNode>();
  for (const element of input.elements) {
    if (element.type === "node") {
      osmNodes.set(element.id, element);
    }
  }

  const nodes: RoadNode[] = [];
  const segments: RoadSegment[] = [];
  const nodeIndex = new Map<number, string>();
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  const origin = [...osmNodes.values()][0];

  if (!origin) {
    return { id: chunkId, district, bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, nodes, segments, landmarks: [] };
  }

  const project = (nodeValue: OsmNode) => {
    const x = (nodeValue.lon - origin.lon) * 9800;
    const z = -(nodeValue.lat - origin.lat) * 11100;
    return { x, z };
  };

  const getRoadNode = (osmId: number): string | undefined => {
    const existing = nodeIndex.get(osmId);
    if (existing) return existing;
    const osmNode = osmNodes.get(osmId);
    if (!osmNode) return undefined;
    const id = `${chunkId}-n${nodeIndex.size}`;
    const projected = project(osmNode);
    nodes.push({ id, x: projected.x, z: projected.z });
    nodeIndex.set(osmId, id);
    minX = Math.min(minX, projected.x);
    maxX = Math.max(maxX, projected.x);
    minZ = Math.min(minZ, projected.z);
    maxZ = Math.max(maxZ, projected.z);
    return id;
  };

  for (const element of input.elements) {
    if (element.type !== "way") continue;
    for (let index = 0; index < element.nodes.length - 1; index += 1) {
      const from = getRoadNode(element.nodes[index]);
      const to = getRoadNode(element.nodes[index + 1]);
      if (!from || !to) continue;
      segments.push({
        id: `${chunkId}-r${segments.length}`,
        from,
        to,
        width: element.tags?.highway === "primary" ? 18 : 12,
        district,
        kind: element.tags?.bridge ? "bridge" : element.tags?.highway === "primary" ? "arterial" : "street",
      });
    }
  }

  return {
    id: chunkId,
    district,
    bounds: { minX, maxX, minZ, maxZ },
    nodes,
    segments,
    landmarks: [],
  };
}

export function convertOverpassToRoadTile(input: OverpassResponse, zone: RoadTileImportZone, loadedAt = 0): RoadTile {
  const osmNodes = new Map<number, OsmNode>();
  for (const element of input.elements) {
    if (element.type === "node") {
      osmNodes.set(element.id, element);
    }
  }

  const nodes: RoadNode[] = [];
  const segments: RoadSegment[] = [];
  const nodeIndex = new Map<number, string>();
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  const getRoadNode = (osmId: number): string | undefined => {
    const existing = nodeIndex.get(osmId);
    if (existing) return existing;
    const osmNode = osmNodes.get(osmId);
    if (!osmNode) return undefined;
    const meters = latLngToWorld(osmNode.lat, osmNode.lon, 1);
    const id = `${zone.id}-n${nodeIndex.size}`;
    nodes.push({ id, x: meters.x, z: meters.z });
    nodeIndex.set(osmId, id);
    minX = Math.min(minX, meters.x);
    maxX = Math.max(maxX, meters.x);
    minZ = Math.min(minZ, meters.z);
    maxZ = Math.max(maxZ, meters.z);
    return id;
  };

  for (const element of input.elements) {
    if (element.type !== "way") continue;
    const kind = normalizeOsmRoadKind(element.tags);
    for (let index = 0; index < element.nodes.length - 1; index += 1) {
      const from = getRoadNode(element.nodes[index]);
      const to = getRoadNode(element.nodes[index + 1]);
      if (!from || !to) continue;
      segments.push({
        id: `${zone.id}-r${segments.length}`,
        from,
        to,
        width: roadWidthForKind(kind),
        district: zone.districtIds[0] ?? "Bangkok",
        kind,
      });
    }
  }

  const southWest = latLngToWorld(zone.south, zone.west, 1);
  const northEast = latLngToWorld(zone.north, zone.east, 1);
  const originMeters = latLngToWorld((zone.south + zone.north) / 2, (zone.west + zone.east) / 2, 1);

  return {
    id: zone.id,
    boundsLatLng: { south: zone.south, west: zone.west, north: zone.north, east: zone.east },
    boundsMeters: {
      minX: Number.isFinite(minX) ? minX : Math.min(southWest.x, northEast.x),
      maxX: Number.isFinite(maxX) ? maxX : Math.max(southWest.x, northEast.x),
      minZ: Number.isFinite(minZ) ? minZ : Math.min(southWest.z, northEast.z),
      maxZ: Number.isFinite(maxZ) ? maxZ : Math.max(southWest.z, northEast.z),
    },
    originMeters,
    nodes,
    segments,
    districtIds: zone.districtIds,
    loadedAt,
  };
}
