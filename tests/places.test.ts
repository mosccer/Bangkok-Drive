import { describe, expect, it } from "vitest";
import { bangkokWorld } from "../src/data/bangkokWorld";
import { filterPlaces } from "../src/simulation/placeQueries";

describe("place filtering", () => {
  it("filters cafes by category", () => {
    const cafes = filterPlaces(bangkokWorld.places, { category: "cafe" });
    expect(cafes.length).toBeGreaterThan(0);
    expect(cafes.every((place) => place.category === "cafe")).toBe(true);
  });

  it("filters high rated food places", () => {
    const food = filterPlaces(bangkokWorld.places, { tag: "food", minRating: 4.5 });
    expect(food.map((place) => place.id)).toContain("yaowarat-food-street");
  });
});
