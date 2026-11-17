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
//
// Aliens (Phase 26, M2-03, mechanics 3): each alien's traits become AlienStats fields the simulation reads (armour,
// bubble layers, flying, healer, children); no part of the simulation names an alien type. The caps of C6.4 are
// compiled to whole ticks here, and so is the healers' shared clock.
//
// Bosses (Phase 27, M2-04, C7): each boss is compiled into an AlienStats like any alien, with `boss` set to its
// phases in simulation units (speed per tick, gift radius squared). The simulation reads the boss's phase from its
// health with bossPhaseAt; nothing names a boss.
//
// Meteor powers (Phase 28, M2-05, C10): each power is compiled into a PowerStats holding its effect in simulation
// units (slow ticks, burst radius squared); the simulation reads the effect, never the power's ID. The use rules (uses
// per wave, the shared lockout in ticks) are compiled once here too.
import type { AttackKind, AuthoredWave, Boss, ClassLevel, PlanetDocument, Power, ReleaseSpec, Ruleset, Targeting, WaveSet } from "../data/game-data";
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
  /** "Frost Explorer": display only (the shop card's title, D4); the simulation never reads it. */
  readonly role: string;
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

/** Patchling's heal (C6.1) in simulation units. The clock is BattleConfig.healPeriodTicks, shared by every healer. */
export interface HealerStats {
  /** Health before the wave's multiplier; healAmount() applies it. */
  readonly amount: number;
  /** Squared units, compared with the squared distance between the healer's point and the other alien's. */
  readonly radiusSq: number;
  /** In tiles, for drawing the ring from the same number. */
  readonly radiusTiles: number;
}

/** One boss phase (C7) in simulation units. */
export interface BossPhaseStats {
  /** The phase begins when health x 100 <= fromPct x maximum health (integers, C2.2). */
  readonly fromPct: number;
  readonly name: string;
  /** Units per tick in this phase: the boss's base speed x the phase's speedFactor (no wave speedMult, C7). */
  readonly speed: number;
  readonly armour: number;
  /** On entering: the boss's bubble layers are set to this, or null to leave them as they are. */
  readonly selfBubbles: number | null;
  /** On entering: every other live non-boss alien within radius is raised to at least `layers` layers, or null. */
  readonly giveBubbles: { readonly layers: number; readonly radiusSq: number; readonly radiusTiles: number } | null;
  /** On entering: released at the boss's route position (C6.3 timing and caps); empty for none. */
  readonly release: readonly ReleaseSpec[];
}

/** What makes an alien a boss (C7). */
export interface BossStats {
  /** In order; phases[0] (fromPct 100) is the boss as it arrives. */
  readonly phases: readonly BossPhaseStats[];
  /** A slow works on the boss at this percentage of its strength (C7: 50, "half strength"). */
  readonly slowFactorPct: number;
}

export interface AlienStats {
  readonly id: string;
  readonly name: string;
  readonly hp: number;
  /** Tiles per second, from the ruleset. Per-wave speed is set at spawn (speed x speedMult). */
  readonly speed: number;
  readonly leak: number;
  readonly bounty: number;
  // Traits (C6.1, C6.2); a ruleset before mechanics 3 has none, so every alien gets the "no trait" values.
  /** Damage every hit loses, at least 1 always landing (C2.2); 0 = no armour. */
  readonly armour: number;
  /** Bubble layers it starts with; each absorbs one whole hit (C6.1). 0 = none. */
  readonly bubbles: number;
  /** A blast does half damage to it, rounded up (C2.2). */
  readonly flying: boolean;
  /** Arrives as a tight group (C6.1). No simulation effect: the renderer may draw it as part of a cluster. */
  readonly cluster: boolean;
  readonly healer: HealerStats | null;
  /** What it releases when defeated (C6.3), unless the wave names other cargo; empty for most aliens. */
  readonly children: readonly ReleaseSpec[];
  /** Never scheduled by a wave, only released (Slimelet). */
  readonly descendantOnly: boolean;
  /** Set for a boss (C7): its health is absolute (`hp`, no hpMult) and its speed and armour come from its phase. */
  readonly boss: BossStats | null;
}

/** What one meteor power does when used (C10), in simulation units. */
export type PowerEffectStats =
  /** Frost Pulse: a slow on every alien on the field, under the C5.4 rules (cap, one slow at a time, bosses at half). */
  | { readonly kind: "slow"; readonly pct: number; readonly ticks: number }
  /** Comet Burst: every alien within the radius of the chosen route point loses a share of its maximum health. */
  | { readonly kind: "burst"; readonly radiusSq: number; readonly radiusTiles: number; readonly pct: number; readonly bossPct: number }
  /** Colony Shield: points added at once, up to the colony's shieldAbsoluteCap. */
  | { readonly kind: "shield"; readonly points: number };

export interface PowerStats {
  readonly id: string;
  readonly name: string;
  readonly effect: PowerEffectStats;
}

/** C10's use rules in ticks. A ruleset with no powers has usesPerWave 0, so no use is ever allowed. */
export interface PowerRuleStats {
  readonly usesPerWave: number;
  /** After any power is used on tick t, the next may be used from tick t + lockoutTicks. */
  readonly lockoutTicks: number;
}

/** The object caps of C6.4, durations in ticks. */
export interface CapStats {
  /** Hard cap: never more aliens alive at once, descendants included. */
  readonly maxActiveAliens: number;
  /** A scheduled spawn that is due waits while this many aliens are alive. */
  readonly scheduledSpawnSoftCap: number;
  /** A descendant release waits while this many descendants are alive. */
  readonly maxLiveDescendants: number;
  /** Between two descendants released by one parent. */
  readonly descendantReleaseGapTicks: number;
  /** Between two scheduled spawns that had to wait. */
  readonly deferredSpawnGapTicks: number;
  /** Generations below a scheduled alien (a descendant is generation 1). */
  readonly maxDescendantDepth: number;
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
  /**
   * Open from the start of this wave set (padsOpenAsForWave). A CHALLENGE fixes its pads with that; in a CAMPAIGN more
   * pads open as waves are cleared (C3.3): ask padOpen for the pads of a given wave.
   */
  readonly open: boolean;
}

/**
 * Whether `pad` takes an astronaut while preparing or fighting `wave` (C3.3, tools/sim Game.pad_is_open): open from the
 * start of the wave set, or, in a CAMPAIGN, once the wave cleared just before is at or past the pad's opensAfterWave.
 */
export function padOpen(config: Pick<BattleConfig, "waveSet">, pad: PadInfo, wave: number): boolean {
  return pad.open || (config.waveSet.mode === "CAMPAIGN" && pad.opensAfterWave <= wave - 1);
}

export interface ScheduledSpawn {
  readonly tick: number;
  readonly type: string;
  /** The group's cargo (C6.3), replacing the type's own children; null = the type's own. */
  readonly cargo: readonly ReleaseSpec[] | null;
}

export interface WavePlan {
  readonly wave: number;
  /** Spawns in the order they are due; ties keep the authored group order. */
  readonly spawns: readonly ScheduledSpawn[];
  readonly hpMult: number;
  readonly speedMult: number;
  /** True when the wave schedules a boss: clearing it repairs colony.repairOnBossClear (C7). */
  readonly hasBoss: boolean;
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
    /** Health repaired when a wave with a boss is cleared, whether the boss was defeated or leaked (C7). */
    readonly repairOnBossClear: number;
  };
  /** C5.4. capPct 0 in a mechanics 1 ruleset, which has no slow attack. */
  readonly slow: { readonly capPct: number; readonly refreshTicks: number };
  readonly sell: { readonly refundPct: number; readonly roundDownTo: number };
  readonly caps: CapStats;
  /** The healers' shared clock (C6.1, C2.5: it starts at wave start): a pulse on every multiple of this tick. Null
   *  when no alien in the ruleset heals. */
  readonly healPeriodTicks: number | null;
  /** The meteor powers (C10), by power ID; {} before mechanics 3. */
  readonly powers: Readonly<Record<string, PowerStats>>;
  readonly powerRules: PowerRuleStats;
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

/** Patchling heal (C2.2): floor(amount x hpMult + 0.5); the caller keeps it at or below the alien's maximum. */
export function healAmount(amount: number, hpMult: number): number {
  return Math.floor(amount * hpMult + 0.5);
}

/** Juno's blast on a flying alien (C2.2): ceil(damage / 2), in integers. */
export function flyingBlastDamage(damage: number): number {
  return Math.floor((damage + 1) / 2);
}

/** Armour (C2.2): max(1, damage - armour). No armour leaves the damage as it is. */
export function armouredDamage(damage: number, armour: number): number {
  return armour > 0 ? Math.max(1, damage - armour) : damage;
}

/** Sol buff on damage (C2.2, C5.6): floor((damage x (100 + buffPct) + 50) / 100), integers only. */
export function buffedDamage(damage: number, buffPct: number): number {
  return Math.floor((damage * (100 + buffPct) + 50) / 100);
}

/**
 * The boss phase health puts a boss in (C7): the last phase whose threshold health has reached, health x 100 <=
 * fromPct x maxHp, in integers. A pure function of health: the same health always gives the same phase, and lower
 * health never gives an earlier one. (The battle keeps the deepest phase a boss has reached: a Patchling may heal a
 * boss, but a phase that has begun never ends, because its actions cannot be undone.)
 */
export function bossPhaseAt(boss: BossStats, hp: number, maxHp: number): number {
  let phase = 0;
  for (let i = 1; i < boss.phases.length; i += 1) {
    if (hp * 100 <= (boss.phases[i]?.fromPct ?? 0) * maxHp) phase = i;
  }
  return phase;
}

/** A slow's strength on a boss (C7 "slows work at half strength"): floor(pct x slowFactorPct / 100), before the cap. */
export function bossSlowPct(pct: number, slowFactorPct: number): number {
  return Math.floor((pct * slowFactorPct) / 100);
}

/** Comet Burst (C2.2): ceil(maxHealth x pct / 100), in integers: removed directly from health. */
export function cometDamage(maxHp: number, pct: number): number {
  return Math.floor((maxHp * pct + 99) / 100);
}

/** Sell refund (C2.2, C5.7): floor(floor(invested x 70 / 100) / 5) x 5. */
export function sellRefund(invested: number, sell: BattleConfig["sell"]): number {
  return Math.floor(Math.floor((invested * sell.refundPct) / 100) / sell.roundDownTo) * sell.roundDownTo;
}

function wavePlan(position: number, wave: AuthoredWave, bosses: Readonly<Record<string, Boss>>): WavePlan {
  const spawns: (ScheduledSpawn & { order: number })[] = [];
  let order = 0;
  for (const group of wave.groups) {
    for (let k = 0; k < group.count; k += 1) {
      spawns.push({ tick: secondsToTicks(group.at + k * group.gap), type: group.type, cargo: group.cargo ?? null, order });
      order += 1;
    }
  }
  spawns.sort((a, b) => a.tick - b.tick || a.order - b.order);
  return {
    wave: position,
    spawns: spawns.map(({ tick, type, cargo }) => ({ tick, type, cargo })),
    hpMult: wave.hpMult,
    speedMult: wave.speedMult,
    hasBoss: wave.groups.some((g) => Object.hasOwn(bosses, g.type)),
  };
}

/** A boss as an AlienStats (C7): its arrival phase gives its starting armour and layers, its defeat release is its children. */
function bossAlienStats(id: string, boss: Boss): AlienStats {
  const phases = boss.phases.map(
    (p): BossPhaseStats => ({
      fromPct: p.fromPct,
      name: p.name,
      // The same conversion as every alien's speed. 0.45 x 1.15 (Captain Clank cracked, Queen Bubbla's storm) is
      // 0.5175 tiles/s, 517.5 units a tick, which in floating point is 517.4999... and rounds to 517.
      speed: speedToUnitsPerTick(boss.speed * p.speedFactor),
      armour: p.armour,
      selfBubbles: p.onEnter?.selfBubbles ?? null,
      giveBubbles:
        p.onEnter?.giveBubbles === undefined
          ? null
          : { layers: p.onEnter.giveBubbles.layers, radiusSq: tilesSq(p.onEnter.giveBubbles.radius), radiusTiles: p.onEnter.giveBubbles.radius },
      release: p.onEnter?.release ?? [],
    }),
  );
  const arrival = phases[0];
  if (arrival === undefined) throw new Error(`boss ${id} has no phases`); // parseRuleset requires one
  return {
    id,
    name: boss.name,
    hp: boss.hp,
    speed: boss.speed,
    leak: boss.leak,
    bounty: boss.bounty,
    armour: arrival.armour,
    bubbles: arrival.selfBubbles ?? 0,
    flying: false,
    cluster: false,
    healer: null,
    children: boss.onDefeatRelease ?? [],
    descendantOnly: false,
    boss: { phases, slowFactorPct: boss.slowFactorPct },
  };
}

/** One power (C10) in simulation units. */
function powerStats(id: string, p: Power): PowerStats {
  switch (p.effect) {
    case "slow":
      return { id, name: p.name, effect: { kind: "slow", pct: p.slowPct, ticks: secondsToTicks(p.duration) } };
    case "burst":
      return {
        id,
        name: p.name,
        effect: { kind: "burst", radiusSq: tilesSq(p.radius), radiusTiles: p.radius, pct: p.pctMaxHp, bossPct: p.bossPctMaxHp },
      };
    case "shield":
      return { id, name: p.name, effect: { kind: "shield", points: p.shieldPoints } };
  }
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
      role: c.role,
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
  let healPeriodTicks: number | null = null;
  for (const [id, a] of Object.entries(ruleset.aliens)) {
    const { healer } = a.traits;
    aliens[id] = {
      id,
      name: a.name,
      hp: a.hp,
      speed: a.speed,
      leak: a.leak,
      bounty: a.bounty,
      armour: a.traits.armour ?? 0,
      bubbles: a.traits.bubbles ?? 0,
      flying: a.traits.flying === true,
      cluster: a.traits.cluster === true,
      healer: healer === undefined ? null : { amount: healer.amount, radiusSq: tilesSq(healer.radius), radiusTiles: healer.radius },
      children: a.traits.children ?? [],
      descendantOnly: a.descendantOnly,
      boss: null,
    };
    // parseRuleset has checked that every healer has the same period (one shared clock).
    if (healer !== undefined) healPeriodTicks = Math.max(1, secondsToTicks(healer.period));
  }

  // parseRuleset has refused a boss ID that is also an alien ID, so this adds and never replaces.
  for (const [id, boss] of Object.entries(ruleset.bosses)) aliens[id] = bossAlienStats(id, boss);

  const authored = new Map(planet.waves.map((w) => [w.wave, w]));
  const waves = waveSet.waves.map((n, i) => {
    const w = authored.get(n);
    if (w === undefined) throw new Error(`wave set ${waveSetId}: authored wave ${n} is missing`);
    for (const g of w.groups) {
      if (aliens[g.type] === undefined) throw new Error(`wave ${n}: alien "${g.type}" is not in ruleset ${ruleset.version}`);
    }
    return wavePlan(i + 1, w, ruleset.bosses);
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
      repairOnBossClear: ruleset.colony.repairOnBossClear,
    },
    slow: {
      capPct: ruleset.slow?.capPct ?? 0,
      refreshTicks: secondsToTicks(ruleset.slow?.refreshWithinSeconds ?? 0),
    },
    sell: ruleset.sell,
    caps: {
      maxActiveAliens: ruleset.caps.maxActiveAliens,
      scheduledSpawnSoftCap: ruleset.caps.scheduledSpawnSoftCap,
      maxLiveDescendants: ruleset.caps.maxLiveDescendants,
      descendantReleaseGapTicks: Math.max(1, secondsToTicks(ruleset.caps.descendantReleaseGap)),
      deferredSpawnGapTicks: Math.max(1, secondsToTicks(ruleset.caps.deferredSpawnGap)),
      maxDescendantDepth: ruleset.caps.maxDescendantDepth,
    },
    healPeriodTicks,
    powers: Object.fromEntries(Object.entries(ruleset.powers).map(([id, p]) => [id, powerStats(id, p)])),
    powerRules: {
      usesPerWave: ruleset.powerRules.perWaveUseLimitPerPower ?? 0,
      lockoutTicks: secondsToTicks(ruleset.powerRules.sharedLockoutSeconds ?? 0),
    },
  };
}
