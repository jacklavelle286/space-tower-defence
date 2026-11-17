// Level files and templates (Gate M, LD3).
import { buildRoute, nearestProgress, UNITS_PER_TILE } from "@scd/game-core";
import { describe, expect, it } from "vitest";
import { levelFileDownload, levelProblems, newLevel, numberPadsInRouteOrder, readLevelFile, TEMPLATES } from "./levelFile";

describe("templates", () => {
  it.each(TEMPLATES.filter((t) => t.id !== "blank").map((t) => [t.id]))("%s starts with no hard or block problem", (id) => {
    const level = newLevel("try-it", "Try it", id);
    expect(levelProblems(level).filter((p) => p.severity !== "warn").map((p) => [p.rule, p.at])).toEqual([]);
  });

  it("blank starts empty, and says what is missing", () => {
    const level = newLevel("empty", "Empty", "blank");
    expect(level.map.route).toEqual([]);
    expect(level.map.pads).toEqual([]);
    expect(levelProblems(level).map((p) => p.rule)).toContain("padCount");
  });

  it("pads carry the level's ID and are numbered in route order", () => {
    const level = newLevel("zig", "Zig", "zigzag");
    expect(level.map.pads[0]?.id).toBe("zig-p01");
    const shuffled = { ...level, map: { ...level.map, pads: [...level.map.pads].reverse().map((p, i) => ({ ...p, id: `zig-p${String(i + 50)}` })) } };
    const renumbered = numberPadsInRouteOrder(shuffled).map.pads;
    expect(renumbered.map((p) => p.id)).toEqual(level.map.pads.map((p) => p.id));
    // The same cells in the same route order (pads level with each other may swap: ties go by ID).
    const progress = (p: { x: number; y: number }) => nearestProgress(buildRoute(level.map.route), p.x * UNITS_PER_TILE, p.y * UNITS_PER_TILE);
    expect(renumbered.map(progress)).toEqual(level.map.pads.map(progress));
  });
});

describe("level files", () => {
  it("a downloaded file uploads unchanged", () => {
    const level = newLevel("zig", "Zig", "zigzag");
    const file = levelFileDownload(level);
    expect(file.name).toBe("zig.level.json");
    expect(readLevelFile(file.text)).toEqual({ ok: true, level });
  });

  it.each<[string, string]>([
    ["not json", "{"],
    ["a planet document", JSON.stringify({ kind: "campaign" })],
    ["a bad ID", JSON.stringify({ ...newLevel("zig", "Zig", "zigzag"), levelId: "Zig!" })],
    ["a pad from another level", JSON.stringify({ ...newLevel("zig", "Zig", "zigzag"), levelId: "zag" })],
    ["a point off the map", JSON.stringify({ ...newLevel("zig", "Zig", "zigzag"), map: { ...newLevel("zig", "Zig", "zigzag").map, route: [[0, 5], [25, 5]] } })],
    ["an unknown decoration", JSON.stringify({ ...newLevel("zig", "Zig", "blank"), map: { ...newLevel("zig", "Zig", "blank").map, art: { backdrop: null, decorations: [{ art: "rock", x: 1, y: 1 }] } } })],
    ["an extra key", JSON.stringify({ ...newLevel("zig", "Zig", "zigzag"), extra: 1 })],
  ])("refuses %s", (_name, text) => {
    expect(readLevelFile(text).ok).toBe(false);
  });
});
