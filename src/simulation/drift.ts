export interface DriftState {
  active: boolean;
  score: number;
  multiplier: number;
  chainSeconds: number;
  graceSeconds: number;
}

export interface DriftInput {
  handbrake: boolean;
  steering: boolean;
  speedMps: number;
}

export interface DriftUpdate {
  state: DriftState;
  banked?: { points: number; multiplier: number };
}

const MIN_DRIFT_SPEED_MPS = 9;
const GRACE_SECONDS = 0.8;
const SECONDS_PER_MULTIPLIER = 1.5;
export const MAX_DRIFT_MULTIPLIER = 5;

export function createDriftState(): DriftState {
  return { active: false, score: 0, multiplier: 1, chainSeconds: 0, graceSeconds: 0 };
}

export function isDrifting(input: DriftInput): boolean {
  return input.handbrake && input.steering && Math.abs(input.speedMps) >= MIN_DRIFT_SPEED_MPS;
}

export function updateDrift(state: DriftState, dt: number, input: DriftInput): DriftUpdate {
  if (isDrifting(input)) {
    const chainSeconds = state.chainSeconds + dt;
    const multiplier = Math.min(MAX_DRIFT_MULTIPLIER, 1 + Math.floor(chainSeconds / SECONDS_PER_MULTIPLIER));
    const speedKmh = Math.abs(input.speedMps) * 3.6;
    return {
      state: {
        active: true,
        score: state.score + speedKmh * 1.2 * multiplier * dt,
        multiplier,
        chainSeconds,
        graceSeconds: GRACE_SECONDS,
      },
    };
  }

  if (!state.active) {
    return { state };
  }

  const graceSeconds = state.graceSeconds - dt;
  if (graceSeconds > 0) {
    return { state: { ...state, graceSeconds } };
  }

  const points = Math.floor(state.score);
  return {
    state: createDriftState(),
    banked: points > 0 ? { points, multiplier: state.multiplier } : undefined,
  };
}

export function driftRewards(points: number): { xp: number; coins: number } {
  return { xp: Math.floor(points / 50), coins: Math.floor(points / 100) };
}
