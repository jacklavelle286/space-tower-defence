// Make the waves for me (Gate M, LD15): 50 waves in the Moon campaign's shape that the parser accepts, the same from
// the same number, inside the level designer's limits.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_DATA_DIR } from "../../scripts/build-bounds";
import { isBoss, parsePlanet, parseRuleset } from "../data/game-data";
import { routeCells } from "../map";
import { LIMITS } from "../rules/contracts.generated";
import { generateWaves, introductionOrder, speedMultAt } from "./generate";
import { toughnessAt } from "./curves";
import { waveStats } from "./model";

const readJson = (dir: string, name: string): unknown => JSON.parse(readFileSync(join(GAME_DATA_DIR, dir, `${name}.json`), "utf8"));
const RULESET = parseRuleset(readJson("ruleset", "r4"));
const RAW = readJson("campaign", "luna-1-c2") as Record<string, unknown>;
const MOON = parsePlanet(RAW, RULESET);
const ROUTE = routeCells(MOON.maps["main"]?.route ?? []).length;
const L = LIMITS.levelDesigner;

const made = (seed: number, extra: Partial<Parameters<typeof generateWaves>[0]> = {}) => {
  const result = generateWaves({ seed, ruleset: RULESET, routeTiles: ROUTE, ...extra });
  if (!("waves" in result)) throw new Error(result.reason);
  return result.waves;
};

describe("generateWaves", () => {
  it("orders the Moon's aliens as the Moon campaign introduces them", () => {
    expect(introductionOrder(RULESET)).toEqual(["blob", "mite", "shell", "swarm", "flutter", "guard", "patch", "slime", "craft"]);
  });

  it("makes 50 waves the parser accepts, in the Moon's shape and the designer's limits, for 40 numbers", () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const waves = made(seed);
      expect(waves.map((w) => w.wave)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
      expect(() => parsePlanet({ ...RAW, waves }, RULESET), `seed ${seed}`).not.toThrow();
      for (const w of waves) {
        const bosses = w.groups.filter((g) => isBoss(RULESET, g.type));
        expect(bosses.length, `seed ${seed} wave ${w.wave}`).toBe(w.wave % 10 === 0 ? 1 : 0);
        expect(w.groups.length).toBeLessThanOrEqual(L.groupsPerWave.max);
        for (const g of w.groups) {
          expect(g.count).toBeGreaterThanOrEqual(L.groupCount.min);
          expect(g.count).toBeLessThanOrEqual(L.groupCount.max);
          expect(g.at).toBeLessThanOrEqual(L.groupSeconds.max);
          expect(g.gap).toBeLessThanOrEqual(L.groupSeconds.max);
        }
        expect(w.hpMult).toBe(toughnessAt(w.wave));
        expect(w.speedMult).toBe(speedMultAt(w.wave));
        const stats = waveStats(RULESET, w, ROUTE);
        if (w.wave % 10 !== 0) expect(stats.seconds, `seed ${seed} wave ${w.wave}`).toBeGreaterThanOrEqual(25);
      }
      // Each alien arrives on its own first, at the Moon's introduction waves.
      const firstSeen = new Map<string, number>();
      for (const w of waves) for (const g of w.groups) if (!firstSeen.has(g.type)) firstSeen.set(g.type, w.wave);
      expect(Object.fromEntries([...firstSeen].filter(([t]) => !isBoss(RULESET, t)))).toEqual({ blob: 1, mite: 3, shell: 6, swarm: 8, flutter: 12, guard: 14, patch: 22, slime: 24, craft: 27 });
      for (const [type, wave] of firstSeen) {
        if (isBoss(RULESET, type)) continue;
        expect(new Set(waves[wave - 1]?.groups.map((g) => g.type))).toEqual(new Set([type]));
      }
    }
  });

  it("makes the same waves from the same number, and others from the next", () => {
    expect(made(9)).toEqual(made(9));
    expect(made(10)).not.toEqual(made(9));
  });

  it("uses only the aliens chosen, in the order given, and the bosses given", () => {
    const waves = made(3, { aliens: ["guard", "blob"], bosses: ["boss2"] });
    const types = new Set(waves.flatMap((w) => w.groups.map((g) => g.type)));
    expect(types).toEqual(new Set(["guard", "blob", "boss2"]));
    expect(waves[0]?.groups.every((g) => g.type === "guard")).toBe(true);
  });

  it("is gentler with the gentler preset, and says why when nothing can be made", () => {
    const gentle = made(4, { preset: { id: "gentle", label: "", scale: 1.2 } });
    expect(gentle[49]?.hpMult).toBeLessThan(made(4)[49]?.hpMult ?? 0);
    expect(generateWaves({ seed: 1, ruleset: RULESET, routeTiles: ROUTE, aliens: [] })).toEqual({ reason: "Choose at least one alien." });
  });
});
