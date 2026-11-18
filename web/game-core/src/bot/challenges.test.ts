// Make the challenges for me (Gate M, LD18): challenges cut from a generated campaign on a generated map parse, are
// won by the competent player at 0 % (the check that blocks publishing), are the same from the same number, and a
// level without the campaign gets its own challenge waves and no boss.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_DATA_DIR } from "../../scripts/build-bounds";
import { parsePlanet, parseRuleset, type PlanetDocument } from "../data/game-data";
import { mergeLevel, type LevelSections } from "../data/level";
import { generateMap, routeCells } from "../map";
import { generateWaves } from "../waves";
import { assembleChallenges, makeChallenge, makeChallenges, planChallenges, type MadeChallenges } from "./challenges";
import { runJob } from "./checks";

const readJson = (dir: string, name: string): unknown => JSON.parse(readFileSync(join(GAME_DATA_DIR, dir, `${name}.json`), "utf8"));
const RULESET = parseRuleset(readJson("ruleset", "r4"));
const LIVE = readJson("campaign", "luna-1-c2") as Record<string, unknown>;
const CAMPAIGN = (LIVE["waveSets"] as Record<string, Record<string, unknown>>)["campaign"] ?? {};

/** A generated map and campaign as a level "lvl" that owns the campaign. */
function level(seed: number): LevelSections {
  const made = generateMap({ seed, twist: "medium", decorations: [] });
  if (!("map" in made)) throw new Error(made.reason);
  const map = {
    name: "Lvl",
    grid: { cols: 20, rows: 11 },
    route: made.map.route,
    pads: made.map.pads.map((p, i) => ({ ...p, id: `lvl-p${String(i + 1).padStart(2, "0")}` })),
    art: { backdrop: null, decorations: [] },
  };
  const waves = generateWaves({ seed, ruleset: RULESET, routeTiles: routeCells(made.map.route).length });
  if (!("waves" in waves)) throw new Error(waves.reason);
  return { levelId: "lvl", map, waves: waves.waves, challengeWaves: {}, waveSets: { campaign: { ...CAMPAIGN, mapId: "lvl" } } } as unknown as LevelSections;
}

const planetOf = (sections: object): PlanetDocument => parsePlanet(mergeLevel(LIVE, sections as LevelSections, "draft"), RULESET);

function make(seed: number, count: number, ownsCampaign: boolean): { sections: LevelSections; made: MadeChallenges } {
  const sections = level(seed);
  const plans = planChallenges(seed, count, { bosses: ownsCampaign });
  return { sections, made: makeChallenges(RULESET, planetOf(sections), plans, { seed, levelId: "lvl", ownsCampaign }) };
}

describe("planChallenges", () => {
  it("plans an opening, a boss fight and middles, each 2 to 8 waves, the same from the same number", () => {
    const plans = planChallenges(7, 4, { bosses: true });
    expect(plans.map((p) => p.theme)).toEqual(["opening", "boss", "middle", "middle"]);
    expect(plans[0]?.first).toBe(1);
    expect([10, 20]).toContain(plans[1]?.last);
    for (const p of plans) expect(p.last - p.first + 1).toBeGreaterThanOrEqual(2);
    for (const p of plans) expect(p.last - p.first + 1).toBeLessThanOrEqual(8);
    expect(planChallenges(7, 4, { bosses: true })).toEqual(plans);
    expect(planChallenges(7, 4, { bosses: false }).every((p) => p.last % 10 !== 0)).toBe(true);
  });
});

describe("makeChallenges", () => {
  it("makes challenges that parse and that the competent player wins at 0 %", { timeout: 120_000 }, () => {
    for (const seed of [3, 11]) {
      const { sections, made } = make(seed, 4, true);
      const ids = Object.keys(made.waveSets);
      expect(ids.length, `seed ${seed}: ${made.notes.join(" ")}`).toBeGreaterThanOrEqual(3);
      const planet = planetOf({ ...sections, waveSets: { ...sections.waveSets, ...made.waveSets } });
      for (const id of ids) {
        expect(id.startsWith("lvl-") && id.length <= 40).toBe(true);
        const set = planet.waveSets[id];
        expect(set?.mode).toBe("CHALLENGE");
        expect(set?.classes).toContain("nova");
        const won = runJob(RULESET, planet, { waveSetId: id, policy: "competent", learn: 0, seed: 1 }).result;
        expect(won.cleared, `seed ${seed} ${id}`).toBe(set?.waves.length);
      }
      const opening = Object.values(made.waveSets)[0];
      expect(opening?.presetPlacements).toEqual([]);
      expect(opening?.waves[0]).toBe(1);
    }
  });

  it("is the same from the same number, and one made on its own (a worker's) is the same as in the list", { timeout: 120_000 }, () => {
    const { sections, made } = make(5, 2, true);
    expect(make(5, 2, true).made).toEqual(made);
    const plan = planChallenges(5, 2, { bosses: true })[1];
    const alone = makeChallenge(RULESET, planetOf(sections), plan as never, { seed: 5, levelId: "lvl", ownsCampaign: true, index: 1 });
    expect("waveSet" in alone && alone.waveSet).toEqual(Object.values(made.waveSets)[1]);
  });

  it("numbers a repeated name and keys each challenge by its name", () => {
    const set = make(3, 1, true).made.waveSets;
    const one = Object.values(set)[0];
    if (one === undefined) throw new Error("no challenge");
    const both = assembleChallenges("lvl", [{ waveSet: one, challengeWaves: {} }, { waveSet: one, challengeWaves: {} }, { note: "left out" }]);
    expect(Object.values(both.waveSets).map((s) => s.name)).toEqual([one.name, `${one.name} 2`]);
    expect(Object.keys(both.waveSets)[1]).toMatch(/^lvl-[a-z0-9-]+-2$/u);
    expect(both.notes).toEqual(["left out"]);
    const long = assembleChallenges("a-very-long-level-id-thirty-chars", [{ waveSet: one, challengeWaves: {} }]);
    expect(Object.keys(long.waveSets)).toEqual(["a-very-long-level-id-thirty-chars-c1"]);
  });

  it("gives a level without the campaign its own challenge waves, never a boss", { timeout: 120_000 }, () => {
    const { sections, made } = make(3, 3, false);
    const refs = Object.values(made.waveSets).flatMap((s) => s.waves);
    expect(refs.every((r) => typeof r === "string" && r.startsWith("lvl-w"))).toBe(true);
    expect(Object.keys(made.challengeWaves).sort()).toEqual([...new Set(refs as string[])].sort());
    const planet = planetOf({ ...sections, challengeWaves: made.challengeWaves, waveSets: { ...sections.waveSets, ...made.waveSets } });
    for (const w of Object.values(planet.challengeWaves)) expect(w.groups.some((g) => Object.hasOwn(RULESET.bosses, g.type))).toBe(false);
  });
});
