// Difficulty curves (Gate M, LD13; scope-level-designer.md §3.3 "Admin UX", C8.1, C8.3, C17.5): the anchors a campaign
// is shaped against, so the level designer can see a wave set beside them and set wave health from them.
//
//   toughness   C8.1: the health multiplier rises linearly between anchors, x1 at wave 1 to x7 at wave 50, rounded
//               to 0.05.
//   margin      C8.3: how much tougher each wave could be before the competent player (0 % learning, no powers, no
//               purchases during the wave) lets an alien through. The target is the campaign's sawtooth: about 4 at
//               wave 1 down to 1.10 at 49, boss waves a little below their neighbours. Presets scale it.
//   duration    C17.5: an ordinary wave of 25 s or more; a boss wave of 40 to 100 s (1x, competent player)
//               [ASSUMPTION: the scope's "25 s and 40-100 s bands"].
//
// fitHpMult turns a measured margin into the health multiplier that would meet the target: margin multiplies every
// health value, so (hpMult x margin / target) is the health at which the margin would be the target, give or take
// what the board does differently against tougher aliens (the exit check allows 15 %).
import { LIMITS } from "../rules/contracts.generated";

export type Anchor = readonly [number, number];

export const TOUGHNESS_ANCHORS: readonly Anchor[] = [
  [1, 1],
  [10, 1.4],
  [20, 3.2],
  [30, 4.8],
  [40, 6],
  [50, 7],
];

export const MARGIN_ANCHORS: readonly Anchor[] = [
  [1, 4],
  [9, 2.6],
  [19, 2.0],
  [29, 1.55],
  [39, 1.28],
  [49, 1.1],
];

/** A boss wave's margin target against the curve between its neighbours ("a little below", C8.3) [ASSUMPTION]. */
export const BOSS_MARGIN_DIP = 0.92;

export interface MarginPreset {
  readonly id: string;
  readonly label: string;
  /** Multiplies the whole target curve: above 1 is gentler (more room before a leak). */
  readonly scale: number;
}

export const MARGIN_PRESETS: readonly MarginPreset[] = [
  { id: "campaign", label: "The campaign's curve (C8.3)", scale: 1 },
  { id: "gentle", label: "Gentler (a fifth more room)", scale: 1.2 },
  { id: "tough", label: "Tougher (15 % less room)", scale: 0.85 },
];

export const DURATION_BANDS = { ordinaryMinSeconds: 25, bossMinSeconds: 40, bossMaxSeconds: 100 } as const;

/** Linear between anchors, flat beyond the first and last. */
export function interpolate(anchors: readonly Anchor[], x: number): number {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (first === undefined || last === undefined) throw new Error("interpolate: no anchors");
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i += 1) {
    const [x1, y1] = anchors[i] ?? last;
    const [x0, y0] = anchors[i - 1] ?? first;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return last[1];
}

/** Rounded to the nearest 0.05 (C8.1), without floating-point tails. */
export function round005(x: number): number {
  return Math.round(x * 20) / 20;
}

/** C8.1's toughness at a wave. */
export function toughnessAt(wave: number): number {
  return round005(interpolate(TOUGHNESS_ANCHORS, wave));
}

/** The margin target at a wave, for a preset (a boss wave a little below the curve). */
export function marginTarget(wave: number, preset: MarginPreset = MARGIN_PRESETS[0] as MarginPreset, boss = wave % 10 === 0): number {
  const curve = interpolate(MARGIN_ANCHORS, wave) * preset.scale;
  return Math.round((boss ? curve * BOSS_MARGIN_DIP : curve) * 100) / 100;
}

export type DurationProblem = "short" | "long" | null;

/** Whether a wave's length (seconds at 1x) is outside its band. */
export function durationProblem(seconds: number, boss: boolean): DurationProblem {
  if (boss) return seconds < DURATION_BANDS.bossMinSeconds ? "short" : seconds > DURATION_BANDS.bossMaxSeconds ? "long" : null;
  return seconds < DURATION_BANDS.ordinaryMinSeconds ? "short" : null;
}

/** The health multiplier that would bring a measured margin to the target, rounded and kept inside the designer's
 *  limits (limits.json levelDesigner.hpMult). */
export function fitHpMult(hpMult: number, margin: number, target: number): number {
  const { min, max } = LIMITS.levelDesigner.hpMult;
  if (!(margin > 0) || !(target > 0)) return hpMult;
  return Math.min(max, Math.max(min, round005((hpMult * margin) / target)));
}
