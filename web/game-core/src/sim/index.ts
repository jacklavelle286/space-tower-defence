// The battle simulation (Phase 14, M1-21; C2; the six-class roster and economy, Phase 24, M2-01; targeting and support
// rules, Phase 25, M2-02). Pure: no Phaser, DOM, timers or randomness from the host.
export {
  ALIEN_LOOKS,
  battleSnapshot,
  buffPctAt,
  checkCommand,
  classAvailability,
  createBattle,
  drainEvents,
  giveCommand,
  placementsOf,
  startWave,
  step,
  type AlienState,
  type Battle,
  type BattleEvent,
  type BattleStats,
  type BattleStatus,
  type Command,
  type CommandResult,
  type RejectReason,
  type Tower,
} from "./battle";
export {
  buffedDamage,
  compileBattleConfig,
  secondsToTicks,
  sellRefund,
  speedToUnitsPerTick,
  waveHealth,
  type AlienStats,
  type BattleConfig,
  type BuffStats,
  type ClassStats,
  type LevelStats,
  type PadInfo,
  type ScheduledSpawn,
  type ShieldStats,
  type ShotStats,
  type SlowStats,
  type WavePlan,
} from "./config";
export { runFrame, type FrameResult } from "./frame";
export { nextInt, nextRandom, waveSeed } from "./rng";
export { buildRoute, routePoint, UNITS_PER_TILE, withinRange, type Point, type Route, type RouteSegment } from "./route";
export { initialRunState } from "./run";
