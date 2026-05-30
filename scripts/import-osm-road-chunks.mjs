/* global console, fetch, process, URLSearchParams */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const zones = [
  { id: "siam", district: "Pathum Wan", south: 13.735, west: 100.524, north: 13.757, east: 100.546 },
  { id: "yaowarat", district: "Samphanthawong", south: 13.731, west: 100.498, north: 13.748, east: 100.517 },
  { id: "phra-nakhon", district: "Phra Nakhon", south: 13.744, west: 100.485, north: 13.765, east: 100.505 },
  { id: "ari-chatuchak", district: "Ari / Chatuchak", south: 13.775, west: 100.532, north: 13.815, east: 100.565 },
  { id: "thonburi", district: "Thonburi / Khlong San", south: 13.71, west: 100.49, north: 13.738, east: 100.515 },
];

function overpassQuery(zone) {
  return `
    [out:json][timeout:25];
    (
      way["highway"~"^(primary|secondary|tertiary|residential|service)$"](${zone.south},${zone.west},${zone.north},${zone.east});
    );
    (._;>;);
    out body;
  `;
}

async function main() {
  const outDir = resolve("public/data/road-chunks");
  await mkdir(outDir, { recursive: true });
  for (const zone of zones) {
    const response = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: overpassQuery(zone) }),
    });
    if (!response.ok) {
      throw new Error(`Overpass failed for ${zone.id}: ${response.status}`);
    }
    const json = await response.json();
    await writeFile(resolve(outDir, `${zone.id}.overpass.json`), JSON.stringify({ zone, overpass: json }, null, 2));
    console.log(`wrote ${zone.id}`);
  }
}

if (process.argv[1]?.endsWith("import-osm-road-chunks.mjs")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
