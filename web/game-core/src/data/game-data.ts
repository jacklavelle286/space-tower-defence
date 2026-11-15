// Versioned game data (Phase 13, M1-23; spine S5.1, C15): the ruleset, the planet document, current.json and the bounds
// file built from them.
//
// Each `parse*` function takes untrusted JSON (a file from game-data/) and either returns it typed or throws a
// GameDataError naming the first problem with its path. Unknown keys are refused, like `additionalProperties: false`,
// so a misspelt field fails the build instead of being silently ignored. `buildBounds` turns a ruleset and a planet
// document into the numbers-only bounds file `player-api` reads with `load_bounds` (api/shared/bounds.py).
//
// The game-data build gate G-15 (spine S5.1, H.10) lives in parsePlanet: a wave set whose create-run transaction
// would need more than 100 DynamoDB actions is refused.
//
// This module imports nothing, so Node can run web/game-core/scripts/build-bounds.ts directly (type stripping) and
// it stays as pure as the rest of game-core.

/** The mechanics numbers this game-core can run (spine S5.1). Support is additive forever: never remove one. */
export const SUPPORTED_MECHANICS: readonly number[] = [1];

/**
 * Version strings are path segments, and `__` joins two of them in a bounds file name (H.8.5). Copy of
 * contracts/limits.json gameData.versionPattern (this module imports nothing; game-data.test.ts checks the copy).
 */
export const VERSION_PATTERN = /^[a-z0-9.-]{1,40}$/;
/** Spine S9.5 `keyId` (contracts/limits.json ids.keyId): class, alien, pad, planet and wave-set IDs. */
export const KEY_ID_PATTERN = /^[a-z0-9-]{1,40}$/;
/** DynamoDB's limit on actions in one TransactWriteItems call (G7 create run; spine S5.1, S8.1). Copy of
 *  contracts/limits.json gameData.createRunMaxActions (checked by game-data.test.ts). */
export const MAX_TRANSACTION_ACTIONS = 100;
/** Levels per class: contracts/limits.json placementLevel.max. */
export const LEVELS_PER_CLASS = 3;
export const TARGETING_MODES = ["FRONT", "FAST", "CROWD", "STRONG"] as const;
export const WAVE_SET_MODES = ["CAMPAIGN", "CHALLENGE"] as const;
/** The campaign wave set's fixed shape (spine S3.1, C8, G-2). */
export const CAMPAIGN_WAVE_SET_ID = "campaign";
export const CAMPAIGN_WAVES = 50;
export const CAMPAIGN_METEOR_AFTER: readonly number[] = [9, 19, 29, 39, 49];

const INT_MAX = 2147483647; // contracts/limits.json integerMax

export type Targeting = (typeof TARGETING_MODES)[number];
export type WaveSetMode = (typeof WAVE_SET_MODES)[number];

export interface ClassLevel {
  level: number;
  cost: number;
  range: number;
  period: number;
  damage: number;
}

export interface AstronautClass {
  name: string;
  role: string;
  unlockAfterWave: number;
  deployCap: number | null;
  attack: "single";
  targeting: Targeting[];
  defaultTargeting: Targeting;
  levels: ClassLevel[];
}

export interface Alien {
  name: string;
  hp: number;
  speed: number;
  leak: number;
  bounty: number;
}

export interface RewardBlock {
  afterWaveFrom: number;
  afterWaveTo: number;
  credits: number;
}

export interface Ruleset {
  kind: "ruleset";
  version: string;
  mechanics: number;
  simulation: { tickRateHz: number };
  colony: {
    maxHealth: number;
    shieldCap: number;
    shieldAbsoluteCap: number;
    repairOnBossClear: number;
    miraRepairCapPerWave: number;
  };
  classes: Record<string, AstronautClass>;
  aliens: Record<string, Alien>;
  economy: {
    startingCredits: number;
    waveClearBonus: number;
    learningRewardByBlock: RewardBlock[];
    endlessLearningReward: number;
  };
  sell: { refundPct: number; roundDownTo: number };
  caps: {
    maxActiveAliens: number;
    scheduledSpawnSoftCap: number;
    maxLiveDescendants: number;
    descendantReleaseGap: number;
    deferredSpawnGap: number;
    maxDescendantDepth: number;
  };
  powerRules: { inventoryCapPerPower: number };
}

export interface Pad {
  id: string;
  x: number;
  y: number;
  opensAfterWave: number;
}

export interface SpawnGroup {
  type: string;
  count: number;
  at: number;
  gap: number;
}

export interface AuthoredWave {
  wave: number;
  groups: SpawnGroup[];
  hpMult: number;
  speedMult: number;
}

export interface PresetPlacement {
  padId: string;
  classId: string;
  level: number;
  targeting: Targeting;
}

export interface WaveSet {
  mode: WaveSetMode;
  name: string;
  /** References to authored waves (`AuthoredWave.wave`), in play order. finalWave = waves.length. */
  waves: number[];
  meteorAfter: number[];
  startCredits: number;
  colonyHealth: number;
  classes: string[];
  padsOpenAsForWave: number;
  presetPlacements: PresetPlacement[];
}

export interface PlanetDocument {
  kind: "campaign";
  version: string;
  planetId: string;
  name: string;
  map: {
    grid: { cols: number; rows: number };
    route: [number, number][];
    pads: Pad[];
  };
  waves: AuthoredWave[];
  waveSets: Record<string, WaveSet>;
}

export interface CurrentPointers {
  rulesetVersion: string;
  campaignVersion: string;
}

export interface WaveSetBounds {
  mode: WaveSetMode;
  finalWave: number;
  meteorAfter: number[];
  startCredits: number;
  colonyHealth: number;
  classes: string[];
  padsOpenAsForWave: number;
  /** G-15: actions in this wave set's create-run transaction (spine S5.1). */
  createRunActions: number;
  /** maxBounty[i] = credits on offer in position i + 1 of the set if nothing leaks (C8.1 "Total bounty available"). */
  maxBounty: number[];
  /** normalRewardByInterval[i] = credits for a successful normal activity after position i + 1 (C9.2, C13). */
  normalRewardByInterval: number[];
}

export interface Bounds {
  kind: "bounds";
  rulesetVersion: string;
  campaignVersion: string;
  mechanics: number;
  colony: { maxHealth: number; shieldCap: number };
  powerInventoryCap: number;
  sell: { refundPct: number; roundDownTo: number };
  /** targeting: the modes a placement of this class may use (spine S6 rule 4, "targeting valid"). */
  classes: Record<
    string,
    { unlockAfterWave: number; deployCap: number | null; targeting: Targeting[]; levelCosts: number[]; cumulativeCosts: number[] }
  >;
  pads: Record<string, { opensAfterWave: number }>;
  waveSets: Record<string, WaveSetBounds>;
}

export class GameDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameDataError";
  }
}

// ---- small checking helpers -------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;

function fail(path: string, message: string): never {
  throw new GameDataError(`${path}: ${message}`);
}

/** An object with exactly the `required` keys plus any of `optional` (and a top-level "$comment" where allowed). */
function obj(value: unknown, path: string, required: readonly string[], optional: readonly string[] = []): Obj {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "must be an object");
  const o = value as Obj;
  for (const key of required) if (!Object.hasOwn(o, key)) fail(path, `"${key}" is missing`);
  for (const key of Object.keys(o)) {
    if (!required.includes(key) && !optional.includes(key)) fail(path, `unknown key "${key}"`);
  }
  return o;
}

function int(value: unknown, path: string, min = 0, max = INT_MAX): number {
  if (typeof value !== "number" || !Number.isInteger(value)) fail(path, `must be an integer, got ${JSON.stringify(value)}`);
  if (value < min || value > max) fail(path, `must be between ${min} and ${max}, got ${value}`);
  return value;
}

/** A positive finite number (seconds, tiles, multipliers); `allowZero` for start times and gaps. */
function num(value: unknown, path: string, allowZero = false, max = 1000): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(path, `must be a number, got ${JSON.stringify(value)}`);
  if (value < 0 || (!allowZero && value === 0) || value > max) {
    fail(path, `must be ${allowZero ? "at least 0" : "above 0"} and at most ${max}, got ${value}`);
  }
  return value;
}

function str(value: unknown, path: string, pattern?: RegExp, maxLength = 80): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    fail(path, `must be a string of 1 to ${maxLength} characters`);
  }
  if (pattern !== undefined && !pattern.test(value)) fail(path, `${JSON.stringify(value)} does not match ${pattern}`);
  return value;
}

function arr(value: unknown, path: string, minItems = 0, maxItems = 1000): unknown[] {
  if (!Array.isArray(value)) fail(path, "must be an array");
  if (value.length < minItems || value.length > maxItems) {
    fail(path, `must have ${minItems} to ${maxItems} items, has ${value.length}`);
  }
  return value;
}

/** An object used as a map: every key matches KEY_ID_PATTERN; entries are parsed by `item`. Keys come out sorted. */
function idMap<T>(value: unknown, path: string, item: (v: unknown, p: string) => T, minEntries = 1): Record<string, T> {
  const o = obj(value, path, [], Object.keys(typeof value === "object" && value !== null ? value : {}));
  const keys = Object.keys(o).sort();
  if (keys.length < minEntries) fail(path, `must have at least ${minEntries} entr${minEntries === 1 ? "y" : "ies"}`);
  const out: Record<string, T> = {};
  for (const key of keys) {
    if (!KEY_ID_PATTERN.test(key)) fail(`${path}.${key}`, `ID does not match ${KEY_ID_PATTERN}`);
    out[key] = item(o[key], `${path}.${key}`);
  }
  return out;
}

function oneOf<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    fail(path, `must be one of ${allowed.join(", ")}, got ${JSON.stringify(value)}`);
  }
  return value as T;
}

function unique(values: readonly (string | number)[], path: string): void {
  const seen = new Set<string | number>();
  for (const v of values) {
    if (seen.has(v)) fail(path, `${JSON.stringify(v)} appears twice`);
    seen.add(v);
  }
}

// ---- version strings and current.json ---------------------------------------------------------------------------

export function checkVersion(value: unknown, path: string): string {
  return str(value, path, VERSION_PATTERN, 40);
}

/** The bounds file for one (ruleset, campaign) pair: /game-data/bounds/<rulesetVersion>__<campaignVersion>.json. */
export function boundsVersion(rulesetVersion: string, campaignVersion: string): string {
  return `${checkVersion(rulesetVersion, "rulesetVersion")}__${checkVersion(campaignVersion, "campaignVersion")}`;
}

export function parseCurrent(raw: unknown): CurrentPointers {
  const o = obj(raw, "current.json", ["rulesetVersion", "campaignVersion"]);
  return {
    rulesetVersion: checkVersion(o["rulesetVersion"], "current.json.rulesetVersion"),
    campaignVersion: checkVersion(o["campaignVersion"], "current.json.campaignVersion"),
  };
}

// ---- ruleset ----------------------------------------------------------------------------------------------------

function parseClass(raw: unknown, path: string): AstronautClass {
  const o = obj(raw, path, ["name", "role", "unlockAfterWave", "deployCap", "attack", "targeting", "defaultTargeting", "levels"]);
  const targeting = arr(o["targeting"], `${path}.targeting`, 1, 2).map((t, i) =>
    oneOf(t, `${path}.targeting[${i}]`, TARGETING_MODES),
  );
  unique(targeting, `${path}.targeting`);
  const defaultTargeting = oneOf(o["defaultTargeting"], `${path}.defaultTargeting`, TARGETING_MODES);
  if (!targeting.includes(defaultTargeting)) fail(`${path}.defaultTargeting`, "must be one of the class's targeting modes");
  // Mechanics 1 knows one attack kind; area attacks and support classes arrive with a later mechanics number.
  if (o["attack"] !== "single") fail(`${path}.attack`, `mechanics 1 supports only "single", got ${JSON.stringify(o["attack"])}`);
  const levels = arr(o["levels"], `${path}.levels`, LEVELS_PER_CLASS, LEVELS_PER_CLASS).map((l, i) => {
    const p = `${path}.levels[${i}]`;
    const lv = obj(l, p, ["level", "cost", "range", "period", "damage"]);
    if (lv["level"] !== i + 1) fail(`${p}.level`, `must be ${i + 1}`);
    return {
      level: i + 1,
      cost: int(lv["cost"], `${p}.cost`, 1, 100000),
      range: num(lv["range"], `${p}.range`, false, 20),
      period: num(lv["period"], `${p}.period`, false, 60),
      damage: int(lv["damage"], `${p}.damage`, 1, 100000),
    };
  });
  return {
    name: str(o["name"], `${path}.name`),
    role: str(o["role"], `${path}.role`),
    unlockAfterWave: int(o["unlockAfterWave"], `${path}.unlockAfterWave`),
    deployCap: o["deployCap"] === null ? null : int(o["deployCap"], `${path}.deployCap`, 1, 32),
    attack: "single",
    targeting,
    defaultTargeting,
    levels,
  };
}

function parseAlien(raw: unknown, path: string): Alien {
  // Mechanics 1 has no traits (armour, bubbles, flying, healing, splitting, carrying): they arrive with a later number.
  const o = obj(raw, path, ["name", "hp", "speed", "leak", "bounty"]);
  return {
    name: str(o["name"], `${path}.name`),
    hp: int(o["hp"], `${path}.hp`, 1, 1000000),
    speed: num(o["speed"], `${path}.speed`, false, 20),
    leak: int(o["leak"], `${path}.leak`, 1, 100),
    bounty: int(o["bounty"], `${path}.bounty`, 0, 100000),
  };
}

export function parseRuleset(raw: unknown): Ruleset {
  const top = obj(
    raw,
    "ruleset",
    ["kind", "version", "mechanics", "simulation", "colony", "classes", "aliens", "economy", "sell", "caps", "powerRules"],
    ["$comment"],
  );
  if (top["kind"] !== "ruleset") fail("ruleset.kind", 'must be "ruleset"');
  const version = checkVersion(top["version"], "ruleset.version");
  const mechanics = int(top["mechanics"], "ruleset.mechanics", 1);
  if (!SUPPORTED_MECHANICS.includes(mechanics)) {
    fail("ruleset.mechanics", `${mechanics} is not supported by this game-core (supports ${SUPPORTED_MECHANICS.join(", ")})`);
  }

  const sim = obj(top["simulation"], "ruleset.simulation", ["tickRateHz"]);
  // The clock (src/clock.ts) is built for exactly 60 steps per second (C2.1).
  if (sim["tickRateHz"] !== 60) fail("ruleset.simulation.tickRateHz", "must be 60 (src/clock.ts STEPS_PER_SECOND)");

  const c = obj(top["colony"], "ruleset.colony", [
    "maxHealth",
    "shieldCap",
    "shieldAbsoluteCap",
    "repairOnBossClear",
    "miraRepairCapPerWave",
  ]);
  const colony = {
    maxHealth: int(c["maxHealth"], "ruleset.colony.maxHealth", 1, 1000),
    shieldCap: int(c["shieldCap"], "ruleset.colony.shieldCap", 0, 1000),
    shieldAbsoluteCap: int(c["shieldAbsoluteCap"], "ruleset.colony.shieldAbsoluteCap", 0, 1000),
    repairOnBossClear: int(c["repairOnBossClear"], "ruleset.colony.repairOnBossClear", 0, 1000),
    miraRepairCapPerWave: int(c["miraRepairCapPerWave"], "ruleset.colony.miraRepairCapPerWave", 0, 1000),
  };
  if (colony.shieldCap > colony.shieldAbsoluteCap) fail("ruleset.colony.shieldCap", "must not exceed shieldAbsoluteCap");

  const e = obj(top["economy"], "ruleset.economy", [
    "startingCredits",
    "waveClearBonus",
    "learningRewardByBlock",
    "endlessLearningReward",
  ]);
  let nextFrom = 1;
  const learningRewardByBlock = arr(e["learningRewardByBlock"], "ruleset.economy.learningRewardByBlock", 1).map((b, i) => {
    const p = `ruleset.economy.learningRewardByBlock[${i}]`;
    const block = obj(b, p, ["afterWaveFrom", "afterWaveTo", "credits"]);
    const from = int(block["afterWaveFrom"], `${p}.afterWaveFrom`, 1);
    const to = int(block["afterWaveTo"], `${p}.afterWaveTo`, from);
    if (from !== nextFrom) fail(`${p}.afterWaveFrom`, `must be ${nextFrom}: the blocks are contiguous from wave 1`);
    nextFrom = to + 1;
    return { afterWaveFrom: from, afterWaveTo: to, credits: int(block["credits"], `${p}.credits`, 0, 100000) };
  });

  const s = obj(top["sell"], "ruleset.sell", ["refundPct", "roundDownTo"]);
  const k = obj(top["caps"], "ruleset.caps", [
    "maxActiveAliens",
    "scheduledSpawnSoftCap",
    "maxLiveDescendants",
    "descendantReleaseGap",
    "deferredSpawnGap",
    "maxDescendantDepth",
  ]);
  const caps = {
    maxActiveAliens: int(k["maxActiveAliens"], "ruleset.caps.maxActiveAliens", 1, 1000),
    scheduledSpawnSoftCap: int(k["scheduledSpawnSoftCap"], "ruleset.caps.scheduledSpawnSoftCap", 1, 1000),
    maxLiveDescendants: int(k["maxLiveDescendants"], "ruleset.caps.maxLiveDescendants", 0, 1000),
    descendantReleaseGap: num(k["descendantReleaseGap"], "ruleset.caps.descendantReleaseGap", false, 60),
    deferredSpawnGap: num(k["deferredSpawnGap"], "ruleset.caps.deferredSpawnGap", false, 60),
    maxDescendantDepth: int(k["maxDescendantDepth"], "ruleset.caps.maxDescendantDepth", 0, 10),
  };
  if (caps.scheduledSpawnSoftCap > caps.maxActiveAliens) {
    fail("ruleset.caps.scheduledSpawnSoftCap", "must not exceed maxActiveAliens");
  }
  const pr = obj(top["powerRules"], "ruleset.powerRules", ["inventoryCapPerPower"]);

  return {
    kind: "ruleset",
    version,
    mechanics,
    simulation: { tickRateHz: 60 },
    colony,
    classes: idMap(top["classes"], "ruleset.classes", parseClass),
    aliens: idMap(top["aliens"], "ruleset.aliens", parseAlien),
    economy: {
      startingCredits: int(e["startingCredits"], "ruleset.economy.startingCredits", 0, 100000),
      waveClearBonus: int(e["waveClearBonus"], "ruleset.economy.waveClearBonus", 0, 100000),
      learningRewardByBlock,
      endlessLearningReward: int(e["endlessLearningReward"], "ruleset.economy.endlessLearningReward", 0, 100000),
    },
    sell: {
      refundPct: int(s["refundPct"], "ruleset.sell.refundPct", 0, 100),
      roundDownTo: int(s["roundDownTo"], "ruleset.sell.roundDownTo", 1, 1000),
    },
    caps,
    powerRules: { inventoryCapPerPower: int(pr["inventoryCapPerPower"], "ruleset.powerRules.inventoryCapPerPower", 0, 100) },
  };
}

// ---- planet document --------------------------------------------------------------------------------------------

/** G-15: TransactWriteItems actions to create a run on this wave set (spine S5.1, F 12.3): SESSION, RUN and the
 * PROFILE check, plus one slot per normal interval (finalWave - 1) and one per meteor challenge. */
export function createRunActions(finalWave: number, meteorAfterCount: number): number {
  return 3 + (finalWave - 1) + meteorAfterCount;
}

/** The learning reward for a normal slot after the wave at 1-based position `interval` (C9.2; C13 for challenges). */
export function learningReward(ruleset: Ruleset, interval: number): number {
  const block = ruleset.economy.learningRewardByBlock.find((b) => interval >= b.afterWaveFrom && interval <= b.afterWaveTo);
  if (block === undefined) throw new GameDataError(`ruleset ${ruleset.version}: no learning reward block covers interval ${interval}`);
  return block.credits;
}

function parseWaveSet(
  raw: unknown,
  path: string,
  id: string,
  ruleset: Ruleset,
  authored: ReadonlyMap<number, AuthoredWave>,
  pads: readonly Pad[],
): WaveSet {
  const o = obj(raw, path, [
    "mode",
    "name",
    "waves",
    "meteorAfter",
    "startCredits",
    "colonyHealth",
    "classes",
    "padsOpenAsForWave",
    "presetPlacements",
  ]);
  const mode = oneOf(o["mode"], `${path}.mode`, WAVE_SET_MODES);
  const waves = arr(o["waves"], `${path}.waves`, 1).map((w, i) => {
    const n = int(w, `${path}.waves[${i}]`, 1);
    if (!authored.has(n)) fail(`${path}.waves[${i}]`, `authored wave ${n} is not in this planet document's waves`);
    return n;
  });
  const finalWave = waves.length;
  const meteorAfter = arr(o["meteorAfter"], `${path}.meteorAfter`).map((m, i) =>
    int(m, `${path}.meteorAfter[${i}]`, 1, Math.max(1, finalWave - 1)),
  );
  for (let i = 1; i < meteorAfter.length; i += 1) {
    if ((meteorAfter[i] ?? 0) <= (meteorAfter[i - 1] ?? 0)) fail(`${path}.meteorAfter`, "must be strictly increasing");
  }
  if (meteorAfter.some((m) => m >= finalWave)) fail(`${path}.meteorAfter`, `every entry must be below finalWave ${finalWave}`);

  // G-15 (H.10): the create-run transaction must fit DynamoDB's 100-action limit.
  const actions = createRunActions(finalWave, meteorAfter.length);
  if (actions > MAX_TRANSACTION_ACTIONS) {
    fail(
      path,
      `G-15: creating a run on this wave set needs 3 + (${finalWave} - 1) + ${meteorAfter.length} = ${actions} ` +
        `TransactWriteItems actions, more than DynamoDB's ${MAX_TRANSACTION_ACTIONS} (spine S5.1)`,
    );
  }

  if (mode === "CAMPAIGN") {
    if (id !== CAMPAIGN_WAVE_SET_ID) fail(path, `a CAMPAIGN wave set must be called "${CAMPAIGN_WAVE_SET_ID}"`);
    const expected = Array.from({ length: CAMPAIGN_WAVES }, (_, i) => i + 1);
    if (waves.join(",") !== expected.join(",")) fail(`${path}.waves`, `the campaign is waves 1 to ${CAMPAIGN_WAVES} in order`);
    if (meteorAfter.join(",") !== CAMPAIGN_METEOR_AFTER.join(",")) {
      fail(`${path}.meteorAfter`, `the campaign's meteor challenges follow waves ${CAMPAIGN_METEOR_AFTER.join(", ")}`);
    }
  }

  const classes = arr(o["classes"], `${path}.classes`, 1).map((c, i) => {
    const classId = str(c, `${path}.classes[${i}]`, KEY_ID_PATTERN, 40);
    if (!Object.hasOwn(ruleset.classes, classId)) fail(`${path}.classes[${i}]`, `class "${classId}" is not in ruleset ${ruleset.version}`);
    return classId;
  });
  unique(classes, `${path}.classes`);

  const padsOpenAsForWave = int(o["padsOpenAsForWave"], `${path}.padsOpenAsForWave`, 1, CAMPAIGN_WAVES);
  const openPads = new Set(pads.filter((p) => p.opensAfterWave < padsOpenAsForWave).map((p) => p.id));
  const presetPlacements = arr(o["presetPlacements"], `${path}.presetPlacements`, 0, pads.length).map((entry, i) => {
    const p = `${path}.presetPlacements[${i}]`;
    const pl = obj(entry, p, ["padId", "classId", "level", "targeting"]);
    const padId = str(pl["padId"], `${p}.padId`, KEY_ID_PATTERN, 40);
    if (!openPads.has(padId)) fail(`${p}.padId`, `pad "${padId}" is not open when preparing wave ${padsOpenAsForWave}`);
    const classId = str(pl["classId"], `${p}.classId`, KEY_ID_PATTERN, 40);
    if (!classes.includes(classId)) fail(`${p}.classId`, `class "${classId}" is not available in this wave set`);
    const cls = ruleset.classes[classId];
    const targeting = oneOf(pl["targeting"], `${p}.targeting`, TARGETING_MODES);
    if (cls !== undefined && !cls.targeting.includes(targeting)) fail(`${p}.targeting`, `${classId} has no ${targeting} mode`);
    return { padId, classId, level: int(pl["level"], `${p}.level`, 1, LEVELS_PER_CLASS), targeting };
  });
  unique(
    presetPlacements.map((pl) => pl.padId),
    `${path}.presetPlacements`,
  );

  // Every normal interval needs a reward in the ruleset (C9.2), so a slot can be priced when the run is created.
  for (let interval = 1; interval < finalWave; interval += 1) learningReward(ruleset, interval);

  return {
    mode,
    name: str(o["name"], `${path}.name`, undefined, 60),
    waves,
    meteorAfter,
    startCredits: int(o["startCredits"], `${path}.startCredits`, 0, 100000),
    colonyHealth: int(o["colonyHealth"], `${path}.colonyHealth`, 1, ruleset.colony.maxHealth),
    classes,
    padsOpenAsForWave,
    presetPlacements,
  };
}

/** Parse a planet document against the ruleset it will be played with (alien types and classes must exist there). */
export function parsePlanet(raw: unknown, ruleset: Ruleset): PlanetDocument {
  const top = obj(raw, "planet", ["kind", "version", "planetId", "name", "map", "waves", "waveSets"], ["$comment"]);
  if (top["kind"] !== "campaign") fail("planet.kind", 'must be "campaign"');
  const version = checkVersion(top["version"], "planet.version");

  const m = obj(top["map"], "planet.map", ["grid", "route", "pads"]);
  const g = obj(m["grid"], "planet.map.grid", ["cols", "rows"]);
  const cols = int(g["cols"], "planet.map.grid.cols", 1, 100);
  const rows = int(g["rows"], "planet.map.grid.rows", 1, 100);
  const point = (v: unknown, p: string): [number, number] => {
    const xy = arr(v, p, 2, 2);
    return [int(xy[0], `${p}[0]`, 0, cols - 1), int(xy[1], `${p}[1]`, 0, rows - 1)];
  };
  const route = arr(m["route"], "planet.map.route", 2).map((v, i) => point(v, `planet.map.route[${i}]`));
  for (let i = 1; i < route.length; i += 1) {
    const [ax, ay] = route[i - 1] ?? [0, 0];
    const [bx, by] = route[i] ?? [0, 0];
    // C2.2: horizontal and vertical segments only, so range checks need no trigonometry.
    if ((ax === bx) === (ay === by)) fail(`planet.map.route[${i}]`, "each segment must be horizontal or vertical and not empty");
  }
  const pads = arr(m["pads"], "planet.map.pads", 1, 32).map((v, i) => {
    const p = `planet.map.pads[${i}]`;
    const pad = obj(v, p, ["id", "x", "y", "opensAfterWave"]);
    return {
      id: str(pad["id"], `${p}.id`, KEY_ID_PATTERN, 40),
      x: int(pad["x"], `${p}.x`, 0, cols - 1),
      y: int(pad["y"], `${p}.y`, 0, rows - 1),
      opensAfterWave: int(pad["opensAfterWave"], `${p}.opensAfterWave`, 0, CAMPAIGN_WAVES),
    };
  });
  unique(
    pads.map((p) => p.id),
    "planet.map.pads",
  );
  unique(
    pads.map((p) => `${p.x},${p.y}`),
    "planet.map.pads (tiles)",
  );
  if (!pads.some((p) => p.opensAfterWave === 0)) fail("planet.map.pads", "at least one pad must be open from the start");

  const waves = arr(top["waves"], "planet.waves", 1).map((v, i) => {
    const p = `planet.waves[${i}]`;
    const w = obj(v, p, ["wave", "groups", "hpMult", "speedMult"]);
    const groups = arr(w["groups"], `${p}.groups`, 1, 20).map((gv, j) => {
      const gp = `${p}.groups[${j}]`;
      const group = obj(gv, gp, ["type", "count", "at", "gap"]);
      const type = str(group["type"], `${gp}.type`, KEY_ID_PATTERN, 40);
      if (!Object.hasOwn(ruleset.aliens, type)) fail(`${gp}.type`, `alien "${type}" is not in ruleset ${ruleset.version}`);
      return {
        type,
        count: int(group["count"], `${gp}.count`, 1, 200),
        at: num(group["at"], `${gp}.at`, true, 600),
        gap: num(group["gap"], `${gp}.gap`, true, 600),
      };
    });
    return {
      wave: int(w["wave"], `${p}.wave`, 1, CAMPAIGN_WAVES),
      groups,
      hpMult: num(w["hpMult"], `${p}.hpMult`, false, 100),
      speedMult: num(w["speedMult"], `${p}.speedMult`, false, 10),
    };
  });
  for (let i = 1; i < waves.length; i += 1) {
    if ((waves[i]?.wave ?? 0) <= (waves[i - 1]?.wave ?? 0)) fail("planet.waves", "must be in increasing wave order, each once");
  }
  const authored = new Map(waves.map((w) => [w.wave, w]));

  return {
    kind: "campaign",
    version,
    planetId: str(top["planetId"], "planet.planetId", KEY_ID_PATTERN, 40),
    name: str(top["name"], "planet.name", undefined, 60),
    map: { grid: { cols, rows }, route, pads },
    waves,
    waveSets: idMap(top["waveSets"], "planet.waveSets", (v, p) =>
      parseWaveSet(v, p, p.slice("planet.waveSets.".length), ruleset, authored, pads),
    ),
  };
}

// ---- bounds file ------------------------------------------------------------------------------------------------

/** Credits on offer in one authored wave if nothing leaks (C8.1). Mechanics 1 has no descendants or bosses. */
export function waveBounty(ruleset: Ruleset, wave: AuthoredWave): number {
  let total = 0;
  for (const group of wave.groups) total += group.count * (ruleset.aliens[group.type]?.bounty ?? 0);
  return total;
}

/** The numbers-only bounds file for one (ruleset, planet) pair (spine S5.1, S6; C15). Deterministic key order. */
export function buildBounds(ruleset: Ruleset, planet: PlanetDocument): Bounds {
  const authored = new Map(planet.waves.map((w) => [w.wave, w]));
  const classes: Bounds["classes"] = {};
  for (const [id, cls] of Object.entries(ruleset.classes)) {
    let running = 0;
    const levelCosts = cls.levels.map((l) => l.cost);
    classes[id] = {
      unlockAfterWave: cls.unlockAfterWave,
      deployCap: cls.deployCap,
      targeting: [...cls.targeting],
      levelCosts,
      cumulativeCosts: levelCosts.map((cost) => (running += cost)),
    };
  }
  const pads: Bounds["pads"] = {};
  for (const pad of [...planet.map.pads].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    pads[pad.id] = { opensAfterWave: pad.opensAfterWave };
  }
  const waveSets: Bounds["waveSets"] = {};
  for (const [id, set] of Object.entries(planet.waveSets)) {
    const finalWave = set.waves.length;
    waveSets[id] = {
      mode: set.mode,
      finalWave,
      meteorAfter: [...set.meteorAfter],
      startCredits: set.startCredits,
      colonyHealth: set.colonyHealth,
      classes: [...set.classes],
      padsOpenAsForWave: set.padsOpenAsForWave,
      createRunActions: createRunActions(finalWave, set.meteorAfter.length),
      maxBounty: set.waves.map((n) => {
        const wave = authored.get(n);
        if (wave === undefined) throw new GameDataError(`wave set ${id}: authored wave ${n} is missing`);
        return waveBounty(ruleset, wave);
      }),
      normalRewardByInterval: Array.from({ length: finalWave - 1 }, (_, i) => learningReward(ruleset, i + 1)),
    };
  }
  return {
    kind: "bounds",
    rulesetVersion: ruleset.version,
    campaignVersion: planet.version,
    mechanics: ruleset.mechanics,
    colony: { maxHealth: ruleset.colony.maxHealth, shieldCap: ruleset.colony.shieldCap },
    powerInventoryCap: ruleset.powerRules.inventoryCapPerPower,
    sell: { ...ruleset.sell },
    classes,
    pads,
    waveSets,
  };
}

/** The bounds file's bytes: two-space JSON with a final newline, the same for the same inputs. */
export function boundsJson(bounds: Bounds): string {
  return `${JSON.stringify(bounds, null, 2)}\n`;
}
