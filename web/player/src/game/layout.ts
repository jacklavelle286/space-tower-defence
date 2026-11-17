// Where things go on the 1920 x 1056 logical canvas: 20 x 11 tiles of 96 px (C3.1), drawn top-down.
// The map part (tile mapping, route tiles, colony mood) lives in @scd/shared/map since Gate M (LD1), so the level
// editor draws the same tiles; this module adds the simulation's unit mapping, which only the battlefield needs.
import { UNITS_PER_TILE } from "@scd/game-core";
import { TILE_PX } from "@scd/shared/map";

export { CANVAS_HEIGHT, CANVAS_WIDTH, colonyArt, routeTiles, TILE_PX, tileToPx, type RouteTile } from "@scd/shared/map";

/** Pixel position of a simulation coordinate in units (60,000 per tile). */
export function unitsToPx(u: number): number {
  return TILE_PX / 2 + (u * TILE_PX) / UNITS_PER_TILE;
}
