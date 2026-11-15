// Battlefield layout (Phase 14): route tiles for the Moonbeam route, pixel mapping, colony mood.
import { UNITS_PER_TILE } from "@scd/game-core";
import { describe, expect, it } from "vitest";
import { ART } from "./assets";
import { colonyArt, routeTiles, tileToPx, unitsToPx } from "./layout";

const LUNA: [number, number][] = [[0, 2], [4, 2], [4, 8], [8, 8], [8, 3], [12, 3], [12, 8], [16, 8], [16, 3], [19, 3]];

describe("layout", () => {
  it("puts tile centres on the 96 px grid and maps units the same way", () => {
    expect([tileToPx(0), tileToPx(19), tileToPx(10)]).toEqual([48, 1872, 1008]);
    expect(unitsToPx(19 * UNITS_PER_TILE)).toBe(1872);
    expect(unitsToPx(UNITS_PER_TILE / 2)).toBe(96);
  });

  it("lays one tile per route cell: portal end, straights, the eight corners, colony end", () => {
    const tiles = routeTiles(LUNA);
    expect(tiles).toHaveLength(41); // 40 tiles of route plus the gate cell
    expect(tiles[0]).toEqual({ x: 0, y: 2, art: ART.portalEnd });
    expect(tiles.at(-1)).toEqual({ x: 19, y: 3, art: ART.colonyEnd });
    const corners = tiles.filter((t) => t.art.id.startsWith("route-corner")).map((t) => [t.x, t.y, t.art.id]);
    expect(corners).toEqual([
      [4, 2, "route-corner-right-down"],
      [4, 8, "route-corner-down-right"],
      [8, 8, "route-corner-right-up"],
      [8, 3, "route-corner-up-right"],
      [12, 3, "route-corner-right-down"],
      [12, 8, "route-corner-down-right"],
      [16, 8, "route-corner-right-up"],
      [16, 3, "route-corner-up-right"],
    ]);
    expect(tiles.find((t) => t.x === 8 && t.y === 5)?.art).toBe(ART.routeUp);
    expect(tiles.find((t) => t.x === 4 && t.y === 5)?.art).toBe(ART.routeDown);
  });

  it("refuses a turn it has no art for", () => {
    expect(() => routeTiles([[5, 5], [5, 2], [2, 2]])).toThrow(/no route corner art/);
  });

  it("shows a worried colony at half health and very worried at a quarter (D10)", () => {
    expect([20, 11, 10, 6, 5, 0].map((h) => colonyArt(h, 20).id)).toEqual([
      "colony-healthy",
      "colony-healthy",
      "colony-worried",
      "colony-worried",
      "colony-very-worried",
      "colony-very-worried",
    ]);
  });
});
