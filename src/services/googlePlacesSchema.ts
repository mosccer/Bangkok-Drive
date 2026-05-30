import type { PlaceCategory } from "../types";

export const GOOGLE_PLACE_TYPES: PlaceCategory[] = [
  "tourist_attraction",
  "restaurant",
  "cafe",
  "museum",
  "temple",
  "shopping_mall",
  "park",
];

export interface GooglePlacesImportCell {
  lat: number;
  lng: number;
  radiusMeters: number;
  type: PlaceCategory;
}

export function buildBangkokImportGrid(): GooglePlacesImportCell[] {
  const north = 13.955;
  const south = 13.49;
  const west = 100.32;
  const east = 100.94;
  const rows = 5;
  const cols = 6;
  const cells: GooglePlacesImportCell[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const lat = south + ((north - south) * (row + 0.5)) / rows;
      const lng = west + ((east - west) * (col + 0.5)) / cols;
      for (const type of GOOGLE_PLACE_TYPES) {
        cells.push({ lat, lng, radiusMeters: 4500, type });
      }
    }
  }

  return cells;
}
