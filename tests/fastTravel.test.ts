import { describe, expect, it } from "vitest";
import { curatedPlaces } from "../src/data/curatedPlaces";
import { createFastTravelPoint, shouldOfferFastTravel } from "../src/simulation/fastTravel";

describe("fast travel", () => {
  it("offers jumps for far 1:1 mission waypoints", () => {
    const from = { lat: 13.7515, lng: 100.4929 };
    const chatuchak = curatedPlaces.find((place) => place.id === "chatuchak-market");
    expect(chatuchak).toBeTruthy();
    const point = createFastTravelPoint(from, chatuchak!);

    expect(shouldOfferFastTravel(from, point.target)).toBe(true);
    expect(point.distanceMeters).toBeGreaterThan(2_500);
  });

  it("does not offer jumps for nearby old-town waypoints", () => {
    const from = { lat: 13.7515, lng: 100.4929 };
    const grandPalace = curatedPlaces.find((place) => place.id === "grand-palace");
    expect(grandPalace).toBeTruthy();

    expect(shouldOfferFastTravel(from, { lat: grandPalace!.lat, lng: grandPalace!.lng })).toBe(false);
  });
});
