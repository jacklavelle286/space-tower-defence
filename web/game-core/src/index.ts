// Public entry point of the pure rules package: the fixed-timestep clock (Phase 10), the rules (Phase 11), the game
// data parsers (Phase 13), the battle simulation (Phase 14), the test players and the map rules (Gate M, LD0-LD1).

export {
  advanceClock,
  MAX_FRAME_MS,
  MAX_STEPS_PER_FRAME,
  STEP_UNITS,
  STEPS_PER_SECOND,
  UNITS_PER_MS,
  type ClockFrame,
  type ClockState,
  type Speed,
} from "./clock";

export * from "./rules";

// The mechanics numbers this game-core can run (spine S5.1) live with the data parsers; the old
// MECHANICS_VERSION = 0 placeholder from Phase 1 is replaced by SUPPORTED_MECHANICS.
export {
  alienBounty,
  ATTACK_KINDS,
  boundsJson,
  boundsVersion,
  buildBounds,
  GameDataError,
  isBoss,
  learningReward,
  LIBRARY_PICTURE_PATTERN,
  MAX_DECORATIONS,
  MAX_MAPS,
  meteorAward,
  parseCurrent,
  parsePlanet,
  parseRuleset,
  placementTargetings,
  POWER_EFFECTS,
  REPO_DECORATIONS,
  SCHEMA1_MAP_ID,
  SUPPORTED_MECHANICS,
  targetingAllowed,
  waveFor,
  waveSetMap,
  type Alien,
  type AlienTraits,
  type AstronautClass,
  type AttackKind,
  type AuthoredWave,
  type Boss,
  type BossPhase,
  type BossPhaseActions,
  type ChallengeWave,
  type CurrentPointers,
  type MapDecoration,
  type Pad,
  type ParseOptions,
  type PlanetDocument,
  type PlanetMap,
  type Power,
  type PowerEffect,
  type PowerRules,
  type ReleaseSpec,
  type Ruleset,
  type SpawnGroup,
  type WaveBody,
  type WaveRef,
  type WaveSet,
} from "./data/game-data";

export { asSchema2, levelOwnsField, mergeLevel, ownsCampaign, type LevelSections } from "./data/level";

export * from "./sim";
export * from "./bot";
export * from "./map";
export * from "./waves";
