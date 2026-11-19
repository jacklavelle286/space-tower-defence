// The map editor's reducer (Gate M, LD3): every edit the mouse or keyboard makes, and undo.
import { describe, expect, it } from "vitest";
import type { LevelFile } from "../api";
import { editorReducer, initialEditor, nextRoutePoint, type Action, type EditorState } from "./editorModel";
import { newLevel } from "./levelFile";

const blank = (): LevelFile => newLevel("lvl", "Level", "blank");
const run = (state: EditorState, ...actions: Action[]): EditorState => actions.reduce(editorReducer, state);
const at = (x: number, y: number): Action[] => [{ type: "cursor", cell: [x, y] }, { type: "place" }];

describe("route tool", () => {
  it("starts on an edge, snaps straight, turns either way, finishes on an edge", () => {
    let s = initialEditor(blank());
    s = run(s, ...at(3, 5));
    expect(s.refusal).toBe("Start the route on an edge of the map.");
    s = run(s, ...at(0, 5), ...at(6, 6)); // (6, 6) snaps to (6, 5): the bigger move wins
    expect(s.level.map.route).toEqual([
      [0, 5],
      [6, 5],
    ]);
    s = run(s, ...at(6, 2), ...at(2, 2)); // a left turn (LD11)
    expect(s.level.map.route.at(-1)).toEqual([2, 2]);
    s = run(s, { type: "back" }, ...at(19, 2));
    expect(s.level.map.route).toEqual([
      [0, 5],
      [6, 5],
      [6, 2],
      [19, 2],
    ]);
    s = run(s, ...at(19, 8));
    expect(s.refusal).toMatch(/already reaches the colony/);
  });

  it("continuing in the same direction moves the last point instead of adding one", () => {
    const s = run(initialEditor(blank()), ...at(0, 5), ...at(4, 5), ...at(9, 5));
    expect(s.level.map.route).toEqual([
      [0, 5],
      [9, 5],
    ]);
  });

  it("refuses a crossing and going back over the route", () => {
    const route: [number, number][] = [
      [0, 5],
      [4, 5],
      [4, 1],
      [8, 1],
      [8, 8],
    ];
    expect(nextRoutePoint(route, [8, 3])).toEqual({ refusal: "The route cannot cross itself." });
    expect(nextRoutePoint([[0, 5], [4, 5], [4, 9], [8, 9], [8, 2]], [8, 5])).toEqual({ refusal: "The route cannot cross itself." });
  });

  it("routes in any direction (LD11, ANY_DIRECTION_ROUTES): any edge, either turn, any edge out", () => {
    expect(nextRoutePoint([], [5, 5], false)).toEqual({ refusal: "Start the route on the left edge." }); // tier 1
    expect(nextRoutePoint([], [7, 0], true)).toEqual({ point: [7, 0] });
    expect(nextRoutePoint([], [5, 5], true)).toEqual({ refusal: "Start the route on an edge of the map." });
    expect(nextRoutePoint([[7, 0]], [12, 0], true)).toEqual({ refusal: "Leave the portal heading into the map." });
    expect(nextRoutePoint([[7, 0]], [7, 6], true)).toEqual({ point: [7, 6] });
    expect(nextRoutePoint([[7, 0], [7, 6]], [2, 6], true)).toEqual({ point: [2, 6] }); // a left turn
    expect(nextRoutePoint([[7, 0], [7, 6]], [2, 6], false)).toEqual({ refusal: "Turns left: no route art for that yet." });
    expect(nextRoutePoint([[7, 0], [7, 6], [2, 6], [2, 10]], [5, 10], true)).toEqual({
      refusal: "The route already reaches the colony. Backspace takes the last point back.",
    });
    expect(nextRoutePoint([[7, 0], [7, 6], [0, 6]], [0, 9], true)).toEqual({
      refusal: "The route already reaches the colony. Backspace takes the last point back.",
    });
    // Running along an edge is not leaving by it: the route goes on.
    expect(nextRoutePoint([[0, 0], [0, 6]], [5, 6], true)).toEqual({ point: [5, 6] });
  });

  it("refuses the 17th waypoint as it is clicked, and still lets a straight click move the 16th", () => {
    // A staircase down from the top edge: 16 points, 14 turns, not yet off an edge.
    const route: [number, number][] = [[1, 0]];
    for (let i = 1; i < 16; i += 1) {
      const [x, y] = route[i - 1] as [number, number];
      route.push(i % 2 === 1 ? [x, y + 1] : [x + 1, y]);
    }
    expect(route).toHaveLength(16);
    const last = route[15] as [number, number];
    expect(nextRoutePoint(route, [last[0] + 3, last[1]], true)).toEqual({
      refusal: "A route has at most 16 waypoints (the start, the end and 14 turns). Aim for 9 turns or fewer.",
    });
    expect(nextRoutePoint(route, [last[0], last[1] + 2], true)).toEqual({ point: [last[0], last[1] + 2] }); // y 8 to the bottom row
  });

  it("puts a generated map in as one edit that Ctrl+Z takes back (LD14)", () => {
    const start = initialEditor(blank());
    const map = { route: [[0, 5], [19, 5]] as [number, number][], pads: [{ id: "p01", x: 3, y: 4, opensAfterWave: 0 }], decorations: [{ art: "deco-rock-1", x: 2, y: 9 }] };
    const after = editorReducer(start, { type: "generated", map });
    expect(after.level.map.route).toEqual([[0, 5], [19, 5]]);
    expect(after.level.map.pads).toEqual([{ id: "lvl-p01", x: 3, y: 4, opensAfterWave: 0 }]);
    expect(after.level.map.art.decorations).toEqual([{ art: "deco-rock-1", x: 2, y: 9 }]);
    expect(after.level.map.art.backdrop).toBe(start.level.map.art.backdrop);
    expect(editorReducer(after, { type: "undo" }).level).toEqual(start.level);
  });

  it("Backspace takes the last point back; a route over a pad removes the pad", () => {
    let s = run(initialEditor(blank()), ...at(0, 5), ...at(10, 5), { type: "tool", tool: "pads" }, ...at(15, 5));
    expect(s.level.map.pads.map((p) => [p.x, p.y])).toEqual([[15, 5]]);
    s = run(s, { type: "tool", tool: "route" }, ...at(19, 5));
    expect(s.level.map.pads).toEqual([]);
    s = run(s, { type: "back" });
    expect(s.level.map.route).toEqual([[0, 5]]);
  });
});

describe("pads and decorations", () => {
  it("adds and removes pads, never on the route, numbered in route order", () => {
    let s = run(initialEditor(blank()), ...at(0, 5), ...at(19, 5), { type: "tool", tool: "pads" });
    s = run(s, ...at(15, 3), ...at(3, 3), ...at(9, 5));
    expect(s.refusal).toBe("A pad cannot sit on the route.");
    expect(s.level.map.pads.map((p) => [p.id, p.x])).toEqual([
      ["lvl-p01", 3],
      ["lvl-p02", 15],
    ]);
    s = run(s, ...at(3, 3));
    expect(s.level.map.pads.map((p) => [p.id, p.x])).toEqual([["lvl-p01", 15]]);
    s = run(s, { type: "opens", padId: "lvl-p01", wave: 10 });
    expect(s.level.map.pads[0]?.opensAfterWave).toBe(10);
  });

  it("places the chosen decoration and keeps it off pads and the route", () => {
    let s = run(initialEditor(blank()), ...at(0, 5), ...at(19, 5), { type: "decoration", art: "deco-crater-2" });
    s = run(s, ...at(2, 9), ...at(4, 5));
    expect(s.refusal).toBe("Decorations stay off the route.");
    expect(s.level.map.art.decorations).toEqual([{ art: "deco-crater-2", x: 2, y: 9 }]);
    s = run(s, { type: "tool", tool: "pads" }, ...at(2, 9));
    expect(s.refusal).toBe("A decoration is there.");
  });
});

describe("history", () => {
  it("undo and redo cover every edit; the cursor and the tool are not edits", () => {
    let s = run(initialEditor(blank()), ...at(0, 5), ...at(19, 5), { type: "backdrop", backdrop: "lib-0123456789abcdef0123456789abcdef" });
    expect(s.past).toHaveLength(3);
    s = run(s, { type: "move", dx: 1, dy: 0 }, { type: "tool", tool: "pads" });
    expect(s.past).toHaveLength(3);
    s = run(s, { type: "undo" }, { type: "undo" });
    expect(s.level.map.route).toEqual([[0, 5]]);
    expect(s.level.map.art.backdrop).toBeNull();
    s = run(s, { type: "redo" });
    expect(s.level.map.route).toHaveLength(2);
    s = run(s, ...at(2, 2)); // pads tool: a new edit clears what could be redone
    expect(s.future).toEqual([]);
  });

  it("the cursor stays on the map", () => {
    const s = run(initialEditor(blank()), { type: "cursor", cell: [0, 0] }, { type: "move", dx: -1, dy: -1 });
    expect(s.cursor).toEqual([0, 0]);
  });
});

describe("challenge presets follow the map", () => {
  const challenge = (padsOpenAsForWave: number, padIds: string[]) => ({
    mode: "CHALLENGE" as const,
    name: "Meteor Mite Surprise",
    mapId: "lvl",
    waves: [14, 15],
    meteorAfter: [],
    startCredits: 200,
    colonyHealth: 20,
    classes: ["nova"],
    padsOpenAsForWave,
    presetPlacements: padIds.map((padId) => ({ padId, classId: "nova", level: 1, targeting: "FRONT" as const })),
  });
  const withChallenge = (): LevelFile => ({
    ...blank(),
    map: {
      ...blank().map,
      route: [
        [0, 5],
        [19, 5],
      ],
      pads: [
        { id: "lvl-p01", x: 3, y: 4, opensAfterWave: 0 },
        { id: "lvl-p02", x: 8, y: 4, opensAfterWave: 0 },
      ],
    },
    waveSets: { "lvl-c1": challenge(14, ["lvl-p01", "lvl-p02"]) },
  });

  it("a generated map takes off astronauts whose pad is gone or opens after the challenge starts, and says so", () => {
    const start = initialEditor(withChallenge());
    expect(start.refusal).toBeNull();
    // The new map keeps a pad on (3, 4), opening after wave 0; the pad on (8, 4) is gone; (12, 6) opens after wave 14.
    const map = {
      route: [[0, 5], [19, 5]] as [number, number][],
      pads: [
        { id: "p01", x: 3, y: 4, opensAfterWave: 0 },
        { id: "p02", x: 12, y: 6, opensAfterWave: 14 },
      ],
      decorations: [],
    };
    const after = editorReducer(start, { type: "generated", map });
    expect(after.level.waveSets["lvl-c1"]?.presetPlacements.map((p) => p.padId)).toEqual(["lvl-p01"]);
    expect(after.refusal).toMatch(/^1 astronaut was taken off challenge pads that are gone or not open yet: Meteor Mite Surprise \(1\)\./u);
    expect(editorReducer(after, { type: "undo" }).level).toEqual(start.level);
  });

  it("an astronaut moves with its pad when the pad is renumbered, and goes when its pad opens too late", () => {
    let s = initialEditor(withChallenge());
    s = run(s, { type: "tool", tool: "pads" }, ...at(1, 4)); // a pad before the others on the route: they renumber
    expect(s.level.map.pads.map((p) => p.id)).toEqual(["lvl-p01", "lvl-p02", "lvl-p03"]);
    expect(s.level.waveSets["lvl-c1"]?.presetPlacements.map((p) => p.padId)).toEqual(["lvl-p02", "lvl-p03"]);
    expect(s.refusal).toBeNull();
    s = run(s, { type: "opens", padId: "lvl-p03", wave: 14 });
    expect(s.level.waveSets["lvl-c1"]?.presetPlacements.map((p) => p.padId)).toEqual(["lvl-p02"]);
    expect(s.refusal).toMatch(/Make it all again/u);
  });

  it("a draft saved with an astronaut on a pad that is not open yet is fitted when it opens", () => {
    const broken = withChallenge();
    broken.map.pads[1] = { id: "lvl-p02", x: 8, y: 4, opensAfterWave: 20 };
    const s = initialEditor(broken);
    expect(s.level.waveSets["lvl-c1"]?.presetPlacements.map((p) => p.padId)).toEqual(["lvl-p01"]);
    expect(s.refusal).toMatch(/Meteor Mite Surprise \(1\)/u);
    const clean = withChallenge();
    expect(initialEditor(clean).level).toBe(clean); // nothing to fit: the same level, so not unsaved
  });
});
