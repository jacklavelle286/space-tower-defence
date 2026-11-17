// What publishing changes (Gate M, LD7): the Publish tab's "against live" and the Versions page's comparison.
import { asSchema2 } from "@scd/game-core";
import { describe, expect, it } from "vitest";
import c1 from "../../../../../game-data/campaign/luna-1-c1.json";
import type { LevelWaveSet } from "../../api";
import { newLevel, REPO_BASE } from "../levelFile";
import { diffPlanets, diffText, levelDiff } from "./diff";

const live = REPO_BASE.raw;
const liveSets = asSchema2(live)["waveSets"] as Record<string, LevelWaveSet & { name: string }>;
const aChallenge = Object.entries(liveSets).find(([, ws]) => ws.mode === "CHALLENGE")?.[1];

/** The same JSON with every object's keys in reverse order. */
function reversed(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reversed);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reversed(v)]));
}

describe("levelDiff", () => {
  it("a new level's map and challenge read as new", () => {
    const level = newLevel("zigzag", "Zigzag", "zigzag");
    level.waveSets = { "zigzag-rush": { ...structuredClone(aChallenge!), name: "Zigzag Rush", mapId: "zigzag", presetPlacements: [] } };
    expect(levelDiff(live, level).map(diffText)).toEqual(["New map Zigzag", "New wave set Zigzag Rush"]);
  });

  it("a campaign level names the waves it changes", () => {
    const level = newLevel("moon", "Moon", "moonbeam-campaign");
    const waves = level.waves!;
    waves[2] = { ...waves[2]!, hpMult: waves[2]!.hpMult + 0.5 };
    waves[9] = { ...waves[9]!, speedMult: waves[9]!.speedMult + 0.1 };
    const text = levelDiff(live, level).map(diffText);
    expect(text).toContain("New map Moon");
    expect(text).toContain("Changed campaign waves 3, 10");
    expect(text.find((t) => t.startsWith("Changed wave set"))).toMatch(/mapId/u);
  });
});

describe("diffPlanets", () => {
  it("key order is never a change", () => {
    expect(diffPlanets(live, reversed(live))).toEqual([]);
  });

  it("a schema 1 version compares with a schema 2 one, section by section", () => {
    const lines = diffPlanets(c1, live);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.section === "wave set")).toBe(true);
  });

  it("a removed wave set and many changed waves are summarised", () => {
    const after = structuredClone(asSchema2(live)) as Record<string, unknown>;
    const sets = after["waveSets"] as Record<string, unknown>;
    const gone = Object.keys(sets).find((k) => k !== "campaign")!;
    delete sets[gone];
    after["waves"] = (after["waves"] as { wave: number; hpMult: number }[]).map((w) => ({ ...w, hpMult: w.hpMult + 1 }));
    const text = diffPlanets(live, after).map(diffText);
    expect(text).toContain(`Removed wave set ${liveSets[gone]!.name}`);
    expect(text.find((t) => t.startsWith("Changed campaign waves"))).toMatch(/and \d+ more$/u);
  });
});
