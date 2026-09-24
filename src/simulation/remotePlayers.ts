import { vehicleDefinitions } from "../data/vehicles";

export interface PlayerSnapshot {
  id: string;
  name: string;
  vehicleId: string;
  color: string;
  lat: number;
  lng: number;
  yaw: number;
  speed: number;
  seq: number;
}

export interface RemotePlayerView extends PlayerSnapshot {
  lastSeen: number;
  emote?: { text: string; until: number };
}

const MAX_NAME_LENGTH = 20;
const knownVehicles = new Set(vehicleDefinitions.map((vehicle) => vehicle.id));

export function sanitizePlayerName(value: unknown, fallback = "Driver"): string {
  if (typeof value !== "string") return fallback;
  const cleaned = [...value]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code !== 127 && char !== "<" && char !== ">";
    })
    .join("")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return cleaned || fallback;
}

export function sanitizeRoomCode(value: unknown): string {
  if (typeof value !== "string") return "bangkok";
  const cleaned = value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 24);
  return cleaned || "bangkok";
}

// Snapshots come from other clients, so every field is validated before it reaches the renderer.
export function sanitizeSnapshot(raw: unknown): PlayerSnapshot | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  const numbers = [value.lat, value.lng, value.yaw, value.speed, value.seq];
  if (!numbers.every((number) => typeof number === "number" && Number.isFinite(number))) return undefined;
  const lat = value.lat as number;
  const lng = value.lng as number;
  if (lat < 13.3 || lat > 14.2 || lng < 100.1 || lng > 101.1) return undefined;
  if (typeof value.id !== "string" || !/^[a-zA-Z0-9-]{4,64}$/.test(value.id)) return undefined;
  const color = typeof value.color === "string" && /^#[0-9a-fA-F]{6}$/.test(value.color) ? value.color : "#e2e8f0";
  const vehicleId = typeof value.vehicleId === "string" && knownVehicles.has(value.vehicleId) ? value.vehicleId : "krung-compact";
  return {
    id: value.id,
    name: sanitizePlayerName(value.name),
    vehicleId,
    color,
    lat,
    lng,
    yaw: value.yaw as number,
    speed: Math.max(-60, Math.min(60, value.speed as number)),
    seq: value.seq as number,
  };
}

interface BufferedSample {
  snapshot: PlayerSnapshot;
  receivedAt: number;
}

// Renders remote cars slightly in the past and interpolates between received samples,
// using local receive times so peers never need synchronized clocks.
export class RemotePlayerBuffer {
  private readonly samples = new Map<string, BufferedSample[]>();
  private readonly emotes = new Map<string, { text: string; until: number }>();

  constructor(
    private readonly interpolationDelayMs = 180,
    private readonly staleAfterMs = 6_000,
  ) {}

  push(snapshot: PlayerSnapshot, receivedAt: number): void {
    const list = this.samples.get(snapshot.id) ?? [];
    const last = list[list.length - 1];
    if (last && snapshot.seq <= last.snapshot.seq) return;
    list.push({ snapshot, receivedAt });
    while (list.length > 12) list.shift();
    this.samples.set(snapshot.id, list);
  }

  remove(id: string): void {
    this.samples.delete(id);
    this.emotes.delete(id);
  }

  setEmote(id: string, text: string, until: number): void {
    this.emotes.set(id, { text, until });
  }

  ids(): string[] {
    return [...this.samples.keys()];
  }

  latest(id: string): PlayerSnapshot | undefined {
    const list = this.samples.get(id);
    return list?.[list.length - 1]?.snapshot;
  }

  views(now: number): RemotePlayerView[] {
    const views: RemotePlayerView[] = [];
    for (const [id, list] of this.samples) {
      const last = list[list.length - 1];
      if (!last || now - last.receivedAt > this.staleAfterMs) {
        this.remove(id);
        continue;
      }
      const renderTime = now - this.interpolationDelayMs;
      let view: PlayerSnapshot = last.snapshot;
      for (let i = list.length - 1; i > 0; i -= 1) {
        const older = list[i - 1];
        const newer = list[i];
        if (older.receivedAt <= renderTime && renderTime <= newer.receivedAt) {
          const t = (renderTime - older.receivedAt) / Math.max(1, newer.receivedAt - older.receivedAt);
          view = interpolateSnapshot(older.snapshot, newer.snapshot, t);
          break;
        }
      }
      if (renderTime > last.receivedAt) {
        view = extrapolateSnapshot(last.snapshot, Math.min(0.35, (renderTime - last.receivedAt) / 1000));
      }
      const emote = this.emotes.get(id);
      views.push({ ...view, lastSeen: last.receivedAt, ...(emote && emote.until > now ? { emote } : {}) });
    }
    return views;
  }
}

export function interpolateSnapshot(a: PlayerSnapshot, b: PlayerSnapshot, t: number): PlayerSnapshot {
  const clamped = Math.max(0, Math.min(1, t));
  const yawDelta = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
  return {
    ...b,
    lat: a.lat + (b.lat - a.lat) * clamped,
    lng: a.lng + (b.lng - a.lng) * clamped,
    yaw: a.yaw + yawDelta * clamped,
    speed: a.speed + (b.speed - a.speed) * clamped,
  };
}

const METERS_PER_DEGREE = 111_320;

// Dead-reckons a little past the newest sample; speed is in world units (2 per real meter).
export function extrapolateSnapshot(snapshot: PlayerSnapshot, seconds: number, mapScale = 2): PlayerSnapshot {
  const meters = (snapshot.speed * seconds) / mapScale;
  const dLat = (-Math.cos(snapshot.yaw) * meters) / METERS_PER_DEGREE;
  const dLng = (Math.sin(snapshot.yaw) * meters) / (METERS_PER_DEGREE * Math.cos((snapshot.lat * Math.PI) / 180));
  return { ...snapshot, lat: snapshot.lat + dLat, lng: snapshot.lng + dLng };
}
