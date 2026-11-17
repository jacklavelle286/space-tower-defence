// The ?aliens= dev wave (Phase 26) and the ?boss= dev waves (Phase 27) of the local battlefield.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRuleset } from "@scd/game-core";
import { describe, expect, it } from "vitest";
import { devBossWaves, devWave } from "./devWave";

const r3 = parseRuleset(JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "game-data", "ruleset", "r3.json"), "utf8")));

describe("devWave", () => {
  it("all: two of every alien a wave may schedule, one group each, 3 s apart (Slimelets come out of Split Slimes)", () => {
    const wave = devWave(r3, "all", 3);
    expect(wave.wave).toBe(3);
    expect(wave.groups.map((g) => g.type)).toEqual(["blob", "craft", "flutter", "guard", "mite", "patch", "shell", "slime", "swarm"]);
    expect(wave.groups.every((g) => g.count === 2 && g.gap === 0.6)).toBe(true);
    expect(wave.groups.map((g) => g.at)).toEqual([0, 3, 6, 9, 12, 15, 18, 21, 24]);
  });

  it("a list: type:count, count 1 when left out", () => {
    expect(devWave(r3, "craft:2,slime", 3).groups).toEqual([
      { type: "craft", count: 2, at: 0, gap: 0.6 },
      { type: "slime", count: 1, at: 3, gap: 0.6 },
    ]);
  });

  it("refuses an unknown alien, a descendant-only alien and a bad count", () => {
    expect(() => devWave(r3, "ghost:1", 3)).toThrow(/no alien "ghost"/);
    expect(() => devWave(r3, "slimelet:2", 3)).toThrow(/only ever released/);
    expect(() => devWave(r3, "blob:0", 3)).toThrow(/must be 1 to 20/);
  });
});

describe("devBossWaves", () => {
  it("one boss: one wave, the boss 3 s in between two groups of Moon Blobs", () => {
    expect(devBossWaves(r3, "boss3", 4)).toEqual([
      {
        wave: 4,
        groups: [
          { type: "blob", count: 4, at: 0, gap: 1.5 },
          { type: "boss3", count: 1, at: 3, gap: 0 },
          { type: "blob", count: 4, at: 6, gap: 1.5 },
        ],
        hpMult: 1,
        speedMult: 1,
      },
    ]);
  });

  it("all: one wave per boss, numbered on from the first, one boss in each (C7)", () => {
    const waves = devBossWaves(r3, "all", 3);
    expect(waves.map((w) => w.wave)).toEqual([3, 4, 5, 6, 7]);
    expect(waves.map((w) => w.groups.filter((g) => g.type.startsWith("boss")).map((g) => g.type))).toEqual([["boss1"], ["boss2"], ["boss3"], ["boss4"], ["boss5"]]);
  });

  it("refuses a boss the ruleset does not have, and a ruleset with no bosses", () => {
    expect(() => devBossWaves(r3, "boss9", 3)).toThrow(/no boss "boss9"/);
    const r1 = parseRuleset(JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "game-data", "ruleset", "r1.json"), "utf8")));
    expect(() => devBossWaves(r1, "all", 3)).toThrow(/ruleset r1 has no bosses/);
  });
});
