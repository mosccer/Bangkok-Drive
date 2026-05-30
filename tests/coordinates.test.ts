import { describe, expect, it } from "vitest";
import { latLngToWorld, worldToLatLng } from "../src/data/coordinates";

describe("coordinate conversion", () => {
  it("round trips Bangkok coordinates", () => {
    const original = { lat: 13.7466, lng: 100.5347 };
    const world = latLngToWorld(original.lat, original.lng);
    const roundTrip = worldToLatLng(world.x, world.z);

    expect(roundTrip.lat).toBeCloseTo(original.lat, 5);
    expect(roundTrip.lng).toBeCloseTo(original.lng, 5);
  });
});
