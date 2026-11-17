// Difficulty curves (Gate M, LD13): the anchors of C8.1 and C8.3, and the fit from a measured margin.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_DATA_DIR } from "../../scripts/build-bounds";
import { durationProblem, fitHpMult, interpolate, MARGIN_PRESETS, marginTarget, round005, toughnessAt } from "./curves";

describe("toughness (C8.1)", () => {
  it("is the live campaign's health multiplier on every one of its 50 waves", () => {
    const doc = JSON.parse(readFileSync(join(GAME_DATA_DIR, "campaign", "luna-1-c2.json"), "utf8")) as { waves: { wave: number; hpMult: number }[] };
    for (const w of doc.waves) expect(toughnessAt(w.wave), `wave ${w.wave}`).toBe(w.hpMult);
  });

  it("interpolates linearly and holds flat past the ends", () => {
    expect(interpolate([[1, 1], [11, 2]], 6)).toBe(1.5);
    expect(interpolate([[1, 1], [11, 2]], 0)).toBe(1);
    expect(interpolate([[1, 1], [11, 2]], 20)).toBe(2);
    expect(round005(1.178)).toBe(1.2);
  });
});

describe("margin target (C8.3)", () => {
  it("follows the sawtooth: about 4 at wave 1, 1.10 at 49, boss waves a little below their neighbours", () => {
    expect(marginTarget(1)).toBe(4);
    expect(marginTarget(49)).toBe(1.1);
    expect(marginTarget(20)).toBeLessThan(marginTarget(19));
    expect(marginTarget(21)).toBeLessThan(marginTarget(19));
    expect(marginTarget(20)).toBeLessThan(marginTarget(21));
  });

  it("presets scale it", () => {
    const [campaign, gentle, tough] = MARGIN_PRESETS;
    expect(marginTarget(15, gentle)).toBeGreaterThan(marginTarget(15, campaign));
    expect(marginTarget(15, tough)).toBeLessThan(marginTarget(15, campaign));
  });
});

describe("duration bands (C17.5)", () => {
  it("flags a short ordinary wave and a boss wave outside 40 to 100 s", () => {
    expect([durationProblem(24, false), durationProblem(25, false), durationProblem(300, false)]).toEqual(["short", null, null]);
    expect([durationProblem(39, true), durationProblem(60, true), durationProblem(101, true)]).toEqual(["short", null, "long"]);
  });
});

describe("fitHpMult", () => {
  it("scales health by measured / target margin, rounded to 0.05, inside the designer's limits", () => {
    expect(fitHpMult(2, 3, 2)).toBe(3);
    expect(fitHpMult(2, 1, 2)).toBe(1);
    expect(fitHpMult(1, 100, 1)).toBe(20);
    expect(fitHpMult(1, 0.1, 1)).toBe(0.5);
    expect(fitHpMult(1.5, 0, 2)).toBe(1.5); // nothing measured: unchanged
  });
});
