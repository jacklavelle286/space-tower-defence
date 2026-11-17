// The battle simulation (Phase 14, M1-21; C2; the six-class roster and economy, Phase 24, M2-01; targeting and support
// rules, Phase 25, M2-02; aliens, carriers and caps, Phase 26, M2-03; bosses, Phase 27, M2-04). Pure: no Phaser, DOM, timers or randomness from
// the host.
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
  type PendingRelease,
  type RejectReason,
  type Tower,
} from "./battle";
export {
  armouredDamage,
  bossPhaseAt,
  bossSlowPct,
  buffedDamage,
  compileBattleConfig,
  flyingBlastDamage,
  healAmount,
  secondsToTicks,
  sellRefund,
  speedToUnitsPerTick,
  waveHealth,
  type AlienStats,
  type BattleConfig,
  type BossPhaseStats,
  type BossStats,
  type BuffStats,
  type CapStats,
  type ClassStats,
  type HealerStats,
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
