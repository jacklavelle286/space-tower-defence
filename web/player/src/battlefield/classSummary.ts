// What an astronaut class does, in short words for the shop card's hover and focus summary (D4 "one-line explanation",
// prompt.md:295 "view cost, upgrade benefits and range"). Every number comes from the compiled ruleset (the same
// ClassStats the simulation uses), so the summary changes with the balance and never disagrees with the game.
// The explanation line follows the class's attack kind, not its ID, so a class added later still gets one; the
// character lines are prompt.md's optional, unvoiced card text.
//
// Star ratings (owner request at the Gate E review): 1 to 5 stars per quality, at level 1, measured against the best
// value any class reaches at any level in the same ruleset, so upgrading can only earn more stars and a rebalance
// moves the stars with it. Attackers are rated on Power (damage per second, a blast counted as two hits), Reach and Speed (shots per second);
// support classes on Help (their effect against their own level 3) and, for a class with a ring, Reach.
import { STEPS_PER_SECOND, type ClassStats, type LevelStats } from "@scd/game-core";

export interface ClassSummary {
  /** "Pip, Frost Explorer". */
  readonly title: string;
  /** One line on what the class is for. */
  readonly line: string;
  /** Level 1's numbers, one short fact each. */
  readonly facts: readonly string[];
  /** "Level 2: faster shots", one per upgrade. */
  readonly upgrades: readonly string[];
  /** The optional character line (prompt.md), or null. */
  readonly quote: string | null;
  /** Star ratings at level 1, 1 to 5 each. */
  readonly ratings: readonly Rating[];
}

export interface Rating {
  readonly label: "Power" | "Reach" | "Speed" | "Help";
  readonly stars: number;
}

export const MAX_STARS = 5;

const QUOTES: Readonly<Record<string, string>> = {
  nova: "Ready for launch!",
  pip: "Let's cool things down.",
  juno: "I've got a bright idea.",
  mira: "The colony is in good hands.",
  orion: "I can see them coming.",
  sol: "Better together!",
};

/** At or beyond this reach a single-target class is described as long range (Orion's 4.5; Nova has 2.5). */
const LONG_RANGE_TILES = 4;

function seconds(ticks: number): string {
  const s = Math.round((ticks / STEPS_PER_SECOND) * 10) / 10;
  return `${s} ${s === 1 ? "second" : "seconds"}`;
}

function squares(tiles: number): string {
  return `${tiles} ${tiles === 1 ? "square" : "squares"}`;
}

function explain(cls: ClassStats, first: LevelStats): string {
  switch (cls.attack) {
    case "single":
      return (first.shot?.rangeTiles ?? 0) >= LONG_RANGE_TILES ? "Hits one alien hard, from far away." : "Zaps one alien at a time.";
    case "slow":
      return "Slows aliens down so the others can catch them.";
    case "blast":
      return "Hits a whole group of aliens at once.";
    case "shield":
      return "Gives the colony a shield. Does not shoot.";
    case "buff":
      return "Helps nearby astronauts hit harder. Does not shoot.";
  }
}

function factsOf(cls: ClassStats, l: LevelStats): string[] {
  const facts: string[] = [];
  if (l.shot !== null) {
    facts.push(`Reach: ${squares(l.shot.rangeTiles)}`);
    facts.push(`Shoots every ${seconds(l.shot.periodTicks)}`);
    facts.push(`Damage: ${l.shot.damage}${l.shot.splashSq > 0 ? " to every alien in the blast" : ""}`);
    if (l.shot.slow !== null) facts.push(`Slows by ${l.shot.slow.pct}% for ${seconds(l.shot.slow.ticks)}`);
  }
  if (l.shield !== null) {
    facts.push(`Adds ${l.shield.points} shield every ${seconds(l.shield.periodTicks)}`);
    if (l.shield.repairOnWaveClear > 0) facts.push(`Repairs ${l.shield.repairOnWaveClear} after each wave`);
  }
  if (l.buff !== null) {
    facts.push(`Boost: +${l.buff.pct}% damage`);
    facts.push(`Reach: ${squares(l.buff.radiusTiles)}`);
  }
  if (cls.deployCap !== null) facts.push(`Up to ${cls.deployCap} on the map`);
  return facts;
}

/** What one level adds over the one before, in a few words. */
function gains(prev: LevelStats, next: LevelStats): string {
  const out: string[] = [];
  const a = prev.shot;
  const b = next.shot;
  if (a !== null && b !== null) {
    if (b.periodTicks < a.periodTicks) out.push("faster shots");
    if (b.rangeTiles > a.rangeTiles) out.push("more reach");
    if (b.damage > a.damage) out.push("more damage");
    if (b.splashSq > a.splashSq) out.push("bigger blast");
    if (a.slow !== null && b.slow !== null) {
      if (b.slow.radiusSq > a.slow.radiusSq) out.push("slows a group");
      if (b.slow.pct > a.slow.pct || b.slow.ticks > a.slow.ticks) out.push("stronger slow");
    }
  }
  if (prev.shield !== null && next.shield !== null) {
    if (next.shield.points > prev.shield.points) out.push("bigger shield");
    if (next.shield.periodTicks < prev.shield.periodTicks) out.push("shields more often");
    if (next.shield.repairOnWaveClear > prev.shield.repairOnWaveClear) out.push("repairs the colony");
  }
  if (prev.buff !== null && next.buff !== null) {
    if (next.buff.pct > prev.buff.pct) out.push("bigger boost");
    if (next.buff.radiusTiles > prev.buff.radiusTiles) out.push("reaches further");
  }
  return out.length > 0 ? out.join(", ") : "stronger";
}

/** What upgrading the class from `level` to the next adds ("faster shots"), or null at the top level (D4 panel). */
export function upgradeGain(cls: ClassStats, level: number): string | null {
  const prev = cls.levels[level - 1];
  const next = cls.levels[level];
  return prev === undefined || next === undefined ? null : gains(prev, next);
}

/** value as stars against best: at least 1 for anything above 0, MAX_STARS at best. */
function stars(value: number, best: number): number {
  if (best <= 0 || value <= 0) return 1;
  return Math.min(MAX_STARS, Math.max(1, Math.ceil((MAX_STARS * value) / best)));
}

/** A blast is counted as hitting this many aliens for Power, so an area class is not rated as weak [ASSUMPTION]. */
const BLAST_TARGETS = 2;
const dps = (l: LevelStats): number =>
  l.shot === null ? 0 : (l.shot.damage * (l.shot.splashSq > 0 ? BLAST_TARGETS : 1) * STEPS_PER_SECOND) / l.shot.periodTicks;
const shotsPerSecond = (l: LevelStats): number => (l.shot === null ? 0 : STEPS_PER_SECOND / l.shot.periodTicks);
const reach = (l: LevelStats): number => l.shot?.rangeTiles ?? l.buff?.radiusTiles ?? 0;
/** A support level's effect in its own units: shield points a minute plus repair a wave, or boost percent. */
const help = (l: LevelStats): number =>
  l.shield !== null
    ? (l.shield.points * STEPS_PER_SECOND * 60) / l.shield.periodTicks + l.shield.repairOnWaveClear
    : (l.buff?.pct ?? 0);

function ratingsOf(cls: ClassStats, first: LevelStats, all: Readonly<Record<string, ClassStats>>): Rating[] {
  const every = Object.values(all).flatMap((c) => c.levels);
  const best = (f: (l: LevelStats) => number): number => Math.max(0, ...every.map(f));
  if (first.shot !== null) {
    return [
      { label: "Power", stars: stars(dps(first), best(dps)) },
      { label: "Reach", stars: stars(reach(first), best(reach)) },
      { label: "Speed", stars: stars(shotsPerSecond(first), best(shotsPerSecond)) },
    ];
  }
  const own = Math.max(0, ...cls.levels.map(help));
  const out: Rating[] = [{ label: "Help", stars: stars(help(first), own) }];
  if (first.buff !== null) out.push({ label: "Reach", stars: stars(reach(first), best(reach)) });
  return out;
}

/** The summary of `cls`; `all` is every class in the ruleset, the yardstick for the stars. */
export function classSummary(cls: ClassStats, all: Readonly<Record<string, ClassStats>>): ClassSummary {
  const first = cls.levels[0];
  if (first === undefined) return { title: `${cls.name}, ${cls.role}`, line: "", facts: [], upgrades: [], quote: null, ratings: [] };
  const upgrades: string[] = [];
  for (let i = 1; i < cls.levels.length; i++) {
    const prev = cls.levels[i - 1];
    const next = cls.levels[i];
    if (prev !== undefined && next !== undefined) upgrades.push(`Level ${next.level}: ${gains(prev, next)}`);
  }
  return {
    title: `${cls.name}, ${cls.role}`,
    line: explain(cls, first),
    facts: factsOf(cls, first),
    upgrades,
    quote: QUOTES[cls.id] ?? null,
    ratings: ratingsOf(cls, first, all),
  };
}
