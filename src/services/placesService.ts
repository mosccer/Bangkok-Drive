import type { PlaceDetail, PlaceListResponse, PlaceQuery, PlaceSummary } from "../types";
import { queryPlaces } from "../simulation/placeQueries";
import { createCachedPlaceDetail } from "./placeNormalization";

export interface PlacesService {
  listSummaries(query?: PlaceQuery): Promise<PlaceListResponse>;
  getDetail(placeId: string, lang?: "th" | "en"): Promise<PlaceDetail | undefined>;
}

export class CachedPlacesService implements PlacesService {
  constructor(private readonly places: PlaceSummary[]) {}

  async listSummaries(query: PlaceQuery = {}): Promise<PlaceListResponse> {
    return queryPlaces(this.places, query);
  }

  async getDetail(placeId: string, lang: "th" | "en" = "th"): Promise<PlaceDetail | undefined> {
    const place = this.places.find((candidate) => candidate.id === placeId || candidate.googlePlaceId === placeId);
    return place ? createCachedPlaceDetail(place, lang) : undefined;
  }
}

export class GooglePlacesProxyService implements PlacesService {
  constructor(
    private readonly endpoint: string,
    private readonly fallback: PlacesService,
  ) {}

  async listSummaries(query: PlaceQuery = {}): Promise<PlaceListResponse> {
    try {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) params.set(key, String(value));
      }

      const response = await fetch(`${this.endpoint}/places${params.size ? `?${params.toString()}` : ""}`);
      if (!response.ok) throw new Error(`Places request failed: ${response.status}`);
      const payload = await response.json();
      return Array.isArray(payload) ? queryPlaces(payload as PlaceSummary[], query) : (payload as PlaceListResponse);
    } catch {
      return this.fallback.listSummaries(query);
    }
  }

  async getDetail(placeId: string, lang: "th" | "en" = "th"): Promise<PlaceDetail | undefined> {
    try {
      const response = await fetch(`${this.endpoint}/places/${encodeURIComponent(placeId)}?lang=${lang}`);
      if (!response.ok) throw new Error(`Place detail request failed: ${response.status}`);
      return (await response.json()) as PlaceDetail;
    } catch {
      return this.fallback.getDetail(placeId, lang);
    }
  }
}
