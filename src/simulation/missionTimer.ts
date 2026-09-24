import type { Mission } from "../types";

export const FAST_TRAVEL_PENALTY_SECONDS = 20;

export interface MissionRunTimer {
  missionId: string;
  elapsedSeconds: number;
  penaltySeconds: number;
}

export function startMissionTimer(missionId: string): MissionRunTimer {
  return { missionId, elapsedSeconds: 0, penaltySeconds: 0 };
}

export function tickMissionTimer(timer: MissionRunTimer, dt: number): MissionRunTimer {
  return { ...timer, elapsedSeconds: timer.elapsedSeconds + Math.max(0, dt) };
}

export function addMissionPenalty(timer: MissionRunTimer, seconds: number): MissionRunTimer {
  return { ...timer, penaltySeconds: timer.penaltySeconds + seconds };
}

export function totalRunSeconds(timer: MissionRunTimer): number {
  return timer.elapsedSeconds + timer.penaltySeconds;
}

export function remainingSeconds(timer: MissionRunTimer, mission: Mission): number | undefined {
  if (!mission.timeLimit) return undefined;
  return mission.timeLimit - totalRunSeconds(timer);
}

export function isMissionTimerExpired(timer: MissionRunTimer, mission: Mission): boolean {
  const remaining = remainingSeconds(timer, mission);
  return remaining !== undefined && remaining <= 0;
}

export function formatRaceTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}
