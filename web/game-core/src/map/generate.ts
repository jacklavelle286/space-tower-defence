// The map generator (Gate M, LD14; owner 2026-11-18: "auto create a map with route, pads, decorations etc which fits
// the specs, as it's quite hard to design"). Pure and seeded: the same options always make the same map.
//
// It makes maps by trial and keeps the best one that meets the design rules (rules.ts mapProblems, the same rules that
// block publishing): no hard or blocking problem, and the fewest warnings.
//
//   Route        a walk of straight stretches from one edge to another with the asked number of turns, then the last
//                stretch runs straight off an edge. Walks that cross or touch themselves are dropped as they are made;
//                the rest are checked with routeDesignProblems and scored by warnings, by how far the length is from
//                40 tiles (the rules ask for 36 to 44) and by how much of the battlefield is far from the route.
//   Pads         chosen one by one from the cells within two tiles of the route (off the portal and colony), each pick
//                the cell that reaches the most route, counting route no pad reaches yet half again, with a little
//                chance so "Another one" differs; pads stay two tiles apart. The two best corner pads (three
//                stretches in reach) go first. The pads that reach most open at the start (up to 8, leaving five);
//                the rest open after waves 5, 10, 15, 20 and 25 in turn. Numbered in route order.
//   Decorations  from the given pictures, on cells the decoration rule allows, two tiles apart.
//
// Waves are not made here: the Waves tab's curve tools (LD13) do that.
import type { MapDecoration, Pad, PlanetMap } from "../data/game-data.ts";
import { nextRandom } from "../sim/rng.ts";
import { padReach } from "./coverage.ts";
import { routeEnds } from "./ends.ts";
import { mapGeometry, routeCells, type Heading } from "./geometry.ts";
import { GRID_COLS, GRID_ROWS } from "./grid.ts";
import { padOrder } from "./order.ts";
import { ANY_DIRECTION_ROUTES, mapProblems, PAD_OPEN_WAVES, routeDesignProblems, type PlanetProblem } from "./rules.ts";

export type MapEdge = "left" | "right" | "top" | "bottom";
export type Twist = "gentle" | "medium" | "twisty";

/** How much a generated route turns. The rules warn above 9 turns. */
export const TWISTS: Readonly<Record<Twist, { readonly label: string; readonly turns: readonly [number, number] }>> = {
  gentle: { label: "Gentle (4 or 5 turns)", turns: [4, 5] },
  medium: { label: "Medium (6 or 7 turns)", turns: [6, 7] },
  twisty: { label: "Twisty (8 or 9 turns)", turns: [8, 9] },
};

export interface GenerateMapOptions {
  readonly seed: number;
  readonly twist?: Twist;
  /** The edge the route starts on (the portal), or any. Tier 1 rules (no ANY_DIRECTION_ROUTES) always use left. */
  readonly from?: MapEdge | "any";
  /** The edge the route leaves by (the colony), or any. Tier 1 rules always use right. */
  readonly to?: MapEdge | "any";
  /** 12 to 16. */
  readonly pads?: number;
  /** The decoration pictures to choose from (repo decorations or library picture IDs); none places none. */
  readonly decorations?: readonly string[];
  readonly decorationCount?: number;
  /** Keep this route and make only the pads and decorations. */
  readonly route?: readonly (readonly [number, number])[];
  readonly anyDirection?: boolean;
}

export interface GeneratedMap {
  readonly route: [number, number][];
  /** IDs p01, p02, ... in route order: the editor renames them for its level. */
  readonly pads: Pad[];
  readonly decorations: MapDecoration[];
  /** The warnings left (a generated map never has a hard or blocking problem). */
  readonly problems: PlanetProblem[];
}

export type GenerateResult = { readonly map: GeneratedMap } | { readonly reason: string };

const EDGES: readonly MapEdge[] = ["left", "right", "top", "bottom"];
const STEP: Readonly<Record<Heading, readonly [number, number]>> = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };
const INWARD: Readonly<Record<MapEdge, Heading>> = { left: "right", right: "left", top: "down", bottom: "up" };
const SIDES: Readonly<Record<Heading, readonly [Heading, Heading]>> = {
  right: ["up", "down"],
  left: ["down", "up"],
  down: ["right", "left"],
  up: ["left", "right"],
};
const ROUTE_TRIES = 20_000;
const GOOD_ROUTES = 12;
const ENOUGH_TRIES = 3_000;
const PAD_TRIES = 24;
const REACH_TILES = 2.5; // the rules' reach (padProblems)
const MAX_START_PADS = 8;
const START_REACH = 5.5; // the rules' startPadReach

class Rng {
  #state: number;
  constructor(seed: number) {
    this.#state = seed >>> 0;
  }
  /** A number in [0, 1). */
  next(): number {
    const r = nextRandom(this.#state);
    this.#state = r.state;
    return r.value / 2 ** 32;
  }
  /** An integer in [lo, hi]. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)] as T;
  }
}

const key = (x: number, y: number): string => `${x},${y}`;
const cheb = (ax: number, ay: number, bx: number, by: number): number => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const inGrid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < GRID_COLS && y < GRID_ROWS;

/** Steps from (x, y) to the edge `heading` runs into. */
function toEdge(x: number, y: number, heading: Heading): number {
  return heading === "right" ? GRID_COLS - 1 - x : heading === "left" ? x : heading === "down" ? GRID_ROWS - 1 - y : y;
}

function startCell(rng: Rng, edge: MapEdge): [number, number] {
  if (edge === "left") return [0, rng.int(2, GRID_ROWS - 3)];
  if (edge === "right") return [GRID_COLS - 1, rng.int(2, GRID_ROWS - 3)];
  if (edge === "top") return [rng.int(2, GRID_COLS - 3), 0];
  return [rng.int(2, GRID_COLS - 3), GRID_ROWS - 1];
}

const LEAVES: Readonly<Record<Heading, MapEdge>> = { right: "right", left: "left", down: "bottom", up: "top" };

/** One walk: `turns` turns, then straight off an edge; null when it crosses or touches itself or runs out of room. */
function walk(rng: Rng, turns: number, from: readonly MapEdge[], to: readonly MapEdge[], anyDirection: boolean): [number, number][] | null {
  const edge = rng.pick(from);
  let heading = INWARD[edge];
  let [x, y] = startCell(rng, edge);
  const points: [number, number][] = [[x, y]];
  const index = new Map<string, number>([[key(x, y), 0]]);
  let n = 1;
  for (let t = 0; t <= turns; t += 1) {
    const room = toEdge(x, y, heading);
    const last = t === turns;
    // Middle stretches stop short of the edge ahead (so there is room to turn); the last runs onto it.
    const length = last ? room : room - 1 < 2 ? -1 : rng.int(2, Math.min(room - 1, 9));
    if (length < 1) return null;
    const [dx, dy] = STEP[heading];
    for (let k = 0; k < length; k += 1) {
      x += dx;
      y += dy;
      if (index.has(key(x, y))) return null;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        const i = index.get(key(nx, ny));
        if (i !== undefined && n - i >= 3) return null; // two stretches touching (the rules' stretchesTouch)
      }
      index.set(key(x, y), n);
      n += 1;
    }
    points.push([x, y]);
    if (!last) {
      const sides = SIDES[heading].filter((h) => anyDirection || h !== "left");
      heading = rng.pick(sides);
    }
  }
  return to.includes(LEAVES[heading]) ? points : null;
}

const blocking = (problems: readonly PlanetProblem[]): boolean => problems.some((p) => p.severity !== "warn");

/** Lower is better: warnings, distance from 40 tiles, and cells more than three tiles from the route (a route that
 *  leaves a corner of the battlefield empty). */
function routeScore(route: readonly (readonly [number, number])[], problems: readonly PlanetProblem[]): number {
  const cells = routeCells(route);
  let far = 0;
  for (let y = 0; y < GRID_ROWS; y += 1) for (let x = 0; x < GRID_COLS; x += 1) if (cells.every((c) => cheb(x, y, c.x, c.y) > 3)) far += 1;
  return problems.length * 10 + Math.abs(cells.length - 1 - 40) + far / 4;
}

function makeRoutes(rng: Rng, o: GenerateMapOptions, anyDirection: boolean): [number, number][][] {
  const [lo, hi] = TWISTS[o.twist ?? "medium"].turns;
  const from = anyDirection ? (o.from === undefined || o.from === "any" ? EDGES : [o.from]) : (["left"] as const);
  const to = anyDirection ? (o.to === undefined || o.to === "any" ? EDGES : [o.to]) : (["right"] as const);
  const found: { route: [number, number][]; score: number; clean: boolean }[] = [];
  // Keep walking until there are GOOD_ROUTES routes with no warning at all (or the tries run out).
  // Enough once there are GOOD_ROUTES clean routes, or ENOUGH_TRIES walks have found at least one.
  for (let i = 0, clean = 0; i < ROUTE_TRIES && clean < GOOD_ROUTES && !(i >= ENOUGH_TRIES && clean > 0); i += 1) {
    const route = walk(rng, rng.int(lo, hi), from, to, anyDirection);
    if (route === null) continue;
    const problems = routeDesignProblems(route);
    if (blocking(problems)) continue;
    if (problems.length === 0) clean += 1;
    found.push({ route, score: routeScore(route, problems), clean: problems.length === 0 });
  }
  const sorted = found.sort((a, b) => a.score - b.score);
  return (sorted.some((f) => f.clean) ? sorted.filter((f) => f.clean) : sorted.slice(0, GOOD_ROUTES)).map((f) => f.route);
}

type Candidate = { readonly id: string; readonly x: number; readonly y: number };

/** What pad placement needs that depends only on the route: worked out once per route, not once per try. */
interface PadSetup {
  readonly route: readonly (readonly [number, number])[];
  readonly candidates: readonly Candidate[];
  readonly reach: ReadonlyMap<string, { readonly tiles: number; readonly stretches: number }>;
  /** The route cells each candidate reaches (tile centres within REACH_TILES), for "route no pad reaches yet". */
  readonly reaches: ReadonlyMap<string, readonly string[]>;
}

function padSetup(route: readonly (readonly [number, number])[]): PadSetup {
  const cells = routeCells(route);
  const onRoute = new Set(cells.map((c) => key(c.x, c.y)));
  const ends = routeEnds(cells.map((c) => [c.x, c.y] as const));
  const covered = new Set([...(ends?.portalCells ?? []), ...(ends?.colonyCells ?? [])].map(([x, y]) => key(x, y)));
  const candidates: Candidate[] = [];
  for (let y = 0; y < GRID_ROWS; y += 1) {
    for (let x = 0; x < GRID_COLS; x += 1) {
      if (onRoute.has(key(x, y)) || covered.has(key(x, y))) continue;
      if (cells.some((c) => cheb(x, y, c.x, c.y) <= 2)) candidates.push({ id: `c${candidates.length}`, x, y });
    }
  }
  const reach = padReach(mapGeometry({ route, pads: candidates }), REACH_TILES);
  const reaches = new Map(candidates.map((c) => [c.id, cells.filter((r) => (r.x - c.x) ** 2 + (r.y - c.y) ** 2 <= REACH_TILES ** 2).map((r) => key(r.x, r.y))]));
  return { route, candidates, reach, reaches };
}

function placePads(rng: Rng, setup: PadSetup, count: number): Pad[] | null {
  const { route, candidates, reach, reaches } = setup;
  const chosen: { id: string; x: number; y: number }[] = [];
  const seen = new Set<string>();
  const free = (c: { x: number; y: number }): boolean => chosen.every((q) => cheb(c.x, c.y, q.x, q.y) >= 2);
  const take = (c: { id: string; x: number; y: number }): void => {
    chosen.push(c);
    for (const k of reaches.get(c.id) ?? []) seen.add(k);
  };
  const jitter = new Map(candidates.map((c) => [c.id, 1 + 0.35 * rng.next()]));
  const bends = candidates
    .filter((c) => (reach.get(c.id)?.stretches ?? 0) >= 3)
    .sort((a, b) => (reach.get(b.id)?.tiles ?? 0) * (jitter.get(b.id) ?? 1) - (reach.get(a.id)?.tiles ?? 0) * (jitter.get(a.id) ?? 1));
  for (const c of bends) if (chosen.length < 2 && free(c)) take(c);
  while (chosen.length < count) {
    let best: { id: string; x: number; y: number } | null = null;
    let bestScore = -1;
    for (const c of candidates) {
      if (!free(c)) continue;
      const own = reaches.get(c.id) ?? [];
      const fresh = own.filter((k) => !seen.has(k)).length;
      const score = ((reach.get(c.id)?.tiles ?? 0) + 1.5 * fresh) * (jitter.get(c.id) ?? 1);
      if (score > bestScore) {
        best = c;
        bestScore = score;
      }
    }
    if (best === null) return null;
    take(best);
  }
  const byReach = [...chosen].sort((a, b) => (reach.get(b.id)?.tiles ?? 0) - (reach.get(a.id)?.tiles ?? 0));
  // Open at the start: the pads that reach enough route (the rules warn below START_REACH), at least six if there
  // are, leaving one pad for each later unlock.
  const strong = byReach.filter((c) => (reach.get(c.id)?.tiles ?? 0) >= START_REACH).length;
  const startCount = Math.min(MAX_START_PADS, count - (PAD_OPEN_WAVES.length - 1), Math.max(6, strong));
  const later = PAD_OPEN_WAVES.slice(1);
  const opens = new Map(byReach.map((c, i) => [c.id, i < startCount ? 0 : (later[(i - startCount) % later.length] ?? 0)]));
  const order = padOrder(mapGeometry({ route, pads: chosen }));
  const byId = new Map(chosen.map((c) => [c.id, c]));
  return order.map((id, i) => {
    const c = byId.get(id) as { x: number; y: number };
    return { id: `p${String(i + 1).padStart(2, "0")}`, x: c.x, y: c.y, opensAfterWave: opens.get(id) ?? 0 };
  });
}

function placeDecorations(rng: Rng, route: readonly (readonly [number, number])[], pads: readonly Pad[], pool: readonly string[], count: number): MapDecoration[] {
  if (pool.length === 0 || count <= 0) return [];
  const cells = routeCells(route);
  const near = new Set<string>();
  for (const c of cells) for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) near.add(key(c.x + dx, c.y + dy));
  const ends = routeEnds(cells.map((c) => [c.x, c.y] as const));
  for (const [x, y] of [...(ends?.portalCells ?? []), ...(ends?.colonyCells ?? [])]) near.add(key(x, y));
  for (const p of pads) near.add(key(p.x, p.y));
  const open: [number, number][] = [];
  for (let y = 0; y < GRID_ROWS; y += 1) for (let x = 0; x < GRID_COLS; x += 1) if (!near.has(key(x, y)) && inGrid(x, y)) open.push([x, y]);
  const out: MapDecoration[] = [];
  while (out.length < count && open.length > 0) {
    const [x, y] = open.splice(Math.floor(rng.next() * open.length), 1)[0] as [number, number];
    if (out.some((d) => cheb(d.x, d.y, x, y) < 2)) continue;
    out.push({ art: rng.pick(pool), x, y });
  }
  return out;
}

/** A map that meets the design rules, or the reason none was found. */
export function generateMap(o: GenerateMapOptions): GenerateResult {
  const rng = new Rng(o.seed);
  const anyDirection = o.anyDirection ?? ANY_DIRECTION_ROUTES;
  const padCount = Math.max(12, Math.min(16, Math.round(o.pads ?? 14)));
  let routes: [number, number][][];
  if (o.route !== undefined) {
    const route = o.route.map(([x, y]): [number, number] => [x, y]);
    if (blocking(routeDesignProblems(route))) return { reason: "Your route has a problem to fix first, so pads cannot be placed around it." };
    routes = [route];
  } else {
    routes = makeRoutes(rng, o, anyDirection);
    if (routes.length === 0) return { reason: "No route fits those choices. Try other edges or another amount of turning." };
  }
  let best: { map: GeneratedMap; score: number } | null = null;
  for (const route of routes) {
    const setup = padSetup(route);
    for (let t = 0; t < PAD_TRIES; t += 1) {
      const pads = placePads(rng, setup, padCount);
      if (pads === null) continue;
      const decorations = placeDecorations(rng, route, pads, o.decorations ?? [], o.decorationCount ?? 8);
      const map: PlanetMap = { name: "", grid: { cols: GRID_COLS, rows: GRID_ROWS }, route, pads, art: { backdrop: null, decorations } };
      const problems = mapProblems(map);
      if (blocking(problems)) continue;
      const score = problems.length * 10 + routeScore(route, routeDesignProblems(route));
      if (best === null || score < best.score) best = { map: { route, pads, decorations, problems }, score };
      if (problems.length === 0) break;
    }
    if (best !== null && best.map.problems.length === 0) break;
  }
  return best === null ? { reason: `No way to place ${padCount} pads around ${o.route === undefined ? "the routes tried" : "your route"} meets the rules. Try fewer pads.` } : { map: best.map };
}
