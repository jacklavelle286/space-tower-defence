// Battlefield layout (Phase 14): route tiles for the Moonbeam route, pixel mapping, colony mood.
import { UNITS_PER_TILE } from "@scd/game-core";
import { describe, expect, it } from "vitest";
import { ART } from "./assets";
import { ROUTE_ART } from "@scd/shared/map";
import FIXTURES from "../../../game-core/src/map/fixtures-any-direction.json";
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

  it("has a tile for all twelve cases and a cap for each of the four headings at both ends (LD11)", () => {
    const tiles = Object.values(FIXTURES.routes).flatMap((route) => routeTiles(route as [number, number][]));
    const ids = new Set(tiles.map((t) => t.art.id));
    const straights = ["route-straight-h", "route-straight-l", "route-straight-v", "route-straight-up"];
    const corners = ["right-down", "down-right", "right-up", "up-right", "left-down", "down-left", "left-up", "up-left"].map((c) => `route-corner-${c}`);
    const caps = ["", "-down", "-up", "-left"].flatMap((h) => [`route-portal-end${h}`, `route-colony-end${h}`]);
    for (const id of [...straights, ...corners, ...caps]) expect(ids, id).toContain(id);
    // Every LD11 tile is in the shared table the scene and the editor load from.
    for (const art of Object.values(ROUTE_ART)) expect(ids).toContain(art.id);
  });

  it("picks each piece by the route's own headings", () => {
    const tiles = routeTiles([[19, 2], [13, 2], [13, 8], [7, 8], [7, 3], [2, 3], [2, 10]]);
    expect(tiles[0]?.art).toBe(ROUTE_ART.portalEndLeft);
    expect(tiles.find((t) => t.x === 16 && t.y === 2)?.art).toBe(ROUTE_ART.routeLeft);
    expect(tiles.find((t) => t.x === 13 && t.y === 2)?.art).toBe(ROUTE_ART.cornerLeftDown);
    expect(tiles.find((t) => t.x === 13 && t.y === 8)?.art).toBe(ROUTE_ART.cornerDownLeft);
    expect(tiles.find((t) => t.x === 7 && t.y === 8)?.art).toBe(ROUTE_ART.cornerLeftUp);
    expect(tiles.find((t) => t.x === 7 && t.y === 3)?.art).toBe(ROUTE_ART.cornerUpLeft);
    expect(tiles.at(-1)?.art).toBe(ROUTE_ART.colonyEndDown);
  });

  it("refuses a reversal (game-core's hard rules refuse it first, as a crossing)", () => {
    expect(() => routeTiles([[5, 5], [8, 5], [2, 5]])).toThrow(/no route corner art/);
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
