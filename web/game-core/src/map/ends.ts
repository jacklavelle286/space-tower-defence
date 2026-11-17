// Where a route's two ends are drawn (Gate M, LD11; scope-level-designer.md §3.3): the portal on the edge the route
// starts from, the colony over the last stretch of route, and the leak puff by the colony gate, for a route that starts
// and ends on any edge. The design rules keep pads and other route off the cells the portal and colony pictures cover
// (rules.ts `footprint`), and the battlefield draws them at these points (web/shared/src/map/layout.ts), so the two can
// never disagree.
//
// Pixels on the 1920 x 1056 battlefield (20 x 11 tiles of 96 px), whole numbers, so a route heading right draws
// exactly where it always has (the colony 72 px back along the route and 46 px to its left, the portal on the edge,
// the leak 24 px before the gate). Every other heading is that layout turned with the route; the colony is then
// pushed back inside the canvas when a turned layout would hang over an edge (a route ending in a corner).
import { GRID_COLS, GRID_ROWS } from "./grid.ts";
import { routeCells, type Heading } from "./geometry.ts";

export const TILE_PX = 96;
/** The colony picture's drawn size (BattleScene COLONY_PX): the map's last column leaves room for about 240 px. */
export const COLONY_PX = 240;
const CANVAS_W = GRID_COLS * TILE_PX;
const CANVAS_H = GRID_ROWS * TILE_PX;
/** The colony's centre from the gate tile's centre, along the route (back) and across it (to the route's left). */
const COLONY_BACK = 72;
const COLONY_LEFT = 46;
const LEAK_BACK = 24;

export interface PxPoint {
  readonly x: number;
  readonly y: number;
}

export interface RouteEnds {
  /** The heading the route leaves the portal with, and reaches the colony with. */
  readonly startHeading: Heading;
  readonly endHeading: Heading;
  /** The portal pool's ground point: the middle of the start tile's outer edge. */
  readonly portal: PxPoint;
  /** The colony picture's centre (it is COLONY_PX square); its feet are COLONY_PX / 2 below. */
  readonly colony: PxPoint;
  /** Where a leaking alien's puff plays: just before the gate. */
  readonly leak: PxPoint;
  /** The tiles the portal and colony pictures cover (inside the grid), for the footprint rule. */
  readonly portalCells: readonly (readonly [number, number])[];
  readonly colonyCells: readonly (readonly [number, number])[];
}

const UNIT: Record<Heading, readonly [number, number]> = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };
/** The direction to the route's left when facing `heading`, on screen (y down): right → up. */
const LEFT_OF = (heading: Heading): readonly [number, number] => {
  const [ux, uy] = UNIT[heading];
  return [uy, -ux];
};

export const tileCentrePx = (t: number): number => TILE_PX / 2 + t * TILE_PX;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const inGrid = ([x, y]: readonly [number, number]): boolean => x >= 0 && y >= 0 && x < GRID_COLS && y < GRID_ROWS;

/** The ends of a route of at least two cells, or null for a shorter one (nothing to draw yet). */
export function routeEnds(waypoints: readonly (readonly [number, number])[]): RouteEnds | null {
  const cells = routeCells(waypoints);
  const start = cells[0];
  const end = cells[cells.length - 1];
  if (start === undefined || end === undefined || cells.length < 2) return null;
  const [sx, sy] = UNIT[start.heading];
  const [ex, ey] = UNIT[end.heading];
  const [lx, ly] = LEFT_OF(end.heading);
  const gate = { x: tileCentrePx(end.x), y: tileCentrePx(end.y) };
  const half = COLONY_PX / 2;
  const colony = {
    x: clamp(gate.x - COLONY_BACK * ex + COLONY_LEFT * lx, half, CANVAS_W - half),
    y: clamp(gate.y - COLONY_BACK * ey + COLONY_LEFT * ly, half, CANVAS_H - half),
  };
  const colonyCells: [number, number][] = [];
  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLS; x += 1) {
      if (Math.abs(tileCentrePx(x) - colony.x) <= half && Math.abs(tileCentrePx(y) - colony.y) <= half) colonyCells.push([x, y]);
    }
  }
  // The portal pool covers its tile, the tile beyond the edge (off the grid) and one either side.
  const [px, py] = LEFT_OF(start.heading);
  const portalCells: [number, number][] = [];
  for (const back of [-1, 0]) {
    for (const side of [-1, 0, 1]) {
      const cell: [number, number] = [start.x + back * sx + side * px, start.y + back * sy + side * py];
      if (inGrid(cell)) portalCells.push(cell);
    }
  }
  return {
    startHeading: start.heading,
    endHeading: end.heading,
    portal: { x: tileCentrePx(start.x) - (TILE_PX / 2) * sx, y: tileCentrePx(start.y) - (TILE_PX / 2) * sy },
    colony,
    leak: { x: gate.x - LEAK_BACK * ex, y: gate.y - LEAK_BACK * ey },
    portalCells,
    colonyCells,
  };
}
