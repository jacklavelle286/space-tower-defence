// Where a map goes on the 1920 x 1056 logical canvas: 20 x 11 tiles of 96 px (C3.1), drawn top-down (Gate M, LD1:
// moved from web/player/src/game/layout.ts so the level editor draws the same tiles). Pure functions of the map.
import { routeCells, routeEnds, type Heading, type RouteEnds } from "@scd/game-core";
import { MAP_ART, ROUTE_ART, type ArtAsset } from "./art";

export const TILE_PX = 96;
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1056;

/** Pixel centre of a tile coordinate (tile centres are whole numbers; fractions are allowed). */
export function tileToPx(t: number): number {
  return TILE_PX / 2 + t * TILE_PX;
}

const STRAIGHT: Record<Heading, ArtAsset> = { right: MAP_ART.routeH, down: MAP_ART.routeDown, up: MAP_ART.routeUp, left: ROUTE_ART.routeLeft };
/** Every turn: the heading before it, then the heading after it (LD11 adds the four left turns). */
const CORNER: Partial<Record<`${Heading}-${Heading}`, ArtAsset>> = {
  "right-down": MAP_ART.cornerRightDown,
  "down-right": MAP_ART.cornerDownRight,
  "right-up": MAP_ART.cornerRightUp,
  "up-right": MAP_ART.cornerUpRight,
  "left-down": ROUTE_ART.cornerLeftDown,
  "down-left": ROUTE_ART.cornerDownLeft,
  "left-up": ROUTE_ART.cornerLeftUp,
  "up-left": ROUTE_ART.cornerUpLeft,
};
/** The start cap by the heading the route leaves the portal with (the edge it starts on is behind it). */
const PORTAL_CAP: Record<Heading, ArtAsset> = { right: MAP_ART.portalEnd, down: ROUTE_ART.portalEndDown, up: ROUTE_ART.portalEndUp, left: ROUTE_ART.portalEndLeft };
/** The end cap by the heading the route reaches the colony with. */
const COLONY_CAP: Record<Heading, ArtAsset> = { right: MAP_ART.colonyEnd, down: ROUTE_ART.colonyEndDown, up: ROUTE_ART.colonyEndUp, left: ROUTE_ART.colonyEndLeft };

export interface RouteTile {
  readonly x: number;
  readonly y: number;
  readonly art: ArtAsset;
}

/**
 * One route tile per cell the polyline passes through: the portal end first, the colony end last, corners where
 * the direction changes. Every heading and turn has art from LD11; only a reversal (which game-core's hard rules
 * refuse as a crossing) throws.
 */
export function routeTiles(waypoints: readonly (readonly [number, number])[]): RouteTile[] {
  const cells = routeCells(waypoints);
  return cells.map((c, i) => {
    if (i === 0) return { x: c.x, y: c.y, art: PORTAL_CAP[c.heading] };
    if (i === cells.length - 1) return { x: c.x, y: c.y, art: COLONY_CAP[c.heading] };
    const before = cells[i - 1]?.heading ?? c.heading;
    if (before !== c.heading) {
      const art = CORNER[`${before}-${c.heading}`];
      if (art === undefined) throw new Error(`no route corner art for ${before} then ${c.heading}`);
      return { x: c.x, y: c.y, art };
    }
    return { x: c.x, y: c.y, art: STRAIGHT[c.heading] };
  });
}

/** Where the portal, colony and leak puff are drawn for this route (game-core's routeEnds, which the footprint rule
 *  uses too), or null before the route has two cells. */
export function mapEnds(waypoints: readonly (readonly [number, number])[]): RouteEnds | null {
  return routeEnds(waypoints);
}

/** Colony art by health (D10: worried at <= 50 %, very worried at <= 25 %). */
export function colonyArt(health: number, maxHealth: number): ArtAsset {
  if (health * 4 <= maxHealth) return MAP_ART.colonyVeryWorried;
  if (health * 2 <= maxHealth) return MAP_ART.colonyWorried;
  return MAP_ART.colonyHealthy;
}
