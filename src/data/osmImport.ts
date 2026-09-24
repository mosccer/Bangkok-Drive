import type {
  MapArea,
  MapAreaKind,
  MapBuilding,
  MapBuildingKind,
  PlaceCategory,
  PlaceSummary,
  RoadChunk,
  RoadNode,
  RoadSegment,
  RoadTile,
  WorldMeters,
} from "../types";
import { bangkokDistricts } from "./bangkokDistricts";
import { distanceMetersBetweenGeo, latLngToWorld, MAP_SCALE } from "./coordinates";

export interface OsmNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

export interface OsmGeomPoint {
  lat: number;
  lon: number;
}

export interface OsmWay {
  type: "way";
  id: number;
  nodes: number[];
  geometry?: Array<OsmGeomPoint | null>;
  tags?: Record<string, string>;
}

export interface OsmRelation {
  type: "relation";
  id: number;
  tags?: Record<string, string>;
  members: Array<{ type: "node" | "way" | "relation"; ref: number; role: string; geometry?: Array<OsmGeomPoint | null> }>;
}

export interface OverpassResponse {
  elements: Array<OsmNode | OsmWay | OsmRelation>;
}

export interface RoadTileImportZone {
  id: string;
  districtIds: string[];
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface ImportBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors (ODbL)";
const ROAD_HIGHWAYS =
  "motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|service|living_street";

export function buildOverpassQuery(bounds: ImportBounds, options: { includeRestaurants?: boolean } = {}): string {
  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  return `
    [out:json][timeout:120];
    (
      way["highway"~"^(${ROAD_HIGHWAYS})$"]["service"!~"parking_aisle|driveway"]["area"!="yes"](${bbox});
      way["building"](${bbox});
      way["natural"="water"](${bbox});
      way["waterway"="riverbank"](${bbox});
      way["landuse"~"^(reservoir|basin)$"](${bbox});
      relation["natural"="water"](${bbox});
      way["leisure"~"^(park|garden)$"](${bbox});
      relation["leisure"="park"](${bbox});
      way["landuse"~"^(grass|recreation_ground|village_green)$"](${bbox});
      nwr["amenity"="place_of_worship"]["religion"="buddhist"](${bbox});
      nwr["amenity"~"^(cafe|marketplace|ice_cream${options.includeRestaurants ? "|restaurant" : ""})$"]["name"](${bbox});
      nwr["tourism"~"^(attraction|museum|viewpoint|gallery)$"]["name"](${bbox});
      nwr["shop"~"^(bakery|mall|confectionery)$"]["name"](${bbox});
      nwr["historic"~"^(monument|memorial|palace|castle|temple)$"]["name"](${bbox});
    );
    out geom;
  `;
}

export function createImportGrid(bounds: ImportBounds, tileDegrees: number): RoadTileImportZone[] {
  const zones: RoadTileImportZone[] = [];
  const rows = Math.ceil((bounds.north - bounds.south) / tileDegrees - 1e-9);
  const cols = Math.ceil((bounds.east - bounds.west) / tileDegrees - 1e-9);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const south = round6(bounds.south + row * tileDegrees);
      const west = round6(bounds.west + col * tileDegrees);
      const north = round6(Math.min(bounds.north, south + tileDegrees));
      const east = round6(Math.min(bounds.east, west + tileDegrees));
      const center = { lat: (south + north) / 2, lng: (west + east) / 2 };
      zones.push({ id: `osm-${row}-${col}`, districtIds: [nearestDistrictId(center)], south, west, north, east });
    }
  }
  return zones;
}

export function nearestDistrictId(point: { lat: number; lng: number }): string {
  let best = bangkokDistricts[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const district of bangkokDistricts) {
    const distance = distanceMetersBetweenGeo(point, district.center);
    if (distance < bestDistance) {
      best = district;
      bestDistance = distance;
    }
  }
  return best.id;
}

export function normalizeOsmRoadKind(tags: Record<string, string> = {}): RoadSegment["kind"] {
  if (tags.bridge && tags.bridge !== "no") return "bridge";
  switch ((tags.highway ?? "").replace(/_link$/, "")) {
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

export function roadWidthFromTags(tags: Record<string, string> = {}, kind = normalizeOsmRoadKind(tags)): number {
  const explicit = parseMeters(tags.width);
  if (explicit && explicit >= 3 && explicit <= 60) return explicit;
  const lanes = Number(tags.lanes);
  if (Number.isFinite(lanes) && lanes >= 1 && lanes <= 12) return Math.max(6, lanes * 3.4 + 1.5);
  return roadWidthForKind(kind);
}

export function convertOverpassToRoadChunk(input: OverpassResponse, chunkId: string, district: string): RoadChunk {
  const osmNodes = collectNodes(input);
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

// Roads keep OSM node ids for connectivity; each segment belongs to the tile containing its midpoint
// so neighbouring tiles never draw the same road twice.
export function convertOverpassToRoadTile(input: OverpassResponse, zone: RoadTileImportZone, loadedAt = 0): RoadTile {
  const osmNodes = collectNodes(input);
  const nodes: RoadNode[] = [];
  const segments: RoadSegment[] = [];
  const nodeIndex = new Map<string, string>();
  const districtName = bangkokDistricts.find((district) => district.id === zone.districtIds[0])?.nameEn ?? zone.districtIds[0] ?? "Bangkok";

  const getRoadNode = (key: string, point: OsmGeomPoint): string => {
    const existing = nodeIndex.get(key);
    if (existing) return existing;
    const meters = latLngToWorld(point.lat, point.lon);
    const id = `${zone.id}-n${nodeIndex.size}`;
    nodes.push({ id, x: round1(meters.x), z: round1(meters.z) });
    nodeIndex.set(key, id);
    return id;
  };

  for (const element of input.elements) {
    if (element.type !== "way" || !element.tags?.highway || element.tags.building) continue;
    const kind = normalizeOsmRoadKind(element.tags);
    const width = roadWidthFromTags(element.tags, kind);
    const points = wayPoints(element, osmNodes);
    for (let index = 0; index < points.length - 1; index += 1) {
      const a = points[index];
      const b = points[index + 1];
      if (!a || !b) continue;
      if (!insideZone({ lat: (a.point.lat + b.point.lat) / 2, lon: (a.point.lon + b.point.lon) / 2 }, zone)) continue;
      const from = getRoadNode(a.key, a.point);
      const to = getRoadNode(b.key, b.point);
      if (from === to) continue;
      segments.push({
        id: `${zone.id}-r${segments.length}`,
        from,
        to,
        width,
        district: districtName,
        kind,
        ...(element.tags.name ? { name: element.tags.name } : {}),
      });
    }
  }

  const buildings = extractBuildings(input, zone, osmNodes);
  const southWest = latLngToWorld(zone.south, zone.west);
  const northEast = latLngToWorld(zone.north, zone.east);
  const originMeters = latLngToWorld((zone.south + zone.north) / 2, (zone.west + zone.east) / 2);

  return {
    id: zone.id,
    boundsLatLng: { south: zone.south, west: zone.west, north: zone.north, east: zone.east },
    boundsMeters: {
      minX: Math.min(southWest.x, northEast.x),
      maxX: Math.max(southWest.x, northEast.x),
      minZ: Math.min(southWest.z, northEast.z),
      maxZ: Math.max(southWest.z, northEast.z),
    },
    originMeters: { x: round1(originMeters.x), z: round1(originMeters.z) },
    nodes,
    segments,
    ...(buildings.length ? { buildings } : {}),
    districtIds: zone.districtIds,
    loadedAt,
  };
}

export function buildingHeightMeters(tags: Record<string, string> = {}, id = 0): number {
  const explicit = parseMeters(tags.height);
  if (explicit && explicit > 2 && explicit < 400) return explicit;
  const levels = Number(tags["building:levels"]);
  if (Number.isFinite(levels) && levels > 0 && levels < 120) return levels * 3.2 + 1;
  const jitter = hashNumber(id);
  switch (buildingKind(tags)) {
    case "temple":
      return 14;
    case "commercial":
      return 14 + (jitter % 22);
    case "residential":
      return tags.building === "apartments" ? 22 + (jitter % 30) : 7 + (jitter % 5);
    case "industrial":
      return 9 + (jitter % 4);
    case "civic":
      return 12 + (jitter % 10);
    default:
      return 6 + (jitter % 14);
  }
}

export function buildingKind(tags: Record<string, string> = {}): MapBuildingKind {
  const building = tags.building ?? "";
  if (building === "temple" || building === "religious" || building === "monastery" || tags.amenity === "place_of_worship") return "temple";
  if (["commercial", "retail", "office", "hotel", "supermarket", "mall"].includes(building) || tags.shop) return "commercial";
  if (["apartments", "residential", "house", "detached", "terrace", "dormitory", "semidetached_house"].includes(building)) return "residential";
  if (["industrial", "warehouse", "factory"].includes(building)) return "industrial";
  if (["public", "government", "school", "university", "hospital", "train_station", "civic"].includes(building)) return "civic";
  return "generic";
}

export function extractBuildings(input: OverpassResponse, zone: RoadTileImportZone, osmNodes = collectNodes(input)): MapBuilding[] {
  const buildings: MapBuilding[] = [];
  for (const element of input.elements) {
    if (element.type !== "way" || !element.tags?.building || element.tags.building === "no") continue;
    const ring = cleanRing(wayPoints(element, osmNodes).flatMap((entry) => (entry ? [entry.point] : [])));
    if (ring.length < 3) continue;
    const center = ringCentroid(ring);
    if (!insideZone(center, zone)) continue;
    const footprint = ring.map((point) => roundedWorld(point));
    if (Math.abs(polygonArea(footprint)) < 12 * MAP_SCALE * MAP_SCALE) continue;
    buildings.push({
      id: `osm-w${element.id}`,
      footprint,
      heightMeters: Math.round(buildingHeightMeters(element.tags, element.id) * 10) / 10,
      kind: buildingKind(element.tags),
      ...(element.tags.name ? { name: element.tags.name } : {}),
    });
  }
  return buildings;
}

export function areaKindForTags(tags: Record<string, string> = {}): MapAreaKind | undefined {
  if (tags.natural === "water" || tags.waterway === "riverbank" || tags.landuse === "reservoir" || tags.landuse === "basin") return "water";
  if (tags.leisure === "park" || tags.leisure === "garden" || ["grass", "recreation_ground", "village_green"].includes(tags.landuse ?? "")) return "park";
  if (tags.amenity === "place_of_worship" && tags.religion === "buddhist") return "temple_ground";
  return undefined;
}

export function extractMapAreas(input: OverpassResponse, simplifyMeters = 1.5): MapArea[] {
  const osmNodes = collectNodes(input);
  const areas: MapArea[] = [];
  const toArea = (id: string, kind: MapAreaKind, outer: OsmGeomPoint[], holes: OsmGeomPoint[][], name?: string) => {
    const outerWorld = simplifyRing(outer.map(roundedWorld), simplifyMeters * MAP_SCALE);
    if (outerWorld.length < 3) return;
    const holesWorld = holes.map((hole) => simplifyRing(hole.map(roundedWorld), simplifyMeters * MAP_SCALE)).filter((hole) => hole.length >= 3);
    areas.push({ id, kind, outer: outerWorld, ...(holesWorld.length ? { holes: holesWorld } : {}), ...(name ? { name } : {}) });
  };

  for (const element of input.elements) {
    if (element.type === "way") {
      const kind = areaKindForTags(element.tags);
      if (!kind || element.tags?.building) continue;
      const ring = cleanRing(wayPoints(element, osmNodes).flatMap((entry) => (entry ? [entry.point] : [])));
      if (ring.length >= 3 && isClosedWay(element)) toArea(`osm-w${element.id}`, kind, ring, [], element.tags?.name);
    } else if (element.type === "relation") {
      const kind = areaKindForTags(element.tags);
      if (!kind) continue;
      const lines = (role: string) =>
        element.members
          .filter((member) => member.type === "way" && (member.role || "outer") === role && member.geometry?.length)
          .map((member) => (member.geometry ?? []).filter((point): point is OsmGeomPoint => Boolean(point)));
      const outers = assembleRings(lines("outer"));
      const inners = assembleRings(lines("inner"));
      outers.forEach((outer, index) => {
        const holes = inners.filter((inner) => pointInRing(inner[0], outer));
        toArea(`osm-r${element.id}-${index}`, kind, outer, holes, element.tags?.name);
      });
    }
  }
  return areas;
}

// Joins open ways that share endpoints into closed rings (multipolygon members are often split).
export function assembleRings(lines: OsmGeomPoint[][]): OsmGeomPoint[][] {
  const pending = lines.filter((line) => line.length >= 2).map((line) => [...line]);
  const rings: OsmGeomPoint[][] = [];
  const same = (a: OsmGeomPoint, b: OsmGeomPoint) => Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lon - b.lon) < 1e-7;
  while (pending.length) {
    const ring = pending.shift()!;
    let extended = true;
    while (!same(ring[0], ring[ring.length - 1]) && extended) {
      extended = false;
      for (let i = 0; i < pending.length; i += 1) {
        const candidate = pending[i];
        const tail = ring[ring.length - 1];
        if (same(candidate[0], tail)) {
          ring.push(...candidate.slice(1));
        } else if (same(candidate[candidate.length - 1], tail)) {
          ring.push(...[...candidate].reverse().slice(1));
        } else {
          continue;
        }
        pending.splice(i, 1);
        extended = true;
        break;
      }
    }
    if (same(ring[0], ring[ring.length - 1]) && ring.length >= 4) {
      rings.push(ring.slice(0, -1));
    }
  }
  return rings;
}

export function placeCategoryForTags(tags: Record<string, string> = {}): PlaceCategory | undefined {
  if (tags.amenity === "place_of_worship" && tags.religion === "buddhist") return "temple";
  if (tags.historic === "temple") return "temple";
  if (tags.amenity === "cafe") return "cafe";
  if (tags.shop === "bakery") return "bakery";
  if (tags.amenity === "ice_cream" || tags.shop === "confectionery") return "dessert";
  if (tags.tourism === "museum") return "museum";
  if (tags.shop === "mall") return "shopping_mall";
  if (tags.amenity === "marketplace") return /night|ไนท์|กลางคืน/i.test(`${tags.name ?? ""} ${tags["name:en"] ?? ""}`) ? "night_market" : "market";
  if (tags.amenity === "restaurant") return "restaurant";
  if (tags.leisure === "park") return "park";
  if (tags.tourism || tags.historic) return "tourist_attraction";
  return undefined;
}

export function extractOsmPlaces(input: OverpassResponse, updatedAt = new Date().toISOString()): PlaceSummary[] {
  const osmNodes = collectNodes(input);
  const places: PlaceSummary[] = [];
  for (const element of input.elements) {
    const tags = element.tags ?? {};
    const category = placeCategoryForTags(tags);
    const name = tags["name:th"] ?? tags.name;
    if (!category || !name) continue;
    let center: OsmGeomPoint | undefined;
    if (element.type === "node") {
      center = { lat: element.lat, lon: element.lon };
    } else if (element.type === "way") {
      const ring = wayPoints(element, osmNodes).flatMap((entry) => (entry ? [entry.point] : []));
      center = ring.length ? ringCentroid(ring) : undefined;
    } else {
      const outer = element.members.flatMap((member) => (member.role === "outer" ? (member.geometry ?? []) : [])).filter((point): point is OsmGeomPoint => Boolean(point));
      center = outer.length ? ringCentroid(outer) : undefined;
    }
    if (!center) continue;
    const districtId = nearestDistrictId({ lat: center.lat, lng: center.lon });
    const district = bangkokDistricts.find((candidate) => candidate.id === districtId)!;
    const nameEn = tags["name:en"] ?? (/[a-z]/i.test(tags.name ?? "") ? tags.name : undefined);
    places.push({
      id: `osm-${element.type[0]}${element.id}`,
      source: "osm",
      name: nameEn ?? name,
      nameTh: tags["name:th"] ?? (/[฀-๿]/.test(tags.name ?? "") ? tags.name! : name),
      ...(nameEn ? { nameEn } : {}),
      category,
      lat: round6(center.lat),
      lng: round6(center.lon),
      district: district.nameEn,
      districtId,
      districtName: district.nameEn,
      googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${nameEn ?? name} ${round6(center.lat)},${round6(center.lon)}`)}`,
      curatedPriority: tags.wikidata || tags.wikipedia ? 40 : 10,
      attributionRequired: false,
      updatedAt,
      tags: ["osm", category, ...(tags.wikidata ? ["notable"] : []), ...(category === "temple" ? ["temple", "tour"] : [])],
    });
  }
  return places;
}

export function dedupeById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function collectNodes(input: OverpassResponse): Map<number, OsmNode> {
  const nodes = new Map<number, OsmNode>();
  for (const element of input.elements) {
    if (element.type === "node") nodes.set(element.id, element);
  }
  return nodes;
}

function wayPoints(way: OsmWay, osmNodes: Map<number, OsmNode>): Array<{ key: string; point: OsmGeomPoint } | undefined> {
  return way.nodes.map((nodeId, index) => {
    const geometry = way.geometry?.[index];
    if (geometry) return { key: `n${nodeId}`, point: geometry };
    const node = osmNodes.get(nodeId);
    return node ? { key: `n${nodeId}`, point: { lat: node.lat, lon: node.lon } } : undefined;
  });
}

function isClosedWay(way: OsmWay): boolean {
  return way.nodes.length >= 4 && way.nodes[0] === way.nodes[way.nodes.length - 1];
}

function cleanRing(points: OsmGeomPoint[]): OsmGeomPoint[] {
  const ring = [...points];
  if (ring.length > 1 && ring[0].lat === ring[ring.length - 1].lat && ring[0].lon === ring[ring.length - 1].lon) ring.pop();
  return ring;
}

function insideZone(point: OsmGeomPoint, zone: ImportBounds): boolean {
  return point.lat >= zone.south && point.lat < zone.north && point.lon >= zone.west && point.lon < zone.east;
}

function ringCentroid(points: OsmGeomPoint[]): OsmGeomPoint {
  const sum = points.reduce((acc, point) => ({ lat: acc.lat + point.lat, lon: acc.lon + point.lon }), { lat: 0, lon: 0 });
  return { lat: sum.lat / points.length, lon: sum.lon / points.length };
}

function pointInRing(point: OsmGeomPoint, ring: OsmGeomPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (a.lat > point.lat !== b.lat > point.lat && point.lon < ((b.lon - a.lon) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lon) {
      inside = !inside;
    }
  }
  return inside;
}

export function polygonArea(points: WorldMeters[]): number {
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    area += (points[j].x + points[i].x) * (points[j].z - points[i].z);
  }
  return area / 2;
}

// Douglas-Peucker on a closed ring; keeps at least a triangle.
export function simplifyRing(points: WorldMeters[], tolerance: number): WorldMeters[] {
  if (points.length <= 4 || tolerance <= 0) return points;
  const simplified = simplifyLine([...points, points[0]], tolerance);
  simplified.pop();
  return simplified.length >= 3 ? simplified : points;
}

function simplifyLine(points: WorldMeters[], tolerance: number): WorldMeters[] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDistance = 0;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const distance = pointSegmentDistance(points[i], points[start], points[end]);
      if (distance > maxDistance) {
        maxDistance = distance;
        index = i;
      }
    }
    if (index >= 0 && maxDistance > tolerance) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function pointSegmentDistance(point: WorldMeters, a: WorldMeters, b: WorldMeters): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared)) : 0;
  return Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t));
}

function roundedWorld(point: OsmGeomPoint): WorldMeters {
  const world = latLngToWorld(point.lat, point.lon);
  return { x: round1(world.x), z: round1(world.z) };
}

function parseMeters(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseFloat(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function hashNumber(value: number): number {
  let hash = value | 0;
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
