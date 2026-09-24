export interface NitroState {
  charge: number;
  locked: boolean;
}

export interface NitroInput {
  wantsBoost: boolean;
  accelerating: boolean;
  speedMps: number;
  drifting: boolean;
}

export interface NitroTuning {
  drainPerSecond: number;
  rechargePerSecond: number;
  driftRechargePerSecond: number;
}

const MIN_BOOST_SPEED_MPS = 8;
const UNLOCK_CHARGE = 0.2;

export function createNitroState(charge = 1): NitroState {
  return { charge: clampCharge(charge), locked: false };
}

export function nitroTuningForLevel(level: number): NitroTuning {
  const tier = Math.max(0, Math.min(3, Math.floor(level)));
  return {
    drainPerSecond: 0.24 - tier * 0.03,
    rechargePerSecond: 0.035 + tier * 0.01,
    driftRechargePerSecond: 0.22 + tier * 0.04,
  };
}

export function updateNitro(state: NitroState, dt: number, input: NitroInput, tuning: NitroTuning): { state: NitroState; active: boolean } {
  const wantsActive = input.wantsBoost && input.accelerating && Math.abs(input.speedMps) > MIN_BOOST_SPEED_MPS;
  let locked = state.locked && state.charge < UNLOCK_CHARGE;
  const active = wantsActive && !locked && state.charge > 0;
  let charge = state.charge;

  if (active) {
    charge -= tuning.drainPerSecond * dt;
    if (charge <= 0) {
      charge = 0;
      locked = true;
    }
  } else {
    charge += tuning.rechargePerSecond * dt;
    if (input.drifting) {
      charge += tuning.driftRechargePerSecond * dt;
    }
  }

  return { state: { charge: clampCharge(charge), locked }, active };
}

export function addNitro(state: NitroState, amount: number): NitroState {
  const charge = clampCharge(state.charge + amount);
  return { charge, locked: state.locked && charge < UNLOCK_CHARGE };
}

function clampCharge(value: number): number {
  return Math.max(0, Math.min(1, value));
}
