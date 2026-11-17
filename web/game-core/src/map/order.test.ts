// Pad order and arrow-key reach (Gate M, LD1; D5.1, D5.2). The player's keyboard tests (web/player/src/hud/padNav.test.ts)
// still cover route order and the arrow cone through the re-export; these cover what the design rules add.
import { describe, expect, it } from "vitest";
import { buildRoute, UNITS_PER_TILE } from "../sim/route";
import { padOrder, padsUnreachableByArrows, type MapGeometry } from ".";

const geometry = (route: [number, number][], pads: [number, number][]): MapGeometry => ({
  route: buildRoute(route),
  pads: pads.map(([x, y], i) => ({ id: `p${i + 1}`, x, y, cx: x * UNITS_PER_TILE, cy: y * UNITS_PER_TILE })),
});

describe("padsUnreachableByArrows", () => {
  it("is empty when every pad can be reached", () => {
    expect(padsUnreachableByArrows(geometry([[0, 0], [19, 0]], [[2, 2], [5, 2], [8, 2], [8, 5]]))).toEqual([]);
  });

  it("names a pad that every arrow passes by for a nearer one", () => {
    // Found by a seeded search: from each other pad, some nearer pad sits in (8, 8)'s cone.
    expect(padsUnreachableByArrows(geometry([[0, 0], [19, 0]], [[2, 4], [6, 2], [2, 6], [6, 0], [8, 8]]))).toEqual(["p5"]);
  });
});

describe("padOrder", () => {
  it("orders pads by the route point nearest each", () => {
    expect(padOrder(geometry([[0, 2], [10, 2], [10, 8], [19, 8]], [[13, 6], [3, 4], [8, 6]]))).toEqual(["p2", "p3", "p1"]);
  });
});
