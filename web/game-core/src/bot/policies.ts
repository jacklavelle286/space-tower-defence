// The C17.1 test players (Gate M, LD0), ported from tools/sim/sim.py to the game's own simulation so the level
// designer can judge any map, not only Moonbeam:
//
//   none           sells any preset astronauts and never buys: the "None" board, which must lose
//   presets-only   keeps the wave set's presets and never buys (scope §5 "this challenge plays itself")
//   minimal        three Novas on the three open pads that reach the least route, then never buys again (C17.2)
//   naive          a young first-time player, seeded (C17.1 "Naive child"; sim.py Naive)
//   competent      a pad plan plus greedy buying by test-playing the next two waves made tougher (sim.py Competent)
//
// They are heuristics, not children (C17.1). Randomness comes only from the seeded generator (sim/rng.ts).
import type { Battle, Command } from "../sim/battle";
import { checkCommand, classAvailability, giveCommand } from "../sim/battle";
import { padOpen, sellRefund, type BattleConfig, type ClassStats, type PadInfo } from "../sim/config";
import { nextRandom } from "../sim/rng";
import { padReach } from "../map/coverage";
import { MOONBEAM_BLUEPRINT, type Blueprint } from "./board";
import type { Policy, WaveOutcome } from "./runner";
import { runTrial } from "./trial";

const SECOND = 60;

// ---- shared helpers ---------------------------------------------------------------------------------------------

function cls(config: BattleConfig, id: string): ClassStats {
  const c = config.classes[id];
  if (c === undefined) throw new Error(`bot: unknown class ${id}`);
  return c;
}

function cost(config: BattleConfig, id: string, level: number): number {
  return cls(config, id).levels[level - 1]?.cost ?? Number.POSITIVE_INFINITY;
}

function openPads(b: Battle): PadInfo[] {
  return b.config.pads.filter((p) => padOpen(b.config, p, b.wave));
}

function freePads(b: Battle): PadInfo[] {
  return openPads(b).filter((p) => !b.towers.some((t) => t.padId === p.id));
}

function count(b: Battle, classId: string): number {
  return b.towers.filter((t) => t.classId === classId).length;
}

/** Placeable now: offered and unlocked (C5.9, C13) and under its deploy cap. */
function allowed(b: Battle, classId: string): boolean {
  if (b.config.classes[classId] === undefined) return false;
  if (classAvailability(b.config, classId, b.wave) !== "AVAILABLE") return false;
  const cap = cls(b.config, classId).deployCap;
  return cap === null || count(b, classId) < cap;
}

function refund(b: Battle, padId: string): number {
  const t = b.towers.find((x) => x.padId === padId);
  if (t === undefined) return 0;
  return sellRefund(cls(b.config, t.classId).levels[t.level - 1]?.invested ?? 0, b.config.sell);
}

/** In preparation a command applies at once; during a wave it is checked now and queued for the next tick. */
function act(b: Battle, c: Command): boolean {
  if (b.status === "IN_WAVE" && !checkCommand(b, c).ok) return false;
  return giveCommand(b, c).ok;
}

function isAttacker(config: BattleConfig, classId: string): boolean {
  return config.classes[classId]?.levels[0]?.shot !== null && config.classes[classId] !== undefined;
}

/** A seeded uniform generator over the battle's mulberry32 (sim/rng.ts). */
class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  random(): number {
    const r = nextRandom(this.state);
    this.state = r.state;
    return r.value / 0x1_0000_0000;
  }
  uniform(a: number, b: number): number {
    return a + (b - a) * this.random();
  }
  choice<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.random() * items.length)];
    if (item === undefined) throw new Error("bot: choice from nothing");
    return item;
  }
}

// ---- none, presets-only, minimal --------------------------------------------------------------------------------

const idle = { tickInterval: SECOND, tick(): void {}, afterWave(): void {} };

export function nonePolicy(): Policy {
  return {
    ...idle,
    name: "none",
    prep(b: Battle): void {
      for (const t of [...b.towers]) giveCommand(b, { kind: "sell", padId: t.padId });
    },
  };
}

export function presetsOnlyPolicy(): Policy {
  return { ...idle, name: "presets-only", prep(): void {} };
}

/** Three Novas on the three open pads that reach the least route within 2.5 tiles, before wave 1 (C17.2). */
export function minimalPolicy(config: BattleConfig): Policy {
  const reach = padReach(config, 2.5);
  return {
    ...idle,
    name: "minimal",
    prep(b: Battle): void {
      if (b.wave !== 1) return;
      const weakest = [...freePads(b)].sort((x, y) => (reach.get(x.id)?.tiles ?? 0) - (reach.get(y.id)?.tiles ?? 0)).slice(0, 3);
      for (const p of weakest) giveCommand(b, { kind: "place", padId: p.id, classId: "nova" });
    },
  };
}

// ---- naive ------------------------------------------------------------------------------------------------------

export interface NaiveOptions {
  readonly usePowers?: boolean;
  readonly pSkip?: number;
  readonly pUpgrade?: number;
  readonly pUpgradeFull?: number;
  readonly pNewest?: number;
  readonly pCheapest?: number;
}

/** sim.py Naive: random open pads, likes the newest or cheapest class, rarely upgrades, never sells. */
export function naivePolicy(config: BattleConfig, seed: number, options: NaiveOptions = {}): Policy {
  const rng = new Rng(Math.imul(seed, 2654435761) ^ 0x5eed);
  const usePowers = options.usePowers ?? true;
  const pSkip = options.pSkip ?? 0.25;
  const pUpgrade = options.pUpgrade ?? 0.15;
  const pUpgradeFull = options.pUpgradeFull ?? 0.3;
  const pNewest = options.pNewest ?? 0.5;
  const pCheapest = options.pCheapest ?? 0.3;
  let midwaveAt: number | null = null;
  let powerAt = new Map<string, number>();

  const buyOnce = (b: Battle): boolean => {
    const free = freePads(b);
    if (rng.random() < (free.length > 0 ? pUpgrade : pUpgradeFull)) {
      const ups = b.towers.filter((t) => checkCommand(b, { kind: "upgrade", padId: t.padId }).ok);
      if (ups.length > 0) return act(b, { kind: "upgrade", padId: rng.choice(ups).padId });
    }
    if (free.length === 0) return false;
    const unlocked = Object.keys(config.classes).filter((c) => allowed(b, c));
    if (unlocked.length === 0) return false;
    const r = rng.random();
    const order = [...unlocked].sort((x, y) => cls(config, x).unlockAfterWave - cls(config, y).unlockAfterWave);
    let want: string;
    if (r < pNewest) want = order[order.length - 1] ?? "nova";
    else if (r < pNewest + pCheapest) want = [...unlocked].sort((x, y) => cost(config, x, 1) - cost(config, y, 1))[0] ?? "nova";
    else want = rng.choice(unlocked);
    if (b.credits < cost(config, want, 1)) {
      if (rng.random() < 0.5) return false; // saves up for the one they want
      const aff = unlocked.filter((c) => b.credits >= cost(config, c, 1));
      if (aff.length === 0) return false;
      want = rng.choice(aff);
    }
    return act(b, { kind: "place", padId: rng.choice(free).id, classId: want });
  };

  return {
    name: "naive",
    tickInterval: 2 * SECOND,
    prep(b: Battle): void {
      midwaveAt = rng.random() < 0.2 ? rng.uniform(8, 30) : null;
      powerAt = new Map();
      if (usePowers) {
        const boss = b.config.waves[b.wave - 1]?.hasBoss ?? false;
        for (const [id, n] of Object.entries(b.powers)) {
          if (n > 0 && rng.random() < (boss ? 0.7 : 0.1)) powerAt.set(id, rng.uniform(6, 45));
        }
      }
      if (b.towers.length > 0 && rng.random() < pSkip) return;
      const n = freePads(b).length > 0 ? rng.choice([1, 1, 2, 3]) : 1;
      for (let i = 0; i < n; i += 1) if (!buyOnce(b)) break;
      if (b.towers.length === 0) {
        buyOnce(b);
        const free = freePads(b);
        if (b.towers.length === 0 && free.length > 0) giveCommand(b, { kind: "place", padId: rng.choice(free).id, classId: "nova" });
      }
    },
    tick(b: Battle): void {
      const t = b.tick / SECOND;
      if (midwaveAt !== null && t >= midwaveAt) {
        midwaveAt = null;
        buyOnce(b);
      }
      for (const [id, when] of [...powerAt]) {
        if (t < when) continue;
        let target: number | undefined;
        if (b.config.powers[id]?.effect.kind === "burst") {
          if (b.aliens.length === 0) continue;
          target = Math.max(...b.aliens.map((a) => a.progress));
        }
        const c: Command = target === undefined ? { kind: "usePower", powerId: id } : { kind: "usePower", powerId: id, target };
        if (act(b, c)) powerAt.delete(id);
      }
    },
    afterWave(): void {},
  };
}

// ---- competent --------------------------------------------------------------------------------------------------

export interface CompetentOptions {
  /** Pad -> class plan; default the simulator's Moonbeam plan. */
  readonly blueprint?: Blueprint;
  /** Where Mira goes, in order of preference; default the planned Mira pads, then the planned Nova pad reaching least. */
  readonly miraPads?: readonly string[];
  readonly usePowers?: boolean;
  readonly inWaveBuying?: boolean;
  /** Waves of look-ahead (sim.py: 2). */
  readonly look?: number;
}

interface Candidate {
  readonly ratio: number;
  readonly gain: number;
  readonly cost: number;
  readonly commands: readonly Command[];
}

interface StressPoint {
  readonly wave: number;
  readonly s: number;
  readonly base: number;
  readonly weight: number;
}

/** sim.py Competent, step for step, with the pad plan as a parameter so it can play any map. */
export function competentPolicy(config: BattleConfig, options: CompetentOptions = {}): Policy {
  const offered = (id: string): boolean => config.classes[id] !== undefined && config.waveSet.classes.includes(id);
  const plan: Record<string, string> = {};
  for (const pad of config.pads) {
    const want = (options.blueprint ?? MOONBEAM_BLUEPRINT)[pad.id] ?? "nova";
    plan[pad.id] = offered(want) ? want : "nova"; // a class that can never be bought is replaced by Nova
  }
  const reach = padReach(config, 2.5);
  const miraPads =
    options.miraPads ??
    [
      ...config.pads.filter((p) => plan[p.id] === "mira").map((p) => p.id),
      ...config.pads
        .filter((p) => plan[p.id] === "nova")
        .sort((a, b) => (reach.get(a.id)?.tiles ?? 0) - (reach.get(b.id)?.tiles ?? 0))
        .slice(0, 1)
        .map((p) => p.id),
    ];
  const usePowers = options.usePowers ?? true;
  const inWaveBuying = options.inWaveBuying ?? true;
  const look = options.look ?? 2;
  const maxHealth = config.colony.maxHealth;
  let waitUntil = 0;
  let recentLeak = [0, 0, 0];
  let lastPen = 0;

  const setup = (b: Battle): StressPoint[] => {
    const out: StressPoint[] = [];
    for (let off = 0; off < look; off += 1) {
      const wave = b.wave + off;
      if (wave > config.waves.length) break;
      let s = 1.3;
      let base = 0;
      for (let i = 0; i < 12; i += 1) {
        const r = runTrial(b, wave, s);
        base = r.damage;
        if (r.leaked >= Math.max(1, 0.3 * r.spawned) || r.bossLeaked) break;
        s *= 1.4;
      }
      out.push({ wave, s, base: Math.max(1, base), weight: off === 0 ? 1 : 0.5 });
    }
    return out;
  };

  const score = (b: Battle, points: readonly StressPoint[], commands: readonly Command[]): number =>
    points.reduce((sum, p) => sum + (p.weight * (runTrial(b, p.wave, p.s, commands).damage - p.base)) / p.base, 0);

  const wantAt = (padId: string): string => {
    const want = plan[padId] ?? "nova";
    return want === "mira" ? "nova" : want; // Mira is bought by rule; until then the pad may hold a Nova
  };

  const candidates = (b: Battle): Candidate[] => {
    const points = setup(b);
    const out: Candidate[] = [];
    for (const pad of openPads(b)) {
      const want = wantAt(pad.id);
      const tower = b.towers.find((t) => t.padId === pad.id);
      if (tower === undefined) {
        const c = allowed(b, want) ? want : allowed(b, "nova") ? "nova" : null;
        if (c === null) continue;
        const buff = cls(config, c).levels[0]?.buff;
        if (buff) {
          const near = b.towers.some((t) => {
            const at = config.pads.find((p) => p.id === t.padId);
            return at !== undefined && isAttacker(config, t.classId) && (at.cx - pad.cx) ** 2 + (at.cy - pad.cy) ** 2 <= buff.radiusSq;
          });
          if (!near) continue;
        }
        const price = cost(config, c, 1);
        const commands: Command[] = [{ kind: "place", padId: pad.id, classId: c }];
        const gain = score(b, points, commands);
        out.push({ ratio: gain / price, gain, cost: price, commands });
        continue;
      }
      if (tower.classId === "mira") continue;
      const filler = tower.classId !== want;
      if (filler && allowed(b, want)) {
        const price = Math.max(0, cost(config, want, 1) - refund(b, pad.id));
        const commands: Command[] = [
          { kind: "sell", padId: pad.id },
          { kind: "place", padId: pad.id, classId: want },
        ];
        const gain = score(b, points, commands);
        out.push({ ratio: gain / Math.max(price, 20), gain, cost: price, commands });
      }
      if (tower.level < 3 && !(filler && tower.level >= 2)) {
        const price = cost(config, tower.classId, tower.level + 1);
        const commands: Command[] = [{ kind: "upgrade", padId: pad.id }];
        const gain = score(b, points, commands);
        out.push({ ratio: gain / price, gain, cost: price, commands });
      }
    }
    return out;
  };

  const cheapest = (b: Battle): number | null => {
    const costs: number[] = [];
    for (const pad of openPads(b)) {
      const want = wantAt(pad.id);
      const tower = b.towers.find((t) => t.padId === pad.id);
      if (tower === undefined) costs.push(cost(config, allowed(b, want) ? want : "nova", 1));
      else if (tower.classId !== "mira") {
        if (tower.classId !== want && allowed(b, want)) costs.push(Math.max(0, cost(config, want, 1) - refund(b, pad.id)));
        if (tower.level < 3) costs.push(cost(config, tower.classId, tower.level + 1));
      }
    }
    return costs.length > 0 ? Math.min(...costs) : null;
  };

  const run = (b: Battle, commands: readonly Command[]): boolean => {
    let ok = true;
    for (const c of commands) ok = (b.status === "IN_WAVE" ? giveCommand(b, c).ok : act(b, c)) && ok;
    return ok;
  };

  const placeMira = (b: Battle): boolean => {
    if (!offered("mira")) return false;
    const price = cost(config, "mira", 1);
    for (const padId of miraPads) {
      const pad = config.pads.find((p) => p.id === padId);
      if (pad === undefined || !padOpen(config, pad, b.wave)) continue;
      const tower = b.towers.find((t) => t.padId === padId);
      if (tower === undefined) return b.credits >= price ? act(b, { kind: "place", padId, classId: "mira" }) : false;
      if (tower.classId !== "mira") {
        if (b.credits + refund(b, padId) >= price) {
          return run(b, [
            { kind: "sell", padId },
            { kind: "place", padId, classId: "mira" },
          ]);
        }
        return false;
      }
    }
    const free = freePads(b);
    if (free.length > 0 && b.credits >= price) {
      const pad = [...free].sort((x, y) => (reach.get(x.id)?.tiles ?? 0) - (reach.get(y.id)?.tiles ?? 0))[0];
      if (pad !== undefined) return act(b, { kind: "place", padId: pad.id, classId: "mira" });
    }
    return false;
  };

  const mira = (b: Battle): boolean => {
    if (!offered("mira") || classAvailability(config, "mira", b.wave) !== "AVAILABLE") return false;
    const leak = recentLeak.reduce((a, x) => a + x, 0);
    const danger = leak > 0 || b.health < 0.75 * maxHealth || lastPen > 0.93;
    const n = count(b, "mira");
    if (n === 0 && (danger || b.wave >= 36)) return placeMira(b);
    if (n >= 1 && (leak > 2 || b.health < 0.6 * maxHealth || b.wave >= 44)) {
      for (const t of b.towers) {
        if (t.classId === "mira" && t.level < 3 && checkCommand(b, { kind: "upgrade", padId: t.padId }).ok) {
          return act(b, { kind: "upgrade", padId: t.padId });
        }
      }
    }
    if (n === 1 && b.health < 0.5 * maxHealth && b.wave >= 30) return placeMira(b);
    return false;
  };

  const spend = (b: Battle): void => {
    if (b.credits < waitUntil) return;
    const inWave = b.status === "IN_WAVE";
    for (let guard = 0; guard < 30; guard += 1) {
      if (mira(b)) {
        if (inWave) return; // queued: credits change on the next tick
        continue;
      }
      const low = cheapest(b);
      if (low === null || b.credits < low) {
        waitUntil = low ?? b.credits + 1e9;
        return;
      }
      const cands = candidates(b)
        .filter((c) => c.gain > 1e-6)
        .sort((x, y) => y.ratio - x.ratio || y.gain - x.gain || y.cost - x.cost);
      const best = cands[0];
      if (best === undefined) {
        waitUntil = b.credits + 60;
        return;
      }
      if (best.cost <= b.credits) {
        run(b, best.commands);
        if (inWave) return;
        continue;
      }
      const relaxed = !(lastPen < 0.9 && recentLeak.every((x) => x === 0));
      const thresh = relaxed ? 0 : 0.65;
      const aff = cands.find((c) => c.cost <= b.credits && c.ratio >= thresh * best.ratio);
      if (aff !== undefined) {
        run(b, aff.commands);
        if (inWave) return;
        continue;
      }
      const costs = cands.filter((c) => c.ratio >= thresh * best.ratio).map((c) => c.cost);
      waitUntil = costs.length > 0 ? Math.min(...costs) : best.cost;
      return;
    }
  };

  const powerByEffect = (kind: "slow" | "burst" | "shield"): string | undefined =>
    Object.values(config.powers).find((p) => p.effect.kind === kind)?.id;

  const tryPower = (b: Battle, kind: "slow" | "burst" | "shield", target?: number): boolean => {
    const id = powerByEffect(kind);
    if (id === undefined) return false;
    const c: Command = target === undefined ? { kind: "usePower", powerId: id } : { kind: "usePower", powerId: id, target };
    return act(b, c);
  };

  const powers = (b: Battle): void => {
    const L = config.route.length;
    let boss: { progress: number } | null = null;
    let front: { progress: number } | null = null;
    for (const a of b.aliens) {
      if (a.hp <= 0) continue;
      if ((config.aliens[a.type]?.boss ?? null) !== null) boss = a;
      if (front === null || a.progress > front.progress) front = a;
    }
    if (boss === null) {
      // outside boss waves powers are kept, except to stop a likely defeat
      if (front !== null && front.progress > 0.93 * L && b.health <= 4) {
        if (!tryPower(b, "shield")) tryPower(b, "slow");
      }
      return;
    }
    const frac = boss.progress / L;
    if (frac >= 0.3 && tryPower(b, "slow")) return;
    if (frac >= 0.45 && tryPower(b, "burst", boss.progress)) return;
    if (frac >= 0.9) tryPower(b, "shield");
  };

  return {
    name: "competent",
    tickInterval: SECOND,
    prep(b: Battle): void {
      waitUntil = 0;
      spend(b);
    },
    tick(b: Battle): void {
      if (inWaveBuying) spend(b);
      if (usePowers && Object.values(b.powers).some((n) => n > 0)) powers(b);
    },
    afterWave(outcome: WaveOutcome): void {
      recentLeak = [recentLeak[1] ?? 0, recentLeak[2] ?? 0, outcome.leakDamage];
      lastPen = outcome.penetration;
    },
  };
}
