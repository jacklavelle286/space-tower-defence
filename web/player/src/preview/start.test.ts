// The battle preview (Gate M, LD12): where it starts, and that it can never reach the server (AC-04).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { compileBattleConfig, parsePlanet, parseRuleset } from "@scd/game-core";
import { describe, expect, it } from "vitest";
import { previewStart } from "./start";

const GAME_DATA = join(import.meta.dirname, "..", "..", "..", "..", "game-data");
const readJson = (path: string): unknown => JSON.parse(readFileSync(join(GAME_DATA, path), "utf8"));
const ruleset = parseRuleset(readJson("ruleset/r4.json"));
const planet = parsePlanet(readJson("campaign/luna-1-c2.json"), ruleset);
const config = compileBattleConfig(ruleset, planet, "campaign");

describe("previewStart", () => {
  it("starts at the chosen wave with what the test player holds by then", () => {
    const { run, lostAt } = previewStart(ruleset, config, 8, "play");
    expect(lostAt).toBeNull();
    expect([run.wave, run.highestCompletedWave, run.phase, run.status]).toEqual([8, 7, "BUILD", "IN_PROGRESS"]);
    expect(run.snapshot?.placements.length).toBeGreaterThan(0);
  });

  it("watch adds the test player's towers for that wave", () => {
    const play = previewStart(ruleset, config, 8, "play").run.snapshot;
    const watch = previewStart(ruleset, config, 8, "watch").run.snapshot;
    expect(watch?.placements.length).toBeGreaterThanOrEqual(play?.placements.length ?? 0);
    expect(watch?.credits).toBeLessThanOrEqual(play?.credits ?? 0);
  });

  it("wave 1 is the wave set's own start", () => {
    const { run } = previewStart(ruleset, config, 1, "play");
    expect([run.wave, run.snapshot?.credits]).toEqual([1, config.waveSet.startCredits]);
  });
});

describe("the preview code (AC-04)", () => {
  it("imports nothing that talks to the server", () => {
    const dir = import.meta.dirname;
    for (const name of readdirSync(dir).filter((f) => /\.tsx?$/u.test(f) && !f.endsWith(".test.ts"))) {
      const text = readFileSync(join(dir, name), "utf8");
      expect(text, name).not.toMatch(/fetch\(|XMLHttpRequest|\/api\/|shell\/services|syncedRun|loadRun|newGame|gameData"/u);
    }
  });
});
