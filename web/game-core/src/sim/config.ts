// Battle configuration: the pinned ruleset and planet document turned into the integer numbers the simulation uses
// (C2.1 "durations in the data are seconds, converted once at load", C2.2 integers).
//
// compileBattleConfig is called once per run. It takes already-parsed game data (parseRuleset / parsePlanet in
// ../data/game-data.ts), whose parser has already refused any mechanics number this game-core does not support.
//
// What the simulation does with each attack kind (C5.2):
//   single  one target, full damage (Nova, Orion)
//   blast   every alien within the splash radius of the target, full damage each (Juno)
//   slow    one target, full damage, and a slow on the target, or at level 3 on every alien near it (Pip, C5.4)
//   shield  never fires; adds colony shield points every period, and repairs when a wave is cleared (Mira, C5.5)
//   buff    never fires; raises the damage of attackers on nearby pads, strongest Sol only (Sol, C5.6)
// Phase 25 (M2-02) completed the last three, which completes mechanics 2 (ADR-0033).
import type { AttackKind, AuthoredWave, ClassLevel, PlanetDocument, Ruleset, Targeting, WaveSet } from "../data/game-data";
import { STEPS_PER_SECOND } from "../clock";
import { buildRoute, UNITS_PER_TILE, type Route } from "./route";

/** What one shot of an attacking level does, in simulation units. */
export interface ShotStats {
  /** Range squared, in squared units. */
  readonly rangeSq: number;
  /** Range in tiles, for drawing the preview circle from the same number (C3.1). */
  readonly rangeTiles: number;
  readonly periodTicks: number;
  readonly damage: number;
  /** Blast radius squared around the target, in squared units; 0 for a single-target shot. */
  readonly splashSq: number;
  /** Pip's slow (C5.4), or null for a shot that does not slow. */
  readonly slow: SlowStats | null;
}

/** The slow one shot applies (C5.2, C5.4). */
export interface SlowStats {
  /** Speed reduction in percent, before the ruleset's cap. */
  readonly pct: number;
  readonly ticks: number;
  /** 0: the target only. Above 0: every live alien within this radius (squared units) of the target, target included. */
  readonly radiusSq: number;
}

/** Mira's pulses and repair (C5.2, C5.5). */
export interface ShieldStats {
  /** Shield points each pulse adds (never above the colony's shieldCap). */
  readonly points: number;
  readonly periodTicks: number;
  /** Health repaired when a wave is cleared; all Miras together repair at most colony.miraRepairCapPerWave. */
  readonly repairOnWaveClear: number;
}

/** Sol's damage bonus (C5.2, C5.6). */
export interface BuffStats {
  readonly pct: number;
  /** Squared units, compared with the squared distance between pad centres. */
  readonly radiusSq: number;
  /** In tiles, for drawing the ring from the same number. */
  readonly radiusTiles: number;
}

export interface LevelStats {
  readonly level: number;
  /** Purchase price at level 1, upgrade price at levels 2 and 3 (C5.2). */
  readonly cost: number;
  /** Everything paid to reach this level (C5.2 "Cumulative cost"), the base of the sell refund (C5.7). */
  readonly invested: number;
  /** null for a support class (Mira, Sol): it never fires. */
  readonly shot: ShotStats | null;
  /** Mira only. */
  readonly shield: ShieldStats | null;
  /** Sol only. */
  readonly buff: BuffStats | null;
}

export interface ClassStats {
  readonly id: string;
  readonly name: string;
  readonly attack: AttackKind;
  /** Placeable while preparing wave unlockAfterWave + 1 and later, in a CAMPAIGN wave set (C5.9). */
  readonly unlockAfterWave: number;
  readonly deployCap: number | null;
  /** The modes the player may choose; empty for a class that does not aim. */
  readonly targeting: readonly Targeting[];
  readonly defaultTargeting: Targeting;
  /** First level at which a mode may be chosen; absent = level 1 (C5.3). */
  readonly targetingFromLevel: Readonly<Partial<Record<Targeting, number>>>;
  readonly levels: readonly LevelStats[];
}

export interface AlienStats {
  readonly id: string;
  readonly name: string;
  readonly hp: number;
  /** Tiles per second, from the ruleset. Per-wave speed is set at spawn (speed x speedMult). */
  readonly speed: number;
  readonly leak: number;
  readonly bounty: number;
}

export interface PadInfo {
  readonly id: string;
  /** Tile coordinates (tile centres). */
  readonly x: number;
  readonly y: number;
  /** Centre in units. */
  readonly cx: number;
  readonly cy: number;
  readonly opensAfterWave: number;
  /** Open in this run's wave set (C3.3; a CHALLENGE fixes it with padsOpenAsForWave). */
  readonly open: boolean;
}

export interface ScheduledSpawn {
  readonly tick: number;
  readonly type: string;
}

export interface WavePlan {
  readonly wave: number;
  /** Spawns in the order they are due; ties keep the authored group order. */
  readonly spawns: readonly ScheduledSpawn[];
  readonly hpMult: number;
  readonly speedMult: number;
}

export interface BattleConfig {
  readonly rulesetVersion: string;
  readonly campaignVersion: string;
  readonly waveSetId: string;
  readonly waveSet: WaveSet;
  readonly route: Route;
  readonly grid: { readonly cols: number; readonly rows: number };
  /** In attack order: the planet document's pad order, p01 to p16 (C2.3 step 4). */
  readonly pads: readonly PadInfo[];
  readonly classes: Readonly<Record<string, ClassStats>>;
  readonly aliens: Readonly<Record<string, AlienStats>>;
  /** The wave set's waves, by 1-based position in the set (position 1 = waves[0]). */
  readonly waves: readonly WavePlan[];
  readonly colony: {
    readonly maxHealth: number;
    /** What Mira's pulses may fill the shield to (C4, C5.5); the snapshot is trimmed to it when the wave ends. */
    readonly shieldCap: number;
    /** The most the shield may ever hold, even from the Colony Shield power (C4, C10). */
    readonly shieldAbsoluteCap: number;
    /** All Miras together repair at most this much health per cleared wave (C5.5). */
    readonly miraRepairCapPerWave: number;
  };
  /** C5.4. capPct 0 in a mechanics 1 ruleset, which has no slow attack. */
  readonly slow: { readonly capPct: number; readonly refreshTicks: number };
  readonly sell: { readonly refundPct: number; readonly roundDownTo: number };
  readonly scheduledSpawnSoftCap: number;
}

/** Seconds from the data to whole ticks (C2.1: ticks = round(seconds x 60)). */
export function secondsToTicks(seconds: number): number {
  return Math.round(seconds * STEPS_PER_SECOND);
}

/** Tiles per second to units per tick (speed / 60 tiles per tick). */
export function speedToUnitsPerTick(tilesPerSecond: number): number {
  return Math.round((tilesPerSecond * UNITS_PER_TILE) / STEPS_PER_SECOND);
}

/** Alien health in a wave (C2.2): max(1, floor(baseHealth x hpMult + 0.5)). */
export function waveHealth(baseHealth: number, hpMult: number): number {
  return Math.max(1, Math.floor(baseHealth * hpMult + 0.5));
}

/** Sol buff on damage (C2.2, C5.6): floor((damage x (100 + buffPct) + 50) / 100), integers only. */
export function buffedDamage(damage: number, buffPct: number): number {
  return Math.floor((damage * (100 + buffPct) + 50) / 100);
}

/** Sell refund (C2.2, C5.7): floor(floor(invested x 70 / 100) / 5) x 5. */
export function sellRefund(invested: number, sell: BattleConfig["sell"]): number {
  return Math.floor(Math.floor((invested * sell.refundPct) / 100) / sell.roundDownTo) * sell.roundDownTo;
}

function wavePlan(position: number, wave: AuthoredWave): WavePlan {
  const spawns: (ScheduledSpawn & { order: number })[] = [];
  let order = 0;
  for (const group of wave.groups) {
    for (let k = 0; k < group.count; k += 1) {
      spawns.push({ tick: secondsToTicks(group.at + k * group.gap), type: group.type, order });
      order += 1;
    }
  }
  spawns.sort((a, b) => a.tick - b.tick || a.order - b.order);
  return { wave: position, spawns: spawns.map(({ tick, type }) => ({ tick, type })), hpMult: wave.hpMult, speedMult: wave.speedMult };
}

/** A distance in tiles as squared units, for comparing against squared distances (C2.2: no square roots). */
function tilesSq(tiles: number): number {
  const units = Math.round(tiles * UNITS_PER_TILE);
  return units * units;
}

/** One level's numbers in simulation units; `invested` is everything paid up to and including this level. */
function levelStats(l: ClassLevel, invested: number): LevelStats {
  let shot: ShotStats | null = null;
  let shield: ShieldStats | null = null;
  let buff: BuffStats | null = null;
  if ("damage" in l) {
    shot = {
      rangeSq: tilesSq(l.range),
      rangeTiles: l.range,
      periodTicks: secondsToTicks(l.period),
      damage: l.damage,
      splashSq: "splashRadius" in l ? tilesSq(l.splashRadius) : 0,
      slow: "slowPct" in l ? { pct: l.slowPct, ticks: secondsToTicks(l.slowDuration), radiusSq: tilesSq(l.slowRadius) } : null,
    };
  } else if ("shieldPoints" in l) {
    shield = { points: l.shieldPoints, periodTicks: secondsToTicks(l.period), repairOnWaveClear: l.repairOnWaveClear };
  } else {
    buff = { pct: l.buffPct, radiusSq: tilesSq(l.radius), radiusTiles: l.radius };
  }
  return { level: l.level, cost: l.cost, invested, shot, shield, buff };
}

/** Compile the numbers for one run on `waveSetId`. Throws on data the simulation cannot run. */
export function compileBattleConfig(ruleset: Ruleset, planet: PlanetDocument, waveSetId: string): BattleConfig {
  if (ruleset.simulation.tickRateHz !== STEPS_PER_SECOND) {
    throw new Error(`ruleset ${ruleset.version}: tickRateHz ${ruleset.simulation.tickRateHz}, the clock runs ${STEPS_PER_SECOND}`);
  }
  const waveSet = planet.waveSets[waveSetId];
  if (waveSet === undefined) throw new Error(`planet ${planet.version}: no wave set "${waveSetId}"`);

  const classes: Record<string, ClassStats> = {};
  for (const [id, c] of Object.entries(ruleset.classes)) {
    let invested = 0;
    const levels = c.levels.map((l: ClassLevel): LevelStats => {
      invested += l.cost;
      return levelStats(l, invested);
    });
    classes[id] = {
      id,
      name: c.name,
      attack: c.attack,
      unlockAfterWave: c.unlockAfterWave,
      deployCap: c.deployCap,
      targeting: c.targeting,
      defaultTargeting: c.defaultTargeting,
      targetingFromLevel: c.targetingFromLevel,
      levels,
    };
  }

  const aliens: Record<string, AlienStats> = {};
  for (const [id, a] of Object.entries(ruleset.aliens)) {
    aliens[id] = { id, name: a.name, hp: a.hp, speed: a.speed, leak: a.leak, bounty: a.bounty };
  }

  const authored = new Map(planet.waves.map((w) => [w.wave, w]));
  const waves = waveSet.waves.map((n, i) => {
    const w = authored.get(n);
    if (w === undefined) throw new Error(`wave set ${waveSetId}: authored wave ${n} is missing`);
    for (const g of w.groups) {
      if (aliens[g.type] === undefined) throw new Error(`wave ${n}: alien "${g.type}" is not in ruleset ${ruleset.version}`);
    }
    return wavePlan(i + 1, w);
  });

  const pads = planet.map.pads.map((p) => ({
    id: p.id,
    x: p.x,
    y: p.y,
    cx: p.x * UNITS_PER_TILE,
    cy: p.y * UNITS_PER_TILE,
    opensAfterWave: p.opensAfterWave,
    open: p.opensAfterWave <= waveSet.padsOpenAsForWave - 1,
  }));

  return {
    rulesetVersion: ruleset.version,
    campaignVersion: planet.version,
    waveSetId,
    waveSet,
    route: buildRoute(planet.map.route),
    grid: planet.map.grid,
    pads,
    classes,
    aliens,
    waves,
    colony: {
      maxHealth: ruleset.colony.maxHealth,
      shieldCap: ruleset.colony.shieldCap,
      shieldAbsoluteCap: ruleset.colony.shieldAbsoluteCap,
      miraRepairCapPerWave: ruleset.colony.miraRepairCapPerWave,
    },
    slow: {
      capPct: ruleset.slow?.capPct ?? 0,
      refreshTicks: secondsToTicks(ruleset.slow?.refreshWithinSeconds ?? 0),
    },
    sell: ruleset.sell,
    scheduledSpawnSoftCap: ruleset.caps.scheduledSpawnSoftCap,
  };
}
