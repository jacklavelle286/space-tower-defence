// Public entry point of the pure rules package: the fixed-timestep clock (Phase 10), the rules (Phase 11), the game
// data parsers (Phase 13) and the battle simulation (Phase 14).

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
  GameDataError,
  isBoss,
  learningReward,
  parseCurrent,
  parsePlanet,
  parseRuleset,
  placementTargetings,
  SUPPORTED_MECHANICS,
  targetingAllowed,
  type Alien,
  type AlienTraits,
  type AstronautClass,
  type AttackKind,
  type AuthoredWave,
  type Boss,
  type BossPhase,
  type BossPhaseActions,
  type CurrentPointers,
  type Pad,
  type PlanetDocument,
  type ReleaseSpec,
  type Ruleset,
  type SpawnGroup,
  type WaveSet,
} from "./data/game-data";

export * from "./sim";
