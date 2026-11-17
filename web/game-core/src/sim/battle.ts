// The battle simulation for one wave (Phase 14, M1-21; C2 simulation rules, spine S4 and S10). Phase 24 (M2-01) added
// the six-class roster and economy; Phase 25 (M2-02) the targeting modes (C5.3), Pip's slow (C5.4), Mira's shield and
// repair (C5.5) and Sol's buff (C5.6); Phase 26 (M2-03) the alien traits (C6.1, C6.2), carriers and splitters (C6.3)
// and the object caps (C6.4); Phase 27 (M2-04) the bosses and their phases (C7).
//
// A Battle is plain data: one wave, built from the run snapshot, advanced one fixed tick at a time by `step`. The
// renderer reads it and draws; it never changes it. Everything is deterministic: integers only (C2.2), no clock, no
// Math.random, and the order inside a tick is fixed (C2.3):
//   1. queued player commands, in arrival order, each validated against the state at that moment (AC-09)
//   2. scheduled spawns that are due, then descendant releases that are due, both within the caps (C6.4)
//   3. support timers: Mira's shield pulses, in pad order; then the healers' shared pulse (C6.1)
//   4. astronaut attacks, in pad order p01 -> p16 (C2.4: instant hits), with Sol's buff on the damage; each hit goes
//      through the alien's traits in the C2.2 order (flying, bubble layer, armour); a boss whose health falls past a
//      phase threshold enters that phase at once, its actions before the defeat check (C7); a defeated carrier,
//      splitter or boss queues its descendants (C6.3)
//   5. alien movement, in id order, at the slowed speed while a slow lasts; an alien reaching the end leaks at once
//      (a carrier that leaks releases nothing)
//   6. defeat check (colony health <= 0), then the wave-complete check (and the repair on a cleared wave: Mira's,
//      and a boss wave's, C7)
//
// Traits are data (ruleset mechanics 3, compiled into AlienStats): nothing here names an alien type. An alien's
// armour, layers, flying, heal and children come from its AlienStats, so a new alien with existing traits needs only
// new data. A boss is an alien whose AlienStats has `boss` set: its phases (C7) are data too, and nothing here names a
// boss. Its phase is a pure function of its health (bossPhaseAt); entering one changes its armour and speed and may
// set its own bubble layers, give layers to aliens near it, and release aliens. A boss's state (phase, layers,
// speed) lives on its AlienState, which no other wave ever sees (below).
//
// Every comparison that decides something (which alien to aim at, whether a slow replaces another, whose buff is
// larger, whether a pulse is due) compares integers. Towers are kept in pad order and aliens in id order, and the
// targeting tie-breaks end on the alien id, so no choice depends on the order a list happens to be in.
//
// One Battle per wave, made fresh from the snapshot, is how "no timer or cooldown crosses a wave boundary" (spine S4,
// C2.5) holds by construction: attack timers start ready, and nothing but the snapshot is carried over. The same goes
// for bosses (C2.5 "boss phases belong to aliens; no alien survives a wave"): a boss's phase, layers and speed live on
// its AlienState, its pending releases on this Battle, and the next wave's Battle starts with neither. The compiled
// BattleConfig is shared between waves and is only ever read.
//
// `step`, `startWave` and the command functions change the Battle they are given (it is the caller's private
// object; copying every tick would only cost time). They read nothing else and return nothing hidden, so the same
// Battle and the same calls always give the same result.
import type { ReleaseSpec } from "../data/game-data";
import type { Placement, Snapshot, Targeting } from "../rules";
import type { AlienStats, BattleConfig, BossPhaseStats, BossStats, ClassStats, LevelStats, PadInfo, ShotStats, WavePlan } from "./config";
import {
  armouredDamage,
  bossPhaseAt,
  bossSlowPct,
  buffedDamage,
  flyingBlastDamage,
  healAmount,
  sellRefund,
  speedToUnitsPerTick,
  waveHealth,
} from "./config";
import { nextInt, waveSeed } from "./rng";
import { routePoint, withinRange, type Point } from "./route";

/** Walk-animation start frames an alien can get (cosmetic only, from the seeded generator). */
export const ALIEN_LOOKS = 6;

export type BattleStatus = "PREP" | "IN_WAVE" | "CLEARED" | "DEFEATED";

export type Command =
  | { readonly kind: "place"; readonly padId: string; readonly classId: string }
  | { readonly kind: "upgrade"; readonly padId: string }
  | { readonly kind: "sell"; readonly padId: string }
  | { readonly kind: "setTargeting"; readonly padId: string; readonly targeting: Targeting };

export type RejectReason =
  | "NOT_NOW"
  | "UNKNOWN_PAD"
  | "PAD_CLOSED"
  | "PAD_OCCUPIED"
  | "PAD_EMPTY"
  /** The class is not offered by this wave set (C13), or not in the ruleset at all. */
  | "CLASS_UNAVAILABLE"
  /** The class is in the wave set but not unlocked yet at this wave (C5.9). */
  | "CLASS_LOCKED"
  | "DEPLOY_CAP"
  | "NOT_ENOUGH_CREDITS"
  | "MAX_LEVEL"
  | "TARGETING_UNAVAILABLE";

export type CommandResult = { readonly ok: true } | { readonly ok: false; readonly reason: RejectReason };

export interface Tower {
  readonly padId: string;
  readonly classId: string;
  level: number;
  targeting: Targeting;
  /**
   * The tick at or after which it may act again. An attacker fires (C2.4: ready at wave start and when placed). For
   * Mira it is her next shield pulse: one full period after the wave starts or she is placed (C5.5, C2.4).
   */
  readyTick: number;
  /** For drawing only: the tick of the last shot and where it landed (units), or -1 / null. */
  lastShotTick: number;
  lastShotAt: Point | null;
}

export interface AlienState {
  readonly id: number;
  readonly type: string;
  hp: number;
  readonly maxHp: number;
  /** Route progress in units. */
  progress: number;
  /** Units per tick, unslowed. Fixed at spawn, except that a boss takes each phase's speed as it enters it (C7). */
  speed: number;
  /** The slow on this alien in percent (already capped, C5.4), or 0. 0 whenever slowTicksLeft is 0. */
  slowPct: number;
  /** Ticks of movement the slow still lasts; 0 = not slowed. */
  slowTicksLeft: number;
  /** Cosmetic: walk-animation start frame, 0..ALIEN_LOOKS-1, from the wave's seeded generator. */
  readonly look: number;
  /** Bubble layers left (C6.1 Bubble Guard): each absorbs one whole hit, then pops. Only a boss phase adds layers,
   *  to the boss itself or to the aliens near it (C7 Queen Bubbla, the Great Glorp). */
  bubbles: number;
  /** 0 for an alien the wave scheduled, 1 for a descendant (C6.3); never above the ruleset's maxDescendantDepth. */
  readonly depth: number;
  /** What it releases when defeated: the wave's cargo, or its type's children; empty for most aliens (C6.3). */
  readonly cargo: readonly ReleaseSpec[];
  /** A boss's phase, an index into its phases (C7): the deepest one its health has reached. Always 0 for an alien. */
  phase: number;
}

/**
 * One defeated parent's descendants waiting to come out (C6.3). They come out one at a time at `progress`, the
 * parent's route progress when it was defeated: the first on the tick after the defeat, each next one a release gap
 * after the previous. While the caps are reached (C6.4) the next one waits here; nothing is dropped. A boss queues
 * one of these each time a phase releases aliens (C7), from where it stands then, and one more when it is defeated.
 */
export interface PendingRelease {
  readonly parentId: number;
  readonly progress: number;
  /** The descendants' generation: the parent's depth + 1. */
  readonly depth: number;
  /** Every descendant, in release order (the release list's entries in order, each repeated `count` times). */
  readonly types: readonly string[];
  /** How many of `types` have come out. */
  released: number;
  /** The tick on or after which the next one may come out. */
  nextTick: number;
}

/**
 * `shot`: one per alien a shot damages (a blast gives one per alien inside it), with the damage dealt.
 * `popped`: a hit a bubble layer absorbed instead (C6.1), with the layers left.
 * `shielded`: a Mira pulse that added points (one at the cap adds none and is not reported).
 * `repaired`: Mira's repair when the wave is cleared (C5.5), the health actually added.
 * `healPulse`: one per live healer when the shared heal clock ticks (C6.1), where it stands, for the sparkle ring.
 * `healed`: an alien a heal pulse reached, with the health actually added (0 never reported).
 * `released`: a descendant came out of a defeated parent (C6.3), or of a boss entering a phase (C7).
 * `bossPhase`: a boss entered phase `phase` (C7), where it stood; one event per phase when one hit crosses several.
 * `bubbleGift`: a boss phase raised a nearby alien's bubble layers (C7 "gives 1 bubble layer"), to `layers`.
 */
export type BattleEvent =
  | { readonly kind: "shot"; readonly tick: number; readonly padId: string; readonly alienId: number; readonly damage: number }
  | { readonly kind: "popped"; readonly tick: number; readonly padId: string; readonly alienId: number; readonly layersLeft: number }
  | { readonly kind: "shielded"; readonly tick: number; readonly padId: string; readonly points: number }
  | { readonly kind: "repaired"; readonly tick: number; readonly health: number }
  | { readonly kind: "healPulse"; readonly tick: number; readonly alienId: number; readonly at: Point }
  | { readonly kind: "healed"; readonly tick: number; readonly alienId: number; readonly health: number }
  | { readonly kind: "released"; readonly tick: number; readonly alienId: number; readonly parentId: number; readonly type: string }
  | { readonly kind: "bossPhase"; readonly tick: number; readonly alienId: number; readonly type: string; readonly phase: number; readonly at: Point }
  | { readonly kind: "bubbleGift"; readonly tick: number; readonly bossId: number; readonly alienId: number; readonly layers: number }
  | {
      readonly kind: "defeated";
      readonly tick: number;
      readonly alienId: number;
      readonly type: string;
      readonly bounty: number;
      readonly at: Point;
    }
  | { readonly kind: "leaked"; readonly tick: number; readonly alienId: number; readonly damage: number }
  | { readonly kind: "rejected"; readonly tick: number; readonly command: Command; readonly reason: RejectReason };

export interface BattleStats {
  /** Every alien that entered the route: scheduled spawns and descendants. */
  spawned: number;
  /** Descendants released (C6.3), included in `spawned`. */
  released: number;
  defeated: number;
  leaked: number;
  bounty: number;
  shots: number;
  damage: number;
  healthLost: number;
  /** Health given back by heal pulses (C6.1). */
  healed: number;
  /** Scheduled spawns that came out after their tick because of the soft cap or the deferred-spawn gap (C6.4). */
  deferredSpawns: number;
  /** Descendants that came out after they were due because a cap held them (C6.4). */
  heldReleases: number;
  /** The most aliens, and the most descendants, alive at once (C6.4, C14). */
  peakAliens: number;
  peakDescendants: number;
}

export interface Battle {
  readonly config: BattleConfig;
  /** 1-based position in the wave set. */
  readonly wave: number;
  status: BattleStatus;
  /** Ticks run in this wave (0 during preparation). */
  tick: number;
  credits: number;
  health: number;
  shield: number;
  /** Carried through unchanged: mechanics 1 has no powers to use. */
  readonly powers: Readonly<Record<string, number>>;
  /** Kept in pad order. */
  towers: Tower[];
  /** Kept in id (spawn) order. */
  aliens: AlienState[];
  nextAlienId: number;
  /** Index of the next scheduled spawn in config.waves[wave - 1].spawns. */
  spawnIndex: number;
  /** The tick the last late (deferred) scheduled spawn came out, or null (C6.4 deferredSpawnGap). */
  lastDeferredSpawnTick: number | null;
  /** Descendants waiting to come out, in the order their parents were defeated (C6.3). */
  releases: PendingRelease[];
  /** Commands waiting for the next tick (IN_WAVE only). */
  queue: Command[];
  /** Seeded generator state (rng.ts). */
  rng: number;
  /** Facts from the commands and ticks since the caller last drained them (drainEvents). */
  events: BattleEvent[];
  readonly stats: BattleStats;
}

function padIndex(config: BattleConfig, padId: string): number {
  return config.pads.findIndex((p) => p.id === padId);
}

function classOf(config: BattleConfig, classId: string): ClassStats {
  const cls = config.classes[classId];
  if (cls === undefined) throw new Error(`battle: unknown class ${classId}`);
  return cls;
}

function levelOf(cls: ClassStats, level: number): LevelStats {
  const l = cls.levels[level - 1];
  if (l === undefined) throw new Error(`class ${cls.id} has no level ${level}`);
  return l;
}

function insertTower(battle: Battle, tower: Tower): void {
  const order = padIndex(battle.config, tower.padId);
  const at = battle.towers.findIndex((t) => padIndex(battle.config, t.padId) > order);
  if (at === -1) battle.towers.push(tower);
  else battle.towers.splice(at, 0, tower);
}

/**
 * A battle in preparation for wave `wave` (1-based position in the wave set), from the run snapshot.
 * Throws if the snapshot names a pad, class or level the configuration does not have (a corrupt save, not a
 * player mistake).
 */
export function createBattle(config: BattleConfig, snapshot: Snapshot, wave: number, runSeed: string): Battle {
  if (!Number.isInteger(wave) || wave < 1 || wave > config.waves.length) throw new Error(`battle: no wave ${wave} in the wave set`);
  const battle: Battle = {
    config,
    wave,
    status: "PREP",
    tick: 0,
    credits: snapshot.credits,
    health: snapshot.colony.health,
    shield: snapshot.colony.shield,
    powers: { ...snapshot.powers },
    towers: [],
    aliens: [],
    nextAlienId: 1,
    spawnIndex: 0,
    lastDeferredSpawnTick: null,
    releases: [],
    queue: [],
    rng: waveSeed(runSeed, wave),
    events: [],
    stats: {
      spawned: 0,
      released: 0,
      defeated: 0,
      leaked: 0,
      bounty: 0,
      shots: 0,
      damage: 0,
      healthLost: 0,
      healed: 0,
      deferredSpawns: 0,
      heldReleases: 0,
      peakAliens: 0,
      peakDescendants: 0,
    },
  };
  for (const p of snapshot.placements) {
    const cls = config.classes[p.classId];
    if (padIndex(config, p.padId) === -1 || cls === undefined) throw new Error(`battle: bad placement ${p.padId}/${p.classId}`);
    levelOf(cls, p.level);
    if (battle.towers.some((t) => t.padId === p.padId)) throw new Error(`battle: two placements on ${p.padId}`);
    insertTower(battle, { padId: p.padId, classId: p.classId, level: p.level, targeting: p.targeting, readyTick: 0, lastShotTick: -1, lastShotAt: null });
  }
  return battle;
}

/**
 * Whether a class may be placed in this battle (C5.9, C13): it must be in the wave set's class list, and in a
 * CAMPAIGN wave set also unlocked. "After wave 5" means available while preparing wave 6: a campaign battle for wave
 * w is prepared and fought with highestCompletedWave = w - 1 (waves are played in order), so the test is
 * unlockAfterWave <= w - 1, exactly tools/sim's Game.unlocked. A CHALLENGE wave set fixes its classes and ignores
 * unlock waves (C13: Bubble Trouble offers Juno from its first wave).
 */
export function classAvailability(config: BattleConfig, classId: string, wave: number): "AVAILABLE" | "LOCKED" | "NOT_IN_SET" {
  const cls = config.classes[classId];
  if (cls === undefined || !config.waveSet.classes.includes(classId)) return "NOT_IN_SET";
  if (config.waveSet.mode === "CAMPAIGN" && cls.unlockAfterWave > wave - 1) return "LOCKED";
  return "AVAILABLE";
}

/**
 * Check one command against the battle as it is at this moment, changing nothing. applyCommand runs exactly this
 * check first, so a preview (the pad panel's prices and greyed-out cards) can never disagree with the rules.
 */
export function checkCommand(battle: Readonly<Battle>, command: Command): CommandResult {
  const { config } = battle;
  const pad: PadInfo | undefined = config.pads.find((p) => p.id === command.padId);
  if (pad === undefined) return { ok: false, reason: "UNKNOWN_PAD" };
  const tower = battle.towers.find((t) => t.padId === command.padId);
  switch (command.kind) {
    case "place": {
      if (!pad.open) return { ok: false, reason: "PAD_CLOSED" };
      if (tower !== undefined) return { ok: false, reason: "PAD_OCCUPIED" };
      const availability = classAvailability(config, command.classId, battle.wave);
      if (availability === "NOT_IN_SET") return { ok: false, reason: "CLASS_UNAVAILABLE" };
      if (availability === "LOCKED") return { ok: false, reason: "CLASS_LOCKED" };
      const cls = classOf(config, command.classId);
      // C5.8: the cap counts what stands on the board now, including anything placed earlier in this same tick.
      if (cls.deployCap !== null && battle.towers.filter((t) => t.classId === cls.id).length >= cls.deployCap) {
        return { ok: false, reason: "DEPLOY_CAP" };
      }
      if (battle.credits < levelOf(cls, 1).cost) return { ok: false, reason: "NOT_ENOUGH_CREDITS" };
      return { ok: true };
    }
    case "upgrade": {
      if (tower === undefined) return { ok: false, reason: "PAD_EMPTY" };
      const next = classOf(config, tower.classId).levels[tower.level];
      if (next === undefined) return { ok: false, reason: "MAX_LEVEL" };
      if (battle.credits < next.cost) return { ok: false, reason: "NOT_ENOUGH_CREDITS" };
      return { ok: true };
    }
    case "sell":
      return tower === undefined ? { ok: false, reason: "PAD_EMPTY" } : { ok: true };
    case "setTargeting": {
      if (tower === undefined) return { ok: false, reason: "PAD_EMPTY" };
      const cls = classOf(config, tower.classId);
      // C5.3: only the class's own modes, each from its level (Orion's STRONG from level 3); Mira and Sol have none.
      if (!cls.targeting.includes(command.targeting) || tower.level < (cls.targetingFromLevel[command.targeting] ?? 1)) {
        return { ok: false, reason: "TARGETING_UNAVAILABLE" };
      }
      return { ok: true };
    }
  }
}

/**
 * Check and apply one command against the state at this moment (C2.3 step 1). Credits only ever fall by a price the
 * check has just seen they cover, so they never go negative (AC-09). Prices and refunds come from the ruleset
 * through the compiled config; nothing here knows a class's numbers.
 */
function applyCommand(battle: Battle, command: Command): CommandResult {
  const result = checkCommand(battle, command);
  if (!result.ok) return result;
  const { config } = battle;
  const tower = battle.towers.find((t) => t.padId === command.padId);
  switch (command.kind) {
    case "place": {
      const cls = classOf(config, command.classId);
      const first = levelOf(cls, 1);
      battle.credits -= first.cost;
      // C2.4: a newly placed attacker is ready at once; a newly placed Mira starts a full recharge, so selling and
      // placing her again never brings a pulse forward.
      insertTower(battle, {
        padId: command.padId,
        classId: cls.id,
        level: 1,
        targeting: cls.defaultTargeting,
        readyTick: battle.tick + (first.shield?.periodTicks ?? 0),
        lastShotTick: -1,
        lastShotAt: null,
      });
      break;
    }
    case "upgrade": {
      if (tower === undefined) break; // unreachable: checkCommand refused it
      const next = levelOf(classOf(config, tower.classId), tower.level + 1);
      battle.credits -= next.cost;
      tower.level += 1; // C2.4: upgrading does not reset the attack timer
      // Mira's pulse keeps its timer too, except that a shorter new period can bring it forward (level 3: 15 s ->
      // 12 s): the next pulse is at most one new period away (tools/sim/sim.py Game._refresh).
      if (next.shield !== null) tower.readyTick = Math.min(tower.readyTick, battle.tick + next.shield.periodTicks);
      break;
    }
    case "sell": {
      if (tower === undefined) break; // unreachable: checkCommand refused it
      // C5.7: 70% of everything paid for this astronaut (purchase plus upgrades), rounded down to a multiple of 5.
      battle.credits += sellRefund(levelOf(classOf(config, tower.classId), tower.level).invested, config.sell);
      battle.towers = battle.towers.filter((t) => t !== tower);
      break;
    }
    case "setTargeting": {
      if (tower !== undefined) tower.targeting = command.targeting;
      break;
    }
  }
  return result;
}

function record(battle: Battle, command: Command, result: CommandResult): CommandResult {
  if (!result.ok) battle.events.push({ kind: "rejected", tick: battle.tick, command, reason: result.reason });
  return result;
}

/**
 * Give a player command. In preparation it applies at once (no ticks run while preparing, C2.1). During the wave it
 * is queued and applied at the start of the next tick (C2.3 step 1); the result is then `{ok: true}` meaning
 * "queued", and a refusal arrives later as a `rejected` event. After the wave ends every command is refused.
 */
export function giveCommand(battle: Battle, command: Command): CommandResult {
  if (battle.status === "PREP") return record(battle, command, applyCommand(battle, command));
  if (battle.status === "IN_WAVE") {
    battle.queue.push(command);
    return { ok: true };
  }
  return record(battle, command, { ok: false, reason: "NOT_NOW" });
}

/**
 * Ready pressed: the wave begins. Attack timers start ready; Mira's first pulse is one full period away (C2.5, C5.5).
 */
export function startWave(battle: Battle): void {
  if (battle.status !== "PREP") throw new Error(`battle: cannot start a wave in ${battle.status}`);
  battle.status = "IN_WAVE";
  for (const t of battle.towers) t.readyTick = levelOf(classOf(battle.config, t.classId), t.level).shield?.periodTicks ?? 0;
}

// ---- targeting (C5.3) -------------------------------------------------------------------------------------------

/**
 * An alien's current speed for FAST, scaled by 100 so that it stays an integer: speed x (100 - slow%). Comparing
 * these products compares the current speeds exactly, with no division and no floating point.
 */
function speedKey(a: AlienState): number {
  return a.speed * (100 - a.slowPct);
}

/** The boss rules of an alien, or null for an ordinary alien. */
function bossOf(battle: Readonly<Battle>, alien: AlienState): BossStats | null {
  return battle.config.aliens[alien.type]?.boss ?? null;
}

/**
 * The slow a shot of strength `pct` would leave on `alien` (C5.4): never above the cap, and on a boss at its
 * slowFactorPct of the strength first (C7 "slows work at half strength": Pip's 40% is 20% on a boss).
 */
function effectiveSlowPct(battle: Battle, alien: AlienState, pct: number): number {
  const boss = bossOf(battle, alien);
  return Math.min(boss === null ? pct : bossSlowPct(pct, boss.slowFactorPct), battle.config.slow.capPct);
}

/**
 * Pip's preference (C5.3 "prefers an alien that is not currently slowed, so it spreads its frost"), as the simulator
 * has it (tools/sim/sim.py Game._pick): an alien counts as not slowed if its slow ends within the ruleset's
 * refreshWithinSeconds, or is weaker than the slow this Pip would apply.
 */
function wantsSlow(battle: Battle, a: AlienState, slowPct: number): boolean {
  return a.slowTicksLeft <= battle.config.slow.refreshTicks || a.slowPct < effectiveSlowPct(battle, a, slowPct);
}

/** A candidate target and its integer sort keys, most important first. */
interface Ranked {
  readonly alien: AlienState;
  /** 1 if a slowing shot would prefer this alien (Pip, wantsSlow), else 0. Always 0 for a shot that does not slow. */
  readonly prefer: number;
  /** The mode's own key: FAST speedKey, STRONG current health, CROWD aliens in the blast; 0 for FRONT. */
  readonly modeKey: number;
}

/**
 * Positive when `a` should be chosen over `b`. Every mode breaks its ties the same way, by FRONT: further along the
 * route, then the lower id (C2.2, C5.3). The final key is the id, which is unique, so two candidates never tie and
 * the result does not depend on the order the aliens are visited in.
 */
function compareTargets(a: Ranked, b: Ranked): number {
  return (
    a.prefer - b.prefer ||
    a.modeKey - b.modeKey ||
    a.alien.progress - b.alien.progress ||
    b.alien.id - a.alien.id
  );
}

/**
 * Choose what `tower` shoots at (C5.3), among live aliens within its range:
 *   FRONT   furthest along the route
 *   FAST    highest current speed (a slowed alien is slower); ties -> FRONT
 *   CROWD   most live aliens within the blast radius around it (itself included); ties -> FRONT
 *   STRONG  highest current health; ties -> FRONT
 * A slowing shot (Pip) first prefers aliens that want its slow, then applies its mode among them.
 */
function pickTarget(battle: Battle, tower: Tower, shot: ShotStats, pad: PadInfo): AlienState | null {
  const { route } = battle.config;
  const live = battle.aliens.filter((a) => a.hp > 0);
  const points = live.map((a) => routePoint(route, a.progress));
  let best: Ranked | null = null;
  for (let i = 0; i < live.length; i += 1) {
    const alien = live[i];
    const at = points[i];
    if (alien === undefined || at === undefined || !withinRange(at, pad.cx, pad.cy, shot.rangeSq)) continue;
    let modeKey = 0;
    switch (tower.targeting) {
      case "FRONT":
        break;
      case "FAST":
        modeKey = speedKey(alien);
        break;
      case "STRONG":
        modeKey = alien.hp;
        break;
      case "CROWD":
        modeKey = points.filter((p) => withinRange(p, at.x, at.y, shot.splashSq)).length;
        break;
    }
    const prefer = shot.slow !== null && wantsSlow(battle, alien, shot.slow.pct) ? 1 : 0;
    const candidate: Ranked = { alien, prefer, modeKey };
    if (best === null || compareTargets(candidate, best) > 0) best = candidate;
  }
  return best?.alien ?? null;
}

// ---- support effects (C5.4 - C5.6) ------------------------------------------------------------------------------

/**
 * Put a slow on an alien (C5.4). No stacking: an alien has one slow at a time. A slow is first capped (and halved on
 * a boss, C7); one that is equal or stronger than the current slow replaces it and keeps the longer of the two
 * remaining times; a weaker one is ignored. (An unslowed alien has slowPct 0, so any slow replaces "none".)
 */
function applySlow(battle: Battle, alien: AlienState, pct: number, ticks: number): void {
  const capped = effectiveSlowPct(battle, alien, pct);
  if (capped <= 0 || capped < alien.slowPct) return;
  alien.slowPct = capped;
  alien.slowTicksLeft = Math.max(alien.slowTicksLeft, ticks);
}

/**
 * Sol's buff for the astronaut on `padId` (C5.6), in percent: the single largest buffPct among the Sols whose radius
 * reaches that pad's centre, or 0. Only attackers are buffed: never Sol, Mira, or a Sol itself. A Sol's strength is
 * its own level's number and nothing else, so buffs cannot feed each other (no loop, whatever the board).
 */
export function buffPctAt(battle: Readonly<Battle>, padId: string): number {
  const { config } = battle;
  const tower = battle.towers.find((t) => t.padId === padId);
  const pad = config.pads.find((p) => p.id === padId);
  if (tower === undefined || pad === undefined) return 0;
  if (levelOf(classOf(config, tower.classId), tower.level).shot === null) return 0; // a support class is not buffed
  let best = 0;
  for (const sol of battle.towers) {
    const buff = levelOf(classOf(config, sol.classId), sol.level).buff;
    if (buff === null || buff.pct <= best) continue;
    const solPad = config.pads.find((p) => p.id === sol.padId);
    if (solPad !== undefined && withinRange({ x: pad.cx, y: pad.cy }, solPad.cx, solPad.cy, buff.radiusSq)) best = buff.pct;
  }
  return best;
}

/**
 * Add shield points, never above `limit` (and never above the absolute cap, C4). A shield already at or above the
 * limit is left as it is: a pulse never takes points away. Returns the points added. Mira's pulses use the colony's
 * shieldCap (C5.5); the Colony Shield power (Phase 28) will use shieldAbsoluteCap.
 */
function addShield(battle: Battle, points: number, limit: number): number {
  const ceiling = Math.min(limit, battle.config.colony.shieldAbsoluteCap);
  if (battle.shield >= ceiling) return 0;
  const added = Math.min(points, ceiling - battle.shield);
  battle.shield += added;
  return added;
}

/**
 * The repair when a wave is cleared (C4): Mira's (C5.5: each Mira adds her level's repairOnWaveClear, level 3: 1, the
 * total capped at miraRepairCapPerWave however many Miras stand), plus repairOnBossClear if the wave had a boss (C7:
 * "completing a boss wave repairs 3 health", whether the boss was defeated or reached the colony; tools/sim/sim.py
 * run_wave adds the two the same way). Health never goes above the maximum.
 */
function repairOnClear(battle: Battle, plan: WavePlan, tick: number): void {
  const { config } = battle;
  let mira = 0;
  for (const t of battle.towers) mira += levelOf(classOf(config, t.classId), t.level).shield?.repairOnWaveClear ?? 0;
  const repair = Math.min(mira, config.colony.miraRepairCapPerWave) + (plan.hasBoss ? config.colony.repairOnBossClear : 0);
  const healed = Math.max(0, Math.min(repair, config.colony.maxHealth - battle.health));
  if (healed === 0) return;
  battle.health += healed;
  battle.events.push({ kind: "repaired", tick, health: healed });
}

function alienStatsOf(config: BattleConfig, type: string): AlienStats {
  const stats = config.aliens[type];
  if (stats === undefined) throw new Error(`battle: unknown alien ${type}`);
  return stats;
}

/**
 * A new alien at route `progress` with the next id (C2.2: ids in spawn order, descendants included). Health and speed
 * are scaled by the wave (C6.1); armour, layers and leak are not. `cargo` replaces the type's own children (C6.3).
 * A boss (C7) arrives in its first phase with its absolute health and that phase's speed: the wave scales neither.
 */
function spawn(battle: Battle, plan: WavePlan, type: string, progress: number, depth: number, cargo: readonly ReleaseSpec[] | null): AlienState {
  const stats = alienStatsOf(battle.config, type);
  const look = nextInt(battle.rng, ALIEN_LOOKS);
  battle.rng = look.state;
  const hp = stats.boss === null ? waveHealth(stats.hp, plan.hpMult) : stats.hp;
  const alien: AlienState = {
    id: battle.nextAlienId,
    type,
    hp,
    maxHp: hp,
    progress,
    speed: stats.boss?.phases[0]?.speed ?? speedToUnitsPerTick(stats.speed * plan.speedMult),
    slowPct: 0,
    slowTicksLeft: 0,
    look: look.value,
    bubbles: stats.bubbles,
    depth,
    cargo: cargo ?? stats.children,
    phase: 0,
  };
  battle.aliens.push(alien);
  battle.nextAlienId += 1;
  battle.stats.spawned += 1;
  return alien;
}

/**
 * C2.3 step 2, scheduled spawns. They come out in schedule order on their tick, unless (C6.4):
 *   - the soft cap: while scheduledSpawnSoftCap aliens are alive a due spawn waits, and nothing behind it passes it;
 *   - the deferred gap: a spawn that had to wait comes out at most one per deferredSpawnGap, so a backlog trickles
 *     in as room appears instead of arriving in one lump.
 * A spawn is never dropped: it waits until it fits. The hard cap needs no check here, as the soft cap is below it.
 */
function spawnScheduled(battle: Battle, plan: WavePlan, tick: number): void {
  const { caps } = battle.config;
  for (;;) {
    const next = plan.spawns[battle.spawnIndex];
    if (next === undefined || next.tick > tick) return;
    if (battle.aliens.length >= caps.scheduledSpawnSoftCap) return;
    const late = tick > next.tick;
    if (late && battle.lastDeferredSpawnTick !== null && tick - battle.lastDeferredSpawnTick < caps.deferredSpawnGapTicks) return;
    spawn(battle, plan, next.type, 0, 0, next.cargo);
    battle.spawnIndex += 1;
    if (late) {
      battle.lastDeferredSpawnTick = tick;
      battle.stats.deferredSpawns += 1;
    }
  }
}

/** Descendants alive now (C6.4 counts them against maxLiveDescendants). */
function liveDescendants(battle: Readonly<Battle>): number {
  let n = 0;
  for (const a of battle.aliens) if (a.depth > 0) n += 1;
  return n;
}

/**
 * C2.3 step 2, after the scheduled spawns: descendant releases that are due (C6.3), parents in the order they were
 * defeated, at most one per parent per tick. While maxActiveAliens aliens or maxLiveDescendants descendants are alive,
 * a due release waits at its parent's defeat point (C6.4). The caps are the same for every parent, so once one release
 * waits, the rest wait too, and the earliest-defeated parent goes first when room appears. Nothing is dropped.
 */
function releaseDescendants(battle: Battle, plan: WavePlan, tick: number): void {
  if (battle.releases.length === 0) return;
  const { caps } = battle.config;
  let descendants = liveDescendants(battle);
  for (const pending of battle.releases) {
    if (pending.nextTick > tick) continue;
    if (battle.aliens.length >= caps.maxActiveAliens || descendants >= caps.maxLiveDescendants) break;
    const type = pending.types[pending.released];
    if (type === undefined) continue;
    const child = spawn(battle, plan, type, pending.progress, pending.depth, null);
    battle.events.push({ kind: "released", tick, alienId: child.id, parentId: pending.parentId, type });
    battle.stats.released += 1;
    if (tick > pending.nextTick) battle.stats.heldReleases += 1;
    descendants += 1;
    pending.released += 1;
    pending.nextTick = tick + caps.descendantReleaseGapTicks;
  }
  battle.releases = battle.releases.filter((p) => p.released < p.types.length);
}

/**
 * C2.3 step 3, the healers' shared clock (C6.1; C2.5: it starts at wave start). On every multiple of the period, each
 * alien below its maximum health that stands within reach of at least one OTHER live healer regains that healer's
 * amount x the wave's hpMult, never above its maximum. Near several healers it is healed once, by the first in id order
 * (tools/sim/sim.py does the same). A healer may heal another healer, never itself.
 */
function healPulse(battle: Battle, plan: WavePlan, tick: number): void {
  const period = battle.config.healPeriodTicks;
  if (period === null || tick === 0 || tick % period !== 0) return;
  const { config } = battle;
  const healers = battle.aliens.flatMap((a) => {
    const healer = alienStatsOf(config, a.type).healer;
    return healer === null ? [] : [{ alien: a, healer, at: routePoint(config.route, a.progress) }];
  });
  if (healers.length === 0) return;
  for (const h of healers) battle.events.push({ kind: "healPulse", tick, alienId: h.alien.id, at: h.at });
  for (const alien of battle.aliens) {
    if (alien.hp >= alien.maxHp) continue;
    const p = routePoint(config.route, alien.progress);
    const by = healers.find((h) => h.alien !== alien && withinRange(p, h.at.x, h.at.y, h.healer.radiusSq));
    if (by === undefined) continue;
    const added = Math.min(healAmount(by.healer.amount, plan.hpMult), alien.maxHp - alien.hp);
    alien.hp += added;
    battle.stats.healed += added;
    battle.events.push({ kind: "healed", tick, alienId: alien.id, health: added });
  }
}

/**
 * Queue `releases` to come out of `parent` at its route progress now (C6.3): the first on the next tick (releases run
 * in step 2, before this tick's attacks), each next one a release gap after the previous.
 */
function queueRelease(battle: Battle, parent: AlienState, releases: readonly ReleaseSpec[]): void {
  if (releases.length === 0) return;
  const depth = parent.depth + 1;
  // parseRuleset and parsePlanet refuse any release list that could go deeper (C6.3), so this never throws.
  if (depth > battle.config.caps.maxDescendantDepth) throw new Error(`battle: alien ${parent.id} would release generation ${depth}`);
  battle.releases.push({
    parentId: parent.id,
    progress: parent.progress,
    depth,
    types: releases.flatMap((r) => Array.from({ length: r.count }, () => r.type)),
    released: 0,
    nextTick: battle.tick + 1,
  });
}

/**
 * A defeated alien: its bounty is paid once (C6.1), and a carrier, splitter or boss queues what it releases on defeat
 * at its route progress (C6.3; a boss's onDefeatRelease, C7).
 */
function defeat(battle: Battle, alien: AlienState, stats: AlienStats, at: Point): void {
  battle.credits += stats.bounty;
  battle.stats.defeated += 1;
  battle.stats.bounty += stats.bounty;
  battle.events.push({ kind: "defeated", tick: battle.tick, alienId: alien.id, type: alien.type, bounty: stats.bounty, at });
  queueRelease(battle, alien, alien.cargo);
}

/**
 * A boss enters `phase` (C7), the moment the damage that took it there lands. In order: the phase's armour and speed
 * replace the last phase's (armour is read from the phase in hit(); a slow on the boss keeps working on the new
 * speed); its own bubble layers are set; every other live non-boss alien whose point is within the gift radius of
 * the boss's point is raised to at least the gift's layers, in id order; and its release is queued where it stands.
 */
function enterBossPhase(battle: Battle, boss: AlienState, phase: BossPhaseStats, index: number, at: Point): void {
  boss.phase = index;
  boss.speed = phase.speed;
  battle.events.push({ kind: "bossPhase", tick: battle.tick, alienId: boss.id, type: boss.type, phase: index, at });
  if (phase.selfBubbles !== null) boss.bubbles = phase.selfBubbles;
  const gift = phase.giveBubbles;
  if (gift !== null) {
    for (const other of battle.aliens) {
      if (other === boss || other.hp <= 0 || other.bubbles >= gift.layers || bossOf(battle, other) !== null) continue;
      if (!withinRange(routePoint(battle.config.route, other.progress), at.x, at.y, gift.radiusSq)) continue;
      other.bubbles = gift.layers;
      battle.events.push({ kind: "bubbleGift", tick: battle.tick, bossId: boss.id, alienId: other.id, layers: gift.layers });
    }
  }
  queueRelease(battle, boss, phase.release);
}

/**
 * After damage lands on a boss: every phase its health has now reached and it has not yet entered begins, in order
 * (C7: "if one hit crosses two thresholds, both phases' actions run in order"). bossPhaseAt is a pure function of
 * health; a phase never ends once begun, so a boss a Patchling healed stays in its phase.
 */
function advanceBossPhase(battle: Battle, alien: AlienState, boss: BossStats, at: Point): void {
  const reached = bossPhaseAt(boss, alien.hp, alien.maxHp);
  for (let index = alien.phase + 1; index <= reached; index += 1) {
    const phase = boss.phases[index];
    if (phase !== undefined) enterBossPhase(battle, alien, phase, index, at);
  }
}

/**
 * One hit on one alien, in the C2.2 order (base damage and Sol's buff are already in `damage`): a blast on a flying
 * alien is halved, rounded up -> a bubble layer, if one is left, absorbs the whole hit and pops -> armour takes its
 * share, at least 1 landing (a boss's armour is its phase's) -> health (never below 0) -> a boss enters every phase
 * its health has reached, before the defeat check (C7, C2.3 step 4). Returns true if the hit defeated it.
 */
function hit(battle: Battle, tower: Tower, alien: AlienState, damage: number, at: Point, blast: boolean): boolean {
  const stats = alienStatsOf(battle.config, alien.type);
  const afterFlying = blast && stats.flying ? flyingBlastDamage(damage) : damage;
  if (alien.bubbles > 0) {
    alien.bubbles -= 1;
    battle.events.push({ kind: "popped", tick: battle.tick, padId: tower.padId, alienId: alien.id, layersLeft: alien.bubbles });
    return false;
  }
  const armour = stats.boss?.phases[alien.phase]?.armour ?? stats.armour;
  const dealt = Math.min(armouredDamage(afterFlying, armour), alien.hp);
  alien.hp -= dealt;
  battle.stats.damage += dealt;
  battle.events.push({ kind: "shot", tick: battle.tick, padId: tower.padId, alienId: alien.id, damage: dealt });
  if (stats.boss !== null) advanceBossPhase(battle, alien, stats.boss, at);
  if (alien.hp > 0) return false;
  defeat(battle, alien, stats, at);
  return true;
}

/** Advance one fixed tick (1/60 s). Does nothing unless the wave is running. */
export function step(battle: Battle): void {
  if (battle.status !== "IN_WAVE") return;
  const { config } = battle;
  const plan = config.waves[battle.wave - 1];
  if (plan === undefined) throw new Error(`battle: no plan for wave ${battle.wave}`);
  const tick = battle.tick;

  // 1. Commands, in arrival order.
  const queued = battle.queue;
  battle.queue = [];
  for (const command of queued) record(battle, command, applyCommand(battle, command));

  // 2. Scheduled spawns that are due, then descendant releases that are due, both within the caps (C6.4).
  spawnScheduled(battle, plan, tick);
  releaseDescendants(battle, plan, tick);
  battle.stats.peakAliens = Math.max(battle.stats.peakAliens, battle.aliens.length);
  battle.stats.peakDescendants = Math.max(battle.stats.peakDescendants, liveDescendants(battle));

  // 3. Support timers: each Mira whose pulse is due adds her points, in pad order, up to the shield cap (C5.5). The
  //    next pulse is a whole period after this one, so pulses keep their rhythm.
  for (const tower of battle.towers) {
    const shield = levelOf(classOf(config, tower.classId), tower.level).shield;
    if (shield === null || tower.readyTick > tick) continue;
    tower.readyTick += shield.periodTicks;
    const added = addShield(battle, shield.points, config.colony.shieldCap);
    if (added > 0) battle.events.push({ kind: "shielded", tick, padId: tower.padId, points: added });
  }
  //    Then the healers' shared pulse (C6.1).
  healPulse(battle, plan, tick);

  // 4. Attacks in pad order; hits land at once (C2.4). Support classes (no shot) never fire.
  if (battle.aliens.length > 0) {
    let anyDefeated = false;
    for (const tower of battle.towers) {
      if (tower.readyTick > tick) continue;
      const pad = config.pads.find((p) => p.id === tower.padId);
      if (pad === undefined) throw new Error(`battle: bad tower ${tower.padId}`);
      const shot = levelOf(classOf(config, tower.classId), tower.level).shot;
      if (shot === null) continue;
      const target = pickTarget(battle, tower, shot, pad);
      if (target === null) continue;
      const at = routePoint(config.route, target.progress);
      tower.readyTick = tick + shot.periodTicks;
      tower.lastShotTick = tick;
      tower.lastShotAt = at;
      battle.stats.shots += 1;
      // C2.2 order for one hit: base damage, then Sol's buff (C5.6). The buff changes damage only: never range,
      // rate or slow strength.
      const damage = buffedDamage(shot.damage, buffPctAt(battle, tower.padId));
      // Pip's slow lands before the damage (tools/sim/sim.py Game._fire): on the target, or at level 3 on every live
      // alien within the slow radius of the target's point, in id order.
      if (shot.slow !== null) {
        const slow = shot.slow;
        for (const alien of battle.aliens) {
          if (alien.hp <= 0) continue;
          const near = alien === target || (slow.radiusSq > 0 && withinRange(routePoint(config.route, alien.progress), at.x, at.y, slow.radiusSq));
          if (near) applySlow(battle, alien, slow.pct, slow.ticks);
        }
      }
      // A single shot hits its target. A blast (C5.2, Juno) hits every live alien whose point is within the splash
      // radius of the target's point, the target included, each for the full damage, in id order.
      if (shot.splashSq === 0) {
        if (hit(battle, tower, target, damage, at, false)) anyDefeated = true;
        continue;
      }
      for (const alien of battle.aliens) {
        if (alien.hp <= 0) continue;
        const p = alien === target ? at : routePoint(config.route, alien.progress);
        if (alien === target || withinRange(p, at.x, at.y, shot.splashSq)) {
          if (hit(battle, tower, alien, damage, p, true)) anyDefeated = true;
        }
      }
    }
    if (anyDefeated) battle.aliens = battle.aliens.filter((a) => a.hp > 0);
  }

  // 5. Movement in id order; leaks come off the shield first, then health (C4). A carrier, splitter or boss that leaks
  //    applies its own leak damage and releases nothing more (C6.3, C7): only defeat() and a boss phase queue
  //    releases, and what a boss phase queued before it leaked still comes out. A slowed alien moves
  //    floor(speed x (100 - slow%) / 100) units this tick (under one unit, 1/60,000 of a tile, is dropped), and the
  //    tick counts off its slow.
  if (battle.aliens.length > 0) {
    let anyLeaked = false;
    for (const a of battle.aliens) {
      if (a.slowTicksLeft > 0) {
        a.progress += Math.floor((a.speed * (100 - a.slowPct)) / 100);
        a.slowTicksLeft -= 1;
        if (a.slowTicksLeft === 0) a.slowPct = 0;
      } else {
        a.progress += a.speed;
      }
      if (a.progress >= config.route.length) {
        const damage = config.aliens[a.type]?.leak ?? 0;
        const absorbed = Math.min(battle.shield, damage);
        battle.shield -= absorbed;
        battle.health -= damage - absorbed;
        battle.stats.leaked += 1;
        battle.stats.healthLost += damage - absorbed;
        battle.events.push({ kind: "leaked", tick, alienId: a.id, damage });
        a.hp = 0;
        anyLeaked = true;
      }
    }
    if (anyLeaked) battle.aliens = battle.aliens.filter((a) => a.hp > 0);
  }

  // 6. Defeat, then wave complete.
  battle.tick = tick + 1;
  if (battle.health <= 0) {
    battle.health = 0;
    battle.status = "DEFEATED";
    battle.queue = [];
  } else if (battle.spawnIndex >= plan.spawns.length && battle.releases.length === 0 && battle.aliens.length === 0) {
    // C6.3 (AC-10): complete only when the schedule is exhausted, no release is queued and no alien is active.
    battle.status = "CLEARED";
    battle.queue = [];
    repairOnClear(battle, plan, tick);
  }
}

/** Take the events gathered since the last call. */
export function drainEvents(battle: Battle): BattleEvent[] {
  const events = battle.events;
  battle.events = [];
  return events;
}

/** The placements as the snapshot stores them (spine S4), in pad order. */
export function placementsOf(battle: Battle): Placement[] {
  return battle.towers.map((t) => ({ padId: t.padId, classId: t.classId, level: t.level, targeting: t.targeting }));
}

/**
 * The run snapshot this battle stands for (spine S4): in preparation the build state, after a cleared wave the
 * post-wave snapshot for COMPLETE_WAVE. The shield is trimmed to its cap when the wave ends (C4, C2.5).
 * Throws for a defeated battle: a defeated run has no snapshot.
 */
export function battleSnapshot(battle: Battle): Snapshot {
  if (battle.status === "DEFEATED") throw new Error("battle: a defeated wave has no snapshot");
  if (battle.status === "IN_WAVE") throw new Error("battle: no snapshot mid-wave (nothing is saved during combat)");
  return {
    credits: battle.credits,
    placements: placementsOf(battle),
    colony: { health: battle.health, shield: Math.min(battle.shield, battle.config.colony.shieldCap) },
    powers: { ...battle.powers },
  };
}
