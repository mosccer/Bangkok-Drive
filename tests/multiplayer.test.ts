import { describe, expect, it } from "vitest";
import { LocalTabTransport, sanitizeRoomEvent } from "../src/services/multiplayer";
import { createRace, isRaceLive, placeFor, raceReward, recordRaceResult, shouldCloseRace } from "../src/simulation/race";
import {
  extrapolateSnapshot,
  RemotePlayerBuffer,
  sanitizePlayerName,
  sanitizeRoomCode,
  sanitizeSnapshot,
  type PlayerSnapshot,
} from "../src/simulation/remotePlayers";

const snapshot = (overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  id: "p-abcdef",
  name: "Nok",
  vehicleId: "siam-taxi",
  color: "#ec4899",
  lat: 13.75,
  lng: 100.5,
  yaw: 0,
  speed: 10,
  seq: 1,
  ...overrides,
});

describe("remote player snapshots", () => {
  it("rejects malformed or out-of-city snapshots", () => {
    expect(sanitizeSnapshot(snapshot())).toEqual(snapshot());
    expect(sanitizeSnapshot({ ...snapshot(), lat: 51.5 })).toBeUndefined();
    expect(sanitizeSnapshot({ ...snapshot(), lat: Number.NaN })).toBeUndefined();
    expect(sanitizeSnapshot({ ...snapshot(), id: "<script>" })).toBeUndefined();
    expect(sanitizeSnapshot("nope")).toBeUndefined();
  });

  it("cleans names, colors and unknown cars", () => {
    const cleaned = sanitizeSnapshot({ ...snapshot(), name: "<b>Nok</b>\u0000 the very long driver name", color: "red", vehicleId: "tank" });
    expect(cleaned?.name).toBe("bNok/b the very long");
    expect(cleaned?.color).toBe("#e2e8f0");
    expect(cleaned?.vehicleId).toBe("krung-compact");
    expect(sanitizePlayerName("   ")).toBe("Driver");
    expect(sanitizeRoomCode("My Room!!")).toBe("myroom");
    expect(sanitizeRoomCode("")).toBe("bangkok");
  });

  it("interpolates between received samples and drops stale players", () => {
    const buffer = new RemotePlayerBuffer(100, 1_000);
    buffer.push(snapshot({ seq: 1, lat: 13.75 }), 0);
    buffer.push(snapshot({ seq: 2, lat: 13.76 }), 200);
    buffer.push(snapshot({ seq: 1, lat: 13.9 }), 250);
    const [view] = buffer.views(200);
    expect(view.lat).toBeCloseTo(13.755, 5);
    expect(buffer.views(2_000)).toHaveLength(0);
  });

  it("dead-reckons along the heading for a short gap", () => {
    const south = extrapolateSnapshot(snapshot({ yaw: 0, speed: 20 }), 1);
    expect(south.lat).toBeLessThan(13.75);
    const east = extrapolateSnapshot(snapshot({ yaw: Math.PI / 2, speed: 20 }), 1);
    expect(east.lng).toBeGreaterThan(100.5);
  });

  it("shows emotes until they expire", () => {
    const buffer = new RemotePlayerBuffer(0, 10_000);
    buffer.push(snapshot(), 0);
    buffer.setEmote("p-abcdef", "👋", 1_000);
    expect(buffer.views(500)[0].emote?.text).toBe("👋");
    expect(buffer.views(1_500)[0].emote).toBeUndefined();
  });
});

describe("room events", () => {
  it("accepts known events and rejects anything else", () => {
    expect(sanitizeRoomEvent({ kind: "emote", from: "p-1", name: "Nok", emote: "👋" })).toMatchObject({ kind: "emote" });
    expect(sanitizeRoomEvent({ kind: "emote", from: "p-1", name: "Nok", emote: "<img>" })).toBeUndefined();
    expect(sanitizeRoomEvent({ kind: "race_start", from: "p-1", name: "Nok", raceId: "r", targetId: "wat-pho", countdownMs: 60_000 })).toMatchObject({ countdownMs: 10_000 });
    expect(sanitizeRoomEvent({ kind: "race_finish", from: "p-1", name: "Nok", raceId: "r", timeMs: -5 })).toBeUndefined();
    expect(sanitizeRoomEvent({ kind: "admin", from: "p-1", name: "x" })).toBeUndefined();
  });
});

describe("races", () => {
  it("counts down, ranks finishers and closes after the winner's grace period", () => {
    let race = createRace("r1", "wat-pho", "Nok", 0, 5_000);
    expect(isRaceLive(race, 4_000)).toBe(false);
    expect(isRaceLive(race, 5_000)).toBe(true);
    race = recordRaceResult(race, { playerId: "b", name: "B", timeMs: 90_000 });
    race = recordRaceResult(race, { playerId: "a", name: "A", timeMs: 80_000 });
    race = recordRaceResult(race, { playerId: "a", name: "A", timeMs: 10 });
    expect(placeFor(race, "a")).toBe(1);
    expect(placeFor(race, "b")).toBe(2);
    expect(shouldCloseRace(race, 5_000 + 80_000 + 30_000)).toBe(false);
    expect(shouldCloseRace(race, 5_000 + 80_000 + 61_000)).toBe(true);
    expect(raceReward(1).coins).toBeGreaterThan(raceReward(2).coins);
    expect(raceReward(undefined)).toEqual({ xp: 0, coins: 0 });
  });
});

describe("same-device transport", () => {
  it("delivers hello, positions and events between two tabs of a room", async () => {
    const a = new LocalTabTransport();
    const b = new LocalTabTransport();
    const received: unknown[] = [];
    const joined: string[] = [];
    await a.join("test-room", { id: "p-aaaa", name: "A" }, { onSnapshot: () => undefined, onEvent: () => undefined, onLeave: () => undefined, onJoin: (id) => joined.push(`a saw ${id}`) });
    await b.join("test-room", { id: "p-bbbb", name: "B" }, {
      onSnapshot: (value) => received.push(value),
      onEvent: (value) => received.push(value),
      onLeave: () => undefined,
      onJoin: (id) => joined.push(`b saw ${id}`),
    });
    a.sendSnapshot(snapshot({ id: "p-aaaa" }));
    a.sendEvent({ kind: "emote", from: "p-aaaa", name: "A", emote: "👋" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(joined).toEqual(expect.arrayContaining(["a saw p-bbbb", "b saw p-aaaa"]));
    expect(received).toHaveLength(2);
    await a.leave();
    await b.leave();
  });
});
