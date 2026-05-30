/* global console, fetch, process, URLSearchParams */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const tileSizeMeters = 512;
const zones = [
  { id: "real-phra-nakhon-00", districtIds: ["phra-nakhon"], south: 13.744, west: 100.485, north: 13.765, east: 100.505 },
  { id: "real-yaowarat-00", districtIds: ["samphanthawong"], south: 13.731, west: 100.498, north: 13.748, east: 100.517 },
  { id: "real-siam-00", districtIds: ["pathum-wan", "ratchathewi"], south: 13.735, west: 100.524, north: 13.757, east: 100.546 },
  { id: "real-sathorn-silom-00", districtIds: ["sathon", "bang-rak"], south: 13.716, west: 100.520, north: 13.730, east: 100.548 },
  { id: "real-khlong-san-00", districtIds: ["khlong-san", "thon-buri"], south: 13.710, west: 100.498, north: 13.738, east: 100.518 },
  { id: "real-ari-chatuchak-00", districtIds: ["phaya-thai", "chatuchak"], south: 13.775, west: 100.532, north: 13.815, east: 100.565 },
];

function overpassQuery(zone) {
  return `
    [out:json][timeout:25];
    (
      way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|living_street)$"](${zone.south},${zone.west},${zone.north},${zone.east});
    );
    (._;>;);
    out body;
  `;
}

const metersPerLatDegree = 111_320;
const origin = { lat: 13.7563, lng: 100.5018 };

function latLngToWorld(lat, lng) {
  const latMeters = (lat - origin.lat) * metersPerLatDegree;
  const lngMeters = (lng - origin.lng) * metersPerLatDegree * Math.cos((origin.lat * Math.PI) / 180);
  return { x: lngMeters, z: -latMeters };
}

function normalizeKind(tags = {}) {
  if (tags.bridge) return "bridge";
  if (tags.highway === "motorway" || tags.highway === "trunk") return "motorway";
  if (["primary", "secondary", "tertiary", "residential", "service"].includes(tags.highway)) return tags.highway;
  if (tags.highway === "living_street") return "alley";
  return "street";
}

function widthForKind(kind) {
  return { motorway: 24, primary: 18, secondary: 16, tertiary: 14, residential: 10, service: 8, bridge: 16, alley: 7, street: 10 }[kind] ?? 10;
}

function convertOverpassToRoadTile(overpass, zone) {
  const osmNodes = new Map();
  for (const element of overpass.elements ?? []) {
    if (element.type === "node") osmNodes.set(element.id, element);
  }

  const nodes = [];
  const segments = [];
  const nodeIndex = new Map();
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  const getNode = (osmId) => {
    if (nodeIndex.has(osmId)) return nodeIndex.get(osmId);
    const osmNode = osmNodes.get(osmId);
    if (!osmNode) return undefined;
    const meters = latLngToWorld(osmNode.lat, osmNode.lon);
    const id = `${zone.id}-n${nodeIndex.size}`;
    nodes.push({ id, x: meters.x, z: meters.z });
    nodeIndex.set(osmId, id);
    minX = Math.min(minX, meters.x);
    maxX = Math.max(maxX, meters.x);
    minZ = Math.min(minZ, meters.z);
    maxZ = Math.max(maxZ, meters.z);
    return id;
  };

  for (const element of overpass.elements ?? []) {
    if (element.type !== "way") continue;
    const kind = normalizeKind(element.tags);
    for (let index = 0; index < element.nodes.length - 1; index += 1) {
      const from = getNode(element.nodes[index]);
      const to = getNode(element.nodes[index + 1]);
      if (!from || !to) continue;
      segments.push({
        id: `${zone.id}-r${segments.length}`,
        from,
        to,
        width: widthForKind(kind),
        district: zone.districtIds[0],
        kind,
      });
    }
  }

  const sw = latLngToWorld(zone.south, zone.west);
  const ne = latLngToWorld(zone.north, zone.east);
  const originMeters = latLngToWorld((zone.south + zone.north) / 2, (zone.west + zone.east) / 2);
  return {
    id: zone.id,
    boundsLatLng: { south: zone.south, west: zone.west, north: zone.north, east: zone.east },
    boundsMeters: {
      minX: Number.isFinite(minX) ? minX : Math.min(sw.x, ne.x),
      maxX: Number.isFinite(maxX) ? maxX : Math.max(sw.x, ne.x),
      minZ: Number.isFinite(minZ) ? minZ : Math.min(sw.z, ne.z),
      maxZ: Number.isFinite(maxZ) ? maxZ : Math.max(sw.z, ne.z),
    },
    originMeters,
    nodes,
    segments,
    districtIds: zone.districtIds,
    loadedAt: 0,
  };
}

async function main() {
  const rawDir = resolve("public/data/road-chunks");
  const tileDir = resolve("public/data/road-tiles");
  await mkdir(rawDir, { recursive: true });
  await mkdir(tileDir, { recursive: true });

  const manifest = {
    scaleMode: "real_1_1",
    tileSizeMeters,
    generatedAt: new Date().toISOString(),
    tiles: [],
  };

  for (const zone of zones) {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: overpassQuery(zone) }),
    });
    if (!response.ok) {
      throw new Error(`Overpass failed for ${zone.id}: ${response.status}`);
    }
    const overpass = await response.json();
    await writeFile(resolve(rawDir, `${zone.id}.overpass.json`), JSON.stringify({ zone, overpass }, null, 2));
    const tile = convertOverpassToRoadTile(overpass, zone);
    await writeFile(resolve(tileDir, `${tile.id}.json`), `${JSON.stringify(tile, null, 2)}\n`);
    manifest.tiles.push({
      id: tile.id,
      href: `/data/road-tiles/${tile.id}.json`,
      boundsLatLng: tile.boundsLatLng,
      boundsMeters: tile.boundsMeters,
      districtIds: tile.districtIds,
    });
    console.log(`wrote ${zone.id} (${tile.segments.length} road segments)`);
  }

  await writeFile(resolve(tileDir, "index.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

if (process.argv[1]?.endsWith("import-osm-road-chunks.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
