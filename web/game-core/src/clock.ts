// The fixed-timestep clock (plan J.5, spine S10, C2.1, task M0-09).
//
// Browsers call the frame callback at whatever rate the screen runs (30, 60, 144 Hz, or irregularly when busy).
// The simulation must not care: it always advances in equal steps of 1/60 s, so the same inputs give the same
// result on any machine (prompt.md:303, AC-13). This function is the time bank between the two: each frame
// the host pays in the milliseconds that went by, and the clock says how many whole steps to run now.
//
// The bank is an integer in units of 1/60,000 s, so one step is exactly 1,000 units. A float bank in
// milliseconds drifts: 144 frames of 1000/144 ms add up to slightly less than 1000 and give 59 steps, not 60.
//
// The function is pure. It never reads a real clock; elapsed time is always passed in.

/** Accumulator units per millisecond: the bank counts in 1/60,000 s. */
export const UNITS_PER_MS = 60;

/** Simulation steps (ticks) per simulated second (C2.1). */
export const STEPS_PER_SECOND = 60;

/** Units in one step: 1/60 s = 1,000 units of 1/60,000 s. */
export const STEP_UNITS = (1000 * UNITS_PER_MS) / STEPS_PER_SECOND;

/** A frame longer than this (a stall, a breakpoint, a background tab) counts as this long. */
export const MAX_FRAME_MS = 250;

/** Most steps one frame may run: 250 ms at 2x is 30,000 units, 30 steps (4x reaches it sooner on a stalled frame). Beyond
 *  it the leftover is discarded. */
export const MAX_STEPS_PER_FRAME = 30;

/** Battle speed: 1x or 2x (C2.1); 4x only in the admin's battle preview (Gate M, LD12), never offered to children. */
export type Speed = 1 | 2 | 4;

/** What the clock carries from one frame to the next. */
export interface ClockState {
  /** Time banked but not yet stepped, in whole units of 1/60,000 s. */
  readonly accumulator: number;
}

/** One frame's answer: run `steps` simulation steps now, and keep `accumulator` for the next frame. */
export interface ClockFrame {
  readonly steps: number;
  readonly accumulator: number;
}

/**
 * Advances the clock by one rendered frame.
 *
 * - Paused: no steps, and the bank is kept as it is for after Resume.
 * - The frame's time is clamped to 0..250 ms (a negative or not-a-number delta adds nothing), multiplied by the
 *   speed and rounded once to whole units.
 * - Steps are taken while a whole step is in the bank, at most 30. If the cap is hit, whatever is left is
 *   discarded, so a slow machine plays in slow motion instead of catching up in ever longer frames.
 *
 * @param state the bank carried from the previous frame (a whole, non-negative number of units)
 * @param deltaMs milliseconds since the previous frame, as the host measured them
 * @param speed battle speed, 1 or 2 (4 in the admin's preview)
 * @param paused true while the simulation is paused (page hidden, dialog or learning panel open)
 */
export function advanceClock(state: ClockState, deltaMs: number, speed: Speed, paused: boolean): ClockFrame {
  const banked = state.accumulator;
  if (!Number.isSafeInteger(banked) || banked < 0) {
    throw new RangeError(`clock accumulator must be a whole number of units >= 0, got ${banked}`);
  }
  if (paused) return { steps: 0, accumulator: banked };

  const frameMs = deltaMs > 0 ? Math.min(deltaMs, MAX_FRAME_MS) : 0; // NaN > 0 is false
  let accumulator = banked + Math.round(frameMs * speed * UNITS_PER_MS);

  let steps = 0;
  while (accumulator >= STEP_UNITS && steps < MAX_STEPS_PER_FRAME) {
    accumulator -= STEP_UNITS;
    steps += 1;
  }
  if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;

  return { steps, accumulator };
}
