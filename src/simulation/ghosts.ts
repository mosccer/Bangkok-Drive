import type { GhostPlayerState } from "../types";

export function interpolateGhostState(previous: GhostPlayerState, next: GhostPlayerState, now: number): GhostPlayerState {
  const duration = Math.max(1, next.updatedAt - previous.updatedAt);
  const t = Math.max(0, Math.min(1, (now - previous.updatedAt) / duration));
  const yawDelta = Math.atan2(Math.sin(next.yaw - previous.yaw), Math.cos(next.yaw - previous.yaw));

  return {
    ...next,
    x: previous.x + (next.x - previous.x) * t,
    z: previous.z + (next.z - previous.z) * t,
    yaw: previous.yaw + yawDelta * t,
    speed: previous.speed + (next.speed - previous.speed) * t,
  };
}

export function pruneStaleGhosts(states: GhostPlayerState[], now: number, ttlMs = 5000): GhostPlayerState[] {
  return states.filter((state) => now - state.updatedAt <= ttlMs);
}
