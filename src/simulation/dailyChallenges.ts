import type { DailyChallenge, DailyChallengeKind, DailyChallengeState } from "../types";
import { hashString } from "./hash";

interface ChallengeTemplate {
  kind: DailyChallengeKind;
  title: (target: number) => string;
  targets: number[];
  rewardCoins: number;
  rewardXp: number;
}

const templates: ChallengeTemplate[] = [
  { kind: "drift_points", title: (target) => `Drift ${target.toLocaleString("en-US")} points`, targets: [2_000, 4_000, 8_000], rewardCoins: 120, rewardXp: 80 },
  { kind: "coins", title: (target) => `Collect ${target} road coins`, targets: [15, 30, 50], rewardCoins: 100, rewardXp: 60 },
  { kind: "near_misses", title: (target) => `Score ${target} near misses`, targets: [3, 6, 10], rewardCoins: 140, rewardXp: 90 },
  { kind: "distance", title: (target) => `Drive ${(target / 1000).toFixed(0)} km`, targets: [3_000, 6_000, 10_000], rewardCoins: 110, rewardXp: 70 },
  { kind: "discoveries", title: (target) => `Discover ${target} new places`, targets: [1, 2, 3], rewardCoins: 130, rewardXp: 100 },
  { kind: "missions", title: (target) => `Finish ${target} mission${target > 1 ? "s" : ""}`, targets: [1, 1, 2], rewardCoins: 180, rewardXp: 120 },
];

export const DAILY_CHALLENGE_COUNT = 3;

export function localDateKey(date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function generateDailyChallenges(date: string): DailyChallengeState {
  const pool = [...templates];
  const challenges: DailyChallenge[] = [];
  let seed = hashString(date);
  for (let i = 0; i < DAILY_CHALLENGE_COUNT && pool.length; i += 1) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
    const template = pool.splice(seed % pool.length, 1)[0];
    const tier = (seed >>> 8) % template.targets.length;
    const target = template.targets[tier];
    challenges.push({
      id: `${date}:${template.kind}`,
      kind: template.kind,
      title: template.title(target),
      target,
      progress: 0,
      rewardCoins: template.rewardCoins + tier * 40,
      rewardXp: template.rewardXp + tier * 30,
      completed: false,
    });
  }
  return { date, challenges };
}

export function ensureDailyChallenges(state: DailyChallengeState | undefined, date: string): DailyChallengeState {
  return state?.date === date ? state : generateDailyChallenges(date);
}

export function advanceDailyChallenges(
  state: DailyChallengeState,
  kind: DailyChallengeKind,
  amount: number,
): { state: DailyChallengeState; completed: DailyChallenge[] } {
  if (amount <= 0) return { state, completed: [] };
  const completed: DailyChallenge[] = [];
  let changed = false;
  const challenges = state.challenges.map((challenge) => {
    if (challenge.kind !== kind || challenge.completed) return challenge;
    changed = true;
    const progress = Math.min(challenge.target, challenge.progress + amount);
    const next = { ...challenge, progress, completed: progress >= challenge.target };
    if (next.completed) completed.push(next);
    return next;
  });
  return { state: changed ? { ...state, challenges } : state, completed };
}
