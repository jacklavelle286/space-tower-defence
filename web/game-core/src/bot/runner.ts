// Plays a wave set with a test player (Gate M, LD0; C17.1), the way tools/sim/sim.py run_campaign does, but on the
// game's own simulation: the same battle code the children play, at the game's 60 ticks per second.
//
// Between waves the runner does what the server and the learning panel would: after the wave at position i it pays
// the learning reward for interval i when the activity "succeeds", and grants a meteor charge after the wave set's
// meteor waves when the meteor challenge succeeds (C9, C10). Success follows the simulator's fixed "pattern"
// (exactly round(5p) successes in every 5 intervals), so a run is a pure function of its inputs.
import { learningReward, meteorAward, type Ruleset } from "../data/game-data";
import type { Snapshot } from "../rules/contracts.generated";
import { battleSnapshot, createBattle, startWave, step, type Battle } from "../sim/battle";
import type { BattleConfig } from "../sim/config";

/** One wave's facts, for the results table (scope §3.1 step 10). */
export interface WaveRow {
  /** 1-based position in the wave set. */
  readonly wave: number;
  readonly cleared: boolean;
  readonly healthEnd: number;
  readonly leaked: number;
  /** Health the leaks would have taken before any shield. */
  readonly leakDamage: number;
  readonly peakAliens: number;
  readonly ticks: number;
  readonly bounty: number;
  /** Credits held when the wave ended. */
  readonly credits: number;
  /** How far along the route the furthest alien got, 0..1 (1 = it reached the colony). */
  readonly penetration: number;
  readonly bossDefeated: boolean | null;
}

export interface BotRunResult {
  readonly policy: string;
  readonly learn: number;
  readonly seed: number;
  /** Waves cleared in a row from the first. */
  readonly cleared: number;
  readonly defeatedAt: number | null;
  readonly health: number;
  readonly rows: readonly WaveRow[];
}

/** What a test player sees after a wave. */
export interface WaveOutcome {
  readonly leakDamage: number;
  readonly penetration: number;
}

export interface Policy {
  readonly name: string;
  /** How often tick() runs during a wave, in ticks. */
  readonly tickInterval: number;
  /** Preparation for battle.wave: give commands (applied at once). */
  prep(battle: Battle): void;
  /** During the wave: commands are queued for the next tick (sim/battle.ts giveCommand). */
  tick(battle: Battle): void;
  afterWave(outcome: WaveOutcome): void;
}

export interface BotRunOptions {
  /** Learning success, 0..1 (C9.6, C17.2: 0, 0.6, 1). */
  readonly learn: number;
  /** Recorded in the result; a seeded policy takes its seed itself. */
  readonly seed?: number;
  /** Stop after this wave (default: the wave set's last). */
  readonly maxWave?: number;
  /** Grant meteor charges (default true). */
  readonly meteors?: boolean;
  /** The battle's run seed (cosmetic randomness only, sim/rng.ts). */
  readonly runSeed?: string;
}

/** Ten minutes of combat: no wave lasts that long (C17.5); a stuck wave counts as a defeat. */
export const MAX_WAVE_TICKS = 600 * 60;

/** tools/sim/sim.py learn_success, "pattern" mode. */
export function learnSucceeds(p: number, interval: number): boolean {
  if (p >= 1) return true;
  if (p <= 0) return false;
  return (interval * 3) % 5 < Math.round(p * 5);
}

/** The snapshot a run starts from: the wave set's credits, presets and colony health (as initialRunState). */
export function startingSnapshot(config: BattleConfig): Snapshot {
  const ws = config.waveSet;
  return {
    credits: ws.startCredits,
    placements: ws.presetPlacements.map((p) => ({ padId: p.padId, classId: p.classId, level: p.level, targeting: p.targeting })),
    colony: { health: ws.colonyHealth, shield: 0 },
    powers: {},
  };
}

function isBossType(config: BattleConfig, type: string): boolean {
  return (config.aliens[type]?.boss ?? null) !== null;
}

/** Runs one wave to its end; returns the row. The battle is left CLEARED or DEFEATED. */
export function fightWave(battle: Battle, policy: Policy | null): WaveRow {
  startWave(battle);
  const { config } = battle;
  const hasBoss = battle.config.waves[battle.wave - 1]?.hasBoss ?? false;
  let leakDamage = 0;
  let furthest = 0;
  let bossDefeated = false;
  while (battle.status === "IN_WAVE") {
    if (policy !== null && battle.tick % policy.tickInterval === 0 && battle.tick > 0) policy.tick(battle);
    step(battle);
    for (const e of battle.events) {
      if (e.kind === "leaked") leakDamage += e.damage;
      else if (e.kind === "defeated" && isBossType(config, e.type)) bossDefeated = true;
    }
    battle.events.length = 0;
    for (const a of battle.aliens) if (a.progress > furthest) furthest = a.progress;
    if (battle.tick > MAX_WAVE_TICKS) battle.status = "DEFEATED";
  }
  return {
    wave: battle.wave,
    cleared: battle.status === "CLEARED",
    healthEnd: battle.health,
    leaked: battle.stats.leaked,
    leakDamage,
    peakAliens: battle.stats.peakAliens,
    ticks: battle.tick,
    bounty: battle.stats.bounty,
    credits: battle.credits,
    penetration: battle.stats.leaked > 0 ? 1 : Math.min(1, furthest / config.route.length),
    bossDefeated: hasBoss ? bossDefeated : null,
  };
}

/** The snapshot after interval `interval` (the wave just cleared): its learning reward and meteor charge, paid when
 *  the learning "succeeds" (learnSucceeds). */
function afterInterval(ruleset: Ruleset, config: BattleConfig, snapshot: Snapshot, interval: number, learn: number, meteors: boolean): Snapshot {
  let credits = snapshot.credits;
  const powers = { ...snapshot.powers };
  if (learnSucceeds(learn, interval)) credits += learningReward(ruleset, interval);
  const j = config.waveSet.meteorAfter.indexOf(interval) + 1;
  if (meteors && j > 0 && learnSucceeds(learn, interval + 1000)) {
    const powerId = meteorAward(ruleset, j);
    if (powerId !== null) powers[powerId] = Math.min(ruleset.powerRules.inventoryCapPerPower, (powers[powerId] ?? 0) + 1);
  }
  return { ...snapshot, credits, powers };
}

/**
 * What a test player holds when wave `wave` is about to start (Gate M, LD12: the admin's battle preview jumps to a
 * wave): it plays waves 1 to wave - 1 with `policy` and is paid between them, as playWaveSet. `defeatedAt` is the
 * wave it lost, if it did (the snapshot is then the one it lost with, to show the operator).
 */
export function playUpTo(ruleset: Ruleset, config: BattleConfig, policy: Policy, wave: number, options: BotRunOptions): { snapshot: Snapshot; defeatedAt: number | null } {
  let snapshot = startingSnapshot(config);
  for (let w = 1; w < Math.min(wave, config.waves.length + 1); w += 1) {
    if (w > 1) snapshot = afterInterval(ruleset, config, snapshot, w - 1, options.learn, options.meteors ?? true);
    const battle = createBattle(config, snapshot, w, options.runSeed ?? "bot");
    policy.prep(battle);
    const row = fightWave(battle, policy);
    policy.afterWave({ leakDamage: row.leakDamage, penetration: row.penetration });
    if (!row.cleared) return { snapshot: battleSnapshot(battle), defeatedAt: w };
    snapshot = battleSnapshot(battle);
  }
  if (wave > 1) snapshot = afterInterval(ruleset, config, snapshot, wave - 1, options.learn, options.meteors ?? true);
  return { snapshot, defeatedAt: null };
}

/** Plays the wave set from its first wave with `policy` until defeat or the last wave (tools/sim run_campaign). */
export function playWaveSet(ruleset: Ruleset, config: BattleConfig, policy: Policy, options: BotRunOptions): BotRunResult {
  const { learn } = options;
  const last = Math.min(options.maxWave ?? config.waves.length, config.waves.length);
  const meteors = options.meteors ?? true;
  let snapshot = startingSnapshot(config);
  const rows: WaveRow[] = [];
  let cleared = 0;
  let defeatedAt: number | null = null;
  let health = snapshot.colony.health;
  for (let wave = 1; wave <= last; wave += 1) {
    if (wave > 1) snapshot = afterInterval(ruleset, config, snapshot, wave - 1, learn, meteors);
    const battle = createBattle(config, snapshot, wave, options.runSeed ?? "bot");
    policy.prep(battle);
    const row = fightWave(battle, policy);
    rows.push(row);
    health = row.healthEnd;
    policy.afterWave({ leakDamage: row.leakDamage, penetration: row.penetration });
    if (!row.cleared) {
      defeatedAt = wave;
      break;
    }
    cleared = wave;
    snapshot = battleSnapshot(battle);
  }
  return { policy: policy.name, learn, seed: options.seed ?? 0, cleared, defeatedAt, health, rows };
}
