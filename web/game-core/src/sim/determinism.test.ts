// Determinism as a test (Phase 28, M2-10; prompt.md:303 "browser frame rate must not change damage, movement or reward
// outcomes", AC-13; C2.1, spine S10): the same boss wave, the same board and the same commands on the same ticks give
// the same game at any frame rate.
//
// The wave is played through the real frame loop: runFrame (frame.ts), which asks the fixed-timestep clock (clock.ts)
// how many whole ticks each frame's milliseconds pay for and runs them. Only the frame deltas differ between the runs:
// steady 30, 60 and 144 Hz, 60 Hz at 2x speed, irregular (jittery) frame times with stalls past the 250 ms clamp and
// pauses, and a very slow machine whose frames hit the 30-steps-per-frame cap. Each run must end on the same tick
// with the same post-wave snapshot (the whole object, compared deeply), the same event log, tick for tick, and the
// same final battle state.
//
// The commands are given on fixed ticks through runFrame's beforeTick hook, as a replay would give them: C2.2 promises
// "same commands on the same ticks, same result". (A child's click lands on whichever tick follows it, which depends
// on when the frame comes; that is the input changing, not the simulation.)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePlanet, parseRuleset, type AuthoredWave } from "../data/game-data";
import type { Placement, Snapshot } from "../rules";
import { MAX_FRAME_MS, MAX_STEPS_PER_FRAME, type ClockState, type Speed } from "../clock";
import {
  battleSnapshot,
  compileBattleConfig,
  createBattle,
  drainEvents,
  giveCommand,
  runFrame,
  startWave,
  step,
  type Battle,
  type BattleConfig,
  type BattleEvent,
} from "./index";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const readJson = (path: string): Record<string, unknown> => JSON.parse(readFileSync(join(REPO, path), "utf8")) as Record<string, unknown>;
const r3 = parseRuleset(readJson("game-data/ruleset/r3.json"));
const PLANET_RAW = readJson("game-data/campaign/luna-1-c1.json");
const SEED = "5eed5eed5eed5eed";

// The simulator's boss waves (C8.2 rows 10 to 50), as bosses.test.ts reads them.
// oxlint-disable-next-line typescript/no-explicit-any
const SIM: any = readJson("tools/sim/game_data.json");
// oxlint-disable-next-line typescript/no-explicit-any
const BOSS_WAVES: AuthoredWave[] = SIM.waves.filter((w: any) => w.boss !== null).map((w: any) => ({ wave: w.wave, groups: w.groups, hpMult: w.hpMult, speedMult: w.speedMult }));

function bossConfig(): BattleConfig {
  const doc = structuredClone(PLANET_RAW);
  doc["waves"] = BOSS_WAVES;
  doc["waveSets"] = {
    bosses: {
      mode: "CHALLENGE",
      name: "Bosses",
      waves: BOSS_WAVES.map((w) => w.wave),
      meteorAfter: [],
      startCredits: 150,
      colonyHealth: 20,
      classes: Object.keys(r3.classes),
      padsOpenAsForWave: 26,
      presetPlacements: [],
    },
  };
  return compileBattleConfig(r3, parsePlanet(doc, r3), "bosses");
}

const config = bossConfig();
/** The Great Glorp's wave (C8.2 wave 50): armour, bubbles, releases, a dash, flutters and healers. */
const GLORP = 5;

const place = (padId: string, classId: string, targeting: Placement["targeting"] = "FRONT"): Placement => ({ padId, classId, level: 3, targeting });

/** Every class at level 3 on fifteen pads, p15 left empty for a purchase during the wave. */
const BOARD: Placement[] = [
  place("p01", "nova"),
  place("p02", "orion", "STRONG"),
  place("p03", "nova", "FAST"),
  place("p04", "pip"),
  place("p05", "nova"),
  place("p06", "nova"),
  place("p07", "nova"),
  place("p08", "juno", "CROWD"),
  place("p09", "juno"),
  place("p10", "nova"),
  place("p11", "nova"),
  place("p12", "sol"),
  place("p13", "nova"),
  place("p14", "nova"),
  place("p16", "mira"),
];

const START: Snapshot = {
  credits: 1000,
  placements: BOARD,
  colony: { health: 20, shield: 0 },
  powers: { "frost-pulse": 2, "comet-burst": 2, "colony-shield": 1 },
};

/**
 * The commands, by tick: a purchase, upgrades and a targeting change mid-wave, all three powers (the comet aimed at the
 * boss as it stands on that tick), and three uses C10 refuses (once a wave, the lockout).
 */
function giveScripted(battle: Battle): void {
  const boss = () => battle.aliens.find((a) => config.aliens[a.type]?.boss !== null);
  switch (battle.tick) {
    case 120:
      giveCommand(battle, { kind: "place", padId: "p15", classId: "nova" });
      break;
    case 400:
      giveCommand(battle, { kind: "upgrade", padId: "p15" });
      giveCommand(battle, { kind: "upgrade", padId: "p15" });
      break;
    case 500:
      giveCommand(battle, { kind: "setTargeting", padId: "p15", targeting: "FAST" });
      break;
    case 600:
      giveCommand(battle, { kind: "usePower", powerId: "frost-pulse" });
      break;
    case 660:
      giveCommand(battle, { kind: "usePower", powerId: "frost-pulse" }); // refused: once a wave
      break;
    case 900:
      giveCommand(battle, { kind: "usePower", powerId: "comet-burst", target: boss()?.progress ?? 0 });
      break;
    case 960:
      giveCommand(battle, { kind: "usePower", powerId: "colony-shield" }); // refused: the lockout runs to 1080
      break;
    case 1100:
      giveCommand(battle, { kind: "usePower", powerId: "colony-shield" });
      break;
    case 1500:
      giveCommand(battle, { kind: "usePower", powerId: "comet-burst", target: boss()?.progress ?? 0 }); // refused: once a wave
      break;
  }
}

/** What a run of the wave leaves behind, all of it compared. */
interface Outcome {
  readonly ticks: number;
  readonly status: Battle["status"];
  readonly snapshot: Snapshot;
  readonly events: readonly BattleEvent[];
  /** The whole battle at the end, except the shared (read-only) config. */
  readonly battle: Omit<Battle, "config">;
  /** How many frames it took: this differs between frame rates, and is not compared. */
  readonly frames: number;
}

function finish(battle: Battle, events: BattleEvent[], frames: number): Outcome {
  const { config: _config, ...rest } = battle;
  return { ticks: battle.tick, status: battle.status, snapshot: battleSnapshot(battle), events, battle: structuredClone(rest), frames };
}

/** The wave through the real frame loop, one frame delta after another (the list repeats until the wave ends). */
function playFrames(deltas: readonly number[], speed: Speed = 1, pausedEvery = 0): Outcome {
  const battle = createBattle(config, START, GLORP, SEED);
  startWave(battle);
  let clock: ClockState = { accumulator: 0 };
  const events: BattleEvent[] = [];
  let frames = 0;
  while (battle.status === "IN_WAVE") {
    if (frames > 1_000_000) throw new Error("wave did not end");
    const deltaMs = deltas[frames % deltas.length] ?? 0;
    // A paused frame runs no tick and banks nothing (a hidden page, the learning panel; C2.1).
    const paused = pausedEvery > 0 && frames % pausedEvery === pausedEvery - 1;
    clock = runFrame(battle, clock, deltaMs, speed, paused, giveScripted).clock;
    events.push(...drainEvents(battle));
    frames += 1;
  }
  return finish(battle, events, frames);
}

/** The same wave with no frames at all: one tick after another. */
function playTicks(): Outcome {
  const battle = createBattle(config, START, GLORP, SEED);
  startWave(battle);
  const events: BattleEvent[] = [];
  while (battle.status === "IN_WAVE") {
    giveScripted(battle);
    step(battle);
    events.push(...drainEvents(battle));
  }
  return finish(battle, events, battle.tick);
}

/**
 * Irregular frame times, as a busy laptop gives them: a fixed pseudo-random list (a small linear congruential
 * generator, so the list is the same on every run) of deltas from 0 to 300 ms, with a few stalls far past the clamp,
 * a zero-length frame and a fractional one.
 */
function jitter(count: number, seed: number): number[] {
  let state = seed;
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    state = (state * 1103515245 + 12345) % 2147483648;
    const r = state / 2147483648;
    out.push(i % 97 === 0 ? 2000 : i % 89 === 0 ? 0 : r < 0.8 ? 4 + r * 40 : r * 300);
  }
  out.push(1000 / 7);
  return out;
}

describe("a boss wave gives the same game at any frame rate (C2.1, AC-13, prompt.md:303)", () => {
  const reference = playTicks();

  it("the wave tested is a full one: the Great Glorp, every phase, every power, refusals, a purchase; it ends cleared", () => {
    expect(reference.status).toBe("CLEARED");
    const kinds = new Set(reference.events.map((e) => e.kind));
    for (const kind of ["bossPhase", "released", "burst", "popped", "healed", "shielded", "rejected", "defeated"] as const) {
      expect(kinds.has(kind), kind).toBe(true);
    }
    const phases = reference.events.flatMap((e) => (e.kind === "bossPhase" ? [e.phase] : []));
    expect(phases).toEqual([1, 2, 3]);
    expect(reference.events.some((e) => e.kind === "defeated" && e.type === "boss5")).toBe(true);
    const powers = reference.events.flatMap((e) => (e.kind === "power" ? [[e.tick, e.powerId]] : []));
    expect(powers).toEqual([
      [600, "frost-pulse"],
      [900, "comet-burst"],
      [1100, "colony-shield"],
    ]);
    const refusals = reference.events.flatMap((e) => (e.kind === "rejected" ? [[e.tick, e.reason]] : []));
    expect(refusals).toEqual([
      [660, "POWER_USED_THIS_WAVE"],
      [960, "POWER_LOCKED"],
      [1500, "POWER_USED_THIS_WAVE"],
    ]);
    expect(reference.snapshot.powers).toEqual({ "frost-pulse": 1, "comet-burst": 1, "colony-shield": 0 });
    expect(reference.snapshot.placements.find((p) => p.padId === "p15")).toEqual({ padId: "p15", classId: "nova", level: 3, targeting: "FAST" });
  });

  const STEADY_30 = [1000 / 30];
  const STEADY_60 = [1000 / 60];
  const STEADY_144 = [1000 / 144];

  it.each([
    ["30 Hz", STEADY_30, 1, 0],
    ["60 Hz", STEADY_60, 1, 0],
    ["144 Hz", STEADY_144, 1, 0],
    ["60 Hz at 2x speed", STEADY_60, 2, 0],
    ["144 Hz at 2x speed, paused every 50th frame", STEADY_144, 2, 50],
    ["jittery frame times (0 to 300 ms, stalls of 2 s)", jitter(5000, 42), 1, 0],
    ["jittery frame times at 2x speed, paused every 7th frame", jitter(5000, 7), 2, 7],
    ["a very slow machine: 1 s frames, clamped to 250 ms, at 2x the 30-step cap every frame", [1000], 2, 0],
  ] as const)("%s: the same tick count, post-wave snapshot, event log and final state as tick by tick", (_name, deltas, speed, pausedEvery) => {
    const run = playFrames(deltas, speed, pausedEvery);
    expect(run.ticks).toBe(reference.ticks);
    expect(run.status).toBe(reference.status);
    expect(run.snapshot).toEqual(reference.snapshot);
    expect(run.events).toEqual(reference.events);
    expect(run.battle).toEqual(reference.battle);
  });

  it("the frame rates really were different: the same ticks took different numbers of frames", () => {
    const frames = [STEADY_30, STEADY_60, STEADY_144].map((d) => playFrames(d).frames);
    // About ticks / 2, ticks and ticks x 2.4 frames.
    expect(frames[0]).toBeLessThan(frames[1] ?? 0);
    expect(frames[1]).toBeLessThan(frames[2] ?? 0);
    expect(Math.abs((frames[1] ?? 0) - reference.ticks)).toBeLessThanOrEqual(1);
    // The slow machine ran 30 ticks a frame (250 ms x 2 = 30 steps: the cap) and threw the rest away.
    expect(playFrames([1000], 2).frames).toBe(Math.ceil(reference.ticks / MAX_STEPS_PER_FRAME));
    expect(MAX_FRAME_MS).toBe(250);
  });

  it("the comparison would catch a difference: a command given between frames lands on a frame-dependent tick", () => {
    // The same Frost Pulse, but given by the first frame that starts at or after tick 601 (as a click is), not on a
    // fixed tick: at 30 Hz frames start on even ticks, so it lands on 602; at 60 Hz on 601. The outcomes differ.
    const clicked = (deltaMs: number): Outcome => {
      const battle = createBattle(config, { ...START, powers: { "frost-pulse": 1 } }, GLORP, SEED);
      startWave(battle);
      let clock: ClockState = { accumulator: 0 };
      const events: BattleEvent[] = [];
      let given = false;
      while (battle.status === "IN_WAVE") {
        if (!given && battle.tick >= 601) {
          giveCommand(battle, { kind: "usePower", powerId: "frost-pulse" });
          given = true;
        }
        clock = runFrame(battle, clock, deltaMs, 1, false).clock;
        events.push(...drainEvents(battle));
      }
      return finish(battle, events, 0);
    };
    const at30 = clicked(1000 / 30);
    const at60 = clicked(1000 / 60);
    const powerTick = (o: Outcome) => o.events.find((e) => e.kind === "power")?.tick;
    expect([powerTick(at30), powerTick(at60)]).toEqual([602, 601]);
    expect(at30.events).not.toEqual(at60.events);
  });

  it("30, 60 and 144 Hz agree with each other directly, as the exit criterion states it", () => {
    const [a, b, c] = [STEADY_30, STEADY_60, STEADY_144].map((d) => {
      const { frames: _frames, ...rest } = playFrames(d);
      return rest;
    });
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });
});
