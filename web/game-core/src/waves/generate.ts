// Make the waves for me (Gate M, LD15; owner 2026-11-18): the 50 campaign waves made from a seed, in the Moon
// campaign's shape (C8). Pure and seeded, like the map generator (LD14): the same choices and number make the same
// waves. Design time only: what is published is the fixed list this returns (prompt.md:409).
//
// The shape, read from the live Moon campaign (luna-1-c2):
//   - each alien arrives on its own first, in a small group (prompt.md:385), at the Moon's introduction waves
//     (1, 3, 6, 8, 12, 14, 22, 24, 27, then 17, 32, 34, 36 for a planet with more aliens);
//   - a boss on every tenth wave, with a light escort before and after it;
//   - every other wave mixes aliens already met: more kinds as the campaign goes on, the newest alien again soon
//     after it arrives, and a heavier wave before each boss;
//   - the health of the aliens scheduled (before hpMult) follows a budget measured from the Moon's waves; hpMult
//     follows C8.1's toughness curve, speedMult the Moon's late rise (1.05 from wave 31 to 1.25 by 47).
// The admin can then tune hpMult wave by wave with the test player (curves.ts fitHpMult), so the margins meet C8.3.
import { isBoss, type AuthoredWave, type Ruleset, type SpawnGroup } from "../data/game-data";
import { LIMITS } from "../rules/contracts.generated";
import { nextRandom } from "../sim/rng";
import { interpolate, MARGIN_PRESETS, round005, toughnessAt, type Anchor, type MarginPreset } from "./curves";
import { waveStats } from "./model";

export const CAMPAIGN_WAVES = 50;
const BOSS_WAVES = [10, 20, 30, 40, 50];
/** The Moon's introduction waves, then more for a planet with more aliens (never a tenth wave). */
const INTRO_WAVES = [1, 3, 6, 8, 12, 14, 22, 24, 27, 17, 32, 34, 36, 16, 26];
/** Scheduled health (count x the alien's hp, before hpMult) of an ordinary wave, read from luna-1-c2. */
const BUDGET: readonly Anchor[] = [
  [1, 150],
  [5, 280],
  [9, 500],
  [19, 760],
  [29, 900],
  [31, 1100],
  [41, 1300],
  [49, 1400],
];
/** Traits in the order a child meets them (the Moon's order); plain aliens come first. */
const TRAIT_ORDER = ["armour", "cluster", "flying", "bubbles", "healer", "children"];
const SOFT_CAP = 48; // ruleset caps.scheduledSpawnSoftCap in r4: more than this on the route at once waits
const L = LIMITS.levelDesigner;

export interface GenerateWavesOptions {
  readonly seed: number;
  readonly ruleset: Ruleset;
  /** Tiles from the portal to the colony (lengths and how many aliens are on the route at once). */
  readonly routeTiles: number;
  /** Aliens to use, in the order they arrive. Default: every scheduled alien, in introductionOrder. */
  readonly aliens?: readonly string[];
  /** Bosses for waves 10, 20, 30, 40 and 50, repeating the last if fewer. Default: the ruleset's, weakest first. */
  readonly bosses?: readonly string[];
  /** Gentler or tougher: divides hpMult by the preset's scale (the tuning aims at the same preset). */
  readonly preset?: MarginPreset;
}

export type GenerateWavesResult = { readonly waves: AuthoredWave[] } | { readonly reason: string };

/** Plain aliens first (slow before fast, then weaker first), then by trait in TRAIT_ORDER, then weaker first. */
export function introductionOrder(ruleset: Ruleset, ids: readonly string[] = Object.keys(ruleset.aliens)): string[] {
  const rank = (id: string): number => {
    const traits = Object.keys(ruleset.aliens[id]?.traits ?? {});
    if (traits.length === 0) return -1;
    return Math.max(...traits.map((t) => (TRAIT_ORDER.includes(t) ? TRAIT_ORDER.indexOf(t) : TRAIT_ORDER.length)));
  };
  return ids
    .filter((id) => ruleset.aliens[id] !== undefined && ruleset.aliens[id]?.descendantOnly === false)
    .sort((a, b) => {
      const x = ruleset.aliens[a];
      const y = ruleset.aliens[b];
      if (x === undefined || y === undefined) return 0;
      return rank(a) - rank(b) || (rank(a) === -1 ? x.speed - y.speed : 0) || x.hp - y.hp || a.localeCompare(b);
    });
}

class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next(): number {
    const r = nextRandom(this.state);
    this.state = r.state;
    return r.value / 0x1_0000_0000;
  }
  between(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  pick<T>(items: readonly T[]): T | undefined {
    return items[Math.floor(this.next() * items.length)];
  }
}

const round1 = (v: number): number => Math.round(v * 10) / 10;
const round2 = (v: number): number => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** The Moon's late speed rise: 1 to wave 30, then 1.05 rising 0.05 every four waves to 1.25. */
export function speedMultAt(wave: number): number {
  return wave <= 30 ? 1 : round2(Math.min(1.25, 1.05 + 0.05 * Math.floor((wave - 31) / 4)));
}

/** The scheduled health an ordinary wave aims at (before hpMult). */
export function budgetAt(wave: number): number {
  return interpolate(BUDGET, wave);
}

export function generateWaves(options: GenerateWavesOptions): GenerateWavesResult {
  const { ruleset } = options;
  const rng = new Rng(options.seed);
  const aliens = (options.aliens ?? introductionOrder(ruleset)).filter((id) => ruleset.aliens[id] !== undefined && ruleset.aliens[id]?.descendantOnly === false);
  if (aliens.length === 0) return { reason: "Choose at least one alien." };
  const bosses = options.bosses ?? Object.keys(ruleset.bosses).sort((a, b) => (ruleset.bosses[a]?.hp ?? 0) - (ruleset.bosses[b]?.hp ?? 0));
  if (bosses.length === 0 || bosses.some((b) => !isBoss(ruleset, b))) return { reason: "This game version has no bosses for waves 10, 20, 30, 40 and 50." };
  const preset = options.preset ?? (MARGIN_PRESETS[0] as MarginPreset);
  const introAt = new Map<number, string>();
  aliens.slice(0, INTRO_WAVES.length).forEach((id, i) => introAt.set(INTRO_WAVES[i] as number, id));
  const arrival = new Map([...introAt].map(([wave, id]) => [id, wave]));

  const hp = (id: string): number => ruleset.aliens[id]?.hp ?? 1;
  const cluster = (id: string): boolean => ruleset.aliens[id]?.traits.cluster !== undefined;
  /** Seconds between two aliens of a group: tougher aliens further apart, everything closer late in the campaign. */
  const gapFor = (id: string, wave: number): number => {
    const pace = 1.25 - (0.8 * (wave - 1)) / (CAMPAIGN_WAVES - 1);
    return round2(clamp(2 * (hp(id) / 24) ** 0.8 * pace * (cluster(id) ? 0.5 : 1), 0.25, 14));
  };
  const countFor = (id: string, health: number, lo = 1): number => clamp(Math.round(health / hp(id)), lo, L.groupCount.max);

  /** Groups one after another, each starting part-way through the one before. */
  const schedule = (parts: readonly { type: string; count: number }[], wave: number, start = 0): SpawnGroup[] => {
    let at = start;
    return parts.map((p, i) => {
      const gap = p.count === 1 ? 0 : gapFor(p.type, wave);
      const group: SpawnGroup = { type: p.type, count: p.count, at: round1(clamp(at, 0, L.groupSeconds.max)), gap };
      if (i < parts.length - 1) at += Math.max(2, p.count * gap * rng.between(0.35, 0.75));
      return group;
    });
  };

  const waves: AuthoredWave[] = [];
  for (let wave = 1; wave <= CAMPAIGN_WAVES; wave += 1) {
    const met = aliens.filter((id) => (arrival.get(id) ?? Infinity) <= wave);
    const budget = budgetAt(wave);
    let groups: SpawnGroup[];
    const newcomer = introAt.get(wave);
    if (BOSS_WAVES.includes(wave)) {
      const boss = bosses[Math.min(BOSS_WAVES.indexOf(wave), bosses.length - 1)] as string;
      const escort = met.length > 0 ? met : aliens.slice(0, 1);
      const before = rng.pick(escort) as string;
      const after = rng.pick(escort) as string;
      groups = [
        { type: before, count: countFor(before, budget * 0.12, 2), at: 0, gap: gapFor(before, wave) },
        { type: boss, count: 1, at: 8, gap: 0 },
        { type: after, count: countFor(after, budget * 0.15, 2), at: round1(rng.between(20, 30)), gap: gapFor(after, wave) },
      ];
    } else if (newcomer !== undefined) {
      // A new alien on its own: most of the budget on wave 1, a small group later on (the Moon: 6 at wave 1, 2-4 later).
      // Spread over about 18 s so the child sees each one (a cluster alien in three bursts, as the Moon's wave 8).
      const share = Math.max(0.25, 1 - wave / 20);
      const count = clamp(countFor(newcomer, budget * share), 2, 8);
      const gap = gapFor(newcomer, wave);
      groups =
        cluster(newcomer)
          ? [0, 9, 18].map((at) => ({ type: newcomer, count, at, gap }))
          : [{ type: newcomer, count, at: 0, gap: round2(clamp(Math.max(gap, 18 / count), 0.25, 14)) }];
    } else {
      const pool = met.length > 0 ? met : aliens.slice(0, 1);
      const beforeBoss = wave % 10 === 9 ? 1.12 : 1;
      const target = budget * beforeBoss * rng.between(0.85, 1.1);
      const kinds = clamp(Math.round(1 + wave / 8 + rng.between(-1, 1)), 1, Math.min(pool.length, 7));
      const chosen: string[] = [];
      const newest = pool.filter((id) => wave - (arrival.get(id) ?? 0) <= 6).at(-1);
      if (newest !== undefined) chosen.push(newest);
      while (chosen.length < kinds) {
        const next = rng.pick(pool.filter((id) => !chosen.includes(id)));
        if (next === undefined) break;
        chosen.push(next);
      }
      const weights = chosen.map(() => rng.between(0.6, 1.4));
      const total = weights.reduce((a, b) => a + b, 0);
      const parts: { type: string; count: number }[] = [];
      chosen.forEach((type, i) => {
        const count = countFor(type, (target * (weights[i] as number)) / total);
        // A big group comes in bursts (the Moon's wave 11: three bursts of seven).
        const bursts = count > 16 && parts.length + 3 <= L.groupsPerWave.max ? Math.min(3, Math.ceil(count / 12)) : 1;
        for (let b = 0; b < bursts; b += 1) parts.push({ type, count: Math.round(count / bursts) });
      });
      // Shuffle lightly so the order is not always the order of arrival.
      for (let i = parts.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng.next() * (i + 1));
        [parts[i], parts[j]] = [parts[j] as { type: string; count: number }, parts[i] as { type: string; count: number }];
      }
      groups = schedule(parts.slice(0, L.groupsPerWave.max), wave);
    }
    const hpMult = clamp(round005(toughnessAt(wave) / preset.scale), L.hpMult.min, L.hpMult.max);
    waves.push(fitTiming(ruleset, { wave, groups: groups.sort((a, b) => a.at - b.at), hpMult, speedMult: speedMultAt(wave) }, options.routeTiles));
  }
  return { waves };
}

/** Spread a wave out until it is long enough (an ordinary wave 25 s or more, C17.5) and no more than the soft cap of
 *  aliens would be on the route at once (C6.4: more would wait at the portal). */
function fitTiming(ruleset: Ruleset, wave: AuthoredWave, routeTiles: number): AuthoredWave {
  let out = wave;
  for (let i = 0; i < 12; i += 1) {
    const stats = waveStats(ruleset, out, routeTiles);
    const boss = out.groups.some((g) => isBoss(ruleset, g.type));
    const short = !boss && stats.seconds < 25;
    if (!short && stats.peakLive <= SOFT_CAP) break;
    out = {
      ...out,
      groups: out.groups.map((g) =>
        isBoss(ruleset, g.type) ? g : { ...g, at: round1(Math.min(L.groupSeconds.max, g.at * 1.2 + (short ? 1 : 0))), gap: round2(Math.min(L.groupSeconds.max, Math.max(0.25, g.gap * 1.2))) },
      ),
    };
  }
  return out;
}
