/* Builds the Bangkok streaming map from OpenStreetMap (Overpass API).
 *
 *   npm run osm:import                                  # default central Bangkok grid
 *   npm run osm:import -- --bbox=13.70,100.47,13.82,100.58 --tile=0.006 --block=0.024
 *   npm run osm:import -- --dry-run                     # print the tile plan only
 *   npm run osm:import -- --endpoint=https://overpass.kumi.systems/api/interpreter
 *
 * Output: public/data/road-tiles/{index,areas,<tile>}.json and public/data/osm-places.json
 * Map data © OpenStreetMap contributors, available under the ODbL.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildOverpassQuery,
  convertOverpassToRoadTile,
  createImportGrid,
  dedupeById,
  extractMapAreas,
  extractOsmPlaces,
  OSM_ATTRIBUTION,
  type ImportBounds,
  type OverpassResponse,
} from "../src/data/osmImport";
import { MAP_SCALE } from "../src/data/coordinates";
import type { MapArea, PlaceSummary, RoadTileManifest } from "../src/types";

const DEFAULT_BOUNDS: ImportBounds = { south: 13.7, west: 100.47, north: 13.82, east: 100.58 };
const DEFAULT_TILE_DEGREES = 0.006;
const DEFAULT_BLOCK_DEGREES = 0.024;
const DEFAULT_ENDPOINT = "https://overpass-api.de/api/interpreter";

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function parseBounds(value?: string): ImportBounds {
  if (!value) return DEFAULT_BOUNDS;
  const [south, west, north, east] = value.split(",").map(Number);
  if ([south, west, north, east].some((part) => !Number.isFinite(part)) || south >= north || west >= east) {
    throw new Error(`Invalid --bbox=${value}; expected south,west,north,east`);
  }
  return { south, west, north, east };
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function fetchOverpass(endpoint: string, query: string): Promise<OverpassResponse> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "mosgame-bangkok-drive-importer" },
      body: new URLSearchParams({ data: query }),
    });
    if (response.ok) return (await response.json()) as OverpassResponse;
    if (response.status === 429 || response.status >= 500) {
      const wait = 5_000 * 2 ** attempt;
      console.warn(`Overpass ${response.status}; retrying in ${wait / 1000}s`);
      await sleep(wait);
      continue;
    }
    throw new Error(`Overpass failed: ${response.status} ${await response.text()}`);
  }
  throw new Error("Overpass kept failing; try a smaller --bbox or another --endpoint");
}

async function main(): Promise<void> {
  const bounds = parseBounds(argValue("bbox"));
  const tileDegrees = Number(argValue("tile") ?? DEFAULT_TILE_DEGREES);
  const endpoint = argValue("endpoint") ?? DEFAULT_ENDPOINT;
  const includeRestaurants = process.argv.includes("--with-restaurants");
  const keepRaw = process.argv.includes("--keep-raw");
  const blockDegrees = Math.max(tileDegrees, Number(argValue("block") ?? DEFAULT_BLOCK_DEGREES));
  // One Overpass request per block; each block is then cut into small streaming tiles locally.
  const blocks = createImportGrid(bounds, blockDegrees);
  const tilesPerBlock = blocks.map((block) => createImportGrid(block, tileDegrees).map((tile) => ({ ...tile, id: `${block.id}-${tile.id.slice(4)}` })));

  console.log(
    `OSM import: ${blocks.length} requests → ${tilesPerBlock.flat().length} tiles over ${JSON.stringify(bounds)} (tile ${tileDegrees}°, map scale ${MAP_SCALE}x)`,
  );
  if (process.argv.includes("--dry-run")) {
    blocks.forEach((block, index) => console.log(`${block.id} ${block.south},${block.west} → ${block.north},${block.east}: ${tilesPerBlock[index].length} tiles`));
    return;
  }

  const tileDir = resolve("public/data/road-tiles");
  const rawDir = resolve("public/data/road-chunks");
  await mkdir(tileDir, { recursive: true });
  if (keepRaw) await mkdir(rawDir, { recursive: true });

  const generatedAt = new Date().toISOString();
  const manifest: RoadTileManifest = {
    scaleMode: "real_1_1",
    tileSizeMeters: Math.round(tileDegrees * 111_320 * MAP_SCALE),
    generatedAt,
    source: "osm",
    mapScale: MAP_SCALE,
    areasHref: "/data/road-tiles/areas.json",
    placesHref: "/data/osm-places.json",
    attribution: OSM_ATTRIBUTION,
    tiles: [],
  };
  let areas: MapArea[] = [];
  let places: PlaceSummary[] = [];

  for (const [index, block] of blocks.entries()) {
    const overpass = await fetchOverpass(endpoint, buildOverpassQuery(block, { includeRestaurants }));
    if (keepRaw) await writeFile(resolve(rawDir, `${block.id}.overpass.json`), JSON.stringify(overpass));
    areas = dedupeById([...areas, ...extractMapAreas(overpass)]);
    places = dedupeById([...places, ...extractOsmPlaces(overpass, generatedAt)]);
    let segments = 0;
    let buildings = 0;
    for (const zone of tilesPerBlock[index]) {
      const tile = convertOverpassToRoadTile(overpass, zone);
      if (!tile.segments.length && !tile.buildings?.length) continue;
      segments += tile.segments.length;
      buildings += tile.buildings?.length ?? 0;
      await writeFile(resolve(tileDir, `${tile.id}.json`), JSON.stringify(tile));
      manifest.tiles.push({
        id: tile.id,
        href: `/data/road-tiles/${tile.id}.json`,
        boundsLatLng: tile.boundsLatLng,
        boundsMeters: tile.boundsMeters,
        districtIds: tile.districtIds,
      });
    }
    console.log(`[${index + 1}/${blocks.length}] ${block.id}: ${segments} road segments, ${buildings} buildings`);
    await sleep(1_500);
  }

  await writeFile(resolve(tileDir, "areas.json"), JSON.stringify({ attribution: OSM_ATTRIBUTION, generatedAt, areas }));
  await writeFile(resolve("public/data/osm-places.json"), JSON.stringify({ attribution: OSM_ATTRIBUTION, generatedAt, places }));
  await writeFile(resolve(tileDir, "index.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const temples = places.filter((place) => place.category === "temple").length;
  console.log(`Done: ${manifest.tiles.length} tiles, ${areas.length} water/park areas, ${places.length} places (${temples} temples).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
