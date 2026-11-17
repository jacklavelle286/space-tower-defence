// A wave's margin (Gate M, LD13; C8.1), and the LD13 exit check: setting a wave's health from the margin target brings
// its measured margin within 15 % of the target.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_DATA_DIR } from "../../scripts/build-bounds";
import { parsePlanet, parseRuleset, type PlanetDocument } from "../data/game-data";
import { compileBattleConfig } from "../sim/config";
import { fitHpMult, marginTarget } from "../waves/curves";
import { measureWaves } from "./margin";

const rs = parseRuleset(JSON.parse(readFileSync(join(GAME_DATA_DIR, "ruleset", "r4.json"), "utf8")));
const raw = JSON.parse(readFileSync(join(GAME_DATA_DIR, "campaign", "luna-1-c2.json"), "utf8")) as { waves: { wave: number; hpMult: number }[] };
const configOf = (doc: unknown) => compileBattleConfig(rs, parsePlanet(doc, rs) as PlanetDocument, "campaign");

describe("measureWaves", () => {
  it("measures a margin above 1 and a length for the early campaign, as the simulator does (C8.2)", () => {
    const seen: number[] = [];
    const measured = measureWaves(configOf(raw), [1, 2, 3], (m) => seen.push(m.wave));
    expect(seen).toEqual([1, 2, 3]);
    for (const m of measured) {
      expect(m.margin).toBeGreaterThan(1.5);
      expect(m.seconds).toBeGreaterThan(10);
    }
    // Wave 3 brings the Meteor Mite alone, the easiest of the three (C8.2: 9.12 against 4.59 and 3.19).
    expect(measured[2]?.margin).toBeGreaterThan(measured[1]?.margin ?? 0);
  });

  it("LD13 exit: health set from the margin target gives margins within 15 % of the target", () => {
    const waves = [6, 7];
    const before = measureWaves(configOf(raw), waves);
    const tuned = structuredClone(raw);
    for (const m of before) {
      const w = tuned.waves.find((x) => x.wave === m.wave);
      if (w === undefined || m.margin === null) throw new Error("not measured");
      w.hpMult = fitHpMult(w.hpMult, m.margin, marginTarget(m.wave));
    }
    const after = measureWaves(configOf(tuned), waves);
    for (const m of after) {
      const target = marginTarget(m.wave);
      expect(Math.abs((m.margin ?? 0) / target - 1), `wave ${m.wave}: ${m.margin} against ${target}`).toBeLessThanOrEqual(0.15);
    }
  });
});
