import { describe, expect, it } from "vitest";
import { createWorldAnchor, distanceMetersBetweenGeo, latLngToWorld, localToGeo, recenterAnchor, worldToLatLng } from "../src/data/coordinates";

describe("coordinate conversion", () => {
  it("round trips Bangkok coordinates", () => {
    const original = { lat: 13.7466, lng: 100.5347 };
    const world = latLngToWorld(original.lat, original.lng);
    const roundTrip = worldToLatLng(world.x, world.z);

    expect(roundTrip.lat).toBeCloseTo(original.lat, 5);
    expect(roundTrip.lng).toBeCloseTo(original.lng, 5);
    expect(distanceMetersBetweenGeo(original, roundTrip)).toBeLessThan(1);
  });

  it("recenters the floating origin without changing absolute vehicle geo", () => {
    const anchor = createWorldAnchor({ lat: 13.7515, lng: 100.4929 });
    const before = localToGeo({ x: 1800, z: -1200 }, anchor);
    const recentered = recenterAnchor(anchor, { x: 1800, z: -1200 });
    const after = localToGeo(recentered.vehicleLocal, recentered.anchor);

    expect(recentered.vehicleLocal).toEqual({ x: 0, z: 0 });
    expect(distanceMetersBetweenGeo(before, after)).toBeLessThan(1);
    expect(recentered.anchor.version).toBe(anchor.version + 1);
  });
});
