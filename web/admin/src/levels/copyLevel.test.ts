// Copy a level to a planet (Gate M, LD19): the copy owns everything under its new ID, as a level file the rules and the
// server accept, with or without the campaign.
import { describe, expect, it } from "vitest";
import type { LevelFile } from "../api";
import { copyLevel, ownsCampaign } from "./copyLevel";
import { levelFileDownload, newLevel, readLevelFile } from "./levelFile";
import { freeId, hasCampaign, liveRole } from "./PlanetLevels";

function source(): LevelFile {
  const level = newLevel("lava", "Lava", "moonbeam-campaign");
  level.challengeWaves["lava-big"] = { groups: [{ type: "blob", count: 5, at: 0, gap: 2 }], hpMult: 1, speedMult: 1 };
  level.waveSets["lava-rush"] = {
    mode: "CHALLENGE", name: "Rush", mapId: "lava", waves: [3, "lava-big"], meteorAfter: [], startCredits: 300, colonyHealth: 15,
    classes: ["nova"], padsOpenAsForWave: 1, presetPlacements: [{ padId: "lava-p02", classId: "nova", level: 1, targeting: "FRONT" }],
  };
  return level;
}

describe("copyLevel", () => {
  it("renames the map, pads, challenges and their waves to the new ID, and keeps the campaign when asked", () => {
    const copy = copyLevel(source(), { levelId: "fire", name: "Fire", campaign: true });
    expect(copy.levelId).toBe("fire");
    expect(copy.name).toBe("Fire");
    expect(copy.map.name).toBe("Fire");
    expect(copy.map.route).toEqual(source().map.route);
    expect(copy.map.pads.map((p) => p.id)).toEqual(source().map.pads.map((p) => p.id.replace("lava-", "fire-")));
    expect(Object.keys(copy.waveSets).sort()).toEqual(["campaign", "fire-rush"]);
    expect(Object.values(copy.waveSets).every((s) => s.mapId === "fire")).toBe(true);
    expect(copy.waveSets["fire-rush"]?.waves).toEqual([3, "fire-big"]);
    expect(copy.waveSets["fire-rush"]?.presetPlacements[0]?.padId).toBe("fire-p02");
    expect(Object.keys(copy.challengeWaves)).toEqual(["fire-big"]);
    expect(copy.waves).toEqual(source().waves);
    expect(ownsCampaign(copy)).toBe(true);
    const read = readLevelFile(levelFileDownload(copy).text);
    expect(read.ok, read.ok ? "" : read.reason).toBe(true);
  });

  it("leaves the campaign behind when asked, and the source is unchanged", () => {
    const from = source();
    const copy = copyLevel(from, { levelId: "fire", name: "Fire", campaign: false });
    expect(ownsCampaign(copy)).toBe(false);
    expect(copy.waveSets["campaign"]).toBeUndefined();
    expect(Object.keys(copy.waveSets)).toEqual(["fire-rush"]);
    expect(from).toEqual(source());
    expect(readLevelFile(levelFileDownload(copy).text).ok).toBe(true);
  });
});

describe("the planet list's helpers", () => {
  it("finds a free ID, says what a level has live and which planets have a campaign", () => {
    expect(freeId("Lava Meltdown", new Set())).toBe("lava-meltdown");
    expect(freeId("Lava Meltdown", new Set(["lava-meltdown", "lava-meltdown-2"]))).toBe("lava-meltdown-3");
    const live = { waveSets: { campaign: { mapId: "lava" }, "lava-a": { mapId: "lava" }, "lava-b": { mapId: "lava" }, "x-c": { mapId: "x" } } };
    expect(liveRole(live, "lava")).toBe("Campaign map, 2 challenges");
    expect(liveRole(live, "x")).toBe("1 challenge");
    expect(liveRole(live, "y")).toBe("");
    expect(liveRole(undefined, "y")).toBe("");
    expect(hasCampaign({ planetId: "a", name: "A", status: "RELEASED" })).toBe(true);
    expect(hasCampaign({ planetId: "b", name: "B", status: "DRAFT", campaignWaves: 0 })).toBe(false);
    expect(hasCampaign({ planetId: "b", name: "B", status: "DRAFT", campaignWaves: 50 })).toBe(true);
  });
});
