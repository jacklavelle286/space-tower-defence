// GameBridge: the one typed seam between React and the battlefield (spine S10, E.5.3; Phase 14, M1-21).
//
// Commands go in (React -> game): loadRun, startWave, pause, resume, setSpeed, place, upgrade, sell, setTargeting,
// selectPad. Events come out (game -> React), as past-tense facts: hud, selectionChanged, waveCleared, defeated,
// commandRejected. usePower arrives with powers (M2).
//
// Who decides what:
// - game-core decides everything about the battle (Battle, step, the commands' rules) and the run (the reducer,
//   through a RunPort: LocalRun locally, SyncedRun for a saved run). The bridge only routes.
// - The Phaser scene calls frame(deltaMs) once per rendered frame and then draws `battle` as it finds it. It never
//   changes the battle; pointer input comes back in as selectPad.
// - React never re-renders per frame: `hud` and `selectionChanged` are sent at most once per HUD_INTERVAL_MS of
//   frame time (10 per second) and only when something shown has changed, so a button press shows up within
//   100 ms however fast the child clicks. waveCleared, defeated and
//   commandRejected are rare and sent at once.
//
// The pause flag belongs to the simulation, not to Phaser: only an explicit resume() clears it (spine S10), so a
// tab that comes back from the background stays paused until the child presses Resume.
import {
  battleSnapshot,
  createBattle,
  drainEvents,
  giveCommand,
  runFrame,
  sellRefund,
  startWave as beginWave,
  type Battle,
  type BattleConfig,
  type BattleEvent,
  type BattleStats,
  type ClockState,
  type Command,
  type RejectReason,
  type RunPhase,
  type RunStatus,
  type Snapshot,
  type Speed,
  type Targeting,
} from "@scd/game-core";
import type { RunPort } from "./runPort";

/** HUD events at most 10 per second (spine S10, E.5.2). */
export const HUD_INTERVAL_MS = 100;

export interface HudState {
  readonly credits: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly shield: number;
  /** 1-based position in the wave set, and how many waves it has. */
  readonly wave: number;
  readonly finalWave: number;
  readonly runStatus: RunStatus;
  /** The persisted run phase (absent once the run has ended). */
  readonly runPhase: RunPhase | null;
  /** The battle's own state: preparing, fighting, or just finished. */
  readonly battle: Battle["status"] | null;
  readonly aliensLeft: number;
  readonly speed: Speed;
  readonly paused: boolean;
  readonly highestCompletedWave: number;
}

export interface Selection {
  readonly padId: string;
  readonly open: boolean;
  readonly tower: { readonly classId: string; readonly level: number; readonly targeting: Targeting } | null;
  /** Price to place Nova here (empty pad) or to upgrade (occupied, below level 3); null if not possible. */
  readonly placeCost: number | null;
  readonly upgradeCost: number | null;
  readonly sellRefund: number | null;
}

export interface BridgeEvents {
  hud: HudState;
  selectionChanged: Selection | null;
  waveCleared: { readonly wave: number; readonly snapshot: Snapshot; readonly stats: BattleStats };
  defeated: { readonly wave: number };
  commandRejected: { readonly command: Command; readonly reason: RejectReason };
}

type Listener<K extends keyof BridgeEvents> = (payload: BridgeEvents[K]) => void;

function sameShallow(a: object | null, b: object | null): boolean {
  if (a === null || b === null) return a === b;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => {
    const va: unknown = (a as Record<string, unknown>)[k];
    const vb: unknown = (b as Record<string, unknown>)[k];
    return typeof va === "object" && typeof vb === "object" ? JSON.stringify(va) === JSON.stringify(vb) : va === vb;
  });
}

export class GameBridge {
  readonly config: BattleConfig;
  readonly #run: RunPort;
  readonly #seed: string;
  #battle: Battle | null = null;
  #clock: ClockState = { accumulator: 0 };
  #speed: Speed = 1;
  #paused = false;
  #selectedPad: string | null = null;
  /** Battle events for the scene's effects (stars, beams), taken by takeSceneEvents each frame. */
  #sceneEvents: BattleEvent[] = [];
  #sinceHud = HUD_INTERVAL_MS;
  #lastHud: HudState | null = null;
  #lastSelection: Selection | null = null;
  #reported = false;
  readonly #listeners: { [K in keyof BridgeEvents]: Set<Listener<K>> } = {
    hud: new Set(),
    selectionChanged: new Set(),
    waveCleared: new Set(),
    defeated: new Set(),
    commandRejected: new Set(),
  };
  readonly #unsubscribeRun: () => void;

  constructor(config: BattleConfig, run: RunPort, seed: string) {
    this.config = config;
    this.#run = run;
    this.#seed = seed;
    // A run change that lands in BUILD (the activity resolved) prepares the next wave.
    this.#unsubscribeRun = run.subscribe(() => this.loadRun());
    this.loadRun();
  }

  // ---- events --------------------------------------------------------------------------------------------------

  on<K extends keyof BridgeEvents>(event: K, listener: Listener<K>): () => void {
    this.#listeners[event].add(listener);
    return () => this.#listeners[event].delete(listener);
  }

  #emit<K extends keyof BridgeEvents>(event: K, payload: BridgeEvents[K]): void {
    for (const listener of this.#listeners[event]) listener(payload);
  }

  /** Stop listening to the run; called when the battlefield unmounts. */
  destroy(): void {
    this.#unsubscribeRun();
    for (const set of Object.values(this.#listeners)) set.clear();
  }

  // ---- what the scene reads ------------------------------------------------------------------------------------

  /** The battle as it stands, for drawing only. Null between waves while an activity is open, and after the run. */
  get battle(): Readonly<Battle> | null {
    return this.#battle;
  }

  /** The simulation's pause flag (the scene also pauses its animations). */
  get paused(): boolean {
    return this.#paused;
  }

  get selectedPad(): string | null {
    return this.#selectedPad;
  }

  /** Shots, defeats and leaks since the last call, for cosmetic effects. */
  takeSceneEvents(): BattleEvent[] {
    const events = this.#sceneEvents;
    this.#sceneEvents = [];
    return events;
  }

  /** The current HUD values (React reads this once on mount, then listens to `hud`). */
  hud(): HudState {
    const run = this.#run.state;
    const b = this.#battle;
    const snap = run.snapshot;
    return {
      credits: b?.credits ?? snap?.credits ?? 0,
      health: b?.health ?? snap?.colony.health ?? 0,
      maxHealth: this.config.colony.maxHealth,
      shield: b?.shield ?? snap?.colony.shield ?? 0,
      wave: run.wave,
      finalWave: run.finalWave,
      runStatus: run.status,
      runPhase: run.phase ?? null,
      battle: b?.status ?? null,
      aliensLeft: b === null ? 0 : b.aliens.length + (this.config.waves[b.wave - 1]?.spawns.length ?? 0) - b.spawnIndex,
      speed: this.#speed,
      paused: this.#paused,
      highestCompletedWave: run.highestCompletedWave,
    };
  }

  selection(): Selection | null {
    const padId = this.#selectedPad;
    const b = this.#battle;
    if (padId === null || b === null) return null;
    const pad = this.config.pads.find((p) => p.id === padId);
    if (pad === undefined) return null;
    const tower = b.towers.find((t) => t.padId === padId) ?? null;
    const nova = this.config.classes["nova"];
    const cls = tower === null ? undefined : this.config.classes[tower.classId];
    const fighting = b.status === "PREP" || b.status === "IN_WAVE";
    return {
      padId,
      open: pad.open,
      tower: tower === null ? null : { classId: tower.classId, level: tower.level, targeting: tower.targeting },
      placeCost: fighting && tower === null && pad.open ? (nova?.levels[0]?.cost ?? null) : null,
      upgradeCost: fighting && tower !== null ? (cls?.levels[tower.level]?.cost ?? null) : null,
      sellRefund:
        fighting && tower !== null && cls !== undefined ? sellRefund(cls.levels[tower.level - 1]?.invested ?? 0, this.config.sell) : null,
    };
  }

  // ---- the frame loop ------------------------------------------------------------------------------------------

  /** Called by the scene once per rendered frame with the measured time since the last frame. */
  frame(deltaMs: number): void {
    const b = this.#battle;
    if (b !== null) {
      this.#clock = runFrame(b, this.#clock, deltaMs, this.#speed, this.#paused).clock;
      this.#collect(b);
      if (!this.#reported && (b.status === "CLEARED" || b.status === "DEFEATED")) this.#finishWave(b);
    }
    this.#sinceHud += Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
    if (this.#sinceHud >= HUD_INTERVAL_MS) this.#publish();
  }

  /** Send hud / selectionChanged if they changed, and restart the 100 ms window. */
  #publish(): void {
    const hud = this.hud();
    const selection = this.selection();
    let sent = false;
    if (!sameShallow(hud, this.#lastHud)) {
      this.#lastHud = hud;
      this.#emit("hud", hud);
      sent = true;
    }
    if (!sameShallow(selection, this.#lastSelection)) {
      this.#lastSelection = selection;
      this.#emit("selectionChanged", selection);
      sent = true;
    }
    if (sent) this.#sinceHud = 0;
  }

  #collect(b: Battle): void {
    for (const e of drainEvents(b)) {
      if (e.kind === "rejected") this.#emit("commandRejected", { command: e.command, reason: e.reason });
      else this.#sceneEvents.push(e);
    }
  }

  #finishWave(b: Battle): void {
    this.#reported = true;
    if (b.status === "DEFEATED") {
      this.#run.defeat();
      this.#emit("defeated", { wave: b.wave });
      return;
    }
    const snapshot = battleSnapshot(b);
    // COMPLETE_WAVE through the reducer; the run listener then prepares the next wave if no activity is due.
    this.#run.completeWave(snapshot);
    this.#emit("waveCleared", { wave: b.wave, snapshot, stats: { ...b.stats } });
  }

  // ---- commands ------------------------------------------------------------------------------------------------

  /**
   * Make the battlefield match the run: in BUILD (or IN_WAVE on resume: the wave starts again from its wave-start
   * snapshot, spine S3.2), prepare a fresh battle for the run's wave from the snapshot. In other phases the last
   * battle stays on screen (finished) so the board is visible behind the activity and end screens.
   */
  loadRun(): void {
    const run = this.#run.state;
    const wantsBattle = run.status === "IN_PROGRESS" && (run.phase === "BUILD" || run.phase === "IN_WAVE");
    if (!wantsBattle || run.snapshot === undefined) return;
    const b = this.#battle;
    if (b !== null && b.wave === run.wave && (b.status === "PREP" || b.status === "IN_WAVE")) return;
    this.#battle = createBattle(this.config, run.snapshot, run.wave, this.#seed);
    this.#clock = { accumulator: 0 };
    this.#reported = false;
    this.#sceneEvents = [];
  }

  /** Ready: START_WAVE through the reducer with the wave-start credits and placements, then the ticks begin. */
  startWave(): void {
    const b = this.#battle;
    if (b === null || b.status !== "PREP") return;
    const start = battleSnapshot(b);
    this.#run.startWave(start.credits, start.placements);
    beginWave(b);
  }

  /**
   * Credits and placements while the battle is being prepared (PREP), for SAVE_PREP on Save and exit; null during a
   * wave (save-and-exit mid-wave writes nothing, spine S3.2) or when there is no battle.
   */
  prepSnapshot(): Pick<Snapshot, "credits" | "placements"> | null {
    const b = this.#battle;
    if (b === null || b.status !== "PREP") return null;
    const { credits, placements } = battleSnapshot(b);
    return { credits, placements };
  }

  pause(): void {
    this.#paused = true;
  }

  resume(): void {
    this.#paused = false;
  }

  setSpeed(speed: Speed): void {
    this.#speed = speed;
  }

  place(padId: string, classId: string): void {
    this.#command({ kind: "place", padId, classId });
  }

  upgrade(padId: string): void {
    this.#command({ kind: "upgrade", padId });
  }

  sell(padId: string): void {
    this.#command({ kind: "sell", padId });
  }

  setTargeting(padId: string, targeting: Targeting): void {
    this.#command({ kind: "setTargeting", padId, targeting });
  }

  selectPad(padId: string | null): void {
    this.#selectedPad = padId;
  }

  #command(command: Command): void {
    const b = this.#battle;
    if (b === null) {
      this.#emit("commandRejected", { command, reason: "NOT_NOW" });
      return;
    }
    giveCommand(b, command); // in PREP it applies now; in the wave it waits for the next tick
    this.#collect(b);
  }
}
