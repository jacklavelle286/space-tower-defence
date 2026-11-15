// The battle simulation for one wave (Phase 14, M1-21; C2 simulation rules, spine S4 and S10).
//
// A Battle is plain data: one wave, built from the run snapshot, advanced one fixed tick at a time by `step`. The
// renderer reads it and draws; it never changes it. Everything is deterministic: integers only (C2.2), no clock, no
// Math.random, and the order inside a tick is fixed (C2.3):
//   1. queued player commands, in arrival order, each validated against the state at that moment (AC-09)
//   2. scheduled spawns that are due (and not held back by the soft cap)
//   3. support timers (none in mechanics 1: no Mira, no healers)
//   4. astronaut attacks, in pad order p01 -> p16 (C2.4: instant hits)
//   5. alien movement, in id order; an alien reaching the end leaks at once
//   6. defeat check (colony health <= 0), then the wave-complete check
//
// One Battle per wave, made fresh from the snapshot, is how "no timer or cooldown crosses a wave boundary" (spine S4,
// C2.5) holds by construction: attack timers start ready, and nothing but the snapshot is carried over.
//
// `step`, `startWave` and the command functions change the Battle they are given (it is the caller's private
// object; copying every tick would only cost time). They read nothing else and return nothing hidden, so the same
// Battle and the same calls always give the same result.
import type { Placement, Snapshot, Targeting } from "../rules";
import type { BattleConfig, ClassStats, LevelStats, PadInfo } from "./config";
import { sellRefund, speedToUnitsPerTick, waveHealth } from "./config";
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
  | "CLASS_UNAVAILABLE"
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
  /** The tick at or after which it may fire again (C2.4: ready at wave start and when placed). */
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
  /** Units per tick. */
  readonly speed: number;
  /** Cosmetic: walk-animation start frame, 0..ALIEN_LOOKS-1, from the wave's seeded generator. */
  readonly look: number;
}

export type BattleEvent =
  | { readonly kind: "shot"; readonly tick: number; readonly padId: string; readonly alienId: number; readonly damage: number }
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

/** Check and apply one command against the state at this moment. Never lets credits go negative (AC-09). */
function applyCommand(battle: Battle, command: Command): CommandResult {
  const { config } = battle;
  const pad: PadInfo | undefined = config.pads.find((p) => p.id === command.padId);
  if (pad === undefined) return { ok: false, reason: "UNKNOWN_PAD" };
  const tower = battle.towers.find((t) => t.padId === command.padId);
  switch (command.kind) {
    case "place": {
      if (!pad.open) return { ok: false, reason: "PAD_CLOSED" };
      if (tower !== undefined) return { ok: false, reason: "PAD_OCCUPIED" };
      const cls = config.classes[command.classId];
      if (cls === undefined || !config.waveSet.classes.includes(command.classId)) return { ok: false, reason: "CLASS_UNAVAILABLE" };
      if (cls.deployCap !== null && battle.towers.filter((t) => t.classId === cls.id).length >= cls.deployCap) {
        return { ok: false, reason: "DEPLOY_CAP" };
      }
      const cost = levelOf(cls, 1).cost;
      if (battle.credits < cost) return { ok: false, reason: "NOT_ENOUGH_CREDITS" };
      battle.credits -= cost;
      // C2.4: a newly placed attacker is ready at once.
      insertTower(battle, {
        padId: pad.id,
        classId: cls.id,
        level: 1,
        targeting: cls.defaultTargeting,
        readyTick: battle.tick,
        lastShotTick: -1,
        lastShotAt: null,
      });
      return { ok: true };
    }
    case "upgrade": {
      if (tower === undefined) return { ok: false, reason: "PAD_EMPTY" };
      const cls = config.classes[tower.classId];
      if (cls === undefined) throw new Error(`battle: unknown class ${tower.classId}`);
      const next = cls.levels[tower.level];
      if (next === undefined) return { ok: false, reason: "MAX_LEVEL" };
      if (battle.credits < next.cost) return { ok: false, reason: "NOT_ENOUGH_CREDITS" };
      battle.credits -= next.cost;
      tower.level += 1; // C2.4: upgrading does not reset the attack timer
      return { ok: true };
    }
    case "sell": {
      if (tower === undefined) return { ok: false, reason: "PAD_EMPTY" };
      const cls = config.classes[tower.classId];
      if (cls === undefined) throw new Error(`battle: unknown class ${tower.classId}`);
      battle.credits += sellRefund(levelOf(cls, tower.level).invested, config.sell);
      battle.towers = battle.towers.filter((t) => t !== tower);
      return { ok: true };
    }
    case "setTargeting": {
      if (tower === undefined) return { ok: false, reason: "PAD_EMPTY" };
      const cls = config.classes[tower.classId];
      if (cls === undefined || !cls.targeting.includes(command.targeting)) return { ok: false, reason: "TARGETING_UNAVAILABLE" };
      tower.targeting = command.targeting;
      return { ok: true };
    }
  }
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

/** Ready pressed: the wave begins. Attack timers start ready (C2.5). */
export function startWave(battle: Battle): void {
  if (battle.status !== "PREP") throw new Error(`battle: cannot start a wave in ${battle.status}`);
  battle.status = "IN_WAVE";
  for (const t of battle.towers) t.readyTick = 0;
}

/** C5.3 FRONT: furthest along the route; ties -> lower id. FAST: highest current speed; ties -> FRONT. */
function pickTarget(battle: Battle, tower: Tower, level: LevelStats, pad: PadInfo): AlienState | null {
  let best: AlienState | null = null;
  for (const a of battle.aliens) {
    if (a.hp <= 0) continue;
    if (!withinRange(routePoint(battle.config.route, a.progress), pad.cx, pad.cy, level.rangeSq)) continue;
    if (best === null) {
      best = a;
      continue;
    }
    if (tower.targeting === "FAST" && a.speed !== best.speed) {
      if (a.speed > best.speed) best = a;
      continue;
    }
    // Aliens are in id order, so a strictly greater progress is needed to beat an earlier (lower id) alien.
    if (a.progress > best.progress) best = a;
  }
  return best;
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
    look: look.value,
  });
  battle.nextAlienId += 1;
  battle.stats.spawned += 1;
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

  // 3. Support timers: none in mechanics 1.

  // 4. Attacks in pad order; hits land at once (C2.4).
  if (battle.aliens.length > 0) {
    let anyDefeated = false;
    for (const tower of battle.towers) {
      if (tower.readyTick > tick) continue;
      const cls = config.classes[tower.classId];
      const pad = config.pads.find((p) => p.id === tower.padId);
      if (cls === undefined || pad === undefined) throw new Error(`battle: bad tower ${tower.padId}`);
      const level = levelOf(cls, tower.level);
      const target = pickTarget(battle, tower, level, pad);
      if (target === null) continue;
      const damage = Math.min(level.damage, target.hp);
      target.hp -= damage;
      tower.readyTick = tick + level.periodTicks;
      tower.lastShotTick = tick;
      tower.lastShotAt = routePoint(config.route, target.progress);
      battle.stats.shots += 1;
      battle.stats.damage += damage;
      battle.events.push({ kind: "shot", tick, padId: tower.padId, alienId: target.id, damage });
      if (target.hp <= 0) {
        const bounty = config.aliens[target.type]?.bounty ?? 0;
        battle.credits += bounty;
        battle.stats.defeated += 1;
        battle.stats.bounty += bounty;
        battle.events.push({ kind: "defeated", tick, alienId: target.id, bounty, at: tower.lastShotAt });
        anyDefeated = true;
      }
    }
    if (anyDefeated) battle.aliens = battle.aliens.filter((a) => a.hp > 0);
  }

  // 5. Movement in id order; leaks come off the shield first, then health (C4).
  if (battle.aliens.length > 0) {
    let anyLeaked = false;
    for (const a of battle.aliens) {
      a.progress += a.speed;
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
