// Wave design tools for the level designer (Gate M, LD4; scope-level-designer.md §3.1 step 8 and §3.1a): what a wave
// adds up to, filling a ramp between keyframes, the seeded Vary button, and the table helpers. Pure functions of
// their inputs, used by the editor and (LD6) the publisher. All of it happens at design time: a published wave set is a
// fixed list of waves, so play stays predictable between attempts (prompt.md:409). Nothing here runs during a game.
import { isBoss, type AuthoredWave, type ReleaseSpec, type Ruleset, type SpawnGroup, type WaveBody } from "../data/game-data";
import { nextRandom } from "../sim/rng";

const round2 = (v: number): number => Math.round(v * 100) / 100;
const round1 = (v: number): number => Math.round(v * 10) / 10;

// ---- what a wave adds up to ----------------------------------------------------------------------------------------

export interface WaveStats {
  /** Every alien that enters the route, descendants included (C6.3), a boss counted once. */
  readonly aliens: number;
  /** Their total health at the wave's hpMult (an authored boss keeps its own health, C7). */
  readonly health: number;
  /** Seconds until the last scheduled alien would reach the colony if nothing stopped it (an upper bound for a
   *  defended wave's length, C17.5). */
  readonly seconds: number;
  /** The most scheduled aliens on the route at once if nothing stopped them (C6.4's cap counts these). */
  readonly peakLive: number;
}

function releasesOf(ruleset: Ruleset, type: string, cargo?: readonly ReleaseSpec[]): readonly ReleaseSpec[] {
  const boss = ruleset.bosses[type];
  if (boss !== undefined) return [...boss.phases.flatMap((p) => p.onEnter?.release ?? []), ...(boss.onDefeatRelease ?? [])];
  return cargo ?? ruleset.aliens[type]?.traits.children ?? [];
}

/** One alien of `type` and everything it releases: [aliens, health] (descendants at the wave's hpMult). */
function expand(ruleset: Ruleset, type: string, hpMult: number, cargo?: readonly ReleaseSpec[], depth = 0): [number, number] {
  const boss = ruleset.bosses[type];
  let aliens = 1;
  let health = boss !== undefined ? boss.hp : (ruleset.aliens[type]?.hp ?? 0) * hpMult;
  if (depth < 3) {
    for (const r of releasesOf(ruleset, type, cargo)) {
      const [a, h] = expand(ruleset, r.type, hpMult, undefined, depth + 1);
      aliens += r.count * a;
      health += r.count * h;
    }
  }
  return [aliens, health];
}

function speedOf(ruleset: Ruleset, type: string, speedMult: number): number {
  const boss = ruleset.bosses[type];
  return boss !== undefined ? boss.speed : (ruleset.aliens[type]?.speed ?? 1) * speedMult;
}

/** What a wave adds up to on a route `routeTiles` long. */
export function waveStats(ruleset: Ruleset, wave: WaveBody, routeTiles: number): WaveStats {
  let aliens = 0;
  let health = 0;
  const intervals: [number, number][] = [];
  for (const g of wave.groups) {
    const [a, h] = expand(ruleset, g.type, wave.hpMult, g.cargo);
    aliens += g.count * a;
    health += g.count * h;
    const travel = routeTiles / Math.max(0.01, speedOf(ruleset, g.type, wave.speedMult));
    for (let k = 0; k < g.count; k += 1) {
      const start = g.at + k * g.gap;
      intervals.push([start, start + travel]);
    }
  }
  const seconds = intervals.reduce((m, [, end]) => Math.max(m, end), 0);
  const events = intervals.flatMap(([s, e]): [number, number][] => [
    [s, 1],
    [e, -1],
  ]);
  events.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let live = 0;
  let peakLive = 0;
  for (const [, d] of events) {
    live += d;
    peakLive = Math.max(peakLive, live);
  }
  return { aliens, health: Math.round(health), seconds: round1(seconds), peakLive };
}

/** Total scheduled health, the measure Vary keeps steady (C8.1 "toughness"; bosses are not varied). */
export function toughness(ruleset: Ruleset, wave: WaveBody): number {
  return wave.groups.filter((g) => !isBoss(ruleset, g.type)).reduce((sum, g) => sum + g.count * (ruleset.aliens[g.type]?.hp ?? 0) * wave.hpMult, 0);
}

// ---- keyframes and fill-in -----------------------------------------------------------------------------------------

export type Curve = "linear" | "ease-in" | "ease-out";
export const CURVES: readonly Curve[] = ["linear", "ease-in", "ease-out"];

function shape(curve: Curve, t: number): number {
  if (curve === "ease-in") return t * t;
  if (curve === "ease-out") return 1 - (1 - t) * (1 - t);
  return t;
}

interface TypeTotals {
  readonly count: number;
  readonly at: number;
  readonly gap: number;
}

/** Each non-boss type's total count, and its first group's start and gap, in order of first appearance. */
function byType(ruleset: Ruleset, wave: WaveBody): Map<string, TypeTotals> {
  const out = new Map<string, TypeTotals>();
  for (const g of wave.groups) {
    if (isBoss(ruleset, g.type)) continue;
    const t = out.get(g.type);
    out.set(g.type, t === undefined ? { count: g.count, at: g.at, gap: g.gap } : { ...t, count: t.count + g.count });
  }
  return out;
}

export interface FillOptions {
  readonly curve?: Curve;
  /** Waves set by hand: kept as they are when the keyframes move. */
  readonly overrides?: readonly number[];
}

/**
 * Every wave strictly between two keyframes, rebuilt along the curve (scope §3.1a): each alien type's count
 * interpolates between the keyframes on either side (so the mix ratios do too), and so do its start, its gap and the
 * wave's hpMult and speedMult. A boss stays on its tenth wave: a filled wave that had a boss keeps that boss group.
 * Keyframes, overrides and waves outside the keyframes are returned unchanged. `waves` must be in wave order.
 */
export function fillIn(ruleset: Ruleset, waves: readonly AuthoredWave[], keyframes: readonly number[], options: FillOptions = {}): AuthoredWave[] {
  const curve = options.curve ?? "linear";
  const keep = new Set([...keyframes, ...(options.overrides ?? [])]);
  const keys = [...new Set(keyframes)].sort((a, b) => a - b);
  const byNumber = new Map(waves.map((w) => [w.wave, w]));
  return waves.map((w) => {
    if (keep.has(w.wave)) return w;
    const b = keys.findIndex((k) => k > w.wave);
    const lo = b > 0 ? keys[b - 1] : undefined;
    const hi = b > 0 ? keys[b] : undefined;
    const A = lo === undefined ? undefined : byNumber.get(lo);
    const B = hi === undefined ? undefined : byNumber.get(hi);
    if (A === undefined || B === undefined || lo === undefined || hi === undefined) return w;
    const f = shape(curve, (w.wave - lo) / (hi - lo));
    const lerp = (x: number, y: number): number => x + (y - x) * f;
    const ta = byType(ruleset, A);
    const tb = byType(ruleset, B);
    const groups: SpawnGroup[] = [];
    for (const type of new Set([...ta.keys(), ...tb.keys()])) {
      const a = ta.get(type);
      const z = tb.get(type);
      const count = Math.round(lerp(a?.count ?? 0, z?.count ?? 0));
      if (count < 1) continue;
      groups.push({ type, count, at: round1(lerp(a?.at ?? z?.at ?? 0, z?.at ?? a?.at ?? 0)), gap: round2(lerp(a?.gap ?? z?.gap ?? 1, z?.gap ?? a?.gap ?? 1)) });
    }
    const boss = w.wave % 10 === 0 ? w.groups.filter((g) => isBoss(ruleset, g.type)) : [];
    return {
      wave: w.wave,
      groups: [...groups, ...boss.map((g) => ({ ...g }))].sort((x, y) => x.at - y.at),
      hpMult: round2(lerp(A.hpMult, B.hpMult)),
      speedMult: round2(lerp(A.speedMult, B.speedMult)),
    };
  });
}

// ---- Vary ----------------------------------------------------------------------------------------------------------

export interface VaryOptions {
  /** Alien types Vary may swap in (normally the ones the campaign has introduced by this wave). */
  readonly pool: readonly string[];
  /** Toughness stays within this many percent of the wave's (default 10). */
  readonly budgetPct?: number;
}

/**
 * The wave re-rolled from `seed` (scope §3.1a): counts, starts and gaps nudged, sometimes a group swapped for a pool
 * alien of similar health, then counts scaled back so the toughness stays within the budget. Bosses, hpMult and
 * speedMult are untouched. The same seed always gives the same wave, so a roll can be shown and kept or thrown away.
 */
export function vary(ruleset: Ruleset, wave: WaveBody, seed: number, options: VaryOptions): WaveBody {
  let state = seed >>> 0;
  const rand = (): number => {
    const r = nextRandom(state);
    state = r.state;
    return r.value / 0x1_0000_0000;
  };
  const uniform = (a: number, b: number): number => a + (b - a) * rand();
  const hpOf = (type: string): number => ruleset.aliens[type]?.hp ?? 0;
  const pool = options.pool.filter((t) => ruleset.aliens[t] !== undefined && ruleset.aliens[t]?.descendantOnly === false);
  const groups = wave.groups.map((g): SpawnGroup => {
    if (isBoss(ruleset, g.type)) return { ...g };
    let type = g.type;
    if (rand() < 0.3) {
      const near = pool.filter((t) => t !== g.type && hpOf(t) >= hpOf(g.type) / 2 && hpOf(t) <= hpOf(g.type) * 2);
      const pick = near[Math.floor(rand() * near.length)];
      if (pick !== undefined) type = pick;
    }
    const { cargo: _cargo, ...plain } = g;
    const out: SpawnGroup = {
      ...plain,
      type,
      count: Math.max(1, Math.round(g.count * uniform(0.7, 1.3))),
      at: round1(g.at * uniform(0.8, 1.2)),
      gap: round2(Math.max(0.1, g.gap * uniform(0.8, 1.2))),
    };
    return type === g.type && g.cargo !== undefined ? { ...out, cargo: g.cargo } : out;
  });
  const target = toughness(ruleset, wave);
  const budget = (options.budgetPct ?? 10) / 100;
  const varied: WaveBody = { ...wave, groups };
  const within = (w: WaveBody): boolean => Math.abs(toughness(ruleset, w) - target) <= target * budget;
  if (target > 0 && !within(varied)) {
    const factor = target / Math.max(1, toughness(ruleset, varied));
    for (const g of groups) if (!isBoss(ruleset, g.type)) g.count = Math.max(1, Math.round(g.count * factor));
    // Rounding can leave it outside: step the biggest group one at a time towards the target.
    for (let i = 0; i < 200 && !within(varied); i += 1) {
      const big = groups.filter((g) => !isBoss(ruleset, g.type)).sort((x, y) => y.count * hpOf(y.type) - x.count * hpOf(x.type))[0];
      if (big === undefined) break;
      const under = toughness(ruleset, varied) < target;
      if (!under && big.count <= 1) break;
      big.count += under ? 1 : -1;
    }
  }
  return { ...varied, groups: groups.sort((x, y) => x.at - y.at) };
}

// ---- table helpers -------------------------------------------------------------------------------------------------

/** Every non-boss count in waves `from`..`to` scaled by `pct` percent (at least 1 each). */
export function scaleCounts(ruleset: Ruleset, waves: readonly AuthoredWave[], from: number, to: number, pct: number): AuthoredWave[] {
  return waves.map((w) =>
    w.wave < from || w.wave > to
      ? w
      : { ...w, groups: w.groups.map((g) => (isBoss(ruleset, g.type) ? g : { ...g, count: Math.max(1, Math.round((g.count * (100 + pct)) / 100)) })) },
  );
}

/** Wave `to` becomes a copy of wave `from` (a boss is copied only onto a tenth wave). */
export function copyWave(ruleset: Ruleset, waves: readonly AuthoredWave[], from: number, to: number): AuthoredWave[] {
  const source = waves.find((w) => w.wave === from);
  if (source === undefined) return [...waves];
  const groups = source.groups.filter((g) => to % 10 === 0 || !isBoss(ruleset, g.type)).map((g) => ({ ...g }));
  return waves.map((w) => (w.wave === to ? { wave: to, groups, hpMult: source.hpMult, speedMult: source.speedMult } : w));
}

/** A new alien on its own in a small group: how prompt.md:385 asks a new enemy to arrive. */
export function introduceAlien(type: string, count = 4): SpawnGroup[] {
  return [{ type, count, at: 0, gap: 2.5 }];
}

/** The non-boss types the campaign has scheduled by wave `n` (Vary's default pool). */
export function typesBy(ruleset: Ruleset, waves: readonly AuthoredWave[], n: number): string[] {
  const out = new Set<string>();
  for (const w of waves) if (w.wave <= n) for (const g of w.groups) if (!isBoss(ruleset, g.type)) out.add(g.type);
  return [...out];
}
