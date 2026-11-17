// Test players for the level designer (Gate M, LD0; C17.1): the simulator's policies on the game's own simulation,
// and the balance checks built on them (LD5).
export { deriveBlueprint, MOONBEAM_BLUEPRINT, type Blueprint } from "./board";
export { competentPolicy, minimalPolicy, naivePolicy, nonePolicy, presetsOnlyPolicy, type CompetentOptions, type NaiveOptions } from "./policies";
export {
  fightWave,
  learnSucceeds,
  MAX_WAVE_TICKS,
  playUpTo,
  playWaveSet,
  startingSnapshot,
  type BotRunOptions,
  type BotRunResult,
  type Policy,
  type WaveOutcome,
  type WaveRow,
} from "./runner";
export { runTrial, stressConfig, type TrialResult } from "./trial";
export {
  CHECK_TEXT,
  judgeChecks,
  LEARNING_RATES,
  NAIVE_SEEDS,
  planChecks,
  runJob,
  type CellState,
  type CheckColumn,
  type CheckFinding,
  type CheckJob,
  type CheckPolicy,
  type CheckRule,
  type JobResult,
  type WaveSetReport,
} from "./checks";
