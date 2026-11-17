// Where a map goes on the 1920 x 1056 logical canvas: 20 x 11 tiles of 96 px (C3.1), drawn top-down (Gate M, LD1:
// moved from web/player/src/game/layout.ts so the level editor draws the same tiles). Pure functions of the map.
import { routeCells, type Heading } from "@scd/game-core";
import { MAP_ART, type ArtAsset } from "./art";

export const TILE_PX = 96;
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1056;

/** Pixel centre of a tile coordinate (tile centres are whole numbers; fractions are allowed). */
export function tileToPx(t: number): number {
  return TILE_PX / 2 + t * TILE_PX;
}

const STRAIGHT: Partial<Record<Heading, ArtAsset>> = { right: MAP_ART.routeH, down: MAP_ART.routeDown, up: MAP_ART.routeUp };
const CORNER: Partial<Record<`${Heading}-${Heading}`, ArtAsset>> = {
  "right-down": MAP_ART.cornerRightDown,
  "down-right": MAP_ART.cornerDownRight,
  "right-up": MAP_ART.cornerRightUp,
  "up-right": MAP_ART.cornerUpRight,
};

export interface RouteTile {
  readonly x: number;
  readonly y: number;
  readonly art: ArtAsset;
}

/**
 * One route tile per cell the polyline passes through: the portal end first, the colony end last, corners where
 * the direction changes. The art set has corners for right/up/down turns only; any other turn throws. game-core's
 * hard map rules (src/map/rules.ts) refuse such a route first, so a document that parses always draws.
 */
export function routeTiles(waypoints: readonly (readonly [number, number])[]): RouteTile[] {
  const cells = routeCells(waypoints);
  return cells.map((c, i) => {
    if (i === 0) return { x: c.x, y: c.y, art: MAP_ART.portalEnd };
    if (i === cells.length - 1) return { x: c.x, y: c.y, art: MAP_ART.colonyEnd };
    const before = cells[i - 1]?.heading ?? c.heading;
    if (before !== c.heading) {
      const art = CORNER[`${before}-${c.heading}`];
      if (art === undefined) throw new Error(`no route corner art for ${before} then ${c.heading}`);
      return { x: c.x, y: c.y, art };
    }
    const art = STRAIGHT[c.heading];
    if (art === undefined) throw new Error(`no straight route art going ${c.heading}`);
    return { x: c.x, y: c.y, art };
  });
}

/** Colony art by health (D10: worried at <= 50 %, very worried at <= 25 %). */
export function colonyArt(health: number, maxHealth: number): ArtAsset {
  if (health * 4 <= maxHealth) return MAP_ART.colonyVeryWorried;
  if (health * 2 <= maxHealth) return MAP_ART.colonyWorried;
  return MAP_ART.colonyHealthy;
}
