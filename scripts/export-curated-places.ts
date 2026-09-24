/* Regenerates public/data/places.json (served by /api/places) from src/data/curatedPlaces.ts.
 *   npm run places:export-curated
 */
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { curatedPlaces } from "../src/data/curatedPlaces";
import type { PlaceSummary } from "../src/types";

const KEY_ORDER: Array<keyof PlaceSummary> = [
  "id",
  "source",
  "name",
  "nameTh",
  "nameEn",
  "category",
  "lat",
  "lng",
  "district",
  "districtId",
  "districtName",
  "rating",
  "userRatingCount",
  "googleMapsUri",
  "curatedPriority",
  "attributionRequired",
  "updatedAt",
  "tags",
];

export function serializeCuratedPlaces(places: PlaceSummary[]): string {
  const lines = places.map((place) => {
    const ordered: Record<string, unknown> = {};
    for (const key of KEY_ORDER) {
      if (place[key] !== undefined) ordered[key] = place[key];
    }
    return `  ${JSON.stringify(ordered)}`;
  });
  return `[\n${lines.join(",\n")}\n]\n`;
}

async function main(): Promise<void> {
  const target = resolve("public/data/places.json");
  await writeFile(target, serializeCuratedPlaces(curatedPlaces));
  console.log(`Wrote ${curatedPlaces.length} curated places to ${target}`);
}

if (process.argv[1]?.endsWith("export-curated-places.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
