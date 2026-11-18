// Make the challenges for me (Gate M, LD18; owner 2026-11-18): challenge wave sets cut from a level's campaign, with
// the board a competent player would have built by then. Seeded and pure, like the map and wave generators.
//
//   planChallenges(seed, count, options)       which campaign waves each challenge plays (an opening, a boss, middles)
//   makeChallenge(ruleset, planet, plan, ...)  one challenge: the competent test player at 0 % learning plays the
//                                              campaign up to the challenge's first wave; its astronauts become the
//                                              presets (some taken away, half their price given back as credits), the
//                                              astronauts unlocked by then are offered, and the pads open by then are
//                                              open. The challenge is then played: the competent player at 0 % must
//                                              clear it (the check that blocks publishing, checks.ts), and the presets
//                                              alone must not (the playsItself warning).
//   assembleChallenges(levelId, made)          keys and names them for the level (the admin runs one worker each)
//   makeChallenges(...)                        all three, one after another (tests)
//
// A level without the campaign keeps its challenges' waves as its own challenge waves ("<levelId>-w12"); challenge
// waves never hold a boss (map/rules.ts bossWave), so such a level gets no boss challenge.
import type { AuthoredWave, ChallengeWave, PlanetDocument, PresetPlacement, Ruleset, WaveSet } from "../data/game-data";
import { LIMITS, type Snapshot } from "../rules/contracts.generated";
import { battleSnapshot, createBattle } from "../sim/battle";
import { compileBattleConfig } from "../sim/config";
import { nextRandom } from "../sim/rng";
import { deriveBlueprint } from "./board";
import { competentPolicy, presetsOnlyPolicy } from "./policies";
import { betweenWaves, fightWave, playWaveSet, startingSnapshot } from "./runner";

export type ChallengeTheme = "opening" | "boss" | "middle";

/** A challenge plays campaign waves first..last (2 to 8 of them). */
export interface ChallengePlan {
  readonly theme: ChallengeTheme;
  readonly first: number;
  readonly last: number;
}

export interface MadeChallenges {
  /** Keyed "<levelId>-<name>" (at most 40 characters). */
  readonly waveSets: Record<string, WaveSet>;
  /** Only for a level without the campaign: copies of the campaign waves the challenges play. */
  readonly challengeWaves: Record<string, ChallengeWave>;
  /** One sentence per challenge left out, and why. */
  readonly notes: string[];
}

export interface MakeChallengesOptions {
  readonly seed: number;
  readonly levelId: string;
  /** The level owns the campaign: challenges name campaign wave numbers. Otherwise they get their own copies. */
  readonly ownsCampaign: boolean;
}

export const MAX_CHALLENGES = 4;
const L = LIMITS.levelDesigner;
/** Share of the competent player's astronauts a challenge starts with; the rest is the child's to place. */
const KEEP = 0.6;
const REFUND = 0.5;
const CREDIT_STEP = 50;
const CREDIT_TRIES = 8;

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
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)] as T;
  }
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }
}

/**
 * Which waves each challenge plays: an opening (waves 1 to 3-5), a boss fight (the 2-3 waves before wave 10 or 20, and
 * the boss), then middles (4-5 waves in 11-19, then 21-29). Without bosses (a level without the campaign) the boss
 * fight becomes a middle in waves 5-9.
 */
export function planChallenges(seed: number, count: number, options: { readonly bosses: boolean }): ChallengePlan[] {
  const rng = new Rng((seed ^ 0x5eed_c4a1) >>> 0);
  const plans: ChallengePlan[] = [];
  const opening = (): ChallengePlan => ({ theme: "opening", first: 1, last: rng.int(3, 5) });
  const boss = (): ChallengePlan => {
    const last = rng.pick([10, 20]);
    return { theme: "boss", first: last - rng.int(2, 3), last };
  };
  const middle = (from: number, to: number, length: readonly [number, number]): ChallengePlan => {
    const n = rng.int(length[0], length[1]);
    const first = rng.int(from, to - n + 1);
    return { theme: "middle", first, last: first + n - 1 };
  };
  const order = [
    opening,
    options.bosses ? boss : () => middle(5, 9, [3, 4]),
    () => middle(11, 19, [4, 5]),
    () => middle(21, 29, [4, 5]),
  ];
  for (const make of order.slice(0, Math.max(0, Math.min(MAX_CHALLENGES, Math.floor(count))))) plans.push(make());
  return plans;
}

const NAMES: Record<ChallengeTheme, readonly string[]> = {
  opening: ["{a} Parade", "{a} Patrol", "Hello, {a}", "{a} on the Way"],
  boss: ["{b} Showdown", "{b} Rematch", "Meet {b}", "{b} Strikes Back"],
  middle: ["{a} Rush", "{a} Rumble", "{a} Stampede", "{a} Surprise", "Mixed Bag"],
};

/** The alien a challenge is named after: an opening's commonest, otherwise the last one to arrive. */
function featured(ruleset: Ruleset, waves: readonly AuthoredWave[], theme: ChallengeTheme): string {
  const tally = new Map<string, number>();
  for (const w of waves) for (const g of w.groups) if (!Object.hasOwn(ruleset.bosses, g.type)) tally.set(g.type, (tally.get(g.type) ?? 0) + g.count);
  const ids = [...tally.keys()];
  const id = theme === "opening" ? [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] : ids[ids.length - 1];
  return id === undefined ? "Alien" : (ruleset.aliens[id]?.name ?? id);
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

/** What a placement cost to buy and upgrade to its level. */
function worth(ruleset: Ruleset, p: PresetPlacement): number {
  const levels = ruleset.classes[p.classId]?.levels ?? [];
  return levels.slice(0, p.level).reduce((sum, l) => sum + l.cost, 0);
}

const round10 = (v: number): number => Math.round(v / 10) * 10;
const clampCredits = (v: number): number => Math.max(L.startCredits.min, Math.min(L.startCredits.max, round10(v)));

/** The competent player's snapshot as each of `starts` is about to begin (0 % learning), or null where it lost first. */
export function challengeBoards(ruleset: Ruleset, planet: PlanetDocument, starts: readonly number[]): Map<number, Snapshot | null> {
  const config = compileBattleConfig(ruleset, planet, "campaign");
  const policy = competentPolicy(config, { blueprint: deriveBlueprint(config) });
  const out = new Map<number, Snapshot | null>();
  const wanted = new Set(starts);
  const lastStart = Math.max(0, ...starts);
  let snapshot = startingSnapshot(config);
  for (let w = 1; w <= lastStart; w += 1) {
    if (w > 1) snapshot = betweenWaves(ruleset, config, snapshot, w - 1, 0, false);
    if (wanted.has(w)) out.set(w, snapshot);
    if (w === lastStart) break;
    const battle = createBattle(config, snapshot, w, "bot");
    policy.prep(battle);
    const row = fightWave(battle, policy);
    policy.afterWave({ leakDamage: row.leakDamage, penetration: row.penetration });
    if (!row.cleared) {
      for (const s of starts) if (s > w) out.set(s, null);
      break;
    }
    snapshot = battleSnapshot(battle);
  }
  return out;
}

/** How many of the set's waves a player clears: the competent player at 0 %, or the presets on their own. */
function clears(ruleset: Ruleset, planet: PlanetDocument, id: string, presetsOnly: boolean): number {
  const config = compileBattleConfig(ruleset, planet, id);
  const policy = presetsOnly ? presetsOnlyPolicy() : competentPolicy(config, { blueprint: deriveBlueprint(config) });
  return playWaveSet(ruleset, config, policy, { learn: 0, meteors: false }).cleared;
}

/** One challenge made from its plan: the wave set and (a level without the campaign) its own waves, or why not. */
export type MadeChallenge =
  | { readonly waveSet: WaveSet; readonly challengeWaves: Record<string, ChallengeWave> }
  | { readonly note: string };

/** The id a challenge is tried under while it is made (keyId: at most 40 characters). */
const trialId = (levelId: string): string => `${levelId}-try`;

/**
 * One challenge (the admin makes each in its own Web Worker). `index` is its place in the plans, so each draws its own
 * random numbers; `board` is the competent player's snapshot at `plan.first` when the caller already has it
 * (challengeBoards), otherwise this plays up to there itself.
 */
export function makeChallenge(
  ruleset: Ruleset,
  planet: PlanetDocument,
  plan: ChallengePlan,
  options: MakeChallengesOptions & { readonly index: number; readonly board?: Snapshot | null },
): MadeChallenge {
  const rng = new Rng((options.seed ^ 0x0c4a_11e6 ^ Math.imul(options.index + 1, 0x9e37_79b1)) >>> 0);
  const campaign = planet.waveSets["campaign"];
  if (campaign === undefined) throw new Error("makeChallenge: the planet has no campaign to cut challenges from");
  const byNumber = new Map(planet.waves.map((w) => [w.wave, w]));
  const numbers = Array.from({ length: plan.last - plan.first + 1 }, (_, i) => plan.first + i);
  const waves = numbers.map((n) => byNumber.get(n)).filter((w): w is AuthoredWave => w !== undefined);
  const board = options.board !== undefined ? options.board : (challengeBoards(ruleset, planet, [plan.first]).get(plan.first) ?? null);
  if (board === null || waves.length < L.challengeWaves.min) return { note: `No challenge for waves ${plan.first} to ${plan.last}: the test player did not get that far.` };

  const template = rng.pick(NAMES[plan.theme]);
  const boss = waves.flatMap((w) => w.groups).find((g) => Object.hasOwn(ruleset.bosses, g.type));
  const name = template
    .replace("{a}", featured(ruleset, waves, plan.theme))
    .replace("{b}", boss === undefined ? "Boss" : (ruleset.bosses[boss.type]?.name ?? "Boss"))
    .slice(0, 60);
  const id = trialId(options.levelId);
  const refs: (number | string)[] = options.ownsCampaign ? numbers : numbers.map((n) => `${options.levelId}-w${n}`);
  const ownWaves: Record<string, ChallengeWave> = {};
  if (!options.ownsCampaign) {
    for (const w of waves) {
      const { wave: _n, ...body } = JSON.parse(JSON.stringify(w)) as AuthoredWave;
      ownWaves[`${options.levelId}-w${w.wave}`] = body;
    }
  }
  const classes = Object.entries(ruleset.classes)
    .filter(([, c]) => c.unlockAfterWave < plan.first)
    .sort((a, b) => a[1].unlockAfterWave - b[1].unlockAfterWave)
    .map(([cid]) => cid);
  const bought = rng.shuffle(board.placements.map((p): PresetPlacement => ({ padId: p.padId, classId: p.classId, level: p.level, targeting: p.targeting })));
  const keep = plan.first === 1 ? 0 : Math.ceil(bought.length * KEEP);
  let presets = bought.slice(0, keep);
  let away = bought.slice(keep);
  const refund = (gone: readonly PresetPlacement[]): number => gone.reduce((sum, p) => sum + worth(ruleset, p), 0) * REFUND;
  let credits = plan.first === 1 ? campaign.startCredits : clampCredits(board.credits + refund(away));
  const set = (): WaveSet => ({
    mode: "CHALLENGE",
    name,
    mapId: campaign.mapId,
    waves: refs,
    meteorAfter: numbers.length >= 4 ? [Math.floor(numbers.length / 2)] : [],
    startCredits: credits,
    colonyHealth: ruleset.colony.maxHealth,
    classes: classes.length > 0 ? classes : ["nova"],
    padsOpenAsForWave: plan.first,
    presetPlacements: presets.map((p) => ({ ...p })),
  });
  const trial = (): PlanetDocument => ({ ...planet, challengeWaves: { ...planet.challengeWaves, ...ownWaves }, waveSets: { ...planet.waveSets, [id]: set() } });
  const won = (): boolean => clears(ruleset, trial(), id, false) >= numbers.length;

  // Winnable by the competent player at 0 %: give back astronauts first, then credits.
  let ok = won();
  while (!ok && away.length > 0) {
    const back = away[0] as PresetPlacement;
    away = away.slice(1);
    presets = [...presets, back];
    credits = clampCredits(credits - worth(ruleset, back) * REFUND);
    ok = won();
  }
  for (let i = 0; !ok && i < CREDIT_TRIES && credits < L.startCredits.max; i += 1) {
    credits = clampCredits(credits + CREDIT_STEP);
    ok = won();
  }
  if (!ok) return { note: `No "${name}" challenge: the test player could not win it, even with more astronauts and credits.` };
  // Not won by the presets on their own: take astronauts away (half their price back) while it stays winnable.
  while (presets.length > 0 && clears(ruleset, trial(), id, true) >= numbers.length) {
    const before = { presets, credits };
    credits = clampCredits(credits + refund(presets.slice(0, 1)));
    presets = presets.slice(1);
    if (!won()) {
      ({ presets, credits } = before);
      break;
    }
  }
  return { waveSet: set(), challengeWaves: ownWaves };
}

/**
 * The made challenges as the level's: each keyed "<levelId>-<its name>" (or "<levelId>-c<n>" when that is too long or
 * taken), a repeated name numbered, and the notes of those left out.
 */
export function assembleChallenges(levelId: string, made: readonly MadeChallenge[], taken: readonly string[] = []): MadeChallenges {
  const waveSets: Record<string, WaveSet> = {};
  const challengeWaves: Record<string, ChallengeWave> = {};
  const notes: string[] = [];
  const names = new Set<string>();
  const used = new Set(taken);
  for (const m of made) {
    if ("note" in m) {
      notes.push(m.note);
      continue;
    }
    let name = m.waveSet.name;
    for (let n = 2; names.has(name); n += 1) name = `${m.waveSet.name} ${n}`.slice(0, 60);
    names.add(name);
    let id = `${levelId}-${slug(name)}`;
    for (let n = 1; id.length > 40 || used.has(id); n += 1) id = `${levelId}-c${n}`;
    used.add(id);
    waveSets[id] = { ...m.waveSet, name };
    Object.assign(challengeWaves, m.challengeWaves);
  }
  return { waveSets, challengeWaves, notes };
}

/**
 * Every challenge for `plans`, one after another. `planet` is the level merged into its planet with the level's map as
 * the campaign's (for a level without the campaign, the caller merges a copy that has it, for the test player's sake).
 */
export function makeChallenges(ruleset: Ruleset, planet: PlanetDocument, plans: readonly ChallengePlan[], options: MakeChallengesOptions): MadeChallenges {
  const boards = challengeBoards(ruleset, planet, plans.map((p) => p.first));
  const made = plans.map((plan, index) => makeChallenge(ruleset, planet, plan, { ...options, index, board: boards.get(plan.first) ?? null }));
  return assembleChallenges(options.levelId, made, Object.keys(planet.waveSets));
}
