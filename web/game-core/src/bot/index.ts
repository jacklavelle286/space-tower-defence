// Test players for the level designer (Gate M, LD0; C17.1): the simulator's policies on the game's own simulation.
export { deriveBlueprint, MOONBEAM_BLUEPRINT, type Blueprint } from "./board";
export { competentPolicy, minimalPolicy, naivePolicy, nonePolicy, presetsOnlyPolicy, type CompetentOptions, type NaiveOptions } from "./policies";
export {
  fightWave,
  learnSucceeds,
  MAX_WAVE_TICKS,
  playWaveSet,
  startingSnapshot,
  type BotRunOptions,
  type BotRunResult,
  type Policy,
  type WaveOutcome,
  type WaveRow,
} from "./runner";
export { runTrial, stressConfig, type TrialResult } from "./trial";
