// The design rules (Gate M, LD1; scope-level-designer.md §5): every published planet passes with no hard or block
// problem, and each rule has a document that breaks it. Fixtures are the live planet document with one change.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_DATA_DIR } from "../../scripts/build-bounds";
import { parsePlanet, parseRuleset, type PlanetDocument, type Ruleset } from "../data/game-data";
import fixtures from "./fixtures-any-direction.json";
import { ANY_DIRECTION_ROUTES, hardMapProblems, planetProblems, PROBLEM_TEXT, problemMessage, type PlanetProblem, type ProblemRule, type Severity } from ".";

const readJson = (dir: string, name: string): unknown => JSON.parse(readFileSync(join(GAME_DATA_DIR, dir, `${name}.json`), "utf8"));
const r1 = parseRuleset(readJson("ruleset", "r1"));
const r4 = parseRuleset(readJson("ruleset", "r4"));
const LIVE = parsePlanet(readJson("campaign", "luna-1-c2"), r4);

type Route = [number, number][];
const doc = (change: (d: PlanetDocument) => void): PlanetDocument => {
  const d = structuredClone(LIVE);
  change(d);
  return d;
};
const main = (d: PlanetDocument): PlanetDocument["maps"][string] => {
  const m = d.maps["main"];
  if (m === undefined) throw new Error("no main map");
  return m;
};
const withRoute = (route: Route): PlanetDocument => doc((d) => (main(d).route = route));
const rules = (problems: readonly PlanetProblem[], severity?: Severity): ProblemRule[] =>
  problems.filter((p) => severity === undefined || p.severity === severity).map((p) => p.rule);
const pad = (d: PlanetDocument, id: string): PlanetDocument["maps"][string]["pads"][number] => {
  const p = main(d).pads.find((x) => x.id === id);
  if (p === undefined) throw new Error(id);
  return p;
};

describe("published planets", () => {
  it.each([
    ["luna-1-c1", r1],
    ["luna-1-c2", r4],
  ] as [string, Ruleset][])("%s has no hard or block problem", (name, rs) => {
    const problems = planetProblems(parsePlanet(readJson("campaign", name), rs), rs);
    expect(problems.filter((p) => p.severity !== "warn")).toEqual([]);
    // Moonbeam's pads are numbered by column, not by route (a copy of it warns; a new map blocks, below).
    expect(rules(problems)).toContain("padOrder");
  });
});

describe("one broken document per rule", () => {
  const cases: [ProblemRule, Severity, PlanetDocument][] = [
    ["gridSize", "hard", doc((d) => (main(d).grid = { cols: 21, rows: 11 }))],
    ["waypoints", "hard", withRoute([[0, 1], [1, 1], [1, 2], [2, 2], [2, 1], [3, 1], [3, 2], [4, 2], [4, 1], [5, 1], [5, 2], [6, 2], [6, 1], [7, 1], [7, 2], [8, 2], [19, 2]])],
    ["startEdge", "hard", withRoute([[1, 2], [19, 2]])],
    ["startHeading", "hard", withRoute([[0, 2], [0, 5], [19, 5]])],
    ["endEdge", "hard", withRoute([[0, 2], [18, 2]])],
    ["endHeading", "hard", withRoute([[0, 2], [19, 2], [19, 5]])],
    ["leftHeading", "hard", withRoute([[0, 2], [10, 2], [10, 5], [5, 5], [5, 8], [19, 8]])],
    ["crossing", "hard", withRoute([[0, 5], [5, 5], [5, 2], [5, 8], [19, 8]])],
    ["padOnRoute", "hard", doc((d) => Object.assign(pad(d, "p02"), { x: 1, y: 2 }))],
    ["bossWave", "block", doc((d) => d.waves[8]?.groups.push({ type: Object.keys(r4.bosses)[0] ?? "", count: 1, at: 0, gap: 0 }))],
    ["routeLength", "block", withRoute([[0, 2], [19, 2]])],
    ["routeLength", "warn", withRoute([[0, 2], [4, 2], [4, 9], [8, 9], [8, 2], [12, 2], [12, 9], [16, 9], [16, 3], [19, 3]])],
    ["turns", "warn", withRoute([[0, 1], [3, 1], [3, 4], [6, 4], [6, 1], [9, 1], [9, 4], [12, 4], [12, 1], [15, 1], [15, 4], [17, 4], [17, 2], [19, 2]])],
    ["turns", "block", withRoute([[0, 1], [2, 1], [2, 4], [4, 4], [4, 1], [6, 1], [6, 4], [8, 4], [8, 1], [10, 1], [10, 4], [12, 4], [12, 1], [14, 1], [14, 4], [19, 4]])],
    ["stretchesTouch", "block", withRoute([[0, 2], [4, 2], [4, 8], [5, 8], [5, 3], [19, 3]])],
    ["stretchesClose", "warn", withRoute([[0, 2], [4, 2], [4, 8], [6, 8], [6, 3], [19, 3]])],
    ["footprint", "block", doc((d) => Object.assign(pad(d, "p02"), { x: 0, y: 3 }))],
    ["fewBendPads", "warn", withRoute([[0, 2], [10, 2], [10, 8], [19, 8]])],
    ["padCount", "block", doc((d) => (main(d).pads = main(d).pads.slice(0, 11)))],
    ["padsTooClose", "block", doc((d) => Object.assign(pad(d, "p01"), { x: 3, y: 5 }))],
    ["padFar", "block", doc((d) => Object.assign(pad(d, "p06"), { x: 1, y: 6 }))],
    ["fewStartPads", "warn", doc((d) => ["p02", "p04", "p05"].forEach((id) => (pad(d, id).opensAfterWave = 5)))],
    ["startPadReach", "warn", doc((d) => (pad(d, "p01").opensAfterWave = 0))],
    ["opensAfterWave", "block", doc((d) => (pad(d, "p03").opensAfterWave = 7))],
    ["unlockOpensNothing", "warn", doc((d) => main(d).pads.forEach((p) => p.opensAfterWave === 25 && (p.opensAfterWave = 20)))],
    ["challengeLength", "block", doc((d) => d.waveSets["blob-parade"] && (d.waveSets["blob-parade"].waves = [1]))],
    ["campaignHealth", "block", doc((d) => d.waveSets["campaign"] && (d.waveSets["campaign"].colonyHealth = 15))],
    ["challengeHealth", "block", doc((d) => d.waveSets["blob-parade"] && (d.waveSets["blob-parade"].colonyHealth = 9))],
    ["noNova", "block", doc((d) => d.waveSets["blob-parade"] && (d.waveSets["blob-parade"].classes = ["pip"]))],
    ["speedMult", "warn", doc((d) => d.waves[4] && (d.waves[4].speedMult = 1.3))],
    ["newAlienIntro", "warn", doc((d) => d.waves[2]?.groups.push({ type: "blob", count: 2, at: 0, gap: 1 }))],
  ];

  it.each(cases)("%s (%s)", (rule, severity, broken) => {
    const count = (d: PlanetDocument): number => rules(planetProblems(d, r4), severity).filter((r) => r === rule).length;
    // The change adds the problem (the live document has one Patchling warning of its own, prompt.md:385).
    expect(count(broken)).toBeGreaterThan(count(LIVE));
  });

  it("covers every rule", () => {
    // decorationPlacement needs a schema 2 document: src/data/schema2.test.ts.
    // routeStart and routeEnd are the tier 3 rules (LD11), below.
    const covered = new Set([...cases.map(([rule]) => rule), "padOrder", "arrowReach", "decorationPlacement", "routeStart", "routeEnd"]);
    expect([...covered].sort()).toEqual(Object.keys(PROBLEM_TEXT).sort());
  });

  it("pads out of route order block a new map and warn on a Moonbeam copy", () => {
    expect(planetProblems(LIVE, r4, { strictPadOrder: true }).find((p) => p.rule === "padOrder")?.severity).toBe("block");
    expect(planetProblems(LIVE, r4).find((p) => p.rule === "padOrder")?.severity).toBe("warn");
  });

  it("a problem names its cell when it has one, and never copies a value into its text", () => {
    const [crossing] = planetProblems(withRoute([[0, 5], [5, 5], [5, 2], [5, 8], [19, 8]]), r4).filter((p) => p.rule === "crossing");
    expect(crossing?.at).toEqual([5, 3]);
    expect(problemMessage({ field: "planet.map.route", rule: "crossing", severity: "hard", at: [5, 3] })).toBe(
      "The route passes through this cell twice. (cell 5,3)",
    );
  });
});

describe("parsePlanet refuses hard map problems", () => {
  const raw = readJson("campaign", "luna-1-c2") as { map: { route: unknown; grid: unknown } };
  it.each([
    ["a route heading left", { ...raw, map: { ...raw.map, route: [[0, 2], [10, 2], [10, 5], [5, 5], [5, 8], [19, 8]] } }, /never heads left/],
    ["a 21-column grid", { ...raw, map: { ...raw.map, grid: { cols: 21, rows: 11 } } }, /20 by 11/],
  ])("%s", (_name, bad, message) => {
    expect(() => parsePlanet(bad, r4)).toThrow(message);
  });
});

describe("routes in any direction (LD11, behind ANY_DIRECTION_ROUTES)", () => {
  const ROUTES = fixtures.routes as unknown as Record<string, [number, number][]>;
  const map = (route: [number, number][]) => ({ grid: { cols: 20, rows: 11 }, route, pads: [] });
  const hardRules = (route: [number, number][], anyDirection: boolean): ProblemRule[] => rules(hardMapProblems(map(route), "planet.map", anyDirection));

  it("is off until the player release with the route art has shipped", () => {
    expect(ANY_DIRECTION_ROUTES).toBe(false);
  });

  it.each(Object.entries(ROUTES))("%s is refused today and passes the tier 3 rules", (_name, route) => {
    expect(hardRules(route, false).length).toBeGreaterThan(0);
    expect(hardRules(route, true)).toEqual([]);
  });

  it("keeps Moonbeam valid under both rule sets", () => {
    const route = main(LIVE).route as [number, number][];
    expect(hardRules(route, false)).toEqual([]);
    expect(hardRules(route, true)).toEqual([]);
  });

  it.each([
    ["routeStart", [[3, 2], [3, 8], [19, 8]]],
    ["routeStart", [[0, 2], [0, 8], [19, 8]]],
    ["routeEnd", [[0, 2], [12, 2], [12, 6]]],
    ["routeEnd", [[0, 2], [19, 2], [19, 6]]],
    ["crossing", [[0, 5], [8, 5], [8, 2], [4, 2], [4, 9], [0, 9]]],
  ] as [ProblemRule, [number, number][]][])("%s: %j", (rule, route) => {
    expect(hardRules(route, true)).toContain(rule);
  });

  it("the parser takes them only when asked (development previews and tests)", () => {
    const raw = readJson("campaign", "luna-1-c2") as { map: Record<string, unknown> };
    const left = { ...raw, map: { ...raw.map, route: ROUTES["from-right"] } };
    expect(() => parsePlanet(left, r4)).toThrow(/left edge/u);
    expect(() => parsePlanet(left, r4, { anyDirection: true })).toThrow(/pad cannot sit on the route/u); // Moonbeam's pads
  });
});
