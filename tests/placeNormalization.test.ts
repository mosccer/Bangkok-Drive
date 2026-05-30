import { describe, expect, it } from "vitest";
import { createCachedPlaceDetail, mapGoogleTypesToCategory, normalizeGooglePlaceDetail, normalizeGooglePlaceSummary } from "../src/services/placeNormalization";
import { curatedPlaces } from "../src/data/curatedPlaces";

describe("place normalization", () => {
  it("maps Google types to game categories", () => {
    expect(mapGoogleTypesToCategory(["cafe", "food"])).toBe("cafe");
    expect(mapGoogleTypesToCategory(["dessert_shop"])).toBe("dessert");
    expect(mapGoogleTypesToCategory(["store"])).toBe("market");
  });

  it("normalizes Google summaries with district and attribution metadata", () => {
    const summary = normalizeGooglePlaceSummary(
      {
        id: "places/abc123",
        displayName: { text: "ร้านทดสอบ" },
        location: { latitude: 13.75, longitude: 100.5 },
        rating: 4.4,
        userRatingCount: 120,
        types: ["restaurant", "food"],
        googleMapsUri: "https://maps.google.com/example",
      },
      { districtId: "phra-nakhon", fallbackCategory: "restaurant", lang: "th", tags: ["food"] },
    );

    expect(summary?.googlePlaceId).toBe("abc123");
    expect(summary?.category).toBe("restaurant");
    expect(summary?.nameTh).toBe("ร้านทดสอบ");
    expect(summary?.attributionRequired).toBe(true);
    expect(summary?.districtId).toBe("phra-nakhon");
  });

  it("builds Thai and English detail fallbacks", () => {
    const place = curatedPlaces.find((candidate) => candidate.id === "grand-palace");
    expect(place).toBeTruthy();
    const th = createCachedPlaceDetail(place!, "th");
    const en = createCachedPlaceDetail(place!, "en");
    expect(th.name).toBe("พระบรมมหาราชวัง");
    expect(en.name).toBe("Grand Palace");
    expect(th.sourceAttributions).toEqual([]);
  });

  it("normalizes lazy Google detail payloads", () => {
    const cached = curatedPlaces[0];
    const detail = normalizeGooglePlaceDetail(
      {
        id: "places/live",
        displayName: { text: "Live Name" },
        formattedAddress: "Bangkok",
        location: { latitude: 13.7, longitude: 100.5 },
        rating: 4.8,
        userRatingCount: 99,
        googleMapsUri: "https://maps.google.com/live",
        editorialSummary: { text: "Live summary" },
        attributions: [{ provider: "Google Maps", providerUri: "https://maps.google.com" }],
      },
      cached,
      "en",
    );

    expect(detail.nameEn).toBe("Live Name");
    expect(detail.descriptionEn).toBe("Live summary");
    expect(detail.sourceAttributions[0].provider).toBe("Google Maps");
  });
});
