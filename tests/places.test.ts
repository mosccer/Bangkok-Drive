import { describe, expect, it } from "vitest";
import { bangkokWorld } from "../src/data/bangkokWorld";
import { dedupePlaces, filterPlaces, queryPlaces } from "../src/simulation/placeQueries";
import type { PlaceSummary } from "../src/types";

describe("place filtering", () => {
  it("filters cafes by category", () => {
    const cafes = filterPlaces(bangkokWorld.places, { category: "cafe" });
    expect(cafes.length).toBeGreaterThan(0);
    expect(cafes.every((place) => place.category === "cafe")).toBe(true);
  });

  it("filters high rated food places", () => {
    const food = filterPlaces(bangkokWorld.places, { tag: "food", minRating: 4.5 });
    expect(food.map((place) => place.id)).toEqual(expect.arrayContaining(["yaowarat-food-street", "siam-paragon"]));
  });

  it("treats the tour category as all tagged tour spots", () => {
    const tour = queryPlaces(bangkokWorld.places, { category: "tourist_attraction", limit: 150 });
    expect(tour.places.map((place) => place.id)).toEqual(
      expect.arrayContaining(["grand-palace", "wat-phra-kaew", "wat-pho", "yaowarat-food-street", "chatuchak-market"]),
    );
  });

  it("queries by district, category, cursor, and limit", () => {
    const page = queryPlaces(bangkokWorld.places, { districtId: "phra-nakhon", category: "temple", limit: 1 });
    expect(page.places).toHaveLength(1);
    expect(page.total).toBeGreaterThan(1);
    expect(page.nextCursor).toBe("1");
    expect(page.places[0].districtId).toBe("phra-nakhon");
    expect(page.places[0].category).toBe("temple");
  });

  it("deduplicates Google places by googlePlaceId", () => {
    const base = bangkokWorld.places[0];
    const duplicate: PlaceSummary = {
      ...base,
      id: "google-duplicate",
      source: "google",
      googlePlaceId: "same-place",
      curatedPriority: 1,
      attributionRequired: true,
    };
    const curated: PlaceSummary = { ...duplicate, id: "curated-duplicate", source: "curated", curatedPriority: 90 };
    const result = dedupePlaces([duplicate, curated]);
    expect(result).toHaveLength(1);
    expect(result[0].source).toBe("curated");
  });
});
