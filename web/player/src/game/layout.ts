// Where things go on the 1920 x 1056 logical canvas: 20 x 11 tiles of 96 px (C3.1), drawn top-down.
// Pure functions of the planet document and the battle state, so they can be tested without Phaser.
import { UNITS_PER_TILE } from "@scd/game-core";
import { ART, type ArtAsset } from "./assets";

export const TILE_PX = 96;
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1056;

/** Pixel centre of a tile coordinate (tile centres are whole numbers; fractions are allowed). */
export function tileToPx(t: number): number {
  return TILE_PX / 2 + t * TILE_PX;
}

/** Pixel position of a simulation coordinate in units (60,000 per tile). */
export function unitsToPx(u: number): number {
  return TILE_PX / 2 + (u * TILE_PX) / UNITS_PER_TILE;
}

type Dir = "right" | "left" | "down" | "up";

function dirOf(dx: number, dy: number): Dir {
  if (dx > 0) return "right";
  if (dx < 0) return "left";
  return dy > 0 ? "down" : "up";
}

const STRAIGHT: Partial<Record<Dir, ArtAsset>> = { right: ART.routeH, down: ART.routeDown, up: ART.routeUp };
const CORNER: Partial<Record<`${Dir}-${Dir}`, ArtAsset>> = {
  "right-down": ART.cornerRightDown,
  "down-right": ART.cornerDownRight,
  "right-up": ART.cornerRightUp,
  "up-right": ART.cornerUpRight,
};

export interface RouteTile {
  readonly x: number;
  readonly y: number;
  readonly art: ArtAsset;
}

/**
 * One route tile per cell the polyline passes through: the portal end first, the colony end last, corners where
 * the direction changes. The art set has corners for right/up/down turns only (the Moonbeam route needs no more);
 * any other turn throws, so a new map that needs a new tile is noticed at once.
 */
export function routeTiles(waypoints: readonly (readonly [number, number])[]): RouteTile[] {
  const cells: { x: number; y: number; dir: Dir }[] = [];
  for (let i = 0; i + 1 < waypoints.length; i += 1) {
    const [ax, ay] = waypoints[i] ?? [0, 0];
    const [bx, by] = waypoints[i + 1] ?? [0, 0];
    const dir = dirOf(bx - ax, by - ay);
    const sx = Math.sign(bx - ax);
    const sy = Math.sign(by - ay);
    for (let x = ax, y = ay; x !== bx || y !== by; x += sx, y += sy) cells.push({ x, y, dir });
  }
  const last = waypoints[waypoints.length - 1];
  if (last === undefined || cells.length === 0) return [];
  return [...cells.map((c, i) => {
    if (i === 0) return { x: c.x, y: c.y, art: ART.portalEnd };
    const before = cells[i - 1]?.dir ?? c.dir;
    if (before !== c.dir) {
      const art = CORNER[`${before}-${c.dir}`];
      if (art === undefined) throw new Error(`no route corner art for ${before} then ${c.dir}`);
      return { x: c.x, y: c.y, art };
    }
    const art = STRAIGHT[c.dir];
    if (art === undefined) throw new Error(`no straight route art going ${c.dir}`);
    return { x: c.x, y: c.y, art };
  }), { x: last[0], y: last[1], art: ART.colonyEnd }];
}

/** Colony art by health (D10: worried at <= 50 %, very worried at <= 25 %). */
export function colonyArt(health: number, maxHealth: number): ArtAsset {
  if (health * 4 <= maxHealth) return ART.colonyVeryWorried;
  if (health * 2 <= maxHealth) return ART.colonyWorried;
  return ART.colonyHealthy;
}
