import { describe, expect, it } from "vitest";
import { curatedPlaces } from "../src/data/curatedPlaces";
import { MAP_SCALE } from "../src/data/coordinates";
import { formatEta, hasArrived, placeToNavTarget, routeProgress, turnBetween } from "../src/simulation/navigation";
import { MAX_FAVORITES, pushRecent, sanitizeNavigation, toggleFavorite } from "../src/simulation/saveGame";
import type { NavTarget } from "../src/types";

describe("turn-by-turn navigation", () => {
  it("tells left from right on the north-up x/z plane", () => {
    // Heading north (-z) then turning east (+x) is a right turn.
    expect(turnBetween(0, -1, 1, 0).maneuver).toBe("right");
    expect(turnBetween(0, -1, -1, 0).maneuver).toBe("left");
    expect(turnBetween(0, -1, 0.05, -1).maneuver).toBe("straight");
    expect(turnBetween(0, -1, 0.02, 1).maneuver).toBe("uturn");
  });

  it("reports the next turn, remaining distance and ETA along the route", () => {
    const route = [
      { x: 0, z: 0 },
      { x: 0, z: -200 },
      { x: 300, z: -200 },
    ];
    const progress = routeProgress(route, { x: 0, z: -50 }, 20)!;
    expect(progress.maneuver).toBe("right");
    expect(progress.maneuverMeters).toBeCloseTo(150 / MAP_SCALE, 5);
    expect(progress.remainingMeters).toBeCloseTo(450 / MAP_SCALE, 5);
    expect(progress.etaSeconds).toBeCloseTo(450 / 20, 5);
    const lastLeg = routeProgress(route, { x: 100, z: -200 }, 0)!;
    expect(lastLeg.maneuver).toBe("arrive");
    expect(lastLeg.offRouteMeters).toBe(0);
  });

  it("arrives at the pin or at the road point closest to an off-road pin", () => {
    const pin = { x: 100, z: 100 };
    expect(hasArrived({ x: 90, z: 100 }, pin, 35)).toBe(true);
    expect(hasArrived({ x: 0, z: 100 }, pin, 35)).toBe(false);
    expect(hasArrived({ x: 0, z: 100 }, pin, 35, { x: 5, z: 100 })).toBe(true);
    expect(hasArrived({ x: 0, z: 100 }, { x: 900, z: 100 }, 35, { x: 5, z: 100 })).toBe(false);
  });

  it("formats ETAs in Thai", () => {
    expect(formatEta(20)).toBe("< 1 นาที");
    expect(formatEta(300)).toBe("5 นาที");
    expect(formatEta(3_900)).toBe("1 ชม. 5 นาที");
  });
});

describe("saved destinations", () => {
  const place = placeToNavTarget(curatedPlaces[0]);
  const pin: NavTarget = { id: "pin:13.75,100.5", kind: "pin", label: "หมุด", lat: 13.75, lng: 100.5 };

  it("toggles favorites and keeps the most recent first", () => {
    let navigation = sanitizeNavigation();
    navigation = toggleFavorite(navigation, place);
    navigation = toggleFavorite(navigation, pin);
    expect(navigation.favorites.map((item) => item.id)).toEqual([pin.id, place.id]);
    navigation = toggleFavorite(navigation, place);
    expect(navigation.favorites.map((item) => item.id)).toEqual([pin.id]);
    navigation = pushRecent(pushRecent(pushRecent(navigation, place), pin), place);
    expect(navigation.recent.map((item) => item.id)).toEqual([place.id, pin.id]);
  });

  it("drops malformed entries and caps list sizes when loading", () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ ...pin, id: `pin:${index}` }));
    const navigation = sanitizeNavigation({ favorites: [...many, { id: 5 } as unknown as NavTarget], recent: [{ ...pin, lat: Number.NaN }] });
    expect(navigation.favorites).toHaveLength(MAX_FAVORITES);
    expect(navigation.recent).toHaveLength(0);
  });
});
