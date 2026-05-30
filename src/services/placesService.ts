import type { PlaceDetail, PlaceSummary } from "../types";

export interface PlacesService {
  listSummaries(): Promise<PlaceSummary[]>;
  getDetail(placeId: string): Promise<PlaceDetail | undefined>;
}

export class CachedPlacesService implements PlacesService {
  constructor(private readonly places: PlaceSummary[]) {}

  async listSummaries(): Promise<PlaceSummary[]> {
    return this.places;
  }

  async getDetail(placeId: string): Promise<PlaceDetail | undefined> {
    const place = this.places.find((candidate) => candidate.id === placeId || candidate.googlePlaceId === placeId);
    if (!place) {
      return undefined;
    }

    return {
      ...place,
      openingHours: ["Google Places details can populate live opening hours when an API key is configured."],
      photos: [],
      websiteUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`,
      googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`,
      description:
        "ครอบคลุมพื้นที่กรุงเทพจาก Google Places ตามหมวดที่รองรับ ข้อมูลตัวอย่างนี้ใช้ได้แม้ยังไม่ได้ตั้งค่า API key",
    };
  }
}

export class GooglePlacesProxyService implements PlacesService {
  constructor(
    private readonly endpoint: string,
    private readonly fallback: PlacesService,
  ) {}

  async listSummaries(): Promise<PlaceSummary[]> {
    try {
      const response = await fetch(`${this.endpoint}/places`);
      if (!response.ok) throw new Error(`Places request failed: ${response.status}`);
      return (await response.json()) as PlaceSummary[];
    } catch {
      return this.fallback.listSummaries();
    }
  }

  async getDetail(placeId: string): Promise<PlaceDetail | undefined> {
    try {
      const response = await fetch(`${this.endpoint}/places/${encodeURIComponent(placeId)}`);
      if (!response.ok) throw new Error(`Place detail request failed: ${response.status}`);
      return (await response.json()) as PlaceDetail;
    } catch {
      return this.fallback.getDetail(placeId);
    }
  }
}
