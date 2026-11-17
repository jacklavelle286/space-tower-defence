// The level file and the design rules on it (Gate M, LD3; scope-level-designer.md §3.1). A level is one map and, from
// LD4, the challenge waves and wave sets it owns; the same JSON is the draft admin-api stores and the file the operator
// downloads and uploads. Problems come from game-core's planetProblems, run on a one-map planet document built from the
// level, so the editor shows exactly what the publisher (LD6) will refuse.
import {
  GRID_COLS,
  GRID_ROWS,
  LIBRARY_PICTURE_PATTERN,
  mapGeometry,
  padOrder,
  parseRuleset,
  planetProblems,
  REPO_DECORATIONS,
  type PlanetDocument,
  type PlanetProblem,
  type Ruleset,
} from "@scd/game-core";
import moonbeam from "../../../../game-data/campaign/luna-1-c2.json";
import currentJson from "../../../../game-data/current.json";
import type { LevelFile } from "../api";

type Map_ = LevelFile["map"];
export type LevelPad = Map_["pads"][number];
export type Cell = readonly [number, number];

/** Level IDs leave room for the "<levelId>-p01" pad IDs within keyId's 40 characters (api/shared/levels.py). */
export const LEVEL_ID = /^[a-z0-9-]{1,36}$/u;
export const NAME_MAX = 60;
export const OPENS_AFTER = [0, 5, 10, 15, 20, 25] as const;

// The ruleset new games use: the design rules read its bosses and colony health (wave sets, from LD4).
const RULESETS = import.meta.glob<{ default: unknown }>("../../../../game-data/ruleset/*.json", { eager: true });
const CURRENT_RULESET: Ruleset = parseRuleset(
  Object.entries(RULESETS).find(([path]) => path.endsWith(`/${currentJson.rulesetVersion}.json`))?.[1].default,
);

/** "<levelId>-p01": pad IDs are unique across the planet because they carry the level's ID. */
export function padId(levelId: string, n: number): string {
  return `${levelId}-p${String(n).padStart(2, "0")}`;
}

function emptyMap(name: string): Map_ {
  return { name, grid: { cols: GRID_COLS, rows: GRID_ROWS }, route: [], pads: [], art: { backdrop: null, decorations: [] } };
}

export interface Template {
  readonly id: string;
  readonly label: string;
  readonly route: [number, number][];
  readonly pads: readonly Cell[];
}

/** Starting points for a new map (scope §3.1 step 2). Routes follow the tier 1 art: start left, end right, never left. */
export const TEMPLATES: readonly Template[] = [
  {
    id: "moonbeam",
    label: "Copy Moonbeam map",
    route: moonbeam.map.route as [number, number][],
    pads: moonbeam.map.pads.map((p): Cell => [p.x, p.y]),
  },
  {
    id: "u-bends",
    label: "U-bends",
    route: [
      [0, 2],
      [5, 2],
      [5, 8],
      [10, 8],
      [10, 2],
      [15, 2],
      [15, 8],
      [19, 8],
    ],
    pads: [
      [2, 4], [3, 0], [7, 4], [7, 6], [3, 10], [8, 10], [12, 4], [12, 6], [13, 0], [17, 4], [17, 6], [17, 10],
    ],
  },
  {
    id: "zigzag",
    label: "Zigzag",
    route: [
      [0, 5],
      [3, 5],
      [3, 1],
      [7, 1],
      [7, 9],
      [11, 9],
      [11, 1],
      [15, 1],
      [15, 6],
      [19, 6],
    ],
    pads: [[1, 3], [1, 7], [5, 3], [5, 5], [5, 7], [9, 3], [9, 5], [9, 7], [13, 3], [13, 5], [13, 7], [17, 4], [17, 8]],
  },
  { id: "blank", label: "Blank", route: [], pads: [] },
];

/** A new level from a template, with its pads numbered in route order. */
export function newLevel(levelId: string, name: string, templateId: string): LevelFile {
  const t = TEMPLATES.find((x) => x.id === templateId) ?? TEMPLATES[TEMPLATES.length - 1];
  const map = emptyMap(name);
  map.route = (t?.route ?? []).map(([x, y]) => [x, y]);
  map.pads = (t?.pads ?? []).map(([x, y], i) => ({ id: padId(levelId, i + 1), x, y, opensAfterWave: 0 }));
  const level: LevelFile = { kind: "level", schema: 1, levelId, name, map, challengeWaves: {}, waveSets: {} };
  return numberPadsInRouteOrder(level);
}

/** Pads renumbered p01, p02, ... in route order (D5.1: route order is the attack order and the Tab order). */
export function numberPadsInRouteOrder(level: LevelFile): LevelFile {
  const { route, pads } = level.map;
  if (route.length < 2 || pads.length === 0) return level;
  let order: string[];
  try {
    order = padOrder(mapGeometry({ route, pads }));
  } catch {
    return level; // a route that cannot be built yet (a diagonal step while drawing)
  }
  const byId = new Map(pads.map((p) => [p.id, p]));
  const sorted = order.map((id) => byId.get(id)).filter((p): p is LevelPad => p !== undefined);
  return { ...level, map: { ...level.map, pads: sorted.map((p, i) => ({ ...p, id: padId(level.levelId, i + 1) })) } };
}

/** The level as a one-map schema 2 planet document, for the design rules. */
export function levelAsPlanet(level: LevelFile): PlanetDocument {
  return {
    kind: "campaign",
    schema: 2,
    version: "draft",
    planetId: "luna-1",
    name: level.name,
    maps: { [level.levelId]: { ...level.map, route: level.map.route.map(([x, y]) => [x, y]) } },
    waves: [],
    challengeWaves: {},
    waveSets: {},
  };
}

/** Every design-rule problem with the level (pads must be in route order on a new map). */
export function levelProblems(level: LevelFile): PlanetProblem[] {
  return planetProblems(levelAsPlanet(level), CURRENT_RULESET, { strictPadOrder: true });
}

const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const cellOk = (v: unknown): boolean => Array.isArray(v) && v.length === 2 && isInt(v[0], 0, GRID_COLS - 1) && isInt(v[1], 0, GRID_ROWS - 1);

/**
 * An uploaded level file, checked for the shape admin-api will insist on (api/shared/levels.py), or the reason it
 * cannot be used. The design rules are shown in the editor once it is a draft, as for any other level.
 */
export function readLevelFile(text: string): { ok: true; level: LevelFile } | { ok: false; reason: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "The file is not JSON." };
  }
  if (!isObj(raw) || raw["kind"] !== "level" || raw["schema"] !== 1) return { ok: false, reason: "This is not a level file." };
  const { levelId, name, map } = raw;
  if (typeof levelId !== "string" || !LEVEL_ID.test(levelId)) return { ok: false, reason: "The level ID must be lower case letters, digits and dashes (at most 36)." };
  if (typeof name !== "string" || name.trim() === "" || name.length > NAME_MAX) return { ok: false, reason: "The level needs a name of at most 60 characters." };
  if (!isObj(map) || !isObj(map["grid"]) || map["grid"]["cols"] !== GRID_COLS || map["grid"]["rows"] !== GRID_ROWS) {
    return { ok: false, reason: "The map must be 20 by 11 tiles." };
  }
  if (!Array.isArray(map["route"]) || !map["route"].every(cellOk)) return { ok: false, reason: "The route has a point outside the map." };
  const pads = map["pads"];
  if (!Array.isArray(pads) || !pads.every((p) => isObj(p) && typeof p["id"] === "string" && p["id"].startsWith(`${levelId}-`) && cellOk([p["x"], p["y"]]) && isInt(p["opensAfterWave"], 0, 50))) {
    return { ok: false, reason: `Every pad needs an ID starting "${levelId}-" and a cell on the map.` };
  }
  const art = map["art"];
  const decoOk = (d: unknown): boolean =>
    isObj(d) && typeof d["art"] === "string" && (REPO_DECORATIONS.includes(d["art"]) || LIBRARY_PICTURE_PATTERN.test(d["art"])) && cellOk([d["x"], d["y"]]);
  if (!isObj(art) || !(art["backdrop"] === null || (typeof art["backdrop"] === "string" && LIBRARY_PICTURE_PATTERN.test(art["backdrop"]))) || !Array.isArray(art["decorations"]) || !art["decorations"].every(decoOk)) {
    return { ok: false, reason: "The map's backdrop or decorations are not pictures the game knows." };
  }
  if (!isObj(raw["challengeWaves"]) || !isObj(raw["waveSets"])) return { ok: false, reason: "This is not a level file." };
  const extra = Object.keys(raw).filter((k) => !["kind", "schema", "levelId", "name", "map", "challengeWaves", "waveSets"].includes(k));
  if (extra.length > 0) return { ok: false, reason: `Unknown part of the file: ${extra.join(", ")}.` };
  return { ok: true, level: raw as unknown as LevelFile };
}

/** The file to download: the level, pretty-printed, named "<levelId>.level.json". */
export function levelFileDownload(level: LevelFile): { name: string; text: string } {
  return { name: `${level.levelId}.level.json`, text: `${JSON.stringify(level, null, 2)}\n` };
}
