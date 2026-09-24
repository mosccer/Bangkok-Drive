export const RACE_COUNTDOWN_MS = 5_000;
export const RACE_TIMEOUT_MS = 6 * 60_000;
export const RACE_GRACE_AFTER_WINNER_MS = 60_000;

export interface RaceResult {
  playerId: string;
  name: string;
  timeMs: number;
}

export interface RaceState {
  raceId: string;
  targetId: string;
  hostName: string;
  startsAt: number;
  results: RaceResult[];
  finishedAt?: number;
  closedAt?: number;
}

export function createRace(raceId: string, targetId: string, hostName: string, now: number, countdownMs = RACE_COUNTDOWN_MS): RaceState {
  return { raceId, targetId, hostName, startsAt: now + countdownMs, results: [] };
}

export function raceElapsedMs(race: RaceState, now: number): number {
  return Math.max(0, now - race.startsAt);
}

export function isRaceLive(race: RaceState, now: number): boolean {
  return now >= race.startsAt && race.closedAt === undefined;
}

export function recordRaceResult(race: RaceState, result: RaceResult): RaceState {
  if (race.results.some((existing) => existing.playerId === result.playerId)) return race;
  const results = [...race.results, result].sort((a, b) => a.timeMs - b.timeMs);
  return { ...race, results };
}

export function placeFor(race: RaceState, playerId: string): number | undefined {
  const index = race.results.findIndex((result) => result.playerId === playerId);
  return index >= 0 ? index + 1 : undefined;
}

export function shouldCloseRace(race: RaceState, now: number): boolean {
  if (race.closedAt !== undefined) return false;
  if (now - race.startsAt > RACE_TIMEOUT_MS) return true;
  const winner = race.results[0];
  return winner !== undefined && now - (race.startsAt + winner.timeMs) > RACE_GRACE_AFTER_WINNER_MS;
}

export function raceReward(place: number | undefined): { xp: number; coins: number } {
  if (place === undefined) return { xp: 0, coins: 0 };
  if (place === 1) return { xp: 150, coins: 120 };
  if (place === 2) return { xp: 100, coins: 70 };
  if (place === 3) return { xp: 70, coins: 50 };
  return { xp: 40, coins: 30 };
}
