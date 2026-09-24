import type { PlaceDetail, PlaceListResponse, PlaceQuery, PlaceSummary } from "../types";
import { queryPlaces } from "../simulation/placeQueries";
import { createCachedPlaceDetail, withGuideReview } from "./placeNormalization";

export interface PlacesService {
  listSummaries(query?: PlaceQuery): Promise<PlaceListResponse>;
  getDetail(placeId: string, lang?: "th" | "en"): Promise<PlaceDetail | undefined>;
  addPlaces?(places: PlaceSummary[]): void;
}

export class CachedPlacesService implements PlacesService {
  private places: PlaceSummary[];

  constructor(places: PlaceSummary[]) {
    this.places = places;
  }

  addPlaces(places: PlaceSummary[]): void {
    const known = new Set(this.places.map((place) => place.id));
    this.places = [...this.places, ...places.filter((place) => !known.has(place.id))];
  }

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

  addPlaces(places: PlaceSummary[]): void {
    this.fallback.addPlaces?.(places);
  }

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
      return withGuideReview((await response.json()) as PlaceDetail);
    } catch {
      return this.fallback.getDetail(placeId, lang);
    }
  }
}
