import type { RoadTile, RoadTileManifest } from "../types";
import { cityRoadTileManifest, cityTileAtGeo, generateCityTile } from "./proceduralCity";

// Without imported OpenStreetMap tiles the game streams the procedural city (`proceduralCity.ts`):
// hand-traced main roads from `bangkokArteries.ts` plus a generated street grid and buildings.
export function fallbackRoadTileManifest(): RoadTileManifest {
  return cityRoadTileManifest();
}

export function loadFallbackTile(id: string): RoadTile | undefined {
  return generateCityTile(id);
}

export function fallbackTileAt(lat: number, lng: number): RoadTile {
  const tile = cityTileAtGeo({ lat, lng });
  if (!tile) throw new Error(`No fallback tile at ${lat},${lng}`);
  return tile;
}
