import type { PlaceCategory } from "../types";
import { bangkokDistricts } from "../data/bangkokDistricts";

export const GOOGLE_NEARBY_PLACE_TYPES = [
  "tourist_attraction",
  "restaurant",
  "cafe",
  "bakery",
  "museum",
  "shopping_mall",
  "park",
] as const satisfies PlaceCategory[];

export const GOOGLE_TEXT_PLACE_TYPES = ["temple", "street_food", "night_market", "dessert", "market"] as const satisfies PlaceCategory[];

export const GOOGLE_PLACE_TYPES: PlaceCategory[] = [...GOOGLE_NEARBY_PLACE_TYPES, ...GOOGLE_TEXT_PLACE_TYPES];

export interface GooglePlacesImportCell {
  lat: number;
  lng: number;
  radiusMeters: number;
  type: PlaceCategory;
  districtId: string;
  query?: string;
}

export function buildBangkokImportGrid(): GooglePlacesImportCell[] {
  const cells: GooglePlacesImportCell[] = [];

  for (const district of bangkokDistricts) {
    for (const type of GOOGLE_NEARBY_PLACE_TYPES) {
      cells.push({ ...district.center, radiusMeters: 3200, type, districtId: district.id });
    }

    const districtName = `${district.nameTh} ${district.nameEn}`;
    const textQueries: Record<(typeof GOOGLE_TEXT_PLACE_TYPES)[number], string> = {
      temple: `วัด เขต${district.nameTh} กรุงเทพ`,
      street_food: `street food ${districtName} Bangkok`,
      night_market: `night market ${districtName} Bangkok`,
      dessert: `dessert cafe ${districtName} Bangkok`,
      market: `market ${districtName} Bangkok`,
    };

    for (const type of GOOGLE_TEXT_PLACE_TYPES) {
      cells.push({ ...district.center, radiusMeters: 3200, type, districtId: district.id, query: textQueries[type] });
    }
  }

  return cells;
}
