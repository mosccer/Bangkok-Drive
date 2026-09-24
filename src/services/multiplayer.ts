import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { PlayerSnapshot } from "../simulation/remotePlayers";

export type RoomEvent =
  | { kind: "emote"; from: string; name: string; emote: string }
  | { kind: "race_start"; from: string; name: string; raceId: string; targetId: string; countdownMs: number }
  | { kind: "race_finish"; from: string; name: string; raceId: string; timeMs: number };

export interface RoomHandlers {
  onSnapshot: (snapshot: unknown) => void;
  onEvent: (event: unknown) => void;
  onLeave: (playerId: string) => void;
  onJoin: (playerId: string, name: string) => void;
}

export interface MultiplayerTransport {
  readonly kind: "supabase" | "local";
  join(room: string, self: { id: string; name: string }, handlers: RoomHandlers): Promise<void>;
  sendSnapshot(snapshot: PlayerSnapshot): void;
  sendEvent(event: RoomEvent): void;
  leave(): Promise<void>;
}

type LocalMessage =
  | { type: "hello"; id: string; name: string; reply: boolean }
  | { type: "bye"; id: string }
  | { type: "pos"; snapshot: PlayerSnapshot }
  | { type: "evt"; event: RoomEvent };

// Same-device rooms over BroadcastChannel: lets two tabs play together without a backend.
export class LocalTabTransport implements MultiplayerTransport {
  readonly kind = "local" as const;
  private channel?: BroadcastChannel;
  private self?: { id: string; name: string };
  private readonly handleUnload = () => this.post({ type: "bye", id: this.self?.id ?? "" });

  async join(room: string, self: { id: string; name: string }, handlers: RoomHandlers): Promise<void> {
    await this.leave();
    if (typeof BroadcastChannel === "undefined") return;
    this.self = self;
    this.channel = new BroadcastChannel(`mosgame-room-${room}`);
    this.channel.onmessage = (event: MessageEvent<LocalMessage>) => {
      const message = event.data;
      if (!message || typeof message !== "object") return;
      if (message.type === "pos") handlers.onSnapshot(message.snapshot);
      else if (message.type === "evt") handlers.onEvent(message.event);
      else if (message.type === "bye") handlers.onLeave(message.id);
      else if (message.type === "hello") {
        handlers.onJoin(message.id, message.name);
        if (!message.reply) this.post({ type: "hello", id: self.id, name: self.name, reply: true });
      }
    };
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.handleUnload);
    this.post({ type: "hello", id: self.id, name: self.name, reply: false });
  }

  sendSnapshot(snapshot: PlayerSnapshot): void {
    this.post({ type: "pos", snapshot });
  }

  sendEvent(event: RoomEvent): void {
    this.post({ type: "evt", event });
  }

  async leave(): Promise<void> {
    if (!this.channel) return;
    this.handleUnload();
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.handleUnload);
    this.channel.close();
    this.channel = undefined;
  }

  private post(message: LocalMessage): void {
    this.channel?.postMessage(message);
  }
}

// Internet rooms over Supabase Realtime: presence for who is here, broadcast for movement and events.
export class SupabaseRealtimeTransport implements MultiplayerTransport {
  readonly kind = "supabase" as const;
  private channel?: RealtimeChannel;

  constructor(private readonly client: SupabaseClient) {}

  async join(room: string, self: { id: string; name: string }, handlers: RoomHandlers): Promise<void> {
    await this.leave();
    const channel = this.client.channel(`bangkok-drive:${room}`, {
      config: { broadcast: { self: false, ack: false }, presence: { key: self.id } },
    });
    channel.on("broadcast", { event: "pos" }, ({ payload }) => handlers.onSnapshot(payload));
    channel.on("broadcast", { event: "evt" }, ({ payload }) => handlers.onEvent(payload));
    channel.on("presence", { event: "join" }, ({ key, newPresences }) => {
      if (key !== self.id) handlers.onJoin(key, String((newPresences[0] as { name?: unknown } | undefined)?.name ?? "Driver"));
    });
    channel.on("presence", { event: "leave" }, ({ key }) => handlers.onLeave(key));
    this.channel = channel;
    await new Promise<void>((resolve) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ name: self.name });
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          resolve();
        }
      });
    });
  }

  sendSnapshot(snapshot: PlayerSnapshot): void {
    void this.channel?.send({ type: "broadcast", event: "pos", payload: snapshot });
  }

  sendEvent(event: RoomEvent): void {
    void this.channel?.send({ type: "broadcast", event: "evt", payload: event });
  }

  async leave(): Promise<void> {
    if (!this.channel) return;
    const channel = this.channel;
    this.channel = undefined;
    await channel.untrack();
    await this.client.removeChannel(channel);
  }
}

export function sanitizeRoomEvent(raw: unknown): RoomEvent | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as Record<string, unknown>;
  if (typeof value.from !== "string" || typeof value.name !== "string") return undefined;
  const base = { from: value.from.slice(0, 64), name: value.name.slice(0, 20) };
  if (value.kind === "emote" && typeof value.emote === "string" && ALLOWED_EMOTES.includes(value.emote)) {
    return { kind: "emote", ...base, emote: value.emote };
  }
  if (value.kind === "race_start" && typeof value.raceId === "string" && typeof value.targetId === "string") {
    const countdownMs = typeof value.countdownMs === "number" && Number.isFinite(value.countdownMs) ? Math.max(3_000, Math.min(10_000, value.countdownMs)) : 5_000;
    return { kind: "race_start", ...base, raceId: value.raceId.slice(0, 64), targetId: value.targetId.slice(0, 80), countdownMs };
  }
  if (value.kind === "race_finish" && typeof value.raceId === "string" && typeof value.timeMs === "number" && Number.isFinite(value.timeMs) && value.timeMs > 0) {
    return { kind: "race_finish", ...base, raceId: value.raceId.slice(0, 64), timeMs: value.timeMs };
  }
  return undefined;
}

export const ALLOWED_EMOTES = ["👋", "🏁", "🔥", "😂", "👍", "🙏"];
