// The combat sound set (D10.10; Phase 66): 25 short sounds, each under a second, made in the browser from a recipe
// (Web Audio oscillators and a little noise) rather than recorded files: nothing to license, nothing to download,
// and one place to balance their loudness. Source: written as code in this repository (D10.1 "owner-created").
//
// A recipe is a few voices; each voice is a tone (or noise) that glides from one pitch to another and fades in and
// out. `gain` is set by ear so the set sounds equally loud (D10.10 "normalised to the same loudness") [PROPOSAL].

export type Wave = "sine" | "triangle" | "square" | "sawtooth" | "noise";

export interface Voice {
  readonly wave: Wave;
  /** Hz at the start and at the end (noise: the band-pass centre). */
  readonly from: number;
  readonly to: number;
  /** Seconds after the sound starts. */
  readonly at: number;
  readonly dur: number;
  /** Peak level, 0..1 before the player's volume. */
  readonly gain: number;
}

export const SOUND_IDS = [
  "sfx-place",
  "sfx-upgrade",
  "sfx-sell",
  "sfx-nova",
  "sfx-pip",
  "sfx-juno",
  "sfx-orion",
  "sfx-mira",
  "sfx-sol",
  "sfx-hit-clonk",
  "sfx-bubble-pop",
  "sfx-pop-stars",
  "sfx-leak",
  "sfx-wave-start",
  "sfx-wave-clear",
  "sfx-boss-arrive",
  "sfx-boss-phase",
  "sfx-frost-pulse",
  "sfx-comet-burst",
  "sfx-colony-shield",
  "sfx-correct",
  "sfx-not-quite",
  "sfx-reward",
  "sfx-badge",
  "sfx-click",
] as const;
export type SoundId = (typeof SOUND_IDS)[number];

const tone = (wave: Wave, from: number, to: number, at: number, dur: number, gain: number): Voice => ({ wave, from, to, at, dur, gain });
/** A short rising arpeggio: each note `step` seconds after the last. */
const notes = (wave: Wave, hz: readonly number[], step: number, dur: number, gain: number): Voice[] => hz.map((f, i) => tone(wave, f, f, i * step, dur, gain));

export const RECIPES: Readonly<Record<SoundId, readonly Voice[]>> = {
  "sfx-place": [tone("triangle", 330, 660, 0, 0.12, 0.35), tone("sine", 660, 660, 0.08, 0.12, 0.25)],
  "sfx-upgrade": notes("triangle", [523, 659, 784], 0.07, 0.12, 0.3),
  "sfx-sell": [tone("triangle", 660, 330, 0, 0.18, 0.3)],
  "sfx-nova": [tone("square", 1200, 600, 0, 0.07, 0.08)],
  "sfx-pip": [tone("sine", 1600, 1400, 0, 0.09, 0.12), tone("noise", 6000, 6000, 0, 0.06, 0.05)],
  "sfx-juno": [tone("triangle", 220, 110, 0, 0.18, 0.3), tone("noise", 800, 400, 0.02, 0.15, 0.12)],
  "sfx-orion": [tone("sawtooth", 880, 1760, 0, 0.12, 0.08)],
  "sfx-mira": [tone("sine", 440, 880, 0, 0.3, 0.18), tone("sine", 660, 1320, 0.05, 0.3, 0.1)],
  "sfx-sol": [tone("sine", 392, 392, 0, 0.35, 0.15), tone("sine", 587, 587, 0.08, 0.3, 0.1)],
  "sfx-hit-clonk": [tone("square", 180, 160, 0, 0.08, 0.15), tone("noise", 2500, 2500, 0, 0.05, 0.08)],
  "sfx-bubble-pop": [tone("sine", 900, 1800, 0, 0.06, 0.25)],
  "sfx-pop-stars": [tone("sine", 1200, 2400, 0, 0.08, 0.15), tone("triangle", 2400, 2400, 0.05, 0.12, 0.08)],
  "sfx-leak": [tone("sine", 392, 262, 0, 0.35, 0.25)],
  "sfx-wave-start": notes("triangle", [392, 523], 0.12, 0.2, 0.3),
  "sfx-wave-clear": notes("triangle", [523, 659, 784, 1047], 0.1, 0.25, 0.3),
  "sfx-boss-arrive": [tone("sawtooth", 110, 82, 0, 0.7, 0.18), tone("sine", 55, 55, 0, 0.7, 0.3)],
  "sfx-boss-phase": [tone("square", 220, 330, 0, 0.25, 0.12), tone("square", 330, 220, 0.2, 0.25, 0.1)],
  "sfx-frost-pulse": [tone("noise", 4000, 9000, 0, 0.6, 0.15), tone("sine", 1568, 2093, 0, 0.5, 0.1)],
  "sfx-comet-burst": [tone("noise", 300, 120, 0, 0.6, 0.35), tone("sine", 160, 60, 0, 0.5, 0.35)],
  "sfx-colony-shield": [tone("sine", 262, 523, 0, 0.6, 0.2), tone("sine", 392, 784, 0.05, 0.55, 0.12)],
  "sfx-correct": notes("sine", [659, 988], 0.12, 0.3, 0.3),
  "sfx-not-quite": [tone("sine", 330, 294, 0, 0.25, 0.2)], // soft and neutral (D10.10)
  "sfx-reward": notes("triangle", [784, 988, 1175], 0.08, 0.18, 0.25),
  "sfx-badge": notes("triangle", [523, 659, 784, 1047, 1319], 0.09, 0.3, 0.28),
  "sfx-click": [tone("sine", 800, 800, 0, 0.03, 0.12)],
};

/** How long a recipe lasts, seconds. */
export function lengthOf(id: SoundId): number {
  return Math.max(...RECIPES[id].map((v) => v.at + v.dur));
}

/** The tower class's attack sound (D10.10: one per class). */
export function classSound(classId: string): SoundId | null {
  const id = `sfx-${classId}`;
  return (SOUND_IDS as readonly string[]).includes(id) ? (id as SoundId) : null;
}
