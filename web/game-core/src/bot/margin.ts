// A wave's margin and length (Gate M, LD13; C8.1): the competent test player, with no learning success, plays the wave
// set from the start; before each measured wave, on its board as built for that wave (no purchases during the wave, no
// powers), the wave is tried tougher and tougher (runTrial) to find the largest health factor at which nothing leaks.
// Then the wave is fought for real, which gives its length at 1x. tools/sim reports the same "margin" column (C8.2).
import { battleSnapshot, createBattle } from "../sim/battle";
import type { BattleConfig } from "../sim/config";
import { competentPolicy } from "./policies";
import { fightWave, startingSnapshot, type Policy } from "./runner";
import { runTrial } from "./trial";

export interface WaveMeasure {
  readonly wave: number;
  /** The largest factor every health value could be multiplied by before an alien leaks (2 decimals), or null if the
   *  test player never reached this wave. */
  readonly margin: number | null;
  /** Seconds at 1x from the wave's start to its end, or null if it was not reached. */
  readonly seconds: number | null;
  readonly boss: boolean;
}

/** Bisection steps: the margin is found to within (upper bound) / 2^STEPS. */
const STEPS = 9;
const MAX_FACTOR = 64;

function leaks(battle: Parameters<typeof runTrial>[0], wave: number, s: number): boolean {
  const t = runTrial(battle, wave, s);
  return t.leaked > 0 || t.bossLeaked;
}

/** The margin of `wave` on `battle`'s board (built, before the wave starts). */
export function marginOf(battle: Parameters<typeof runTrial>[0], wave: number): number {
  if (leaks(battle, wave, 1)) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < STEPS; i += 1) {
      const mid = (lo + hi) / 2;
      if (leaks(battle, wave, mid)) hi = mid;
      else lo = mid;
    }
    return Math.floor(lo * 100) / 100;
  }
  let lo = 1;
  let hi = 2;
  while (hi < MAX_FACTOR && !leaks(battle, wave, hi)) {
    lo = hi;
    hi *= 2;
  }
  if (hi >= MAX_FACTOR && !leaks(battle, wave, hi)) return MAX_FACTOR;
  for (let i = 0; i < STEPS; i += 1) {
    const mid = (lo + hi) / 2;
    if (leaks(battle, wave, mid)) hi = mid;
    else lo = mid;
  }
  return Math.floor(lo * 100) / 100;
}

/**
 * Margins and lengths of `waves` (1-based positions), the competent player at 0 % learning playing from wave 1.
 * `onWave` hears each measured wave as it is done (the editor fills its table as the worker goes).
 */
export function measureWaves(
  config: BattleConfig,
  waves: readonly number[],
  onWave: (m: WaveMeasure) => void = () => undefined,
  policy: Policy = competentPolicy(config),
): WaveMeasure[] {
  const wanted = new Set(waves);
  const last = Math.min(Math.max(0, ...waves), config.waves.length);
  const out: WaveMeasure[] = [];
  let snapshot = startingSnapshot(config);
  let lost = false;
  for (let wave = 1; wave <= last; wave += 1) {
    const boss = config.waves[wave - 1]?.hasBoss ?? false;
    if (lost) {
      if (wanted.has(wave)) {
        const m = { wave, margin: null, seconds: null, boss };
        out.push(m);
        onWave(m);
      }
      continue;
    }
    // C8.1: no learning success, so the only income between waves is the bounty (no learning reward is paid).
    const battle = createBattle(config, snapshot, wave, "margin");
    policy.prep(battle);
    const margin = wanted.has(wave) ? marginOf(battle, wave) : null;
    const row = fightWave(battle, policy);
    policy.afterWave({ leakDamage: row.leakDamage, penetration: row.penetration });
    if (wanted.has(wave)) {
      const m = { wave, margin, seconds: Math.round(row.ticks / 60), boss };
      out.push(m);
      onWave(m);
    }
    if (!row.cleared) lost = true;
    else snapshot = battleSnapshot(battle);
  }
  return out;
}
