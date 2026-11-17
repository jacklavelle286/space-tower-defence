import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileBattleConfig, parsePlanet, parseRuleset } from "@scd/game-core";
import { describe, expect, it } from "vitest";
import { classSummary } from "./classSummary";

const GAME_DATA = join(import.meta.dirname, "..", "..", "..", "..", "game-data");
const read = (p: string): unknown => JSON.parse(readFileSync(join(GAME_DATA, p), "utf8"));
const ruleset = parseRuleset(read("ruleset/r3.json"));
const planet = parsePlanet(read("campaign/luna-1-c1.json"), ruleset);
const config = compileBattleConfig(ruleset, planet, "first-contact");
const summary = (id: string) => {
  const cls = config.classes[id];
  if (cls === undefined) throw new Error(id);
  return classSummary(cls, config.classes);
};

describe("classSummary (the shop card's hover summary, from the ruleset's numbers)", () => {
  it("describes Nova from r3's level numbers", () => {
    expect(summary("nova")).toEqual({
      title: "Nova, Laser Scout",
      line: "Zaps one alien at a time.",
      facts: ["Reach: 2.5 squares", "Shoots every 1 second", "Damage: 10"],
      upgrades: ["Level 2: faster shots", "Level 3: more reach, more damage"],
      quote: "Ready for launch!",
      ratings: [
        { label: "Power", stars: 2 },
        { label: "Reach", stars: 3 },
        { label: "Speed", stars: 3 },
      ],
    });
  });

  it("says Sol does not shoot but boosts nearby astronauts", () => {
    const sol = summary("sol");
    expect(sol.line).toBe("Helps nearby astronauts hit harder. Does not shoot.");
    expect(sol.facts).toEqual(["Boost: +15% damage", "Reach: 4.5 squares", "Up to 2 on the map"]);
    expect(sol.upgrades).toEqual(["Level 2: bigger boost", "Level 3: reaches further"]);
    expect(sol.ratings).toEqual([
      { label: "Help", stars: 3 },
      { label: "Reach", stars: 4 },
    ]);
  });

  it("covers every class's attack kind", () => {
    expect(summary("pip").facts).toContain("Slows by 30% for 3 seconds");
    expect(summary("pip").upgrades).toEqual(["Level 2: more damage, stronger slow", "Level 3: more damage, slows a group"]);
    expect(summary("juno").line).toBe("Hits a whole group of aliens at once.");
    expect(summary("orion").line).toBe("Hits one alien hard, from far away.");
    expect(summary("mira").facts).toEqual(["Adds 1 shield every 15 seconds", "Up to 2 on the map"]);
    expect(summary("mira").upgrades).toEqual(["Level 2: bigger shield", "Level 3: shields more often, repairs the colony"]);
  });

  it("rates every class 1 to 5 stars against the best level of any class", () => {
    const line = (id: string) =>
      summary(id)
        .ratings.map((r) => `${r.label} ${r.stars}`)
        .join(", ");
    expect(line("pip")).toBe("Power 1, Reach 3, Speed 4");
    expect(line("juno")).toBe("Power 3, Reach 3, Speed 2");
    expect(line("orion")).toBe("Power 3, Reach 4, Speed 2");
    expect(line("mira")).toBe("Help 2");
  });
});
