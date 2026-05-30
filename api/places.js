/* global process */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export default async function handler(_request, response) {
  const cachePath = resolve(process.cwd(), "public/data/places.json");
  const places = JSON.parse(await readFile(cachePath, "utf8"));
  response.setHeader("cache-control", "s-maxage=120, stale-while-revalidate=600");
  response.status(200).json(places);
}
