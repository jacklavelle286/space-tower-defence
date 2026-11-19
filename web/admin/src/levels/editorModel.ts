// The map editor's state and its one reducer (Gate M, LD3; scope-level-designer.md §3.1 steps 3-7). Pure: every edit
// is an action, so the editor, the keyboard and the tests all go through the same code, and undo is a history of
// level snapshots (one history for the whole level, as the scope asks; waves join it in LD4).
//
// Tools:
//   route        a cell on the left edge starts the route; each next cell snaps straight (same row or column as the
//                last point); a step left is refused with the reason (no left-heading art yet, tier 1); a cell on the
//                right edge finishes it. Backspace takes the last point back.
//   pads         a free cell adds a pad (open from the start); a pad's cell removes it. Pads are renumbered in route
//                order after every pad or route edit.
//   decorations  a free cell places the chosen decoration; a decorated cell removes it.
// Moving the cursor never changes the level, so it is not in the history.
// Every edit (and opening a draft) fits the challenges' preset astronauts to the map (fitPresets): a renumbered pad
// keeps its astronaut, a pad that went or opens too late loses it, and the status line says which challenges lost one.
import { ANY_DIRECTION_ROUTES, entersFrom, GRID_COLS, GRID_ROWS, headingOf, leavesBy, MAX_WAYPOINTS, type GeneratedMap } from "@scd/game-core";
import type { LevelFile } from "../api";
import { droppedPresetsText, fitPresets, numberPadsInRouteOrder, padId, type Cell } from "./levelFile";

export type Tool = "route" | "pads" | "decorations";
export const TOOLS: readonly { readonly id: Tool; readonly label: string; readonly key: string }[] = [
  { id: "route", label: "Route", key: "1" },
  { id: "pads", label: "Pads", key: "2" },
  { id: "decorations", label: "Decorations", key: "3" },
];
const HISTORY_MAX = 200;

export interface EditorState {
  readonly level: LevelFile;
  readonly past: readonly LevelFile[];
  readonly future: readonly LevelFile[];
  readonly tool: Tool;
  readonly cursor: Cell;
  /** The decoration the decorations tool places: a repo decoration or an approved library picture ID. */
  readonly decoration: string;
  /** Why the last action did nothing ("Turns left: no tile art yet"), for the status line; null after a good one. */
  readonly refusal: string | null;
}

export type Action =
  | { readonly type: "tool"; readonly tool: Tool }
  | { readonly type: "cursor"; readonly cell: Cell }
  | { readonly type: "move"; readonly dx: number; readonly dy: number }
  | { readonly type: "place" }
  | { readonly type: "back" }
  | { readonly type: "clearRoute" }
  | { readonly type: "opens"; readonly padId: string; readonly wave: number }
  | { readonly type: "backdrop"; readonly backdrop: string | null }
  | { readonly type: "decoration"; readonly art: string }
  | { readonly type: "rename"; readonly name: string }
  | { readonly type: "undo" }
  | { readonly type: "redo" }
  | { readonly type: "replace"; readonly level: LevelFile }
  /** "Make only a new map" (LD14): the generated route, pads and decorations, as one step of the undo history. */
  | { readonly type: "generated"; readonly map: Pick<GeneratedMap, "route" | "pads" | "decorations"> }
  /** Any other edit (the waves and wave sets tabs build the new level): one step of the undo history. */
  | { readonly type: "edit"; readonly level: LevelFile };

export function initialEditor(level: LevelFile): EditorState {
  // A draft saved before presets were fitted (a map generated over its challenges) is fitted when it opens: unsaved.
  const fitted = fitPresets(level, level);
  return { level: fitted.level, past: [], future: [], tool: "route", cursor: [0, 5], decoration: "deco-rock-1", refusal: droppedPresetsText(fitted.dropped) };
}

const clamp = (v: number, hi: number): number => Math.max(0, Math.min(hi, v));

/** The cells the route runs through (waypoints included), as "x,y". */
export function routeCellSet(route: readonly (readonly [number, number])[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < route.length; i += 1) {
    const [ax, ay] = route[i] ?? [0, 0];
    out.add(`${ax},${ay}`);
    const next = route[i + 1];
    if (next === undefined) continue;
    const [bx, by] = next;
    const sx = Math.sign(bx - ax);
    const sy = Math.sign(by - ay);
    if (sx !== 0 && sy !== 0) continue;
    for (let x = ax, y = ay; x !== bx || y !== by; x += sx, y += sy) out.add(`${x},${y}`);
  }
  return out;
}

/** Where a click on `cell` puts the next route point, or why it cannot. With `anyDirection` (ANY_DIRECTION_ROUTES, LD11)
 *  the route starts on any edge heading into the map, turns either way and ends on any edge heading off it. */
export function nextRoutePoint(
  route: readonly (readonly [number, number])[],
  cell: Cell,
  anyDirection: boolean = ANY_DIRECTION_ROUTES,
): { point: [number, number] } | { refusal: string } {
  const [x, y] = cell;
  const last = route[route.length - 1];
  const onEdge = x === 0 || y === 0 || x === GRID_COLS - 1 || y === GRID_ROWS - 1;
  if (last === undefined) {
    if (anyDirection) return onEdge ? { point: [x, y] } : { refusal: "Start the route on an edge of the map." };
    return x === 0 ? { point: [x, y] } : { refusal: "Start the route on the left edge." };
  }
  const before = route[route.length - 2];
  const done =
    route.length > 1 && (anyDirection ? before !== undefined && leavesBy(last[0], last[1], headingOf(last[0] - before[0], last[1] - before[1])) : last[0] === GRID_COLS - 1);
  if (done) return { refusal: "The route already reaches the colony. Backspace takes the last point back." };
  // Snap straight: keep the bigger move, drop the smaller.
  const dx = x - last[0];
  const dy = y - last[1];
  const point: [number, number] = Math.abs(dx) >= Math.abs(dy) ? [x, last[1]] : [last[0], y];
  if (point[0] === last[0] && point[1] === last[1]) return { refusal: "Choose a cell in the same row or column as the last point." };
  if (!anyDirection && point[0] < last[0]) return { refusal: "Turns left: no route art for that yet." };
  if (anyDirection && route.length === 1 && !entersFrom(last[0], last[1], headingOf(point[0] - last[0], point[1] - last[1]))) {
    return { refusal: "Leave the portal heading into the map." };
  }
  // A click that carries straight on moves the last point (see place); any other click adds a waypoint, and the
  // 17th is refused here, where the designer can see why, instead of as a problem afterwards.
  if (!continuesStraight(route, point) && route.length >= MAX_WAYPOINTS) {
    return { refusal: `A route has at most ${MAX_WAYPOINTS} waypoints (the start, the end and ${MAX_WAYPOINTS - 2} turns). Aim for 9 turns or fewer.` };
  }
  // Going back over the route (a reversal) is a crossing too.
  const taken = routeCellSet(route);
  taken.delete(`${last[0]},${last[1]}`);
  const sx = Math.sign(point[0] - last[0]);
  const sy = Math.sign(point[1] - last[1]);
  for (let cx = last[0] + sx, cy = last[1] + sy; ; cx += sx, cy += sy) {
    if (taken.has(`${cx},${cy}`)) return { refusal: "The route cannot cross itself." };
    if (cx === point[0] && cy === point[1]) break;
  }
  return { point };
}

/** True when `point` carries on along the route's last stretch, so it moves the last point instead of adding one. */
function continuesStraight(route: readonly (readonly [number, number])[], point: readonly [number, number]): boolean {
  const prev = route[route.length - 2];
  const last = route[route.length - 1];
  return prev !== undefined && last !== undefined && ((prev[0] === last[0] && last[0] === point[0]) || (prev[1] === last[1] && last[1] === point[1]));
}

/** One step of the undo history. A map edit moves the challenges' astronauts with their pads (by cell); a whole-level
 * edit (`byCell` false: the tabs, Make it all again) brings its own presets, which are only checked against the map. */
function edited(state: EditorState, next: LevelFile, byCell = true): EditorState {
  const { level, dropped } = fitPresets(byCell ? state.level : next, next);
  return {
    ...state,
    level,
    past: [...state.past, state.level].slice(-HISTORY_MAX),
    future: [],
    refusal: droppedPresetsText(dropped),
  };
}

function withMap(level: LevelFile, map: Partial<LevelFile["map"]>): LevelFile {
  return { ...level, map: { ...level.map, ...map } };
}

function nextPadNumber(level: LevelFile): number {
  const used = new Set(level.map.pads.map((p) => p.id));
  for (let n = 1; ; n += 1) if (!used.has(padId(level.levelId, n))) return n;
}

function place(state: EditorState): EditorState {
  const { level, cursor, tool } = state;
  const [x, y] = cursor;
  const key = `${x},${y}`;
  const onRoute = routeCellSet(level.map.route).has(key);
  if (tool === "route") {
    const next = nextRoutePoint(level.map.route, cursor);
    if ("refusal" in next) return { ...state, refusal: next.refusal };
    const route = level.map.route.map(([a, b]): [number, number] => [a, b]);
    // Continuing in the same direction moves the last point instead of adding a waypoint.
    if (continuesStraight(route, next.point)) route[route.length - 1] = next.point;
    else route.push(next.point);
    // A pad or decoration the route now runs over goes (the editor keeps the map drawable as you go).
    const cells = routeCellSet(route);
    const map = {
      route,
      pads: level.map.pads.filter((p) => !cells.has(`${p.x},${p.y}`)),
      art: { ...level.map.art, decorations: level.map.art.decorations.filter((d) => !cells.has(`${d.x},${d.y}`)) },
    };
    return edited(state, numberPadsInRouteOrder(withMap(level, map)));
  }
  if (tool === "pads") {
    const existing = level.map.pads.find((p) => p.x === x && p.y === y);
    if (existing !== undefined) return edited(state, numberPadsInRouteOrder(withMap(level, { pads: level.map.pads.filter((p) => p !== existing) })));
    if (onRoute) return { ...state, refusal: "A pad cannot sit on the route." };
    if (level.map.art.decorations.some((d) => d.x === x && d.y === y)) return { ...state, refusal: "A decoration is there." };
    const pad = { id: padId(level.levelId, nextPadNumber(level)), x, y, opensAfterWave: 0 };
    return edited(state, numberPadsInRouteOrder(withMap(level, { pads: [...level.map.pads, pad] })));
  }
  const decorations = level.map.art.decorations;
  const existing = decorations.find((d) => d.x === x && d.y === y);
  if (existing !== undefined) return edited(state, withMap(level, { art: { ...level.map.art, decorations: decorations.filter((d) => d !== existing) } }));
  if (onRoute) return { ...state, refusal: "Decorations stay off the route." };
  if (level.map.pads.some((p) => p.x === x && p.y === y)) return { ...state, refusal: "A pad is there." };
  return edited(state, withMap(level, { art: { ...level.map.art, decorations: [...decorations, { art: state.decoration, x, y }] } }));
}

function back(state: EditorState): EditorState {
  const { level, tool, cursor } = state;
  if (tool === "route") {
    if (level.map.route.length === 0) return { ...state, refusal: "The route is empty." };
    return edited(state, numberPadsInRouteOrder(withMap(level, { route: level.map.route.slice(0, -1) })));
  }
  // Pads and decorations: Backspace removes what is under the cursor, as Enter on it does.
  const [x, y] = cursor;
  const here = tool === "pads" ? level.map.pads.some((p) => p.x === x && p.y === y) : level.map.art.decorations.some((d) => d.x === x && d.y === y);
  return here ? place(state) : { ...state, refusal: "Nothing to remove here." };
}

export function editorReducer(state: EditorState, action: Action): EditorState {
  switch (action.type) {
    case "tool":
      return { ...state, tool: action.tool, refusal: null };
    case "cursor":
      return { ...state, cursor: [clamp(action.cell[0], GRID_COLS - 1), clamp(action.cell[1], GRID_ROWS - 1)] };
    case "move":
      return { ...state, cursor: [clamp(state.cursor[0] + action.dx, GRID_COLS - 1), clamp(state.cursor[1] + action.dy, GRID_ROWS - 1)] };
    case "place":
      return place(state);
    case "back":
      return back(state);
    case "clearRoute":
      return state.level.map.route.length === 0 ? state : edited(state, withMap(state.level, { route: [] }));
    case "opens": {
      const pads = state.level.map.pads.map((p) => (p.id === action.padId ? { ...p, opensAfterWave: action.wave } : p));
      return edited(state, withMap(state.level, { pads }));
    }
    case "backdrop":
      return edited(state, withMap(state.level, { art: { ...state.level.map.art, backdrop: action.backdrop } }));
    case "decoration":
      return { ...state, decoration: action.art, tool: "decorations", refusal: null };
    case "rename": {
      const name = action.name.slice(0, 60);
      return edited(state, { ...state.level, name, map: { ...state.level.map, name } });
    }
    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (prev === undefined) return { ...state, refusal: "Nothing to undo." };
      return { ...state, level: prev, past: state.past.slice(0, -1), future: [state.level, ...state.future], refusal: null };
    }
    case "redo": {
      const next = state.future[0];
      if (next === undefined) return { ...state, refusal: "Nothing to redo." };
      return { ...state, level: next, past: [...state.past, state.level], future: state.future.slice(1), refusal: null };
    }
    case "edit":
      return edited(state, action.level, false);
    case "generated": {
      const { route, pads, decorations } = action.map;
      const level = withMap(state.level, {
        route: route.map(([x, y]): [number, number] => [x, y]),
        pads: pads.map((p, i) => ({ ...p, id: padId(state.level.levelId, i + 1) })), // already in route order
        art: { ...state.level.map.art, decorations: decorations.map((d) => ({ ...d })) },
      });
      return edited(state, level);
    }
    case "replace":
      return { ...initialEditor(action.level), tool: state.tool, cursor: state.cursor, decoration: state.decoration };
  }
}
