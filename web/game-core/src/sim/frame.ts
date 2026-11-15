// One rendered frame: ask the fixed-timestep clock how many ticks are due, then run them (spine S10, C2.1).
// The host (the Phaser scene, through GameBridge) calls this from its frame callback with the measured delta; a
// test calls it with made-up deltas. Either way the battle only ever sees whole ticks, so frame rate cannot change
// damage, movement or rewards (prompt.md:303, AC-13).
import { advanceClock, type ClockState, type Speed } from "../clock";
import { step, type Battle } from "./battle";

export interface FrameResult {
  /** The clock to carry into the next frame. */
  readonly clock: ClockState;
  /** Ticks actually run (fewer than the clock allowed if the wave ended during the frame). */
  readonly ticks: number;
}

export function runFrame(battle: Battle, clock: ClockState, deltaMs: number, speed: Speed, paused: boolean): FrameResult {
  // Outside a running wave the clock does not bank time: preparation and the screens after a wave run no ticks.
  if (battle.status !== "IN_WAVE") return { clock: { accumulator: 0 }, ticks: 0 };
  const frame = advanceClock(clock, deltaMs, speed, paused);
  let ticks = 0;
  while (ticks < frame.steps && battle.status === "IN_WAVE") {
    step(battle);
    ticks += 1;
  }
  return { clock: { accumulator: battle.status === "IN_WAVE" ? frame.accumulator : 0 }, ticks };
}
