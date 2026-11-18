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

// The ruleset new games use: the design rules read its aliens, bosses and colony health (wave sets, from LD4). From
// AM1 a made alien publishes a new ruleset without a release, so the editor uses the live one R46 sends
// (`setLiveRuleset`, loadLiveBase); the copy this build was made with is the start and the tests'.
const RULESETS = import.meta.glob<{ default: unknown }>("../../../../game-data/ruleset/*.json", { eager: true });
const REPO_RULESET_RAW: unknown = Object.entries(RULESETS).find(([path]) => path.endsWith(`/${currentJson.rulesetVersion}.json`))?.[1].default;
export const REPO_RULESET: Ruleset = parseRuleset(REPO_RULESET_RAW);

let ruleset: { readonly raw: unknown; readonly parsed: Ruleset } = { raw: REPO_RULESET_RAW, parsed: REPO_RULESET };

/** The ruleset levels are checked against now: the live one once R46 has sent it. */
export function currentRuleset(): Ruleset {
  return ruleset.parsed;
}

/** The ruleset as R46 sent it (the balance-check workers parse it themselves). */
export function currentRulesetRaw(): unknown {
  return ruleset.raw;
}

/** Use `raw` (R46's live ruleset) for every check from now on. Throws when it does not parse. */
export function setLiveRuleset(raw: unknown): Ruleset {
  ruleset = { raw, parsed: parseRuleset(raw) };
  return ruleset.parsed;
}

/**
 * The planet document a level is merged into and checked against: the live one (current.json). From LD7 the editor
 * loads it from admin-api (R46, `loadLiveBase`), because a publish in the portal moves the live version without a
 * release. Until then (and in tests) it is the repository's current.json version, which this build was made with.
 * `version` is what a test play records and a publish names as its source (STALE_SOURCE when live has moved on).
 */
export interface LiveBase {
  readonly version: string;
  readonly raw: unknown;
  readonly planet: PlanetDocument;
}

const CAMPAIGNS = import.meta.glob<{ default: unknown }>("../../../../game-data/campaign/*.json", { eager: true });
const REPO_RAW: unknown = Object.entries(CAMPAIGNS).find(([path]) => path.endsWith(`/${currentJson.campaignVersion}.json`))?.[1].default ?? moonbeam;
/** The repository's live planet (current.json as this build has it). */
export const REPO_BASE: LiveBase = { version: currentJson.campaignVersion, raw: REPO_RAW, planet: parsePlanet(REPO_RAW, REPO_RULESET) };

let base: LiveBase = REPO_BASE;
/** Whether `base` came from admin-api (the true live version) rather than this build's copy. */
let fromServer = false;

/** The planet levels are merged into now. */
export function liveBase(): LiveBase {
  return base;
}

/** Whether the live base was loaded from admin-api in this page (the Test and Publish tabs need it). */
export function liveBaseLoaded(): boolean {
  return fromServer;
}

/** Use `raw` (the document R46 sent, parsed with this build's ruleset) as the live planet. Throws when it does not parse.
 *  A new planet's empty starting document (LD10: no waves yet, which the parser refuses) is taken as it is. */
export function setLiveBase(version: string, raw: unknown): LiveBase {
  base = { version, raw, planet: isEmptyPlanet(raw) ? (raw as PlanetDocument) : parsePlanet(raw, currentRuleset()) };
  fromServer = true;
  return base;
}

/** The empty starting document of a planet with no published version (api/shared/planets.py empty_planet). */
function isEmptyPlanet(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const doc = raw as Record<string, unknown>;
  const empty = (v: unknown) => (Array.isArray(v) ? v.length === 0 : typeof v === "object" && v !== null && Object.keys(v).length === 0);
  return typeof doc["version"] === "string" && doc["version"].endsWith("-new") && empty(doc["waves"]) && empty(doc["maps"]) && empty(doc["waveSets"]);
}

/** Back to the repository's copy (tests). */
export function resetLiveBase(): void {
  base = REPO_BASE;
  ruleset = { raw: REPO_RULESET_RAW, parsed: REPO_RULESET };
  fromServer = false;
}

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
    level.waves = structuredClone(campaignSource().waves as unknown as LevelWave[]);
    level.waveSets = { campaign: campaignCard(levelId) };
  }
  return numberPadsInRouteOrder(level);
}

/** The base's campaign; a planet with nothing published (LD10) starts from the Moon's. */
function campaignSource(): LiveBase["planet"] {
  return liveBase().planet.waveSets["campaign"] !== undefined ? liveBase().planet : REPO_BASE.planet;
}

/** Tiles from the portal to the colony (40 while there is no route yet). */
export function routeTiles(level: LevelFile): number {
  let n = 0;
  for (let i = 1; i < level.map.route.length; i += 1) {
    const [ax, ay] = level.map.route[i - 1] ?? [0, 0];
    const [bx, by] = level.map.route[i] ?? [0, 0];
    n += Math.abs(bx - ax) + Math.abs(by - ay);
  }
  return n || 40;
}

/** The live campaign's card (credits, colony health, classes, pads, meteors) played on this level's map. */
export function campaignCard(levelId: string): LevelWaveSet {
  const campaign = campaignSource().waveSets["campaign"] as unknown as LevelWaveSet;
  return { ...structuredClone(campaign), mapId: levelId, presetPlacements: [] };
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
    look: { icon: null, artSet: "moon" },
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
  const planet = liveBase().planet;
  const live = new Map(planet.waves.map((w) => [w.wave, JSON.stringify(w)]));
  const users = new Map<number, string[]>();
  for (const [id, ws] of Object.entries(planet.waveSets)) {
    if (ws.mode !== "CHALLENGE") continue;
    for (const ref of ws.waves) if (typeof ref === "number") users.set(ref, [...(users.get(ref) ?? []), id]);
  }
  const out: LevelProblem[] = [];
  level.waves.forEach((w, i) => {
    if (JSON.stringify(w) === live.get(w.wave)) return;
    const field = `planet.waves[${i}]`;
    const sets = users.get(w.wave);
    if (sets !== undefined) out.push({ field, rule: "impact", severity: "warn", message: `Wave ${w.wave} changed: the challenges ${sets.join(", ")} play it too.` });
    const boss = w.groups.some((g) => isBoss(currentRuleset(), g.type));
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

/** The level merged into a planet document (the live one unless given) and parsed (throws when it does not parse). */
export function mergedLevel(level: LevelFile, raw: unknown = liveBase().raw): PlanetDocument {
  return parsePlanet(mergeLevel(raw, level, "draft"), currentRuleset());
}

/**
 * Every problem with the level, as publishing will see it: the map's design rules, then (once the map can be drawn)
 * the level merged into the live planet document, parsed, and its own waves and wave sets checked by the same rules.
 * Pads must be in route order on a new map.
 */
export function levelProblems(level: LevelFile, raw: unknown = liveBase().raw): LevelProblem[] {
  const map: LevelProblem[] = planetProblems(levelAsPlanet(level), currentRuleset(), { strictPadOrder: true });
  if (hardMapProblems(level.map).length > 0) return map;
  if (Object.keys(level.waveSets).length === 0 && Object.keys(level.challengeWaves).length === 0) return map;
  let merged: PlanetDocument;
  try {
    merged = mergedLevel(level, raw);
  } catch (error) {
    return [...map, parseProblem(error)];
  }
  const own = planetProblems(merged, currentRuleset(), { strictPadOrder: true }).filter(
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
