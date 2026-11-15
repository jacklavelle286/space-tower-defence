// GameBridge (Phase 14, M1-21): events are throttled to 10 per second, the run moves through the shared reducer,
// and the scene-facing API never lets React decide anything. The Phaser game is never mounted (I-validation TS-C).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileBattleConfig, initialRunState, parsePlanet, parseRuleset, type RunState } from "@scd/game-core";
import { describe, expect, it } from "vitest";
import { GameBridge, HUD_INTERVAL_MS, type BridgeEvents } from "./GameBridge";
import { LocalRun } from "./localRun";

const GAME_DATA = join(import.meta.dirname, "..", "..", "..", "..", "game-data");
const readJson = (path: string): unknown => JSON.parse(readFileSync(join(GAME_DATA, path), "utf8"));
const ruleset = parseRuleset(readJson("ruleset/r1.json"));
const planet = parsePlanet(readJson("campaign/luna-1-c1.json"), ruleset);
const config = compileBattleConfig(ruleset, planet, "first-contact");

function setUp(health?: number) {
  let start: RunState = initialRunState(ruleset, config, ["continue"]);
  if (health !== undefined && start.snapshot !== undefined) {
    start = { ...start, snapshot: { ...start.snapshot, colony: { health, shield: 0 } } };
  }
  let n = 0;
  const run = new LocalRun(start, () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, "0")}`, () => "2026-11-15T10:00:00Z");
  const bridge = new GameBridge(config, run, "test-seed");
  const seen: { [K in keyof BridgeEvents]: BridgeEvents[K][] } = {
    hud: [],
    selectionChanged: [],
    waveCleared: [],
    defeated: [],
    commandRejected: [],
  };
  bridge.on("hud", (e) => seen.hud.push(e));
  bridge.on("selectionChanged", (e) => seen.selectionChanged.push(e));
  bridge.on("waveCleared", (e) => seen.waveCleared.push(e));
  bridge.on("defeated", (e) => seen.defeated.push(e));
  bridge.on("commandRejected", (e) => seen.commandRejected.push(e));
  return { run, bridge, seen };
}

/** Run frames of `ms` until `done()` or `limit` frames; returns the frame count. */
function frames(bridge: GameBridge, ms: number, count: number, done: () => boolean = () => false): number {
  for (let i = 0; i < count; i += 1) {
    if (done()) return i;
    bridge.frame(ms);
  }
  return count;
}

describe("GameBridge", () => {
  it("prepares wave 1 from the run snapshot", () => {
    const { bridge } = setUp();
    expect(bridge.battle?.status).toBe("PREP");
    expect(bridge.hud()).toMatchObject({ credits: 150, health: 20, wave: 1, finalWave: 2, runPhase: "BUILD", battle: "PREP" });
  });

  it("sends hud at most once per 100 ms of frames, and only when something changed", () => {
    const { bridge } = setUp();
    let clock = 0;
    const sentAt: number[] = [];
    bridge.on("hud", () => sentAt.push(clock));
    for (const padId of ["p02", "p04", "p05"]) bridge.place(padId, "nova");
    // Spam commands every frame as well: still no more than one HUD event per 100 ms.
    bridge.startWave();
    for (let i = 0; i < 144 * 20; i += 1) {
      clock += 1000 / 144;
      if (i % 3 === 0) bridge.setSpeed(i % 2 === 0 ? 1 : 2);
      bridge.frame(1000 / 144);
    }
    expect(sentAt.length).toBeGreaterThan(10);
    const gaps = sentAt.slice(1).map((t, i) => t - (sentAt[i] ?? 0));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(HUD_INTERVAL_MS - 1e-6);
    // Nothing changes while paused, so nothing is sent.
    bridge.pause();
    frames(bridge, 16, 10);
    const before = sentAt.length;
    frames(bridge, 16, 200);
    expect(sentAt.length).toBe(before);
    expect(bridge.hud().paused).toBe(true);
  });

  it("plays the two-wave run: wave 1 -> activity -> wave 2 -> COMPLETED, all through the reducer", () => {
    const { run, bridge, seen } = setUp();
    for (const padId of ["p02", "p04", "p05"]) bridge.place(padId, "nova");
    bridge.startWave();
    expect(run.state.phase).toBe("IN_WAVE");
    expect(run.state.snapshot?.credits).toBe(0); // the wave-start snapshot: three Novas bought
    frames(bridge, 1000 / 60, 5000, () => run.state.phase !== "IN_WAVE");
    expect(seen.waveCleared).toEqual([
      expect.objectContaining({ wave: 1, snapshot: expect.objectContaining({ credits: 24, colony: { health: 20, shield: 0 } }) }),
    ]);
    expect(run.state.phase).toBe("ACTIVITY");

    run.submitAttempt("continue");
    expect(run.state.phase).toBe("BUILD");
    expect(bridge.battle).toMatchObject({ wave: 2, status: "PREP", credits: 54 });
    bridge.place("p09", "nova");
    bridge.startWave();
    frames(bridge, 1000 / 30, 5000, () => run.state.status !== "IN_PROGRESS");
    expect(run.state.status).toBe("COMPLETED");
    expect(seen.waveCleared.map((e) => [e.wave, e.snapshot.credits])).toEqual([
      [1, 24],
      [2, 36],
    ]);
    frames(bridge, 100, 2);
    expect(seen.hud.at(-1)).toMatchObject({ runStatus: "COMPLETED", runPhase: null, highestCompletedWave: 2 });
  });

  it("a colony that falls ends the run DEFEATED and sends `defeated`", () => {
    const { run, bridge, seen } = setUp(2);
    bridge.startWave();
    frames(bridge, 250, 1000, () => run.state.status !== "IN_PROGRESS");
    expect(run.state.status).toBe("DEFEATED");
    expect(seen.defeated).toEqual([{ wave: 1 }]);
    expect(seen.waveCleared).toEqual([]);
  });

  it("passes refusals on as commandRejected, and React's prices come from game-core", () => {
    const { bridge, seen } = setUp();
    bridge.place("p03", "nova"); // closed until after wave 5
    expect(seen.commandRejected).toEqual([{ command: { kind: "place", padId: "p03", classId: "nova" }, reason: "PAD_CLOSED" }]);
    bridge.selectPad("p02");
    expect(bridge.selection()).toEqual({ padId: "p02", open: true, tower: null, placeCost: 50, upgradeCost: null, sellRefund: null });
    bridge.place("p02", "nova");
    expect(bridge.selection()).toMatchObject({ tower: { classId: "nova", level: 1 }, placeCost: null, upgradeCost: 60, sellRefund: 35 });
    frames(bridge, HUD_INTERVAL_MS, 1);
    expect(seen.selectionChanged.at(-1)).toMatchObject({ padId: "p02", upgradeCost: 60 });
  });

  it("stays paused until an explicit resume, whatever frames arrive", () => {
    const { bridge } = setUp();
    bridge.place("p02", "nova");
    bridge.startWave();
    frames(bridge, 16, 10);
    const tick = bridge.battle?.tick ?? -1;
    bridge.pause();
    frames(bridge, 16, 100);
    expect(bridge.battle?.tick).toBe(tick);
    bridge.resume();
    frames(bridge, 1000 / 60, 1);
    expect(bridge.battle?.tick).toBe(tick + 1);
  });
});
