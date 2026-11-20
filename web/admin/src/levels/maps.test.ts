// Maps (Gate M, LD22; ADR-0043): a new map is its own planet with its 50-wave adventure; an older Moon level becomes a
// map by moving (a draft) or by a copy (published).
import { beforeEach, describe, expect, it } from "vitest";
import { FakeAdminApi } from "../testing/fakeApi";
import { hasAdventure, newLevel, resetLiveBase } from "./levelFile";
import { homeText } from "./MapList";
import { createMap, emptyPlanet, freeId, makeOwnMap, MAP_ID } from "./maps";

let fake: FakeAdminApi;
beforeEach(() => {
  fake = new FakeAdminApi();
  resetLiveBase();
});

describe("map helpers", () => {
  it("finds a free map ID: a letter first, at most 34, numbered when taken", () => {
    expect(freeId("Lava Meltdown", new Set())).toBe("lava-meltdown");
    expect(freeId("Lava Meltdown", new Set(["lava-meltdown", "lava-meltdown-2"]))).toBe("lava-meltdown-3");
    expect(freeId("3 Moons!", new Set())).toBe("moons");
    expect(MAP_ID.test(freeId("x".repeat(60), new Set(["x".repeat(31)])))).toBe(true);
    expect(MAP_ID.test("a".repeat(35))).toBe(false);
  });

  it("says where a map is for children", () => {
    expect(homeText({ planetId: "a", name: "A", status: "RELEASED" })).toBe("On Home");
    expect(homeText({ planetId: "a", name: "A", status: "DRAFT", latestVersion: "a-a1" })).toBe("Testers only");
    expect(homeText({ planetId: "a", name: "A", status: "DRAFT" })).toBe("Not yet");
    expect(emptyPlanet({ planetId: "a", name: "A", status: "DRAFT" }, new Set())).toBe(true);
    expect(emptyPlanet({ planetId: "a", name: "A", status: "DRAFT" }, new Set(["a"]))).toBe(false);
  });
});

describe("createMap", () => {
  it("makes the map's planet and its level, which gets the Moon's 50 waves when it has none", async () => {
    await createMap(fake.api, newLevel("ice-world", "Ice World", "moonbeam"));
    expect(fake.planets.get("ice-world")).toMatchObject({ name: "Ice World", status: "DRAFT", artSet: "moon", icon: null });
    const stored = fake.levels.get("ice-world");
    expect(stored?.planetId).toBe("ice-world");
    expect(stored !== undefined && hasAdventure(stored.level)).toBe(true);
    expect(stored?.level.waves).toHaveLength(50);
  });
});

describe("makeOwnMap", () => {
  it("moves a draft off the Moon and gives it the Moon's waves when it has none", async () => {
    await fake.api.createLevel(newLevel("ice-planet", "Ice Planet", "moonbeam"));
    const item = (await fake.api.listLevels()).items[0];
    if (item === undefined) throw new Error("no level");
    expect(await makeOwnMap(fake.api, item, "ice-planet")).toBe("ice-planet");
    expect(fake.levels.get("ice-planet")?.planetId).toBe("ice-planet");
    expect(fake.levels.get("ice-planet")?.level.waves).toHaveLength(50);
    expect(fake.planets.has("ice-planet")).toBe(true);
  });

  it("copies a published level into a new map, leaving the original on the Moon", async () => {
    await fake.api.createLevel(newLevel("fire-planet", "Fire Planet", "moonbeam-campaign"));
    const stored = fake.levels.get("fire-planet");
    if (stored === undefined) throw new Error("no level");
    stored.versions = [{ campaignVersion: "luna-1-a2", publishedAt: "2026-11-19T10:00:00Z", draftRevision: 0, sourceVersion: "luna-1-a1", by: "op" }];
    const item = (await fake.api.listLevels()).items.find((i) => i.levelId === "fire-planet");
    if (item === undefined) throw new Error("no summary");
    const published = { ...item, status: "PUBLISHED" as const };
    expect(await makeOwnMap(fake.api, published, "fire-planet-2")).toBe("fire-planet-2");
    expect(fake.levels.get("fire-planet")?.planetId).toBe("luna-1");
    const copy = fake.levels.get("fire-planet-2");
    expect(copy?.planetId).toBe("fire-planet-2");
    expect(copy?.level.map.pads.every((p) => p.id.startsWith("fire-planet-2-p"))).toBe(true);
    expect(fake.planets.get("fire-planet-2")?.name).toBe("Fire Planet");
  });
});
