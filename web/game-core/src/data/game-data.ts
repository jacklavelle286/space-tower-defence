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
// This module imports only src/map/ and src/sim/route.ts (Gate M, LD1: the hard map rules), each with an explicit
// .ts extension, so Node can run web/game-core/scripts/build-bounds.ts directly (type stripping) and it stays as pure
// as the rest of game-core.
import { hardMapProblems, problemMessage } from "../map/rules.ts";

/**
 * The mechanics numbers this game-core can run (spine S5.1). Support is additive forever: never remove one.
 *
 * 1 (Phase 13, ruleset r1): one attack kind, "single"; every targeting mode a class lists is available from level 1.
 * 2 (Phase 24, ruleset r2): the six-class roster (C5.1). Five attack kinds (single, slow, blast, shield, buff), each
 *   with its own level fields; `targetingFromLevel` (Orion's STRONG from level 3, C5.3); support classes with no
 *   targeting modes. The simulation's support effects (slow, shield, buff) are completed in Phase 25 (M2-02), before
 *   any run can pin a mechanics 2 ruleset (ADR-0033); Phase 25 also added the ruleset's `slow` block (C5.4), required
 *   in mechanics 2 and later and refused in mechanics 1. CROWD is a blast class's mode only (it counts aliens in the
 *   blast).
 * 3 (Phase 26, ruleset r3): the alien catalogue (C6.1) with traits as data, each a rule the simulation applies:
 *   armour, bubble layers, flying, cluster, healer, and children (carriers and splitters, C6.3); `descendantOnly`
 *   aliens; a planet document's spawn group may name a carrier's `cargo`; the caps of C6.4 in full (deferred spawns,
 *   held descendant releases). Every alien has a `traits` object (possibly empty) in mechanics 3; mechanics 1 and 2
 *   refuse it, because their simulation would ignore the traits (ADR-0034). Phase 27 (M2-04) added the bosses of C7
 *   to mechanics 3, before any ruleset with mechanics 3 was published: an optional `bosses` object, each boss with its
 *   phases (armour, speed, bubble layers for itself and its neighbours, releases) and its defeat release; a wave may
 *   schedule one boss. Mechanics 1 and 2 refuse `bosses` for the same reason (ADR-0034, amended). Phase 28 (M2-05)
 *   added the meteor powers of C10 to mechanics 3, again before any ruleset with mechanics 3 was published: an optional
 *   `powers` object (each power's effect: slow, burst or shield, with its numbers) and, with it, the use rules in
 *   `powerRules` (uses per wave, the shared lockout, the meteor award rotation). Mechanics 1 and 2 refuse `powers`: their
 *   simulation has no usePower command (ADR-0034, amended again).
 */

export const SUPPORTED_MECHANICS: readonly number[] = [1, 2, 3, 4];

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
/** Spine S3.2: COMPLETE_WAVE at wave 999 completes an endless run (the same number as sim/config's ENDLESS_FINAL_WAVE). */
export const ENDLESS_LAST_WAVE = 999;
export const CAMPAIGN_METEOR_AFTER: readonly number[] = [9, 19, 29, 39, 49];
/** Schema 2 (Gate M, LD2): the ID a schema 1 document's one map gets when parsed [ASSUMPTION]. */
export const SCHEMA1_MAP_ID = "main";
/** Schema 2 limits (scope-level-designer.md §3.1): maps per document, decorations per map. */
export const MAX_MAPS = 4;
export const MAX_DECORATIONS = 24;
/** An approved library picture's ID (web/shared/src/pictures.ts LIBRARY_PICTURE_ID). */
export const LIBRARY_PICTURE_PATTERN = /^lib-[0-9a-f]{32}$/;
/** The repo decorations a map may place: the keys of @scd/shared/map DECORATIONS (shared's map test checks the copy). */
export const REPO_DECORATIONS: readonly string[] = [
  "deco-antenna",
  "deco-crater-1",
  "deco-crater-2",
  "deco-crater-3",
  "deco-flag-plain",
  "deco-lamp-off",
  "deco-lamp-on",
  "deco-rock-1",
  "deco-rock-2",
  "deco-rock-3",
];

const INT_MAX = 2147483647; // contracts/limits.json integerMax

/**
 * How a class acts (C5.1, C5.2): "single" hits one alien (Nova, Orion); "slow" hits one alien and slows it (Pip);
 * "blast" hits every alien within a radius of its target (Juno); "shield" adds colony shield points (Mira); "buff"
 * raises nearby attackers' damage (Sol). Mechanics 1 knows only "single".
 */
export const ATTACK_KINDS = ["single", "slow", "blast", "shield", "buff"] as const;
/** The attack kinds each mechanics number allows. */
const ATTACKS_BY_MECHANICS: Readonly<Record<number, readonly AttackKind[]>> = { 1: ["single"], 2: ATTACK_KINDS, 3: ATTACK_KINDS, 4: ATTACK_KINDS };

export type Targeting = (typeof TARGETING_MODES)[number];
export type WaveSetMode = (typeof WAVE_SET_MODES)[number];
export type AttackKind = (typeof ATTACK_KINDS)[number];

/** A level of an attacking class (single, and the base of slow and blast). Range in tiles, period in seconds. */
export interface AttackerLevel {
  level: number;
  /** Purchase price at level 1, upgrade price at levels 2 and 3 (C5.2). */
  cost: number;
  range: number;
  period: number;
  damage: number;
}

/** Pip (C5.2, C5.4): the slow its shot applies; slowRadius 0 slows the target only, above 0 every alien that near it. */
export interface SlowLevel extends AttackerLevel {
  slowPct: number;
  slowDuration: number;
  slowRadius: number;
}

/** Juno (C5.2): every alien within splashRadius tiles of the target takes the full damage. */
export interface BlastLevel extends AttackerLevel {
  splashRadius: number;
}

/** Mira (C5.2, C5.5): shield points added every `period` seconds; health repaired when a wave is cleared. */
export interface ShieldLevel {
  level: number;
  cost: number;
  shieldPoints: number;
  period: number;
  repairOnWaveClear: number;
}

/** Sol (C5.2, C5.6): the damage bonus, in percent, for attackers on pads within `radius` tiles. */
export interface BuffLevel {
  level: number;
  cost: number;
  buffPct: number;
  radius: number;
}

export type ClassLevel = AttackerLevel | SlowLevel | BlastLevel | ShieldLevel | BuffLevel;

interface ClassCommon {
  name: string;
  role: string;
  /** Available while preparing wave unlockAfterWave + 1 and later (C5.9), in a CAMPAIGN wave set. */
  unlockAfterWave: number;
  /** Most of this class on the board at once; null = no cap (C5.8). */
  deployCap: number | null;
  /** The modes the player may choose (C5.3); empty for a class that does not aim (Mira, Sol). */
  targeting: Targeting[];
  /** The mode a new placement gets. For a class that does not aim it is FRONT, stored only because the snapshot's
   *  placement needs a mode (contracts common.schema.json). */
  defaultTargeting: Targeting;
  /** The first level at which a mode may be chosen; a mode not listed is available from level 1 (C5.3: Orion's
   *  STRONG from level 3). Always {} in mechanics 1, which has no such field. */
  targetingFromLevel: Partial<Record<Targeting, number>>;
}

/** One astronaut class; `attack` says which shape its levels have. */
export type AstronautClass = ClassCommon &
  (
    | { attack: "single"; levels: AttackerLevel[] }
    | { attack: "slow"; levels: SlowLevel[] }
    | { attack: "blast"; levels: BlastLevel[] }
    | { attack: "shield"; levels: ShieldLevel[] }
    | { attack: "buff"; levels: BuffLevel[] }
  );

/**
 * How slows combine (C5.4). capPct: no effect or combination reduces speed by more than this (50: no alien can ever be
 * stopped). refreshWithinSeconds: a slow class prefers aliens that are not slowed, and counts an alien whose slow ends
 * within this many seconds as not slowed, so its frost is renewed just before it lapses (tools/sim/sim.py Game._pick).
 */
export interface SlowRules {
  capPct: number;
  refreshWithinSeconds: number;
}

/** Aliens a carrier or splitter releases when it is defeated (C6.3): `count` of `type`, in list order. */
export interface ReleaseSpec {
  type: string;
  count: number;
}

/** Patchling's heal (C6.1): every other alien within `radius` tiles regains amount x hpMult every `period` seconds. */
export interface HealerTrait {
  amount: number;
  radius: number;
  period: number;
}

/**
 * An alien's traits (C6.1, C6.2), mechanics 3. Each key that is present is a rule the simulation applies; an absent
 * key means "no such trait". The shape is tools/sim/game_data.json's `traits`, key for key.
 *   armour    every hit loses this much damage, but at least 1 always lands (C2.2)
 *   bubbles   layers; each absorbs one whole hit of any size, then pops; layers never come back
 *   flying    follows the same route; a blast (Juno) does half damage to it, rounded up (C2.2)
 *   cluster   arrives as a tight group; each bubble is an ordinary alien (no simulation effect: the waves space them)
 *   healer    see HealerTrait; the clock is shared by every healer, so all healers must have the same period
 *   children  released when defeated, never when it leaks (C6.3)
 */
export interface AlienTraits {
  armour?: number;
  bubbles?: number;
  flying?: true;
  cluster?: true;
  healer?: HealerTrait;
  children?: ReleaseSpec[];
}

export interface Alien {
  name: string;
  hp: number;
  speed: number;
  leak: number;
  bounty: number;
  /** Always {} before mechanics 3. */
  traits: AlienTraits;
  /** Only ever released by a carrier or splitter, never scheduled by a wave (Slimelet). Always false before mechanics 3. */
  descendantOnly: boolean;
}

/**
 * What happens the moment a boss enters a phase (C7). Every key is optional; an absent key means "nothing".
 *   selfBubbles  the boss's bubble layers are SET to this many (C7 "gains N bubble layers")
 *   giveBubbles  every other live non-boss alien within `radius` tiles is raised to at least `layers` layers
 *   release      aliens released at the boss's route position, as a carrier's are (C6.3), counting towards the caps
 * The first phase is the boss as it arrives: only selfBubbles is allowed there (it is the boss's starting layers).
 */
export interface BossPhaseActions {
  selfBubbles?: number;
  giveBubbles?: { layers: number; radius: number };
  release?: ReleaseSpec[];
}

/**
 * One boss phase (C7). It begins the moment the boss's health falls to or below fromPct % of its maximum (the first
 * phase has fromPct 100: the boss arrives in it). Armour and the speed factor replace the previous phase's.
 */
export interface BossPhase {
  fromPct: number;
  name: string;
  /** Times the boss's base speed. */
  speedFactor: number;
  armour: number;
  /** Absent when entering the phase does nothing but change armour and speed. */
  onEnter?: BossPhaseActions;
}

/**
 * A boss (C7), mechanics 3 from Phase 27. Health and speed are absolute: a wave's hpMult and speedMult do not apply
 * (its escorts and releases are ordinary aliens of the wave and do scale). The shape is tools/sim/game_data.json's
 * `bosses` entry, key for key, except that the simulator's bossSlowFactor 0.5 is slowFactorPct 50 here (integers,
 * C2.2) and its prose (`based`, `rule`, each phase's `cue`) and the duplicate top-level armour and bubbles are left out.
 */
export interface Boss {
  name: string;
  hp: number;
  /** Tiles per second before the phase's speedFactor. */
  speed: number;
  leak: number;
  bounty: number;
  /** A slow works at this percentage of its strength on the boss (C7 "slows work at half strength": 50). */
  slowFactorPct: number;
  phases: BossPhase[];
  /** Released when the boss is defeated, never when it leaks (C7: the Mothership's 4 Moon Blobs). */
  onDefeatRelease?: ReleaseSpec[];
}

/**
 * What a meteor power does when used (C10). The simulation reads the effect, never the power's ID:
 *   slow    every alien on the field is slowed by slowPct for duration seconds, under the normal slow rules (C5.4:
 *           the cap, one slow at a time, and a boss at its slowFactorPct, C7) - Frost Pulse
 *   burst   every alien within radius tiles of a chosen point on the route loses pctMaxHp % of its maximum health
 *           (a boss bossPctMaxHp %), rounded up, removed directly from health: armour and bubble layers do not
 *           apply, and a flying alien is hit like any other (C2.2 halves only Juno's blast) - Comet Burst
 *   shield  shieldPoints are added to the colony shield at once, up to shieldAbsoluteCap; anything above shieldCap is
 *           trimmed when the wave ends (C4, C2.5) - Colony Shield
 */
export const POWER_EFFECTS = ["slow", "burst", "shield"] as const;
export type PowerEffect = (typeof POWER_EFFECTS)[number];

export type Power = { name: string } & (
  | { effect: "slow"; slowPct: number; duration: number }
  | { effect: "burst"; radius: number; pctMaxHp: number; bossPctMaxHp: number }
  | { effect: "shield"; shieldPoints: number }
);

/**
 * C10's rules for powers. Every ruleset has the inventory cap (the reducer's grant enforces it, spine S3.2); the other
 * three come with `powers` (mechanics 3) and are absent without them.
 */
export interface PowerRules {
  /** The most charges of one power a run may hold. */
  inventoryCapPerPower: number;
  /** Each power may be used at most this many times in one wave. */
  perWaveUseLimitPerPower?: number;
  /** After any power is used, no power may be used for this many seconds of wave time. */
  sharedLockoutSeconds?: number;
  /** The power each meteor challenge awards, in turn, round and round (C10: Frost Pulse, Comet Burst, Colony Shield). */
  awardRotation?: string[];
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
  /** Mechanics 2 and later (C5.4); absent in mechanics 1, which has no slow attack. */
  slow?: SlowRules;
  classes: Record<string, AstronautClass>;
  aliens: Record<string, Alien>;
  /** Mechanics 3 and later (C7, Phase 27); {} when the ruleset has none (always before mechanics 3). */
  bosses: Record<string, Boss>;
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
  /** Mechanics 3 and later (C10, Phase 28); {} when the ruleset has none (always before mechanics 3). */
  powers: Record<string, Power>;
  /** Mechanics 4 and later (C11, Phase 54): the endless generator's numbers; absent before. */
  endless?: EndlessRules;
  powerRules: PowerRules;
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
  /** A carrier's cargo for this group, replacing its default children (C6.3: waves 38, 43, 47). Mechanics 3. */
  cargo?: ReleaseSpec[];
}

/** True when `type` names one of the ruleset's bosses rather than an alien (a spawn group may name either, C7). */
export function isBoss(ruleset: Pick<Ruleset, "bosses">, type: string): boolean {
  return Object.hasOwn(ruleset.bosses, type);
}

/** What every wave is: its spawn groups and multipliers. */
export interface WaveBody {
  groups: SpawnGroup[];
  hpMult: number;
  speedMult: number;
}

/** A numbered wave (1-50): the campaign's waves, which challenges may reuse (C8, C13). */
export interface AuthoredWave extends WaveBody {
  wave: number;
}

/** A challenge-only wave (schema 2, Gate M LD2): a string ID, only in CHALLENGE wave sets (C13 amendment, ADR-0032). */
export type ChallengeWave = WaveBody;

/** A wave set's reference to a wave: a campaign wave number, or (schema 2, CHALLENGE only) a challenge wave ID. */
export type WaveRef = number | string;

/** C11.1: endless wave n >= 51 is a pure function of n, built from these numbers (mechanics 4, Phase 54). */
export interface EndlessRules {
  startsAtWave: number;
  /** Offsets 1-9 of each ten-wave cycle reuse these authored campaign waves' groups. */
  templateForOffset: Record<string, number>;
  /** Offset 10 (waves 60, 70, ...) is a boss wave: these bosses in order, each with its campaign escort wave. */
  bossCycle: string[];
  bossEscortTemplates: Record<string, number>;
  hpMult: { base: number; perWave: number; cap: number };
  speedMult: { base: number; perWave: number; cap: number };
  countMult: { base: number; perCycle: number; cap: number };
  maxScheduledSpawnsPerWave: number;
  bossHp: { base: number; perBoss: number; cap: number };
  bossBounty: number;
}

/** An endless wave: an authored-shaped wave plus the endless boss's own health and bounty (null without a boss). */
export interface EndlessWave extends AuthoredWave {
  bossHp: number | null;
  bossBounty: number | null;
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
  /** The map it is played on (schema 2); a schema 1 document's one map is SCHEMA1_MAP_ID. */
  mapId: string;
  /** References to waves, in play order: campaign wave numbers, or challenge wave IDs. finalWave = waves.length. */
  waves: WaveRef[];
  meteorAfter: number[];
  startCredits: number;
  colonyHealth: number;
  classes: string[];
  padsOpenAsForWave: number;
  presetPlacements: PresetPlacement[];
}

/** A decoration placed on a map: a repo decoration (REPO_DECORATIONS) or an approved library picture. */
export interface MapDecoration {
  art: string;
  x: number;
  y: number;
}

export interface PlanetMap {
  name: string;
  grid: { cols: number; rows: number };
  route: [number, number][];
  pads: Pad[];
  /** Per-map pictures (schema 2): `backdrop` null = the repo Moonbeam ground, else an approved Background picture. */
  art: { backdrop: string | null; decorations: MapDecoration[] };
}

/**
 * A planet document (spine S5.1, C15). Schema 1 (no `schema` key) has one `map`; schema 2 (Gate M, LD2;
 * scope-level-designer.md §3.1) has up to MAX_MAPS `maps`, per-map art, challenge-only waves and a `mapId` per wave
 * set. Both parse to this shape: a schema 1 map is `maps[SCHEMA1_MAP_ID]` with no art.
 */
export interface PlanetDocument {
  kind: "campaign";
  schema: 1 | 2;
  version: string;
  planetId: string;
  name: string;
  maps: Record<string, PlanetMap>;
  waves: AuthoredWave[];
  challengeWaves: Record<string, ChallengeWave>;
  waveSets: Record<string, WaveSet>;
}

/** A released planet and the campaign version new games on it use (Gate M, LD9). `planetId` is null in a schema 1
 *  current.json, which names one campaign and leaves its planet to the document. */
export interface ReleasedPlanet {
  planetId: string | null;
  campaignVersion: string;
}

export interface CurrentPointers {
  rulesetVersion: string;
  /** The first planet's campaign version (schema 1's only one; kept at the top of schema 2 for older clients). */
  campaignVersion: string;
  /** The asset manifest new runs pin (Gate M, LD8); absent means m1, the repo art. */
  assetManifestVersion?: string;
  /** The released planets in unlock order (Gate M, LD9): one for schema 1. */
  planets: ReleasedPlanet[];
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
  /**
   * Endless (Phase 54, C11): only for a CAMPAIGN wave set of a ruleset with the generator, so earlier files keep their
   * bytes. maxBounty[i] = credits on offer in endless wave 51 + i (to wave 999); learningReward = an endless normal
   * activity's credits (C11.2).
   */
  endless?: { maxBounty: number[]; learningReward: number };
  /**
   * The pads of the set's map (schema 2 documents only, so earlier files keep their bytes): player-api refuses a
   * placement on a pad of another map (Gate M, LD2).
   */
  pads?: string[];
}

export interface Bounds {
  kind: "bounds";
  rulesetVersion: string;
  campaignVersion: string;
  mechanics: number;
  colony: { maxHealth: number; shieldCap: number };
  powerInventoryCap: number;
  /**
   * The power the j-th meteor challenge of a run awards, round and round (C10 award rotation; Phase 51). Only in a
   * bounds file for a ruleset with powers, so earlier files (r1) keep their published bytes. CREATE_RUN prices
   * meteor slots from it.
   */
  powerAwardRotation?: string[];
  sell: { refundPct: number; roundDownTo: number };
  /** targeting: the modes a placement of this class may store (spine S6 rule 4, "targeting valid"; placementTargetings:
   *  only FRONT for a class that does not aim). targetingFromLevel (Phase 30, M2-07): the level a mode opens at, only
   *  for modes above level 1 and only when the class has one (Orion's STRONG from level 3), so a bounds file of a
   *  ruleset without such modes (r1) keeps its published bytes. */
  classes: Record<
    string,
    {
      unlockAfterWave: number;
      deployCap: number | null;
      targeting: Targeting[];
      levelCosts: number[];
      cumulativeCosts: number[];
      targetingFromLevel?: Partial<Record<Targeting, number>>;
    }
  >;
  /** Every pad on the planet, across all its maps (pad IDs are unique in a document). */
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

/**
 * current.json (spine S5.1). Schema 1 (no `schema`): one planet's campaign. Schema 2 (Gate M, LD9; expand and
 * contract): `planets` in unlock order, with the top-level `campaignVersion` kept equal to planets[0]'s, so a reader
 * that only knows schema 1's keys still finds the first planet. Readers before LD9 refuse unknown keys, so schema 2 is
 * written only once every client has this parser (the LD10 publisher).
 */
export function parseCurrent(raw: unknown): CurrentPointers {
  const two = typeof raw === "object" && raw !== null && !Array.isArray(raw) && Object.hasOwn(raw, "schema");
  const o = two
    ? obj(raw, "current.json", ["schema", "rulesetVersion", "campaignVersion", "planets"], ["assetManifestVersion"])
    : obj(raw, "current.json", ["rulesetVersion", "campaignVersion"], ["assetManifestVersion"]);
  const campaignVersion = checkVersion(o["campaignVersion"], "current.json.campaignVersion");
  const pointers: CurrentPointers = {
    rulesetVersion: checkVersion(o["rulesetVersion"], "current.json.rulesetVersion"),
    campaignVersion,
    planets: [{ planetId: null, campaignVersion }],
  };
  if (o["assetManifestVersion"] !== undefined) pointers.assetManifestVersion = checkVersion(o["assetManifestVersion"], "current.json.assetManifestVersion");
  if (!two) return pointers;
  if (o["schema"] !== 2) fail("current.json.schema", "must be 2 when present");
  const seen = new Set<string>();
  pointers.planets = arr(o["planets"], "current.json.planets", 1, 20).map((entry, i) => {
    const at = `current.json.planets[${i}]`;
    const e = obj(entry, at, ["planetId", "campaignVersion"]);
    const planetId = str(e["planetId"], `${at}.planetId`, KEY_ID_PATTERN, 40);
    if (seen.has(planetId)) fail(`${at}.planetId`, `${planetId} is listed twice`);
    seen.add(planetId);
    return { planetId, campaignVersion: checkVersion(e["campaignVersion"], `${at}.campaignVersion`) };
  });
  if (pointers.planets[0]?.campaignVersion !== campaignVersion) fail("current.json.campaignVersion", "must equal planets[0].campaignVersion");
  return pointers;
}

// ---- ruleset ----------------------------------------------------------------------------------------------------

/** The modes a placement of this class may store: its targeting modes, or for a class that does not aim, only its
 *  defaultTargeting (spine S6 rule 4 "targeting valid"; the bounds file carries this list). */
export function placementTargetings(cls: Pick<AstronautClass, "targeting" | "defaultTargeting">): Targeting[] {
  return cls.targeting.length > 0 ? [...cls.targeting] : [cls.defaultTargeting];
}

/** Whether a placement of `cls` at `level` may use `mode` (C5.3, including Orion's STRONG from level 3). */
export function targetingAllowed(
  cls: Pick<AstronautClass, "targeting" | "defaultTargeting" | "targetingFromLevel">,
  mode: Targeting,
  level: number,
): boolean {
  return placementTargetings(cls).includes(mode) && level >= (cls.targetingFromLevel[mode] ?? 1);
}

/** The fields every level has, then the ones its attack kind adds. Ranges and radii in tiles, periods in seconds. */
function parseLevel(raw: unknown, p: string, attack: AttackKind, index: number): ClassLevel {
  const fields: Record<AttackKind, readonly string[]> = {
    single: ["range", "period", "damage"],
    slow: ["range", "period", "damage", "slowPct", "slowDuration", "slowRadius"],
    blast: ["range", "period", "damage", "splashRadius"],
    shield: ["shieldPoints", "period", "repairOnWaveClear"],
    buff: ["buffPct", "radius"],
  };
  const lv = obj(raw, p, ["level", "cost", ...fields[attack]]);
  if (lv["level"] !== index + 1) fail(`${p}.level`, `must be ${index + 1}`);
  const base = { level: index + 1, cost: int(lv["cost"], `${p}.cost`, 1, 100000) };
  switch (attack) {
    case "shield":
      return {
        ...base,
        shieldPoints: int(lv["shieldPoints"], `${p}.shieldPoints`, 1, 1000),
        period: num(lv["period"], `${p}.period`, false, 600),
        repairOnWaveClear: int(lv["repairOnWaveClear"], `${p}.repairOnWaveClear`, 0, 1000),
      };
    case "buff":
      return { ...base, buffPct: int(lv["buffPct"], `${p}.buffPct`, 1, 1000), radius: num(lv["radius"], `${p}.radius`, false, 20) };
    default: {
      const attacker: AttackerLevel = {
        ...base,
        range: num(lv["range"], `${p}.range`, false, 20),
        period: num(lv["period"], `${p}.period`, false, 60),
        damage: int(lv["damage"], `${p}.damage`, 1, 100000),
      };
      if (attack === "blast") return { ...attacker, splashRadius: num(lv["splashRadius"], `${p}.splashRadius`, false, 20) };
      if (attack === "slow") {
        return {
          ...attacker,
          slowPct: int(lv["slowPct"], `${p}.slowPct`, 1, 100),
          slowDuration: num(lv["slowDuration"], `${p}.slowDuration`, false, 60),
          slowRadius: num(lv["slowRadius"], `${p}.slowRadius`, true, 20),
        };
      }
      return attacker;
    }
  }
}

function parseClass(raw: unknown, path: string, mechanics: number): AstronautClass {
  const keys = ["name", "role", "unlockAfterWave", "deployCap", "attack", "targeting", "defaultTargeting", "levels"];
  // targetingFromLevel arrived with mechanics 2; a mechanics 1 ruleset must not carry it (and r1 does not).
  const o = obj(raw, path, mechanics >= 2 ? [...keys, "targetingFromLevel"] : keys);
  const attack = oneOf(o["attack"], `${path}.attack`, ATTACKS_BY_MECHANICS[mechanics] ?? []);
  const aims = attack !== "shield" && attack !== "buff";

  // Attackers have one or two modes (C5.3: two picture buttons at most); support classes have none.
  const targeting = arr(o["targeting"], `${path}.targeting`, aims ? 1 : 0, aims ? 2 : 0).map((t, i) =>
    oneOf(t, `${path}.targeting[${i}]`, TARGETING_MODES),
  );
  unique(targeting, `${path}.targeting`);
  const defaultTargeting = oneOf(o["defaultTargeting"], `${path}.defaultTargeting`, TARGETING_MODES);
  if (aims && !targeting.includes(defaultTargeting)) fail(`${path}.defaultTargeting`, "must be one of the class's targeting modes");
  if (!aims && defaultTargeting !== "FRONT") fail(`${path}.defaultTargeting`, 'must be "FRONT" for a class that does not aim');
  // C5.3 CROWD counts the aliens inside the blast radius around a candidate, so only a class with a blast has it.
  if (targeting.includes("CROWD") && attack !== "blast") fail(`${path}.targeting`, "CROWD needs a blast attack");

  const targetingFromLevel: Partial<Record<Targeting, number>> = {};
  if (mechanics >= 2) {
    const from = obj(o["targetingFromLevel"], `${path}.targetingFromLevel`, [], targeting);
    for (const mode of targeting) {
      if (Object.hasOwn(from, mode)) targetingFromLevel[mode] = int(from[mode], `${path}.targetingFromLevel.${mode}`, 1, LEVELS_PER_CLASS);
    }
    // A new placement is level 1 with the default mode, so that mode must be open at level 1.
    if ((targetingFromLevel[defaultTargeting] ?? 1) !== 1) fail(`${path}.targetingFromLevel`, "the default mode must be available from level 1");
  }

  const levels = arr(o["levels"], `${path}.levels`, LEVELS_PER_CLASS, LEVELS_PER_CLASS).map((l, i) =>
    parseLevel(l, `${path}.levels[${i}]`, attack, i),
  );
  return {
    name: str(o["name"], `${path}.name`),
    role: str(o["role"], `${path}.role`),
    unlockAfterWave: int(o["unlockAfterWave"], `${path}.unlockAfterWave`),
    deployCap: o["deployCap"] === null ? null : int(o["deployCap"], `${path}.deployCap`, 1, 32),
    targeting,
    defaultTargeting,
    targetingFromLevel,
    attack,
    levels,
    // parseLevel built every level with the fields `attack` names; TypeScript cannot see that pairing, hence the cast.
  } as AstronautClass;
}

/** A release list (an alien's children, or a spawn group's cargo): 1 to 10 entries, each `count` of one alien type. */
function parseReleases(raw: unknown, path: string): ReleaseSpec[] {
  return arr(raw, path, 1, 10).map((r, i) => {
    const o = obj(r, `${path}[${i}]`, ["type", "count"]);
    return { type: str(o["type"], `${path}[${i}].type`, KEY_ID_PATTERN, 40), count: int(o["count"], `${path}[${i}].count`, 1, 50) };
  });
}

/** `true` is the only value a flag trait may have: an alien without the trait leaves the key out. */
function flag(value: unknown, path: string): true {
  if (value !== true) fail(path, "must be true (leave the key out for an alien without this trait)");
  return true;
}

function parseTraits(raw: unknown, path: string): AlienTraits {
  const o = obj(raw, path, [], ["armour", "bubbles", "flying", "cluster", "healer", "children"]);
  const traits: AlienTraits = {};
  if (Object.hasOwn(o, "armour")) traits.armour = int(o["armour"], `${path}.armour`, 1, 1000);
  if (Object.hasOwn(o, "bubbles")) traits.bubbles = int(o["bubbles"], `${path}.bubbles`, 1, 100);
  if (Object.hasOwn(o, "flying")) traits.flying = flag(o["flying"], `${path}.flying`);
  if (Object.hasOwn(o, "cluster")) traits.cluster = flag(o["cluster"], `${path}.cluster`);
  if (Object.hasOwn(o, "healer")) {
    const h = obj(o["healer"], `${path}.healer`, ["amount", "radius", "period"]);
    traits.healer = {
      amount: int(h["amount"], `${path}.healer.amount`, 1, 100000),
      radius: num(h["radius"], `${path}.healer.radius`, false, 20),
      period: num(h["period"], `${path}.healer.period`, false, 60),
    };
  }
  if (Object.hasOwn(o, "children")) traits.children = parseReleases(o["children"], `${path}.children`);
  return traits;
}

function parseAlien(raw: unknown, path: string, mechanics: number): Alien {
  // Mechanics 1 and 2 have no traits: their simulation would ignore armour, bubbles, flying, healing and releases, so
  // a ruleset that gave an alien traits under those numbers would be played wrongly. Mechanics 3 requires `traits`.
  const keys = ["name", "hp", "speed", "leak", "bounty"];
  const o = mechanics >= 3 ? obj(raw, path, [...keys, "traits"], ["descendantOnly"]) : obj(raw, path, keys);
  return {
    name: str(o["name"], `${path}.name`),
    hp: int(o["hp"], `${path}.hp`, 1, 1000000),
    speed: num(o["speed"], `${path}.speed`, false, 20),
    leak: int(o["leak"], `${path}.leak`, 1, 100),
    bounty: int(o["bounty"], `${path}.bounty`, 0, 100000),
    traits: mechanics >= 3 ? parseTraits(o["traits"], `${path}.traits`) : {},
    descendantOnly: Object.hasOwn(o, "descendantOnly") ? flag(o["descendantOnly"], `${path}.descendantOnly`) : false,
  };
}

/**
 * Check one release list against the ruleset's aliens (C6.3): every type exists, and none of them releases anything
 * itself ("cargo may not contain Crafts or Split Slimes; Slimelets never split"). So a release is one generation deep
 * below the alien a wave schedules. A boss's releases may go one generation deeper (checkBossReleases).
 */
export function checkReleases(releases: readonly ReleaseSpec[], aliens: Readonly<Record<string, Alien>>, path: string): void {
  releases.forEach((r, i) => {
    const alien = aliens[r.type];
    if (alien === undefined) fail(`${path}[${i}].type`, `alien "${r.type}" is not in this ruleset`);
    if (alien.traits.children !== undefined) {
      fail(`${path}[${i}].type`, `"${r.type}" releases aliens itself; a release may not contain a carrier or splitter (C6.3)`);
    }
  });
}

/**
 * Check one of a boss's release lists (C6.3, C7): every type is an alien of the ruleset (never a boss), and a released
 * carrier or splitter is allowed ("only a boss release may contain Split Slimes"), its own children releasing nothing
 * (checkAlienCatalogue has checked that). So a boss's descendants are at most two generations deep, which C6.4's
 * maxDescendantDepth must allow.
 */
function checkBossReleases(releases: readonly ReleaseSpec[], aliens: Readonly<Record<string, Alien>>, caps: Ruleset["caps"], path: string): void {
  releases.forEach((r, i) => {
    const alien = aliens[r.type];
    if (alien === undefined) fail(`${path}[${i}].type`, `alien "${r.type}" is not in this ruleset (a boss never releases a boss)`);
    const depth = alien.traits.children === undefined ? 1 : 2;
    if (caps.maxDescendantDepth < depth) {
      fail(`${path}[${i}].type`, `releasing "${r.type}" needs maxDescendantDepth ${depth}, the ruleset allows ${caps.maxDescendantDepth}`);
    }
  });
}

function parseBossPhase(raw: unknown, path: string, index: number, previousPct: number): BossPhase {
  const o = obj(raw, path, ["fromPct", "name", "speedFactor", "armour"], ["onEnter"]);
  // The first phase is the boss as it arrives; each later one starts at a strictly lower health.
  const fromPct = index === 0 ? int(o["fromPct"], `${path}.fromPct`, 100, 100) : int(o["fromPct"], `${path}.fromPct`, 1, previousPct - 1);
  const phase: BossPhase = {
    fromPct,
    name: str(o["name"], `${path}.name`),
    speedFactor: num(o["speedFactor"], `${path}.speedFactor`, false, 10),
    armour: int(o["armour"], `${path}.armour`, 0, 1000),
  };
  if (Object.hasOwn(o, "onEnter")) {
    // In the first phase only selfBubbles: it is the boss's layers on arrival (tools/sim/sim.py Game._spawn reads only
    // that from the first phase; a gift or a release "on arrival" is not a C7 rule).
    const e = obj(o["onEnter"], `${path}.onEnter`, [], index === 0 ? ["selfBubbles"] : ["selfBubbles", "giveBubbles", "release"]);
    const actions: BossPhaseActions = {};
    if (Object.hasOwn(e, "selfBubbles")) actions.selfBubbles = int(e["selfBubbles"], `${path}.onEnter.selfBubbles`, 1, 100);
    if (Object.hasOwn(e, "giveBubbles")) {
      const g = obj(e["giveBubbles"], `${path}.onEnter.giveBubbles`, ["layers", "radius"]);
      actions.giveBubbles = {
        layers: int(g["layers"], `${path}.onEnter.giveBubbles.layers`, 1, 100),
        radius: num(g["radius"], `${path}.onEnter.giveBubbles.radius`, false, 20),
      };
    }
    if (Object.hasOwn(e, "release")) actions.release = parseReleases(e["release"], `${path}.onEnter.release`);
    if (Object.keys(actions).length === 0) fail(`${path}.onEnter`, "is empty: leave it out");
    phase.onEnter = actions;
  }
  return phase;
}

/** One boss (C7). Its release lists are checked against the aliens by checkBossReleases. */
function parseBoss(raw: unknown, path: string): Boss {
  const o = obj(raw, path, ["name", "hp", "speed", "leak", "bounty", "slowFactorPct", "phases"], ["onDefeatRelease"]);
  let previousPct = 101;
  const phases = arr(o["phases"], `${path}.phases`, 1, 10).map((p, i) => {
    const phase = parseBossPhase(p, `${path}.phases[${i}]`, i, previousPct);
    previousPct = phase.fromPct;
    return phase;
  });
  const boss: Boss = {
    name: str(o["name"], `${path}.name`),
    hp: int(o["hp"], `${path}.hp`, 1, 1000000),
    speed: num(o["speed"], `${path}.speed`, false, 20),
    leak: int(o["leak"], `${path}.leak`, 1, 100),
    bounty: int(o["bounty"], `${path}.bounty`, 0, 100000),
    slowFactorPct: int(o["slowFactorPct"], `${path}.slowFactorPct`, 0, 100),
    phases,
  };
  if (Object.hasOwn(o, "onDefeatRelease")) boss.onDefeatRelease = parseReleases(o["onDefeatRelease"], `${path}.onDefeatRelease`);
  return boss;
}

/** The checks between bosses and aliens: no ID is both (a spawn group names either), and every release is valid. */
function checkBosses(bosses: Readonly<Record<string, Boss>>, aliens: Readonly<Record<string, Alien>>, caps: Ruleset["caps"]): void {
  for (const [id, boss] of Object.entries(bosses)) {
    const p = `ruleset.bosses.${id}`;
    if (Object.hasOwn(aliens, id)) fail(p, `"${id}" is also an alien: a spawn group could not tell which it names`);
    boss.phases.forEach((phase, i) => {
      if (phase.onEnter?.release !== undefined) checkBossReleases(phase.onEnter.release, aliens, caps, `${p}.phases[${i}].onEnter.release`);
    });
    if (boss.onDefeatRelease !== undefined) checkBossReleases(boss.onDefeatRelease, aliens, caps, `${p}.onDefeatRelease`);
  }
}

/** The checks that need every alien at once: releases (C6.3), the depth cap (C6.4), one shared heal clock (C6.1). */
function checkAlienCatalogue(aliens: Readonly<Record<string, Alien>>, caps: Ruleset["caps"]): void {
  let period: number | null = null;
  for (const [id, alien] of Object.entries(aliens)) {
    const children = alien.traits.children;
    if (children !== undefined) {
      checkReleases(children, aliens, `ruleset.aliens.${id}.traits.children`);
      // A descendant is generation 1; C6.4's maxDescendantDepth must allow it.
      if (caps.maxDescendantDepth < 1) fail(`ruleset.aliens.${id}.traits.children`, "maxDescendantDepth 0 allows no descendants");
    }
    const healer = alien.traits.healer;
    if (healer !== undefined) {
      if (period !== null && healer.period !== period) {
        fail(`ruleset.aliens.${id}.traits.healer.period`, `every healer shares one clock (C6.1), so must be ${period}`);
      }
      period = healer.period;
    }
  }
}

/** One meteor power (C10): its name, its effect and that effect's numbers, nothing else. */
function parsePower(raw: unknown, path: string): Power {
  const kind = obj(raw, path, ["name", "effect"], ["slowPct", "duration", "radius", "pctMaxHp", "bossPctMaxHp", "shieldPoints"]);
  const name = str(kind["name"], `${path}.name`);
  const effect = oneOf(kind["effect"], `${path}.effect`, POWER_EFFECTS);
  switch (effect) {
    case "slow": {
      const o = obj(raw, path, ["name", "effect", "slowPct", "duration"]);
      return {
        name,
        effect,
        slowPct: int(o["slowPct"], `${path}.slowPct`, 1, 100),
        duration: num(o["duration"], `${path}.duration`, false, 60),
      };
    }
    case "burst": {
      const o = obj(raw, path, ["name", "effect", "radius", "pctMaxHp", "bossPctMaxHp"]);
      return {
        name,
        effect,
        radius: num(o["radius"], `${path}.radius`, false, 20),
        pctMaxHp: int(o["pctMaxHp"], `${path}.pctMaxHp`, 1, 100),
        bossPctMaxHp: int(o["bossPctMaxHp"], `${path}.bossPctMaxHp`, 0, 100),
      };
    }
    case "shield": {
      const o = obj(raw, path, ["name", "effect", "shieldPoints"]);
      return { name, effect, shieldPoints: int(o["shieldPoints"], `${path}.shieldPoints`, 1, 1000) };
    }
  }
}

/**
 * powerRules (C10). The inventory cap is in every ruleset. The use rules and the award rotation belong to the powers:
 * required when the ruleset has `powers`, refused when it has none (a rule about nothing would be a misspelling).
 */
function parsePowerRules(raw: unknown, powers: Readonly<Record<string, Power>>): PowerRules {
  const p = "ruleset.powerRules";
  const extra = ["perWaveUseLimitPerPower", "sharedLockoutSeconds", "awardRotation"];
  const hasPowers = Object.keys(powers).length > 0;
  const o = hasPowers ? obj(raw, p, ["inventoryCapPerPower", ...extra]) : obj(raw, p, ["inventoryCapPerPower"]);
  const rules: PowerRules = { inventoryCapPerPower: int(o["inventoryCapPerPower"], `${p}.inventoryCapPerPower`, 0, 100) };
  if (!hasPowers) return rules;
  rules.perWaveUseLimitPerPower = int(o["perWaveUseLimitPerPower"], `${p}.perWaveUseLimitPerPower`, 1, 100);
  rules.sharedLockoutSeconds = num(o["sharedLockoutSeconds"], `${p}.sharedLockoutSeconds`, true, 60);
  rules.awardRotation = arr(o["awardRotation"], `${p}.awardRotation`, 1, 10).map((id, i) => {
    const path = `${p}.awardRotation[${i}]`;
    const powerId = str(id, path, KEY_ID_PATTERN, 40);
    if (!Object.hasOwn(powers, powerId)) fail(path, `"${powerId}" is not one of this ruleset's powers`);
    return powerId;
  });
  return rules;
}

export function parseRuleset(raw: unknown): Ruleset {
  // "slow" is checked against the mechanics number below: required from mechanics 2, refused in mechanics 1; and
  // "bosses" and "powers": allowed from mechanics 3, refused before.
  const top = obj(
    raw,
    "ruleset",
    ["kind", "version", "mechanics", "simulation", "colony", "classes", "aliens", "economy", "sell", "caps", "powerRules"],
    ["$comment", "slow", "bosses", "powers", "endless"],
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
  // C5.4. The cap is below 100 so that no alien can ever be stopped.
  let slow: SlowRules | undefined;
  if (mechanics >= 2) {
    const sl = obj(top["slow"], "ruleset.slow", ["capPct", "refreshWithinSeconds"]);
    slow = {
      capPct: int(sl["capPct"], "ruleset.slow.capPct", 1, 99),
      refreshWithinSeconds: num(sl["refreshWithinSeconds"], "ruleset.slow.refreshWithinSeconds", true, 60),
    };
  } else if (Object.hasOwn(top, "slow")) {
    fail("ruleset.slow", "is mechanics 2; mechanics 1 has no slow attack");
  }

  const aliens = idMap(top["aliens"], "ruleset.aliens", (v, p) => parseAlien(v, p, mechanics));
  checkAlienCatalogue(aliens, caps);

  // C7. A mechanics 1 or 2 game-core has no boss phases, so it would play a boss as a big plain alien: refused.
  let bosses: Record<string, Boss> = {};
  if (Object.hasOwn(top, "bosses")) {
    if (mechanics < 3) fail("ruleset.bosses", "is mechanics 3; mechanics 1 and 2 have no bosses");
    bosses = idMap(top["bosses"], "ruleset.bosses", parseBoss);
    checkBosses(bosses, aliens, caps);
  }

  // C10. A mechanics 1 or 2 game-core has no usePower command, so a run could hold charges it can never spend: refused.
  let powers: Record<string, Power> = {};
  if (Object.hasOwn(top, "powers")) {
    if (mechanics < 3) fail("ruleset.powers", "is mechanics 3; mechanics 1 and 2 have no meteor powers");
    powers = idMap(top["powers"], "ruleset.powers", parsePower);
  }
  const powerRules = parsePowerRules(top["powerRules"], powers);

  // C11 (Phase 54): the endless generator is a rule a mechanics 3 game-core does not have, so it needs mechanics 4.
  let endless: EndlessRules | undefined;
  if (Object.hasOwn(top, "endless")) {
    if (mechanics < 4) fail("ruleset.endless", "is mechanics 4; earlier mechanics have no endless generator");
    endless = parseEndless(top["endless"], bosses);
  }

  return {
    kind: "ruleset",
    version,
    mechanics,
    simulation: { tickRateHz: 60 },
    colony,
    ...(slow === undefined ? {} : { slow }),
    classes: idMap(top["classes"], "ruleset.classes", (v, p) => parseClass(v, p, mechanics)),
    aliens,
    bosses,
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
    powers,
    powerRules,
    ...(endless === undefined ? {} : { endless }),
  };
}

function parseEndless(raw: unknown, bosses: Readonly<Record<string, Boss>>): EndlessRules {
  const p = "ruleset.endless";
  const o = obj(raw, p, [
    "startsAtWave",
    "templateForOffset",
    "bossCycle",
    "bossEscortTemplates",
    "hpMult",
    "speedMult",
    "countMult",
    "maxScheduledSpawnsPerWave",
    "bossHp",
    "bossBounty",
  ]);
  const startsAtWave = int(o["startsAtWave"], `${p}.startsAtWave`, 2, CAMPAIGN_WAVES + 1);
  if (startsAtWave !== CAMPAIGN_WAVES + 1) fail(`${p}.startsAtWave`, `must be ${CAMPAIGN_WAVES + 1}: endless follows the ${CAMPAIGN_WAVES}-wave campaign`);
  const offsets = obj(o["templateForOffset"], `${p}.templateForOffset`, ["1", "2", "3", "4", "5", "6", "7", "8", "9"]);
  const templateForOffset: Record<string, number> = {};
  for (const [k, v] of Object.entries(offsets)) templateForOffset[k] = int(v, `${p}.templateForOffset.${k}`, 1, CAMPAIGN_WAVES);
  const bossCycle = arr(o["bossCycle"], `${p}.bossCycle`, 1, 20).map((b, i) => {
    const id = str(b, `${p}.bossCycle[${i}]`, KEY_ID_PATTERN, 40);
    if (!Object.hasOwn(bosses, id)) fail(`${p}.bossCycle[${i}]`, `boss "${id}" is not in this ruleset`);
    return id;
  });
  const escortsRaw = obj(o["bossEscortTemplates"], `${p}.bossEscortTemplates`, [...new Set(bossCycle)]);
  const bossEscortTemplates: Record<string, number> = {};
  for (const [k, v] of Object.entries(escortsRaw)) bossEscortTemplates[k] = int(v, `${p}.bossEscortTemplates.${k}`, 1, CAMPAIGN_WAVES);
  const growth = (key: "hpMult" | "speedMult") => {
    const g = obj(o[key], `${p}.${key}`, ["base", "perWave", "cap"]);
    return { base: num(g["base"], `${p}.${key}.base`, false, 100), perWave: num(g["perWave"], `${p}.${key}.perWave`, true, 10), cap: num(g["cap"], `${p}.${key}.cap`, false, 100) };
  };
  const cm = obj(o["countMult"], `${p}.countMult`, ["base", "perCycle", "cap"]);
  const bh = obj(o["bossHp"], `${p}.bossHp`, ["base", "perBoss", "cap"]);
  return {
    startsAtWave,
    templateForOffset,
    bossCycle,
    bossEscortTemplates,
    hpMult: growth("hpMult"),
    speedMult: growth("speedMult"),
    countMult: { base: num(cm["base"], `${p}.countMult.base`, false, 10), perCycle: num(cm["perCycle"], `${p}.countMult.perCycle`, true, 10), cap: num(cm["cap"], `${p}.countMult.cap`, false, 10) },
    maxScheduledSpawnsPerWave: int(o["maxScheduledSpawnsPerWave"], `${p}.maxScheduledSpawnsPerWave`, 1, 1000),
    bossHp: { base: int(bh["base"], `${p}.bossHp.base`, 1, 1_000_000), perBoss: int(bh["perBoss"], `${p}.bossHp.perBoss`, 0, 1_000_000), cap: int(bh["cap"], `${p}.bossHp.cap`, 1, 1_000_000) },
    bossBounty: int(o["bossBounty"], `${p}.bossBounty`, 0, 100000),
  };
}

/** Python's round(x, 3) for the values C11 produces (no exact half-way ties occur at the third decimal). */
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/**
 * Endless wave `n` (n >= 51), a pure function of n (C11.1; tools/sim Game.wave_def, step for step): the health and
 * speed multipliers grow per wave to their caps (rounded to 3 decimals), offsets 1-9 of each ten-wave cycle reuse an
 * authored wave's groups with the count multiplier (ceil; bosses never multiplied), offset 10 is the next boss of the
 * cycle with its escort wave and its own health; if the scheduled spawns exceed the per-wave bound, every non-boss group
 * is scaled down (floor, at least 1). `authored` maps a campaign wave number to its authored wave.
 */
export function endlessWave(rules: EndlessRules, bosses: Readonly<Record<string, Boss>>, authored: ReadonlyMap<number, AuthoredWave>, n: number): EndlessWave {
  if (!Number.isInteger(n) || n < rules.startsAtWave) throw new RangeError(`endlessWave: wave ${n} is not an endless wave`);
  const k = n - 50;
  const hp = Math.min(rules.hpMult.cap, rules.hpMult.base + rules.hpMult.perWave * k);
  const sp = Math.min(rules.speedMult.cap, rules.speedMult.base + rules.speedMult.perWave * k);
  const cycle = Math.floor((n - 51) / 10);
  const cm = Math.min(rules.countMult.cap, rules.countMult.base + rules.countMult.perCycle * cycle);
  const offset = ((n - 51) % 10) + 1;
  let template: AuthoredWave | undefined;
  let bossHp: number | null = null;
  if (offset === 10) {
    const kb = Math.floor((n - 50) / 10);
    const boss = rules.bossCycle[(kb - 1) % rules.bossCycle.length] ?? "";
    template = authored.get(rules.bossEscortTemplates[boss] ?? 0);
    bossHp = Math.min(rules.bossHp.cap, rules.bossHp.base + rules.bossHp.perBoss * kb);
  } else {
    template = authored.get(rules.templateForOffset[String(offset)] ?? 0);
  }
  if (template === undefined) throw new Error(`endlessWave: wave ${n}'s template is not an authored wave`);
  const bossGroup = (type: string) => Object.hasOwn(bosses, type);
  const groups = template.groups.map((g) => ({ ...g, count: bossGroup(g.type) ? g.count : Math.ceil(g.count * cm - 1e-9) }));
  const total = groups.reduce((t, g) => t + g.count, 0);
  if (total > rules.maxScheduledSpawnsPerWave) {
    const scale = rules.maxScheduledSpawnsPerWave / total;
    for (const g of groups) if (!bossGroup(g.type)) g.count = Math.max(1, Math.floor(g.count * scale));
  }
  return { wave: n, groups, hpMult: round3(hp), speedMult: round3(sp), bossHp, bossBounty: bossHp === null ? null : rules.bossBounty };
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

/**
 * The power the k-th meteor challenge of a run awards (k = 1 for the first, after wave 9; C10 "fixed rotation by meteor
 * challenge"): the ruleset's awardRotation, round and round, so the sixth (endless M-059) is the third again. One
 * charge per success (the contract's reward holds one powerId). Null for a ruleset with no powers.
 */
export function meteorAward(ruleset: Pick<Ruleset, "powerRules">, k: number): string | null {
  const rotation = ruleset.powerRules.awardRotation;
  if (rotation === undefined || rotation.length === 0) return null;
  if (!Number.isInteger(k) || k < 1) throw new RangeError(`meteorAward: k must be 1 or more, got ${k}`);
  return rotation[(k - 1) % rotation.length] ?? null;
}

function parseWaveSet(
  raw: unknown,
  path: string,
  id: string,
  ruleset: Ruleset,
  authored: ReadonlyMap<number, AuthoredWave>,
  challengeWaves: Readonly<Record<string, ChallengeWave>>,
  maps: Readonly<Record<string, PlanetMap>>,
  schema: 1 | 2,
): WaveSet {
  const keys = ["mode", "name", "waves", "meteorAfter", "startCredits", "colonyHealth", "classes", "padsOpenAsForWave", "presetPlacements"];
  const o = obj(raw, path, schema === 2 ? [...keys, "mapId"] : keys);
  const mode = oneOf(o["mode"], `${path}.mode`, WAVE_SET_MODES);
  const mapId = schema === 2 ? str(o["mapId"], `${path}.mapId`, KEY_ID_PATTERN, 40) : SCHEMA1_MAP_ID;
  const map = maps[mapId];
  if (map === undefined) fail(`${path}.mapId`, `map "${mapId}" is not in this planet document's maps`);
  const { pads } = map;
  const waves = arr(o["waves"], `${path}.waves`, 1).map((w, i): WaveRef => {
    const at = `${path}.waves[${i}]`;
    if (typeof w === "string" && schema === 2) {
      // A challenge-only wave (C13 amendment, ADR-0032): never in the campaign, whose waves are numbered.
      if (mode !== "CHALLENGE") fail(at, "only a CHALLENGE wave set may use a challenge wave");
      if (!Object.hasOwn(challengeWaves, w)) fail(at, `challenge wave "${w}" is not in this planet document's challengeWaves`);
      return w;
    }
    const n = int(w, at, 1);
    if (!authored.has(n)) fail(at, `authored wave ${n} is not in this planet document's waves`);
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
    const level = int(pl["level"], `${p}.level`, 1, LEVELS_PER_CLASS);
    if (cls !== undefined && !targetingAllowed(cls, targeting, level)) {
      fail(`${p}.targeting`, `${classId} at level ${level} has no ${targeting} mode`);
    }
    return { padId, classId, level, targeting };
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
    mapId,
    waves,
    meteorAfter,
    startCredits: int(o["startCredits"], `${path}.startCredits`, 0, 100000),
    colonyHealth: int(o["colonyHealth"], `${path}.colonyHealth`, 1, ruleset.colony.maxHealth),
    classes,
    padsOpenAsForWave,
    presetPlacements,
  };
}

/** One map: grid, route, pads and (schema 2) its name and art. Hard map rules run here (src/map/rules.ts). */
function parseMap(raw: unknown, path: string, schema: 1 | 2): PlanetMap {
  const m = obj(raw, path, schema === 2 ? ["name", "grid", "route", "pads", "art"] : ["grid", "route", "pads"]);
  const g = obj(m["grid"], `${path}.grid`, ["cols", "rows"]);
  const cols = int(g["cols"], `${path}.grid.cols`, 1, 100);
  const rows = int(g["rows"], `${path}.grid.rows`, 1, 100);
  const point = (v: unknown, p: string): [number, number] => {
    const xy = arr(v, p, 2, 2);
    return [int(xy[0], `${p}[0]`, 0, cols - 1), int(xy[1], `${p}[1]`, 0, rows - 1)];
  };
  const route = arr(m["route"], `${path}.route`, 2).map((v, i) => point(v, `${path}.route[${i}]`));
  for (let i = 1; i < route.length; i += 1) {
    const [ax, ay] = route[i - 1] ?? [0, 0];
    const [bx, by] = route[i] ?? [0, 0];
    // C2.2: horizontal and vertical segments only, so range checks need no trigonometry.
    if ((ax === bx) === (ay === by)) fail(`${path}.route[${i}]`, "each segment must be horizontal or vertical and not empty");
  }
  const pads = arr(m["pads"], `${path}.pads`, 1, 32).map((v, i) => {
    const p = `${path}.pads[${i}]`;
    const pad = obj(v, p, ["id", "x", "y", "opensAfterWave"]);
    return {
      id: str(pad["id"], `${p}.id`, KEY_ID_PATTERN, 40),
      x: int(pad["x"], `${p}.x`, 0, cols - 1),
      y: int(pad["y"], `${p}.y`, 0, rows - 1),
      opensAfterWave: int(pad["opensAfterWave"], `${p}.opensAfterWave`, 0, CAMPAIGN_WAVES),
    };
  });
  unique(
    pads.map((p) => `${p.x},${p.y}`),
    `${path}.pads (tiles)`,
  );
  if (!pads.some((p) => p.opensAfterWave === 0)) fail(`${path}.pads`, "at least one pad must be open from the start");
  // Gate M (LD1): the map rules the renderer and simulation need (tier 1 route art, grid, no crossing, no pad on the
  // route); the softer design rules are planetProblems' (src/map/rules.ts), checked by the editor and the publisher.
  const mapProblem = hardMapProblems({ grid: { cols, rows }, route, pads }, path)[0];
  if (mapProblem !== undefined) fail(mapProblem.field, problemMessage(mapProblem));

  let art: PlanetMap["art"] = { backdrop: null, decorations: [] };
  if (schema === 2) {
    const a = obj(m["art"], `${path}.art`, ["backdrop", "decorations"]);
    const backdrop = a["backdrop"] === null ? null : str(a["backdrop"], `${path}.art.backdrop`, LIBRARY_PICTURE_PATTERN, 40);
    const decorations = arr(a["decorations"], `${path}.art.decorations`, 0, MAX_DECORATIONS).map((v, i) => {
      const p = `${path}.art.decorations[${i}]`;
      const d = obj(v, p, ["art", "x", "y"]);
      const id = str(d["art"], `${p}.art`, KEY_ID_PATTERN, 40);
      if (!REPO_DECORATIONS.includes(id) && !LIBRARY_PICTURE_PATTERN.test(id)) fail(`${p}.art`, `"${id}" is neither a repo decoration nor a library picture`);
      return { art: id, x: int(d["x"], `${p}.x`, 0, cols - 1), y: int(d["y"], `${p}.y`, 0, rows - 1) };
    });
    unique(
      decorations.map((d) => `${d.x},${d.y}`),
      `${path}.art.decorations (tiles)`,
    );
    art = { backdrop, decorations };
  }
  return { name: schema === 2 ? str(m["name"], `${path}.name`, undefined, 60) : "", grid: { cols, rows }, route, pads, art };
}

function parseWaveBody(v: unknown, p: string, ruleset: Ruleset, keys: readonly string[]): WaveBody & Obj {
  const w = obj(v, p, [...keys, "groups", "hpMult", "speedMult"]);
  let bossGroups = 0;
  const groups = arr(w["groups"], `${p}.groups`, 1, 20).map((gv, j): SpawnGroup => {
    const gp = `${p}.groups[${j}]`;
    // A carrier's cargo (C6.3) is a mechanics 3 rule; an older ruleset's simulation would ignore it.
    const group = obj(gv, gp, ["type", "count", "at", "gap"], ruleset.mechanics >= 3 ? ["cargo"] : []);
    const type = str(group["type"], `${gp}.type`, KEY_ID_PATTERN, 40);
    const count = int(group["count"], `${gp}.count`, 1, 200);
    if (isBoss(ruleset, type)) {
      // C7: a boss wave has one boss. Its releases are its phases' and its defeat's, never a wave's cargo.
      bossGroups += 1;
      if (count !== 1 || bossGroups > 1) fail(`${gp}`, `a wave schedules at most one boss, once ("${type}")`);
      if (Object.hasOwn(group, "cargo")) fail(`${gp}.cargo`, `"${type}" is a boss: its releases are in the ruleset`);
    } else {
      const alien = ruleset.aliens[type];
      if (alien === undefined) fail(`${gp}.type`, `alien "${type}" is not in ruleset ${ruleset.version}`);
      if (alien.descendantOnly) fail(`${gp}.type`, `"${type}" is only ever released by another alien, never scheduled (C6.1)`);
    }
    const parsed: SpawnGroup = {
      type,
      count,
      at: num(group["at"], `${gp}.at`, true, 600),
      gap: num(group["gap"], `${gp}.gap`, true, 600),
    };
    if (Object.hasOwn(group, "cargo")) {
      const alien = ruleset.aliens[type];
      if (alien?.traits.children === undefined) fail(`${gp}.cargo`, `"${type}" releases nothing, so it has no cargo to name`);
      parsed.cargo = parseReleases(group["cargo"], `${gp}.cargo`);
      checkReleases(parsed.cargo, ruleset.aliens, `${gp}.cargo`);
    }
    return parsed;
  });
  return { ...w, groups, hpMult: num(w["hpMult"], `${p}.hpMult`, false, 100), speedMult: num(w["speedMult"], `${p}.speedMult`, false, 10) };
}

/**
 * Parse a planet document against the ruleset it will be played with (alien types and classes must exist there).
 * Schema 1 has no `schema` key and one `map`; schema 2 (Gate M, LD2) says `"schema": 2` and has `maps`,
 * optional `challengeWaves` and a `mapId` per wave set. Pad IDs are unique across the whole document, so the bounds
 * file's `pads` map stays flat.
 */
export function parsePlanet(raw: unknown, ruleset: Ruleset): PlanetDocument {
  const schema: 1 | 2 = typeof raw === "object" && raw !== null && Object.hasOwn(raw, "schema") ? 2 : 1;
  const top =
    schema === 2
      ? obj(raw, "planet", ["kind", "schema", "version", "planetId", "name", "maps", "waves", "waveSets"], ["$comment", "challengeWaves"])
      : obj(raw, "planet", ["kind", "version", "planetId", "name", "map", "waves", "waveSets"], ["$comment"]);
  if (top["kind"] !== "campaign") fail("planet.kind", 'must be "campaign"');
  if (schema === 2 && top["schema"] !== 2) fail("planet.schema", "must be 2 (a schema 1 document has no schema key)");
  const version = checkVersion(top["version"], "planet.version");

  const maps =
    schema === 2 ? idMap(top["maps"], "planet.maps", (v, p) => parseMap(v, p, 2)) : { [SCHEMA1_MAP_ID]: parseMap(top["map"], "planet.map", 1) };
  if (Object.keys(maps).length > MAX_MAPS) fail("planet.maps", `at most ${MAX_MAPS} maps`);
  unique(
    Object.values(maps).flatMap((m) => m.pads.map((p) => p.id)),
    schema === 2 ? "planet.maps (pad IDs)" : "planet.map.pads",
  );

  const waves = arr(top["waves"], "planet.waves", 1).map((v, i) => {
    const p = `planet.waves[${i}]`;
    const w = parseWaveBody(v, p, ruleset, ["wave"]);
    return { wave: int(w["wave"], `${p}.wave`, 1, CAMPAIGN_WAVES), groups: w.groups, hpMult: w.hpMult, speedMult: w.speedMult };
  });
  for (let i = 1; i < waves.length; i += 1) {
    if ((waves[i]?.wave ?? 0) <= (waves[i - 1]?.wave ?? 0)) fail("planet.waves", "must be in increasing wave order, each once");
  }
  const authored = new Map(waves.map((w) => [w.wave, w]));
  const challengeWaves: Record<string, ChallengeWave> =
    schema === 2 && Object.hasOwn(top, "challengeWaves")
      ? idMap(
          top["challengeWaves"],
          "planet.challengeWaves",
          (v, p) => {
            const w = parseWaveBody(v, p, ruleset, []);
            return { groups: w.groups, hpMult: w.hpMult, speedMult: w.speedMult };
          },
          0,
        )
      : {};

  return {
    kind: "campaign",
    schema,
    version,
    planetId: str(top["planetId"], "planet.planetId", KEY_ID_PATTERN, 40),
    name: str(top["name"], "planet.name", undefined, 60),
    maps,
    waves,
    challengeWaves,
    waveSets: idMap(top["waveSets"], "planet.waveSets", (v, p) =>
      parseWaveSet(v, p, p.slice("planet.waveSets.".length), ruleset, authored, challengeWaves, maps, schema),
    ),
  };
}

/** The map a wave set is played on. */
export function waveSetMap(planet: PlanetDocument, waveSetId: string): PlanetMap {
  const set = planet.waveSets[waveSetId];
  const map = set === undefined ? undefined : planet.maps[set.mapId];
  if (map === undefined) throw new GameDataError(`planet ${planet.version}: no map for wave set ${waveSetId}`);
  return map;
}

/** The wave a wave set's reference names: a campaign wave by number or a challenge wave by ID. */
export function waveFor(planet: Pick<PlanetDocument, "waves" | "challengeWaves">, ref: WaveRef): WaveBody | undefined {
  return typeof ref === "number" ? planet.waves.find((w) => w.wave === ref) : planet.challengeWaves[ref];
}

// ---- bounds file ------------------------------------------------------------------------------------------------

/**
 * Credits one alien of `type` is worth if it and everything it releases is defeated (C6.3: parent and offspring
 * bounties are separate lines; a Craft pays 6 and each of its Moon Blobs 4). `releases` is a group's cargo, or the
 * type's own children when the group names none. A boss (C7) is worth its bounty plus everything every phase and its
 * defeat release: phase actions always run before the defeat check, so a boss wave's bounty is a constant
 * (tools/sim/sim.py Game._type_bounty).
 */
export function alienBounty(ruleset: Ruleset, type: string, releases?: readonly ReleaseSpec[], bossBounty?: number | null): number {
  const boss = ruleset.bosses[type];
  if (boss !== undefined) {
    let total = bossBounty ?? boss.bounty; // an endless boss pays the endless boss bounty (C11.2)
    const all = [...boss.phases.flatMap((p) => p.onEnter?.release ?? []), ...(boss.onDefeatRelease ?? [])];
    for (const r of all) total += r.count * alienBounty(ruleset, r.type);
    return total;
  }
  const alien = ruleset.aliens[type];
  if (alien === undefined) return 0;
  let total = alien.bounty;
  for (const r of releases ?? alien.traits.children ?? []) total += r.count * alienBounty(ruleset, r.type);
  return total;
}

/**
 * Credits on offer in one authored wave if nothing leaks (C8.1), descendants included (the server bound maxBounty
 * relies on C6.4: nothing is dropped, duplicated or re-priced, so this is a constant).
 */
export function waveBounty(ruleset: Ruleset, wave: WaveBody | EndlessWave): number {
  const bossBounty = "bossBounty" in wave ? wave.bossBounty : null;
  let total = 0;
  for (const group of wave.groups) total += group.count * alienBounty(ruleset, group.type, group.cargo, bossBounty);
  return total;
}

/** The numbers-only bounds file for one (ruleset, planet) pair (spine S5.1, S6; C15). Deterministic key order. */
export function buildBounds(ruleset: Ruleset, planet: PlanetDocument): Bounds {
  const authored = new Map(planet.waves.map((w) => [w.wave, w]));
  const endless = ruleset.endless;
  const classes: Bounds["classes"] = {};
  for (const [id, cls] of Object.entries(ruleset.classes)) {
    let running = 0;
    const levelCosts = cls.levels.map((l) => l.cost);
    const gated = Object.fromEntries(
      placementTargetings(cls)
        .map((mode) => [mode, cls.targetingFromLevel[mode] ?? 1] as const)
        .filter(([, level]) => level > 1),
    );
    classes[id] = {
      unlockAfterWave: cls.unlockAfterWave,
      deployCap: cls.deployCap,
      targeting: placementTargetings(cls),
      levelCosts,
      cumulativeCosts: levelCosts.map((cost) => (running += cost)),
      ...(Object.keys(gated).length > 0 ? { targetingFromLevel: gated } : {}),
    };
  }
  const pads: Bounds["pads"] = {};
  for (const pad of Object.values(planet.maps)
    .flatMap((m) => m.pads)
    .sort((a, b) => (a.id < b.id ? -1 : 1))) {
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
        const wave = waveFor(planet, n);
        if (wave === undefined) throw new GameDataError(`wave set ${id}: wave ${n} is missing`);
        return waveBounty(ruleset, wave);
      }),
      normalRewardByInterval: Array.from({ length: finalWave - 1 }, (_, i) => learningReward(ruleset, i + 1)),
      ...(endless !== undefined && set.mode === "CAMPAIGN"
        ? {
            endless: {
              maxBounty: Array.from({ length: ENDLESS_LAST_WAVE - endless.startsAtWave + 1 }, (_, i) =>
                waveBounty(ruleset, endlessWave(endless, ruleset.bosses, authored, endless.startsAtWave + i)),
              ),
              learningReward: ruleset.economy.endlessLearningReward,
            },
          }
        : {}),
      // Schema 2 only, so schema 1 files keep their published bytes (Gate M, LD2).
      ...(planet.schema === 2 ? { pads: (planet.maps[set.mapId]?.pads ?? []).map((p) => p.id).sort() } : {}),
    };
  }
  return {
    kind: "bounds",
    rulesetVersion: ruleset.version,
    campaignVersion: planet.version,
    mechanics: ruleset.mechanics,
    colony: { maxHealth: ruleset.colony.maxHealth, shieldCap: ruleset.colony.shieldCap },
    powerInventoryCap: ruleset.powerRules.inventoryCapPerPower,
    ...((ruleset.powerRules.awardRotation?.length ?? 0) > 0 ? { powerAwardRotation: [...(ruleset.powerRules.awardRotation ?? [])] } : {}),
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
