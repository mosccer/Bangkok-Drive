import type { RoadChunk, RoadNode, RoadSegment } from "../types";

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
