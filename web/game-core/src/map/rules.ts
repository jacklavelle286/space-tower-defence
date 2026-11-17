// The automatic design rules for a planet document (Gate M, LD1; scope-level-designer.md §5).
//
// planetProblems() collects every problem at once, for the level editor (live) and the publisher (again before it
// writes). Each problem names a field, a rule and a severity, never a value (G §1.2), and the cell it is about when
// there is one, so the editor can jump to it:
//
//   hard    the game cannot draw or play it: parsePlanet refuses the document (player load, build-bounds, publisher)
//   block   the designer refuses to publish it (readability, accessibility, balance shape)
//   warn    shown; publishing is allowed
//
// Hard rules are only those the renderer and simulation already need (tier 1 route art: start at x = 0 heading
// right, end at x = 19 heading right, never heading left; 20 x 11 grid; no crossing; at most 16 waypoints; no pad on
// the route), so no published document can start failing to load. "Bosses only on waves 10, 20, ... 50" (C7,
// AC-11) blocks publishing instead: the simulation plays a boss on any wave, and tests rely on that.
// Thresholds are [PROPOSAL] from scope §5 unless the comment names a source.
import type { PlanetDocument, Ruleset } from "../data/game-data.ts";
import { mapGeometry, routeCells, type RouteCell } from "./geometry.ts";
import { padReach } from "./coverage.ts";
import { padOrder, padsUnreachableByArrows } from "./order.ts";

export type Severity = "hard" | "block" | "warn";

export interface PlanetProblem {
  readonly field: string;
  readonly rule: ProblemRule;
  readonly severity: Severity;
  /** The cell the problem is about (tile coordinates), when there is one. */
  readonly at?: readonly [number, number];
}

/** One line per rule, for the editor's problems panel and the parser's error. */
export const PROBLEM_TEXT = {
  gridSize: "The map must be 20 by 11 tiles (the battlefield is drawn at that size).",
  waypoints: "A route has at most 16 waypoints.",
  startEdge: "The route must start on the left edge (x = 0).",
  startHeading: "The route must leave the portal heading right.",
  endEdge: "The route must end on the right edge (x = 19).",
  endHeading: "The route must reach the colony heading right.",
  leftHeading: "The route never heads left: there is no route art for it yet.",
  crossing: "The route passes through this cell twice.",
  padOnRoute: "A pad cannot sit on the route.",
  bossWave: "A boss only comes on waves 10, 20, 30, 40 and 50.",
  routeLength: "The route should be 36 to 44 tiles long, and must be 30 to 50.",
  turns: "The route should turn at most 9 times, and must turn at most 12 times.",
  stretchesTouch: "Two parts of the route touch here, so the path is hard to follow.",
  stretchesClose: "Two parts of the route are only one tile apart here.",
  footprint: "The portal or colony picture covers this cell: keep pads and other route away.",
  fewBendPads: "Fewer than two pads cover three stretches of route: the map has no strong corner to defend.",
  padCount: "A map has 12 to 16 pads.",
  padsTooClose: "Pads must be at least two tiles apart, so they are easy to tap.",
  padFar: "Every pad must be within two tiles of the route.",
  fewStartPads: "Fewer than six pads are open at the start.",
  startPadReach: "A pad open at the start reaches less than 5.5 tiles of route.",
  opensAfterWave: "A pad opens after wave 0, 5, 10, 15, 20 or 25.",
  unlockOpensNothing: "No pad opens when this wave's new astronaut unlocks.",
  padOrder: "Pads should be numbered in route order (that is the attack order and the Tab order).",
  arrowReach: "The arrow keys never reach this pad.",
  challengeLength: "A challenge has 2 to 8 waves.",
  campaignHealth: "The campaign starts with the colony at full health.",
  challengeHealth: "A challenge starts with at least 10 colony health.",
  noNova: "A challenge without Nova needs preset astronauts, or no one can defend at the start.",
  speedMult: "Campaign aliens faster than 1.25 times are hard to follow.",
  newAlienIntro: "A new alien should first come on its own, before it is mixed with others (prompt.md).",
} as const;

export type ProblemRule = keyof typeof PROBLEM_TEXT;

export const GRID_COLS = 20;
export const GRID_ROWS = 11;
export const MAX_WAYPOINTS = 16;
/** C3.3 [PROPOSAL]: pads open with the class unlocks. */
export const PAD_OPEN_WAVES: readonly number[] = [0, 5, 10, 15, 20, 25];

interface MapInput {
  readonly grid: { readonly cols: number; readonly rows: number };
  readonly route: readonly (readonly [number, number])[];
  readonly pads: readonly { readonly id: string; readonly x: number; readonly y: number; readonly opensAfterWave: number }[];
}

const P = "planet.map";

function cheb(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** The rules parsePlanet enforces on a map (after its structural checks). */
export function hardMapProblems(map: MapInput): PlanetProblem[] {
  const out: PlanetProblem[] = [];
  const hard = (field: string, rule: ProblemRule, at?: readonly [number, number]): void => {
    out.push(at === undefined ? { field, rule, severity: "hard" } : { field, rule, severity: "hard", at });
  };
  if (map.grid.cols !== GRID_COLS || map.grid.rows !== GRID_ROWS) hard(`${P}.grid`, "gridSize");
  const { route } = map;
  if (route.length > MAX_WAYPOINTS) hard(`${P}.route`, "waypoints");
  const first = route[0];
  const last = route[route.length - 1];
  const cells = routeCells(route);
  if (first !== undefined && first[0] !== 0) hard(`${P}.route[0]`, "startEdge", first);
  if (last !== undefined && last[0] !== GRID_COLS - 1) hard(`${P}.route[${route.length - 1}]`, "endEdge", last);
  if (cells[0] !== undefined && cells[0].heading !== "right") hard(`${P}.route[1]`, "startHeading", [cells[0].x, cells[0].y]);
  const end = cells[cells.length - 1];
  if (end !== undefined && end.heading !== "right") hard(`${P}.route[${route.length - 1}]`, "endHeading", [end.x, end.y]);
  for (let i = 0; i + 1 < route.length; i += 1) {
    const [ax] = route[i] ?? [0, 0];
    const [bx] = route[i + 1] ?? [0, 0];
    if (bx < ax) hard(`${P}.route[${i + 1}]`, "leftHeading", route[i + 1]);
  }
  const seen = new Set<string>();
  for (const c of cells) {
    const key = `${c.x},${c.y}`;
    if (seen.has(key)) hard(`${P}.route`, "crossing", [c.x, c.y]);
    seen.add(key);
  }
  map.pads.forEach((p, i) => {
    if (seen.has(`${p.x},${p.y}`)) hard(`${P}.pads[${i}]`, "padOnRoute", [p.x, p.y]);
  });
  return out;
}

/** C7, AC-11: a boss only on waves 10, 20, ... 50 (a publishing block, not a load error). */
export function bossWaveProblems(
  waves: readonly { readonly wave: number; readonly groups: readonly { readonly type: string }[] }[],
  bosses: Readonly<Record<string, unknown>>,
): PlanetProblem[] {
  const out: PlanetProblem[] = [];
  waves.forEach((w, i) => {
    if (w.wave % 10 !== 0 && w.groups.some((g) => Object.hasOwn(bosses, g.type))) {
      out.push({ field: `planet.waves[${i}]`, rule: "bossWave", severity: "block" });
    }
  });
  return out;
}

/** Two or more waypoints, every segment horizontal or vertical and not empty (what sim/route.ts buildRoute needs). */
function drawable(route: readonly (readonly [number, number])[]): boolean {
  if (route.length < 2) return false;
  for (let i = 1; i < route.length; i += 1) {
    const [ax, ay] = route[i - 1] ?? [0, 0];
    const [bx, by] = route[i] ?? [0, 0];
    if ((ax === bx) === (ay === by)) return false;
  }
  return true;
}

/** The cells the portal and colony pictures cover (centres inside the sprite; BattleScene.ts portal and colony). */
function footprints(cells: readonly RouteCell[]): { portal: [number, number][]; colony: [number, number][] } {
  const start = cells[0];
  const end = cells[cells.length - 1];
  const portal: [number, number][] = [];
  const colony: [number, number][] = [];
  if (start !== undefined) for (let dx = -1; dx <= 0; dx += 1) for (let dy = -1; dy <= 1; dy += 1) portal.push([start.x + dx, start.y + dy]);
  if (end !== undefined) for (let dx = -2; dx <= 0; dx += 1) for (let dy = -1; dy <= 0; dy += 1) colony.push([end.x + dx, end.y + dy]);
  return { portal, colony };
}

function routeProblems(map: MapInput, cells: readonly RouteCell[], out: PlanetProblem[]): void {
  const length = Math.max(0, cells.length - 1);
  if (length < 30 || length > 50) out.push({ field: `${P}.route`, rule: "routeLength", severity: "block" });
  else if (length < 36 || length > 44) out.push({ field: `${P}.route`, rule: "routeLength", severity: "warn" });
  let turns = 0;
  for (let i = 1; i < cells.length - 1; i += 1) if (cells[i]?.heading !== cells[i - 1]?.heading) turns += 1;
  if (turns > 12) out.push({ field: `${P}.route`, rule: "turns", severity: "block" });
  else if (turns > 9) out.push({ field: `${P}.route`, rule: "turns", severity: "warn" });

  const reported = new Set<string>();
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 3; j < cells.length; j += 1) {
      const a = cells[i];
      const b = cells[j];
      if (a === undefined || b === undefined) continue;
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      const pair = `${Math.min(a.segment, b.segment)}-${Math.max(a.segment, b.segment)}`;
      if (dx + dy === 1 && !reported.has(`t${pair}`)) {
        reported.add(`t${pair}`);
        out.push({ field: `${P}.route`, rule: "stretchesTouch", severity: "block", at: [b.x, b.y] });
      } else if (j - i >= 4 && ((dx === 2 && dy === 0) || (dx === 0 && dy === 2)) && !reported.has(`c${pair}`)) {
        reported.add(`c${pair}`);
        out.push({ field: `${P}.route`, rule: "stretchesClose", severity: "warn", at: [b.x, b.y] });
      }
    }
  }

  const { portal, colony } = footprints(cells);
  const firstSegment = cells[0]?.segment ?? 0;
  const lastSegment = cells[cells.length - 1]?.segment ?? 0;
  const covered = (fp: [number, number][], own: number): void => {
    for (const [x, y] of fp) {
      const pad = map.pads.findIndex((p) => p.x === x && p.y === y);
      if (pad !== -1) out.push({ field: `${P}.pads[${pad}]`, rule: "footprint", severity: "block", at: [x, y] });
      if (cells.some((c) => c.x === x && c.y === y && c.segment !== own)) out.push({ field: `${P}.route`, rule: "footprint", severity: "block", at: [x, y] });
    }
  };
  covered(portal, firstSegment);
  covered(colony, lastSegment);
}

function padProblems(doc: PlanetDocument, cells: readonly RouteCell[], strictPadOrder: boolean, out: PlanetProblem[]): void {
  const { pads } = doc.map;
  if (pads.length < 12 || pads.length > 16) out.push({ field: `${P}.pads`, rule: "padCount", severity: "block" });
  pads.forEach((p, i) => {
    const at: [number, number] = [p.x, p.y];
    if (pads.some((q, j) => j < i && cheb(p.x, p.y, q.x, q.y) < 2)) out.push({ field: `${P}.pads[${i}]`, rule: "padsTooClose", severity: "block", at });
    const near = cells.reduce((best, c) => Math.min(best, cheb(p.x, p.y, c.x, c.y)), Number.POSITIVE_INFINITY);
    if (near > 2) out.push({ field: `${P}.pads[${i}]`, rule: "padFar", severity: "block", at });
    if (!PAD_OPEN_WAVES.includes(p.opensAfterWave)) out.push({ field: `${P}.pads[${i}].opensAfterWave`, rule: "opensAfterWave", severity: "block", at });
  });
  if (!drawable(doc.map.route)) return; // a hard route problem already says why
  const geometry = mapGeometry(doc.map);
  const reach = padReach(geometry, 2.5);
  const start = pads.filter((p) => p.opensAfterWave === 0);
  if (start.length > 0 && start.length < 6) out.push({ field: `${P}.pads`, rule: "fewStartPads", severity: "warn" });
  pads.forEach((p, i) => {
    if (p.opensAfterWave === 0 && (reach.get(p.id)?.tiles ?? 0) < 5.5) {
      out.push({ field: `${P}.pads[${i}]`, rule: "startPadReach", severity: "warn", at: [p.x, p.y] });
    }
  });
  if ([...reach.values()].filter((r) => r.stretches >= 3).length < 2) out.push({ field: `${P}.pads`, rule: "fewBendPads", severity: "warn" });
  if (Object.values(doc.waveSets).some((ws) => ws.mode === "CAMPAIGN")) {
    for (const w of PAD_OPEN_WAVES.slice(1)) {
      if (!pads.some((p) => p.opensAfterWave === w)) out.push({ field: `${P}.pads`, rule: "unlockOpensNothing", severity: "warn" });
    }
  }
  const order = padOrder(geometry);
  if (order.join(",") !== pads.map((p) => p.id).join(",")) {
    out.push({ field: `${P}.pads`, rule: "padOrder", severity: strictPadOrder ? "block" : "warn" });
  }
  for (const id of padsUnreachableByArrows(geometry)) {
    const i = pads.findIndex((p) => p.id === id);
    const p = pads[i];
    if (p !== undefined) out.push({ field: `${P}.pads[${i}]`, rule: "arrowReach", severity: "block", at: [p.x, p.y] });
  }
}

function waveSetProblems(doc: PlanetDocument, ruleset: Ruleset, out: PlanetProblem[]): void {
  for (const [id, ws] of Object.entries(doc.waveSets)) {
    const at = `planet.waveSets.${id}`;
    if (ws.mode === "CAMPAIGN") {
      if (ws.colonyHealth !== ruleset.colony.maxHealth) out.push({ field: `${at}.colonyHealth`, rule: "campaignHealth", severity: "block" });
      continue;
    }
    if (ws.waves.length < 2 || ws.waves.length > 8) out.push({ field: `${at}.waves`, rule: "challengeLength", severity: "block" });
    if (ws.colonyHealth < 10) out.push({ field: `${at}.colonyHealth`, rule: "challengeHealth", severity: "block" });
    if (!ws.classes.includes("nova") && ws.presetPlacements.length === 0) out.push({ field: `${at}.classes`, rule: "noNova", severity: "block" });
  }
}

function waveProblems(doc: PlanetDocument, bosses: Readonly<Record<string, unknown>>, out: PlanetProblem[]): void {
  const campaign = Object.values(doc.waveSets).find((ws) => ws.mode === "CAMPAIGN");
  if (campaign === undefined) return;
  const index = new Map(doc.waves.map((w, i) => [w.wave, i]));
  const met = new Set<string>();
  for (const n of campaign.waves) {
    const i = index.get(n);
    const w = i === undefined ? undefined : doc.waves[i];
    if (w === undefined) continue;
    if (w.speedMult > 1.25) out.push({ field: `planet.waves[${i}].speedMult`, rule: "speedMult", severity: "warn" });
    // "Introduce a new enemy gently before combining it with others" [CONFIRMED prompt.md:385]: a type's first wave
    // has no other type in it. A boss brings its escort (C7), so a boss wave is not counted.
    const types = new Set(w.groups.map((g) => g.type));
    const boss = w.groups.some((g) => Object.hasOwn(bosses, g.type));
    const fresh = new Set<string>();
    w.groups.forEach((g, j) => {
      if (met.has(g.type) || fresh.has(g.type)) return;
      fresh.add(g.type);
      if (types.size > 1 && !boss) out.push({ field: `planet.waves[${i}].groups[${j}]`, rule: "newAlienIntro", severity: "warn" });
    });
    for (const t of types) met.add(t);
  }
}

export interface PlanetRuleOptions {
  /** Pads out of route order block publishing (new maps); otherwise they warn (Moonbeam copies). */
  readonly strictPadOrder?: boolean;
}

/** Every design-rule problem in `doc` (scope §5 H and P rules), hard ones first, then in document order per rule. */
export function planetProblems(doc: PlanetDocument, ruleset: Ruleset, options: PlanetRuleOptions = {}): PlanetProblem[] {
  const hard = hardMapProblems(doc.map);
  const out: PlanetProblem[] = [...hard, ...bossWaveProblems(doc.waves, ruleset.bosses)];
  const cells = routeCells(doc.map.route);
  // The softer route rules need a drawable route; with a hard route problem they would only repeat it.
  if (!hard.some((p) => p.field.startsWith(`${P}.route`) || p.field === `${P}.grid`)) routeProblems(doc.map, cells, out);
  padProblems(doc, cells, options.strictPadOrder ?? false, out);
  waveSetProblems(doc, ruleset, out);
  waveProblems(doc, ruleset.bosses, out);
  return out;
}

/** "planet.map.route: The route passes through this cell twice. (cell 4,6)" — for the parser's error. */
export function problemMessage(p: PlanetProblem): string {
  return `${PROBLEM_TEXT[p.rule]}${p.at === undefined ? "" : ` (cell ${p.at[0]},${p.at[1]})`}`;
}
