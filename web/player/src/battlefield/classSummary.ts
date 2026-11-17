// What an astronaut class does, in short words for the shop card's hover and focus summary (D4 "one-line explanation",
// prompt.md:295 "view cost, upgrade benefits and range"). Every number comes from the compiled ruleset (the same
// ClassStats the simulation uses), so the summary changes with the balance and never disagrees with the game.
// The explanation line follows the class's attack kind, not its ID, so a class added later still gets one; the
// character lines are prompt.md's optional, unvoiced card text.
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
}

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

export function classSummary(cls: ClassStats): ClassSummary {
  const first = cls.levels[0];
  if (first === undefined) return { title: `${cls.name}, ${cls.role}`, line: "", facts: [], upgrades: [], quote: null };
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
  };
}
