// The fixed-timestep clock's promises (plan J.5, spine S10, C2.1, task M0-09).
// Each frame the host passes in how many milliseconds went by; the clock says how many fixed 1/60 s
// simulation steps to run now and what is left in the bank. Time is always an argument: nothing here
// reads a real clock, so every test below is exact and repeatable.
import { describe, expect, it } from "vitest";
import {
  advanceClock,
  MAX_FRAME_MS,
  MAX_STEPS_PER_FRAME,
  STEP_UNITS,
  STEPS_PER_SECOND,
  UNITS_PER_MS,
  type ClockState,
  type Speed,
} from "./clock";

const START: ClockState = { accumulator: 0 };

/** Feeds a list of frame deltas through the clock and returns the total steps and the final bank. */
function run(deltasMs: readonly number[], speed: Speed = 1, start: ClockState = START) {
  let state = start;
  let steps = 0;
  for (const deltaMs of deltasMs) {
    const frame = advanceClock(state, deltaMs, speed, false);
    steps += frame.steps;
    state = { accumulator: frame.accumulator };
  }
  return { steps, accumulator: state.accumulator };
}

/** `count` copies of `pattern`, end to end. */
function repeat(pattern: readonly number[], count: number): number[] {
  return Array.from({ length: count }, () => pattern).flat();
}

// Frame deltas for one simulated second, written in whole accumulator units (1/60,000 s) and turned
// into milliseconds the way a host would see them. Each list adds up to exactly 60,000 units.
const ms = (units: number) => units / UNITS_PER_MS;
const SECOND_AT_30HZ = repeat([ms(2000)], 30);
const SECOND_AT_60HZ = repeat([ms(1000)], 60);
// 1000/144 ms is 416.67 units, not a whole number, so the host's frames come as a repeating
// 417, 417, 416 pattern (1,250 units per three frames, 48 times = 60,000), not as 1000/144 floats.
const SECOND_AT_144HZ = repeat([ms(417), ms(417), ms(416)], 48);

describe("the clock's units", () => {
  it("counts in 1/60,000 s, so one 1/60 s step is exactly 1,000 units and a second is 60 steps", () => {
    expect(UNITS_PER_MS).toBe(60);
    expect(STEP_UNITS).toBe(1000);
    expect(STEPS_PER_SECOND).toBe(60);
    expect(MAX_FRAME_MS).toBe(250);
    expect(MAX_STEPS_PER_FRAME).toBe(30);
  });

  it("the test frame patterns each add up to exactly one second", () => {
    for (const second of [SECOND_AT_30HZ, SECOND_AT_60HZ, SECOND_AT_144HZ]) {
      const units = second.reduce((sum, deltaMs) => sum + Math.round(deltaMs * UNITS_PER_MS), 0);
      expect(units).toBe(60_000);
    }
    expect(SECOND_AT_30HZ).toHaveLength(30);
    expect(SECOND_AT_60HZ).toHaveLength(60);
    expect(SECOND_AT_144HZ).toHaveLength(144);
  });
});

describe("the same simulated time gives the same number of steps at any frame rate", () => {
  it.each([
    ["30 Hz", SECOND_AT_30HZ],
    ["60 Hz", SECOND_AT_60HZ],
    ["144 Hz", SECOND_AT_144HZ],
  ])("one second of frames at %s gives exactly 60 steps and an empty bank", (_rate, second) => {
    expect(run(second)).toEqual({ steps: 60, accumulator: 0 });
  });

  it.each([
    ["30 Hz", SECOND_AT_30HZ],
    ["60 Hz", SECOND_AT_60HZ],
    ["144 Hz", SECOND_AT_144HZ],
  ])("ten seconds at %s gives exactly 600 steps (no drift builds up)", (_rate, second) => {
    expect(run(repeat(second, 10))).toEqual({ steps: 600, accumulator: 0 });
  });

  it("at 2x speed, one real second gives 120 steps at every frame rate", () => {
    for (const second of [SECOND_AT_30HZ, SECOND_AT_60HZ, SECOND_AT_144HZ]) {
      expect(run(second, 2)).toEqual({ steps: 120, accumulator: 0 });
    }
  });

  it("keeps part of a step in the bank until enough time has gone by", () => {
    const half = advanceClock(START, ms(500), 1, false);
    expect(half).toEqual({ steps: 0, accumulator: 500 });
    const rest = advanceClock({ accumulator: half.accumulator }, ms(500), 1, false);
    expect(rest).toEqual({ steps: 1, accumulator: 0 });
  });

  it("a frame's milliseconds are rounded to whole units once, so float deltas like 1000/144 cannot drift", () => {
    // 1000/144 ms is 416.67 units and rounds to 417; the bank only ever holds whole numbers.
    const frame = advanceClock(START, 1000 / 144, 1, false);
    expect(frame).toEqual({ steps: 0, accumulator: 417 });
    expect(Number.isInteger(run(repeat([1000 / 144], 1000)).accumulator)).toBe(true);
  });
});

describe("a long frame is clamped to 250 ms", () => {
  it("a 2 s gap at 1x counts as 250 ms: 15 steps", () => {
    expect(advanceClock(START, 2000, 1, false)).toEqual({ steps: 15, accumulator: 0 });
  });

  it("a frame just over the clamp gives the same result as exactly 250 ms", () => {
    expect(advanceClock(START, 251, 1, false)).toEqual(advanceClock(START, 250, 1, false));
  });

  it("a frame under the clamp is not clamped", () => {
    expect(advanceClock(START, 249, 1, false)).toEqual({ steps: 14, accumulator: 14_940 - 14_000 });
  });
});

describe("no frame runs more than 30 steps, and what is left over is thrown away", () => {
  it("a 2 s gap at 2x gives 30 steps and leaves the bank empty", () => {
    expect(advanceClock(START, 2000, 2, false)).toEqual({ steps: 30, accumulator: 0 });
  });

  it("when the cap is hit, the leftover part of a step is discarded rather than carried", () => {
    // 999 units in the bank plus 30,000 for the frame: 30 steps, then the 999 left would have been kept
    // by a plain accumulator. Hitting the cap throws it away, so the game slows instead of catching up.
    expect(advanceClock({ accumulator: 999 }, 2000, 2, false)).toEqual({ steps: 30, accumulator: 0 });
  });

  it("whatever is in the bank, a frame stops at 30 steps and empties the bank", () => {
    expect(advanceClock({ accumulator: 45_000 }, ms(1000), 1, false)).toEqual({ steps: 30, accumulator: 0 });
    expect(advanceClock({ accumulator: 31_000 }, 0, 1, false)).toEqual({ steps: 30, accumulator: 0 });
  });

  it("a slow machine plays in slow motion: 4 frames a second at 2x gives 120 steps, not more", () => {
    // Each 250 ms frame at 2x is 30,000 units = 30 steps, exactly the cap.
    expect(run(repeat([250], 4), 2)).toEqual({ steps: 120, accumulator: 0 });
    // Each 500 ms frame is clamped to 250 ms: the lost time is gone, not owed.
    expect(run(repeat([500], 4), 2)).toEqual({ steps: 120, accumulator: 0 });
  });

  it("just under the cap, the leftover is kept as normal", () => {
    // 14,000 units of frame time at 2x is 28,000 units: 28 steps, and the 999 stays in the bank.
    expect(advanceClock({ accumulator: 999 }, ms(14_000), 2, false)).toEqual({ steps: 28, accumulator: 999 });
  });
});

describe("paused time runs nothing", () => {
  it("a paused frame gives zero steps, however long it was", () => {
    expect(advanceClock(START, ms(1000), 1, true)).toEqual({ steps: 0, accumulator: 0 });
    expect(advanceClock(START, 2000, 2, true)).toEqual({ steps: 0, accumulator: 0 });
  });

  it("a paused frame adds nothing to the bank and keeps what was there for after Resume", () => {
    expect(advanceClock({ accumulator: 700 }, 5000, 2, true)).toEqual({ steps: 0, accumulator: 700 });
  });

  it("a second of frames while paused, then a second running, gives exactly 60 steps", () => {
    let state = START;
    let steps = 0;
    for (const deltaMs of SECOND_AT_144HZ) {
      const frame = advanceClock(state, deltaMs, 1, true);
      steps += frame.steps;
      state = { accumulator: frame.accumulator };
    }
    expect(steps).toBe(0);
    expect(run(SECOND_AT_144HZ, 1, state)).toEqual({ steps: 60, accumulator: 0 });
  });
});

describe("odd inputs", () => {
  it("a zero, negative or not-a-number delta adds nothing", () => {
    for (const deltaMs of [0, -16, Number.NaN, Number.NEGATIVE_INFINITY]) {
      expect(advanceClock({ accumulator: 300 }, deltaMs, 1, false)).toEqual({ steps: 0, accumulator: 300 });
    }
  });

  it("an infinite delta is clamped like any long frame", () => {
    expect(advanceClock(START, Number.POSITIVE_INFINITY, 1, false)).toEqual({ steps: 15, accumulator: 0 });
  });

  it("refuses a bank that is not a whole, non-negative number of units", () => {
    for (const accumulator of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => advanceClock({ accumulator }, 16, 1, false)).toThrow(RangeError);
    }
  });

  it("does not change the state it is given", () => {
    const state: ClockState = Object.freeze({ accumulator: 500 });
    advanceClock(state, 100, 2, false);
    expect(state).toEqual({ accumulator: 500 });
  });
});
