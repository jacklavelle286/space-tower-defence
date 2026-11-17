// The battle simulation for one wave (Phase 14, M1-21; C2 simulation rules, spine S4 and S10). Phase 24 (M2-01) added
// the six-class roster and economy; Phase 25 (M2-02) the targeting modes (C5.3), Pip's slow (C5.4), Mira's shield and
// repair (C5.5) and Sol's buff (C5.6).
//
// A Battle is plain data: one wave, built from the run snapshot, advanced one fixed tick at a time by `step`. The
// renderer reads it and draws; it never changes it. Everything is deterministic: integers only (C2.2), no clock, no
// Math.random, and the order inside a tick is fixed (C2.3):
//   1. queued player commands, in arrival order, each validated against the state at that moment (AC-09)
//   2. scheduled spawns that are due (and not held back by the soft cap)
//   3. support timers: Mira's shield pulses, in pad order (healers arrive in Phase 26)
//   4. astronaut attacks, in pad order p01 -> p16 (C2.4: instant hits), with Sol's buff on the damage
//   5. alien movement, in id order, at the slowed speed while a slow lasts; an alien reaching the end leaks at once
//   6. defeat check (colony health <= 0), then the wave-complete check (and Mira's repair on a cleared wave)
//
// Every comparison that decides something (which alien to aim at, whether a slow replaces another, whose buff is
// larger, whether a pulse is due) compares integers. Towers are kept in pad order and aliens in id order, and the
// targeting tie-breaks end on the alien id, so no choice depends on the order a list happens to be in.
//
// One Battle per wave, made fresh from the snapshot, is how "no timer or cooldown crosses a wave boundary" (spine S4,
// C2.5) holds by construction: attack timers start ready, and nothing but the snapshot is carried over.
//
// `step`, `startWave` and the command functions change the Battle they are given (it is the caller's private
// object; copying every tick would only cost time). They read nothing else and return nothing hidden, so the same
// Battle and the same calls always give the same result.
import type { Placement, Snapshot, Targeting } from "../rules";
import type { BattleConfig, ClassStats, LevelStats, PadInfo, ShotStats } from "./config";
import { buffedDamage, sellRefund, speedToUnitsPerTick, waveHealth } from "./config";
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
  /** Units per tick, unslowed. */
  readonly speed: number;
  /** The slow on this alien in percent (already capped, C5.4), or 0. 0 whenever slowTicksLeft is 0. */
  slowPct: number;
  /** Ticks of movement the slow still lasts; 0 = not slowed. */
  slowTicksLeft: number;
  /** Cosmetic: walk-animation start frame, 0..ALIEN_LOOKS-1, from the wave's seeded generator. */
  readonly look: number;
}

/**
 * `shot`: one per alien a shot damages (a blast gives one per alien inside it), with the damage dealt.
 * `shielded`: a Mira pulse that added points (one at the cap adds none and is not reported).
 * `repaired`: Mira's repair when the wave is cleared (C5.5), the health actually added.
 */
export type BattleEvent =
  | { readonly kind: "shot"; readonly tick: number; readonly padId: string; readonly alienId: number; readonly damage: number }
  | { readonly kind: "shielded"; readonly tick: number; readonly padId: string; readonly points: number }
  | { readonly kind: "repaired"; readonly tick: number; readonly health: number }
  | { readonly kind: "defeated"; readonly tick: number; readonly alienId: number; readonly bounty: number; readonly at: Point }
  | { readonly kind: "leaked"; readonly tick: number; readonly alienId: number; readonly damage: number }
  | { readonly kind: "rejected"; readonly tick: number; readonly command: Command; readonly reason: RejectReason };

export interface BattleStats {
  spawned: number;
  defeated: number;
  leaked: number;
  bounty: number;
  shots: number;
  damage: number;
  healthLost: number;
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
    queue: [],
    rng: waveSeed(runSeed, wave),
    events: [],
    stats: { spawned: 0, defeated: 0, leaked: 0, bounty: 0, shots: 0, damage: 0, healthLost: 0 },
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

/** The slow this shot would leave on an alien (C5.4: never above the cap; bosses at half strength from Phase 27). */
function effectiveSlowPct(battle: Battle, pct: number): number {
  return Math.min(pct, battle.config.slow.capPct);
}

/**
 * Pip's preference (C5.3 "prefers an alien that is not currently slowed, so it spreads its frost"), as the simulator
 * has it (tools/sim/sim.py Game._pick): an alien counts as not slowed if its slow ends within the ruleset's
 * refreshWithinSeconds, or is weaker than the slow this Pip would apply.
 */
function wantsSlow(battle: Battle, a: AlienState, slowPct: number): boolean {
  return a.slowTicksLeft <= battle.config.slow.refreshTicks || a.slowPct < effectiveSlowPct(battle, slowPct);
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
 * Put a slow on an alien (C5.4). No stacking: an alien has one slow at a time. A slow is first capped; one that is
 * equal or stronger than the current slow replaces it and keeps the longer of the two remaining times; a weaker one
 * is ignored. (An unslowed alien has slowPct 0, so any slow replaces "none".)
 */
function applySlow(battle: Battle, alien: AlienState, pct: number, ticks: number): void {
  const capped = effectiveSlowPct(battle, pct);
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
 * Mira's repair when a wave is cleared (C4, C5.5): each Mira adds her level's repairOnWaveClear (level 3: 1), the
 * total is capped at miraRepairCapPerWave however many Miras stand, and health never goes above the maximum.
 */
function repairOnClear(battle: Battle, tick: number): void {
  const { config } = battle;
  let repair = 0;
  for (const t of battle.towers) repair += levelOf(classOf(config, t.classId), t.level).shield?.repairOnWaveClear ?? 0;
  const healed = Math.max(0, Math.min(Math.min(repair, config.colony.miraRepairCapPerWave), config.colony.maxHealth - battle.health));
  if (healed === 0) return;
  battle.health += healed;
  battle.events.push({ kind: "repaired", tick, health: healed });
}

function spawn(battle: Battle, type: string): void {
  const plan = battle.config.waves[battle.wave - 1];
  const stats = battle.config.aliens[type];
  if (plan === undefined || stats === undefined) throw new Error(`battle: cannot spawn ${type}`);
  const look = nextInt(battle.rng, ALIEN_LOOKS);
  battle.rng = look.state;
  const hp = waveHealth(stats.hp, plan.hpMult);
  battle.aliens.push({
    id: battle.nextAlienId,
    type,
    hp,
    maxHp: hp,
    progress: 0,
    speed: speedToUnitsPerTick(stats.speed * plan.speedMult),
    slowPct: 0,
    slowTicksLeft: 0,
    look: look.value,
  });
  battle.nextAlienId += 1;
  battle.stats.spawned += 1;
}

/** Take `damage` off one alien (never below 0 health). Returns true if that defeated it, paying its bounty. */
function hit(battle: Battle, tower: Tower, alien: AlienState, damage: number, at: Point): boolean {
  const dealt = Math.min(damage, alien.hp);
  alien.hp -= dealt;
  battle.stats.damage += dealt;
  battle.events.push({ kind: "shot", tick: battle.tick, padId: tower.padId, alienId: alien.id, damage: dealt });
  if (alien.hp > 0) return false;
  const bounty = battle.config.aliens[alien.type]?.bounty ?? 0;
  battle.credits += bounty;
  battle.stats.defeated += 1;
  battle.stats.bounty += bounty;
  battle.events.push({ kind: "defeated", tick: battle.tick, alienId: alien.id, bounty, at });
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

  // 2. Spawns that are due. The soft cap holds spawns back (they stay due) while too many aliens are alive (C6.4).
  for (;;) {
    const next = plan.spawns[battle.spawnIndex];
    if (next === undefined || next.tick > tick || battle.aliens.length >= config.scheduledSpawnSoftCap) break;
    spawn(battle, next.type);
    battle.spawnIndex += 1;
  }

  // 3. Support timers: each Mira whose pulse is due adds her points, in pad order, up to the shield cap (C5.5). The
  //    next pulse is a whole period after this one, so pulses keep their rhythm.
  for (const tower of battle.towers) {
    const shield = levelOf(classOf(config, tower.classId), tower.level).shield;
    if (shield === null || tower.readyTick > tick) continue;
    tower.readyTick += shield.periodTicks;
    const added = addShield(battle, shield.points, config.colony.shieldCap);
    if (added > 0) battle.events.push({ kind: "shielded", tick, padId: tower.padId, points: added });
  }

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
        if (hit(battle, tower, target, damage, at)) anyDefeated = true;
        continue;
      }
      for (const alien of battle.aliens) {
        if (alien.hp <= 0) continue;
        const p = alien === target ? at : routePoint(config.route, alien.progress);
        if (alien === target || withinRange(p, at.x, at.y, shot.splashSq)) {
          if (hit(battle, tower, alien, damage, p)) anyDefeated = true;
        }
      }
    }
    if (anyDefeated) battle.aliens = battle.aliens.filter((a) => a.hp > 0);
  }

  // 5. Movement in id order; leaks come off the shield first, then health (C4). A slowed alien moves
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
  } else if (battle.spawnIndex >= plan.spawns.length && battle.aliens.length === 0) {
    battle.status = "CLEARED";
    battle.queue = [];
    repairOnClear(battle, tick);
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
