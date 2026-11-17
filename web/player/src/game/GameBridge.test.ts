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
  const bridge = new GameBridge(config, run, "test-seed", { announceNewAliens: false });
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
    expect(bridge.selection()).toEqual({
      padId: "p02",
      open: true,
      tower: null,
      offers: [{ classId: "nova", name: "Nova", cost: 50, unlockAfterWave: 0, refusal: null }],
      upgradeCost: null,
      sellRefund: null,
    });
    bridge.place("p02", "nova");
    expect(bridge.selection()).toMatchObject({ tower: { classId: "nova", name: "Nova", level: 1 }, offers: [], upgradeCost: 60, sellRefund: 35 });
    frames(bridge, HUD_INTERVAL_MS, 1);
    expect(seen.selectionChanged.at(-1)).toMatchObject({ padId: "p02", upgradeCost: 60 });
  });

  it("offers each class the wave set lists, with game-core's refusal (Phase 24: ruleset r2, every class listed)", () => {
    const r2 = parseRuleset(readJson("ruleset/r2.json"));
    const raw = structuredClone(readJson("campaign/luna-1-c1.json")) as { waveSets: Record<string, { classes: string[] }> };
    const set = raw.waveSets["first-contact"];
    if (set !== undefined) set.classes = ["nova", "pip", "juno", "orion", "mira", "sol"];
    const everyClass = compileBattleConfig(r2, parsePlanet(raw, r2), "first-contact");
    const start = initialRunState(r2, everyClass, ["continue"]);
    if (start.snapshot === undefined) throw new Error("a new run has a snapshot");
    const bridge = new GameBridge(everyClass, new LocalRun({ ...start, snapshot: { ...start.snapshot, credits: 430 } }), "test-seed", { announceNewAliens: false });
    bridge.place("p02", "mira");
    bridge.place("p04", "mira"); // Mira's cap is 2 (C5.8); 430 - 320 = 110 credits left
    bridge.selectPad("p05");
    expect(bridge.selection()?.offers.map((o) => [o.classId, o.cost, o.refusal])).toEqual([
      ["nova", 50, null],
      ["pip", 60, null],
      ["juno", 110, null],
      ["orion", 170, "NOT_ENOUGH_CREDITS"],
      ["mira", 160, "DEPLOY_CAP"],
      ["sol", 150, "NOT_ENOUGH_CREDITS"],
    ]);
    bridge.selectPad("p02");
    expect(bridge.selection()).toMatchObject({ tower: { classId: "mira", name: "Mira", level: 1 }, offers: [], upgradeCost: 180, sellRefund: 110 });
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

  it("usePower (Phase 28): game-core decides; the live r1 has no powers, so every use comes back as commandRejected", () => {
    const { bridge, seen } = setUp();
    bridge.place("p02", "nova");
    bridge.startWave();
    // oxlint-disable-next-line react/rules-of-hooks -- GameBridge.usePower is the spine's command name, not a hook
    bridge.usePower("frost-pulse");
    frames(bridge, 1000 / 60, 1);
    expect(seen.commandRejected.map((e) => e.reason)).toEqual(["UNKNOWN_POWER"]);
    expect(bridge.hud().powers).toEqual({});
  });

  it("usePower on an r3 battle: the charge is spent on the next tick, the HUD shows the count, a second use is refused", () => {
    const r3 = parseRuleset(readJson("ruleset/r3.json"));
    const cfg = compileBattleConfig(r3, parsePlanet(readJson("campaign/luna-1-c1.json"), r3), "first-contact");
    const start = initialRunState(r3, cfg, ["continue"]);
    const snapshot = start.snapshot;
    if (snapshot === undefined) throw new Error("no snapshot");
    const run = new LocalRun({ ...start, snapshot: { ...snapshot, powers: { "colony-shield": 2 } } }, () => "00000000-0000-4000-8000-000000000001");
    const bridge = new GameBridge(cfg, run, "test-seed", { announceNewAliens: false });
    const rejected: string[] = [];
    bridge.on("commandRejected", (e) => rejected.push(e.reason));
    // oxlint-disable-next-line react/rules-of-hooks -- GameBridge.usePower is the spine's command name, not a hook
    bridge.usePower("colony-shield"); // in preparation: not now
    bridge.place("p02", "nova");
    bridge.startWave();
    // oxlint-disable-next-line react/rules-of-hooks -- as above
    bridge.usePower("colony-shield");
    expect(bridge.hud()).toMatchObject({ shield: 0, powers: { "colony-shield": 2 } }); // queued, not yet applied
    frames(bridge, 1000 / 60, 1);
    expect(bridge.hud()).toMatchObject({ shield: 10, powers: { "colony-shield": 1 } });
    expect(bridge.takeSceneEvents().filter((e) => e.kind === "power").map((e) => (e.kind === "power" ? e.effect : null))).toEqual(["shield"]);
    // oxlint-disable-next-line react/rules-of-hooks -- as above
    bridge.usePower("colony-shield");
    frames(bridge, 1000 / 60, 1);
    expect(rejected).toEqual(["NOT_NOW", "POWER_USED_THIS_WAVE"]);
    expect(bridge.hud().powers).toEqual({ "colony-shield": 1 });
  });

  it("a new alien type waits on its card, once per run, and only types the earlier waves did not bring (Phase 66)", () => {
    const run = new LocalRun(initialRunState(ruleset, config, ["continue"]), () => "00000000-0000-4000-8000-000000000009");
    const bridge = new GameBridge(config, run, "test-seed");
    bridge.startWave();
    let guard = 0;
    while (bridge.hud().announcing === null && guard++ < 2000) bridge.frame(16);
    expect(bridge.hud().announcing).toBe("blob"); // wave 1's Moon Blob, the run's first alien
    const tick = bridge.battle?.tick ?? 0;
    for (let i = 0; i < 30; i += 1) bridge.frame(16);
    expect(bridge.battle?.tick).toBe(tick); // the battle waits on the card
    bridge.dismissAnnouncement();
    for (let i = 0; i < 30; i += 1) bridge.frame(16);
    expect(bridge.battle?.tick).toBeGreaterThan(tick);
    expect(bridge.hud().announcing).toBeNull(); // more Moon Blobs: no second card
    // A run resumed at a later wave has met everything the waves before it brought.
    const later = new GameBridge(config, new LocalRun({ ...initialRunState(ruleset, config, ["continue"]), wave: 2 }), "test-seed");
    later.startWave();
    for (let i = 0; i < 600; i += 1) later.frame(16);
    expect(later.hud().announcing).toBeNull();
  });
});
