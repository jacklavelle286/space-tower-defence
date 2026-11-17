// The level file and the design rules on it (Gate M, LD3; scope-level-designer.md §3.1). A level is one map and, from
// LD4, the challenge waves and wave sets it owns; the same JSON is the draft admin-api stores and the file the operator
// downloads and uploads. Problems come from game-core's planetProblems, run on a one-map planet document built from the
// level, so the editor shows exactly what the publisher (LD6) will refuse.
import {
  GRID_COLS,
  GRID_ROWS,
  hardMapProblems,
  isBoss,
  levelOwnsField,
  LIBRARY_PICTURE_PATTERN,
  mapGeometry,
  mergeLevel,
  padOrder,
  parsePlanet,
  parseRuleset,
  planetProblems,
  PROBLEM_TEXT,
  REPO_DECORATIONS,
  type PlanetDocument,
  type PlanetProblem,
  type Ruleset,
} from "@scd/game-core";
import moonbeam from "../../../../game-data/campaign/luna-1-c2.json";
import currentJson from "../../../../game-data/current.json";
import type { LevelFile, LevelWave, LevelWaveSet } from "../api";

type Map_ = LevelFile["map"];
export type LevelPad = Map_["pads"][number];
export type Cell = readonly [number, number];

/** Level IDs leave room for the "<levelId>-p01" pad IDs within keyId's 40 characters (api/shared/levels.py). */
export const LEVEL_ID = /^[a-z0-9-]{1,36}$/u;
export const NAME_MAX = 60;
export const OPENS_AFTER = [0, 5, 10, 15, 20, 25] as const;

// The ruleset new games use: the design rules read its bosses and colony health (wave sets, from LD4).
const RULESETS = import.meta.glob<{ default: unknown }>("../../../../game-data/ruleset/*.json", { eager: true });
export const CURRENT_RULESET: Ruleset = parseRuleset(
  Object.entries(RULESETS).find(([path]) => path.endsWith(`/${currentJson.rulesetVersion}.json`))?.[1].default,
);

// The planet the level is merged into: the one new games use (current.json), as the repo has it.
const CAMPAIGNS = import.meta.glob<{ default: unknown }>("../../../../game-data/campaign/*.json", { eager: true });
/** The live planet document as JSON (what a level is merged into). */
export const LIVE_PLANET_RAW: unknown = Object.entries(CAMPAIGNS).find(([path]) => path.endsWith(`/${currentJson.campaignVersion}.json`))?.[1].default ?? moonbeam;
/** The live planet document, parsed. */
export const LIVE_PLANET: PlanetDocument = parsePlanet(LIVE_PLANET_RAW, CURRENT_RULESET);

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
  /** Pad cells, with the wave each opens after (0 when left out). */
  readonly pads: readonly (Cell | readonly [number, number, number])[];
  /** Copy the live campaign's 50 waves and its wave set too: the level then owns the campaign. */
  readonly campaign?: boolean;
}

/** Starting points for a new map (scope §3.1 step 2). Routes follow the tier 1 art: start left, end right, never left. */
export const TEMPLATES: readonly Template[] = [
  {
    id: "moonbeam",
    label: "Copy Moonbeam map",
    route: moonbeam.map.route as [number, number][],
    pads: moonbeam.map.pads.map((p) => [p.x, p.y, p.opensAfterWave] as const),
  },
  {
    id: "moonbeam-campaign",
    label: "Copy Moonbeam map and campaign",
    route: moonbeam.map.route as [number, number][],
    pads: moonbeam.map.pads.map((p) => [p.x, p.y, p.opensAfterWave] as const),
    campaign: true,
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
  map.pads = (t?.pads ?? []).map((cell, i) => ({ id: padId(levelId, i + 1), x: cell[0], y: cell[1], opensAfterWave: cell[2] ?? 0 }));
  const level: LevelFile = { kind: "level", schema: 1, levelId, name, map, challengeWaves: {}, waveSets: {} };
  if (t?.campaign === true) {
    const campaign = LIVE_PLANET.waveSets["campaign"] as unknown as LevelWaveSet;
    level.waves = structuredClone(LIVE_PLANET.waves as unknown as LevelWave[]);
    level.waveSets = { campaign: { ...structuredClone(campaign), mapId: levelId, presetPlacements: [] } };
  }
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

/** A problem the editor lists: a design rule (game-core), the parser's first error, or an impact warning. */
export type LevelProblem =
  | PlanetProblem
  | { readonly field: string; readonly rule: "parse" | "impact"; readonly severity: "hard" | "warn"; readonly message: string; readonly at?: undefined };

/** The line the problems panel shows. */
export function problemText(p: LevelProblem): string {
  return "message" in p ? p.message : PROBLEM_TEXT[p.rule];
}

/** Waves a campaign level changes that other things read (scope §5): live challenges, and endless (41-49, bosses). */
function impactProblems(level: LevelFile): LevelProblem[] {
  if (level.waves === undefined || level.waves.length === 0) return [];
  const live = new Map(LIVE_PLANET.waves.map((w) => [w.wave, JSON.stringify(w)]));
  const users = new Map<number, string[]>();
  for (const [id, ws] of Object.entries(LIVE_PLANET.waveSets)) {
    if (ws.mode !== "CHALLENGE") continue;
    for (const ref of ws.waves) if (typeof ref === "number") users.set(ref, [...(users.get(ref) ?? []), id]);
  }
  const out: LevelProblem[] = [];
  level.waves.forEach((w, i) => {
    if (JSON.stringify(w) === live.get(w.wave)) return;
    const field = `planet.waves[${i}]`;
    const sets = users.get(w.wave);
    if (sets !== undefined) out.push({ field, rule: "impact", severity: "warn", message: `Wave ${w.wave} changed: the challenges ${sets.join(", ")} play it too.` });
    const boss = w.groups.some((g) => isBoss(CURRENT_RULESET, g.type));
    if ((w.wave >= 41 && w.wave <= 49) || boss) out.push({ field, rule: "impact", severity: "warn", message: `Wave ${w.wave} changed: endless waves are built from it (C11).` });
  });
  return out;
}

/** "planet.waveSets.x.waves[1]: must be ..." as a problem with that field. */
function parseProblem(error: unknown): LevelProblem {
  const text = error instanceof Error ? error.message : String(error);
  const cut = text.indexOf(": ");
  return { field: cut === -1 ? "planet" : text.slice(0, cut), rule: "parse", severity: "hard", message: cut === -1 ? text : text.slice(cut + 2) };
}

/**
 * Every problem with the level, as publishing will see it: the map's design rules, then (once the map can be drawn)
 * the level merged into the live planet document, parsed, and its own waves and wave sets checked by the same rules.
 * Pads must be in route order on a new map.
 */
export function levelProblems(level: LevelFile): LevelProblem[] {
  const map: LevelProblem[] = planetProblems(levelAsPlanet(level), CURRENT_RULESET, { strictPadOrder: true });
  if (hardMapProblems(level.map).length > 0) return map;
  if (Object.keys(level.waveSets).length === 0 && Object.keys(level.challengeWaves).length === 0) return map;
  let merged: PlanetDocument;
  try {
    merged = parsePlanet(mergeLevel(LIVE_PLANET_RAW, level, "draft"), CURRENT_RULESET);
  } catch (error) {
    return [...map, parseProblem(error)];
  }
  const own = planetProblems(merged, CURRENT_RULESET, { strictPadOrder: true }).filter(
    (p) => levelOwnsField(level, p.field) && !p.field.startsWith(`planet.maps.${level.levelId}`),
  );
  return [...map, ...own, ...impactProblems(level)];
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
  // Sections the level owns are named after it, and every wave set is on its map (api/shared/levels.py).
  const owned = (key: string): boolean => key === levelId || key.startsWith(`${levelId}-`);
  const waves = raw["waves"] ?? [];
  if (!Array.isArray(waves) || waves.length > 50 || !waves.every((w) => isObj(w) && Array.isArray(w["groups"]))) return { ok: false, reason: "The campaign waves are not readable." };
  if (!Object.keys(raw["challengeWaves"]).every(owned)) return { ok: false, reason: `Challenge waves must be named "${levelId}-...".` };
  for (const [key, ws] of Object.entries(raw["waveSets"])) {
    if (key === "campaign" ? waves.length === 0 : !owned(key)) return { ok: false, reason: key === "campaign" ? "A campaign level needs its 50 waves." : `Wave sets must be named "${levelId}-...".` };
    if (!isObj(ws) || ws["mapId"] !== levelId) return { ok: false, reason: `Wave set ${key} must be played on this level's map.` };
  }
  const extra = Object.keys(raw).filter((k) => !["kind", "schema", "levelId", "name", "map", "waves", "design", "challengeWaves", "waveSets"].includes(k));
  if (extra.length > 0) return { ok: false, reason: `Unknown part of the file: ${extra.join(", ")}.` };
  return { ok: true, level: raw as unknown as LevelFile };
}

/** The file to download: the level, pretty-printed, named "<levelId>.level.json". */
export function levelFileDownload(level: LevelFile): { name: string; text: string } {
  return { name: `${level.levelId}.level.json`, text: `${JSON.stringify(level, null, 2)}\n` };
}
