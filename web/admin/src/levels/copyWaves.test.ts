// Copy waves and wave sets from another level (Gate M, LD17): what moves, how it is renamed for this level, and the
// presets whose pads are not on this map.
import { describe, expect, it } from "vitest";
import type { LevelFile } from "../api";
import { copyable, copyWavesFrom, renameOwned } from "./copyWaves";
import { levelProblems, newLevel } from "./levelFile";

function source(): LevelFile {
  const level = newLevel("moon2", "Moon two", "moonbeam-campaign");
  level.challengeWaves["moon2-big"] = { groups: [{ type: "blob", count: 5, at: 0, gap: 2 }], hpMult: 1, speedMult: 1 };
  level.waveSets["moon2-rush"] = {
    mode: "CHALLENGE", name: "Rush", mapId: "moon2", waves: [3, "moon2-big"], meteorAfter: [], startCredits: 300, colonyHealth: 15,
    classes: ["nova", "pip"], padsOpenAsForWave: 1,
    presetPlacements: [
      { padId: "moon2-p01", classId: "nova", level: 1, targeting: "FRONT" },
      { padId: "moon2-p16", classId: "pip", level: 1, targeting: "FRONT" },
    ],
  };
  return level;
}

describe("copyWavesFrom", () => {
  it("renames what belongs to the other level", () => {
    expect(renameOwned("moon2-rush", "moon2", "zig")).toBe("zig-rush");
    expect(renameOwned("rush", "moon2", "zig")).toBe("zig-rush");
  });

  it("copies the campaign and the challenges onto this level's map, as a level the rules accept", () => {
    const target = newLevel("zig", "Zig", "zigzag"); // 13 pads: zig-p01 to zig-p13
    const { level, notes } = copyWavesFrom(target, source(), { campaign: true, challenges: true });
    expect(level.waves).toHaveLength(50);
    expect(level.waveSets["campaign"]?.mapId).toBe("zig");
    const rush = level.waveSets["zig-rush"];
    expect(rush?.mapId).toBe("zig");
    expect(rush?.waves).toEqual([3, "zig-big"]);
    expect(level.challengeWaves["zig-big"]).toBeDefined();
    expect(rush?.presetPlacements.map((p) => p.padId)).toEqual(["zig-p01"]); // no zig-p16 on this map
    expect(notes).toEqual([
      "Copied the 50 campaign waves and the campaign card.",
      "Copied 1 challenge and 1 challenge wave.",
      "1 preset astronaut was left out: its pad is not on this map.",
    ]);
    expect(levelProblems(level).filter((p) => p.severity !== "warn")).toEqual([]);
    expect(target.waves).toBeUndefined(); // the level passed in is not changed
  });

  it("copies only what was chosen, and says when there is nothing", () => {
    const target = newLevel("zig", "Zig", "zigzag");
    const only = copyWavesFrom(target, source(), { campaign: false, challenges: true }).level;
    expect(only.waves).toBeUndefined();
    expect(Object.keys(only.waveSets)).toEqual(["zig-rush"]);
    expect(copyWavesFrom(target, newLevel("x", "X", "blank"), { campaign: true, challenges: true }).notes).toEqual(["Nothing to copy: that level has none of what you chose."]);
    expect(copyable(source())).toEqual({ campaign: true, challenges: 1, challengeWaves: 1 });
  });
});
