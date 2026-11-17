// Look-ahead trials for the competent test player (Gate M, LD0; tools/sim/sim.py Game.trial_clone and stress_def):
// play a wave made `s` times tougher on a copy of the present board, with unlimited credits and health and no powers,
// and report the damage the astronauts dealt and what leaked. The player compares boards by that damage.
import type { Snapshot } from "../rules/contracts.generated";
import { createBattle, giveCommand, placementsOf, startWave, step, type Battle, type Command } from "../sim/battle";
import { planFor, type BattleConfig, type WavePlan } from "../sim/config";

const PLENTY = 1_000_000_000;
/** tools/sim Competent._damage: max_time=400 s. */
const TRIAL_TICKS = 400 * 60;

export interface TrialResult {
  readonly damage: number;
  readonly leaked: number;
  readonly spawned: number;
  readonly bossLeaked: boolean;
}

const stressed = new WeakMap<BattleConfig, Map<string, BattleConfig>>();

/** The configuration with wave `wave` made `s` times tougher: every health value, a boss's included (stress_def). */
export function stressConfig(config: BattleConfig, wave: number, s: number): BattleConfig {
  let cache = stressed.get(config);
  if (cache === undefined) {
    cache = new Map();
    stressed.set(config, cache);
  }
  const key = `${wave}/${s}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const plan = planFor(config, wave);
  const bossType = plan.spawns.find((sp) => (config.aliens[sp.type]?.boss ?? null) !== null)?.type;
  const bossBase = bossType === undefined ? null : (plan.bossHp ?? config.aliens[bossType]?.hp ?? null);
  const tougher: WavePlan = { ...plan, hpMult: plan.hpMult * s, bossHp: bossBase === null ? null : Math.round(bossBase * s) };
  const waves = [...config.waves];
  waves[wave - 1] = tougher;
  const out: BattleConfig = { ...config, waves, endless: null };
  cache.set(key, out);
  return out;
}

/** A copy of `battle`'s board ready for wave `wave` of `config`, with plenty of credits and health and no powers. */
export function trialBattle(battle: Battle, config: BattleConfig, wave: number): Battle {
  const snapshot: Snapshot = { credits: PLENTY, placements: placementsOf(battle), colony: { health: PLENTY, shield: 0 }, powers: {} };
  return createBattle(config, snapshot, wave, "trial");
}

/** Plays wave `wave` made `s` times tougher on a copy of the board after `changes`. Changes that fail are skipped. */
export function runTrial(battle: Battle, wave: number, s: number, changes: readonly Command[] = []): TrialResult {
  const config = stressConfig(battle.config, wave, s);
  const t = trialBattle(battle, config, wave);
  for (const c of changes) {
    giveCommand(t, c);
    t.credits = PLENTY;
  }
  startWave(t);
  let bossDefeated = false;
  const hasBoss = config.waves[wave - 1]?.hasBoss ?? false;
  while (t.status === "IN_WAVE" && t.tick < TRIAL_TICKS) {
    step(t);
    if (hasBoss) {
      for (const e of t.events) if (e.kind === "defeated" && (config.aliens[e.type]?.boss ?? null) !== null) bossDefeated = true;
    }
    t.events.length = 0;
  }
  return { damage: t.stats.damage, leaked: t.stats.leaked, spawned: t.stats.spawned, bossLeaked: hasBoss && !bossDefeated };
}
