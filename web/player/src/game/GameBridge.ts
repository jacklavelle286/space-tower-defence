// GameBridge: the one typed seam between React and the battlefield (spine S10, E.5.3; Phase 14, M1-21).
//
// Commands go in (React -> game): loadRun, startWave, pause, resume, setSpeed, place, upgrade, sell, setTargeting,
// usePower (Phase 28: a meteor power, C10), selectPad; Phase 31 adds arm (a shop card chosen, then a pad), focusPad
// (keyboard focus on a pad, for the range preview) and the Comet Burst aiming ring (startAim, moveAim, aimAt,
// dropAim, cancelAim: C2.1, aiming pauses the battle, so it is untimed). Events come out (game -> React), as past-tense facts: hud,
// selectionChanged, waveCleared, defeated, commandRejected.
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
  UNITS_PER_TILE,
  battleSnapshot,
  padOpen,
  planFor,
  checkCommand,
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
  /** Meteor power charges held, by power ID (C10): the battle's while one exists, else the run snapshot's. */
  readonly powers: Readonly<Record<string, number>>;
  /** The shop card chosen to place next (Phase 31, D4), or null. */
  readonly armed: string | null;
  /** The power being aimed (a Comet Burst's ring is on the route; the battle is paused), or null. */
  readonly aiming: string | null;
  /** One shop card per class of the wave set, in its order (D4 "Shop"). */
  readonly shop: readonly ShopCard[];
}

/** A shop card (D4): its price, and why it cannot be placed now (game-core's rules, checked without a pad). */
export interface ShopCard {
  readonly classId: string;
  readonly name: string;
  readonly cost: number;
  readonly unlockAfterWave: number;
  /** "ok", or the reason no pad would take it: still locked, at its deploy cap, or not enough credits. */
  readonly state: "ok" | "locked" | "cap" | "credits";
}

/** Half a tile per arrow press when moving the Comet Burst ring (D5.2). */
export const AIM_STEP = UNITS_PER_TILE / 2;

/** One class the pad panel can offer for an empty pad (Phase 24): its price, and why it cannot be bought now. */
export interface PlaceOffer {
  readonly classId: string;
  readonly name: string;
  /** The level-1 price from the ruleset (C5.2). */
  readonly cost: number;
  /** For a locked card's "Unlocks after wave N" (C5.9). */
  readonly unlockAfterWave: number;
  /** null when placing it here would be accepted now; otherwise game-core's reason (credits, cap, locked...). */
  readonly refusal: RejectReason | null;
}

export interface Selection {
  readonly padId: string;
  readonly open: boolean;
  readonly tower: { readonly classId: string; readonly name: string; readonly level: number; readonly targeting: Targeting } | null;
  /** The classes the wave set lists, in its order, for an open empty pad while preparing or fighting; else empty. */
  readonly offers: readonly PlaceOffer[];
  /** Price to upgrade (occupied, below level 3); null if not possible. */
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
  #armed: string | null = null;
  #focusedPad: string | null = null;
  #aim: { powerId: string; target: number } | null = null;
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

  /** The shop card chosen to place next, or null. */
  get armed(): string | null {
    return this.#armed;
  }

  /** Whether `padId` takes an astronaut in the wave on screen (C3.3: in a campaign, pads open as waves are cleared). */
  isPadOpen(padId: string): boolean {
    const pad = this.config.pads.find((p) => p.id === padId);
    if (pad === undefined) return false;
    return padOpen(this.config, pad, this.#battle?.wave ?? this.#run.state.wave);
  }

  /** The pad with keyboard focus (the scene previews the armed class's range there), or null. */
  get focusedPad(): string | null {
    return this.#focusedPad;
  }

  /** The Comet Burst being aimed: which power, and the route progress (units) the ring is on. */
  get aim(): { readonly powerId: string; readonly target: number } | null {
    return this.#aim;
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
      // On the route, still scheduled, and still to come out of defeated carriers and splitters (C6.3).
      aliensLeft:
        b === null
          ? 0
          : b.aliens.length +
            planFor(this.config, b.wave).spawns.length -
            b.spawnIndex +
            b.releases.reduce((n, r) => n + r.types.length - r.released, 0),
      speed: this.#speed,
      paused: this.#paused,
      highestCompletedWave: run.highestCompletedWave,
      powers: { ...(b?.powers ?? snap?.powers ?? {}) },
      armed: this.#armed,
      aiming: this.#aim?.powerId ?? null,
      shop: this.#shop(),
    };
  }

  /** The shop cards: the same rules game-core's checkCommand applies to a placement, without a pad (C5.8, C5.9). */
  #shop(): ShopCard[] {
    const b = this.#battle;
    const wave = b?.wave ?? this.#run.state.wave;
    const credits = b?.credits ?? this.#run.state.snapshot?.credits ?? 0;
    return this.config.waveSet.classes.flatMap((classId) => {
      const cls = this.config.classes[classId];
      const cost = cls?.levels[0]?.cost;
      if (cls === undefined || cost === undefined) return [];
      const placed = b?.towers.filter((t) => t.classId === classId).length ?? 0;
      const state: ShopCard["state"] =
        this.config.waveSet.mode === "CAMPAIGN" && cls.unlockAfterWave > wave - 1
          ? "locked"
          : cls.deployCap !== null && placed >= cls.deployCap
            ? "cap"
            : credits < cost
              ? "credits"
              : "ok";
      return [{ classId, name: cls.name, cost, unlockAfterWave: cls.unlockAfterWave, state }];
    });
  }

  selection(): Selection | null {
    const padId = this.#selectedPad;
    const b = this.#battle;
    if (padId === null || b === null) return null;
    const pad = this.config.pads.find((p) => p.id === padId);
    if (pad === undefined) return null;
    const tower = b.towers.find((t) => t.padId === padId) ?? null;
    const cls = tower === null ? undefined : this.config.classes[tower.classId];
    const fighting = b.status === "PREP" || b.status === "IN_WAVE";
    // Every offer is game-core's own check of the purchase (checkCommand), so the panel can never offer what the
    // simulation would refuse; the simulation still checks the real command when it applies (AC-09).
    const offers: PlaceOffer[] = [];
    const open = padOpen(this.config, pad, b.wave);
    if (fighting && tower === null && open) {
      for (const classId of this.config.waveSet.classes) {
        const offered = this.config.classes[classId];
        const cost = offered?.levels[0]?.cost;
        if (offered === undefined || cost === undefined) continue;
        const check = checkCommand(b, { kind: "place", padId, classId });
        offers.push({ classId, name: offered.name, cost, unlockAfterWave: offered.unlockAfterWave, refusal: check.ok ? null : check.reason });
      }
    }
    return {
      padId,
      open,
      tower:
        tower === null ? null : { classId: tower.classId, name: cls?.name ?? tower.classId, level: tower.level, targeting: tower.targeting },
      offers,
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
      // Aiming a Comet Burst pauses the battle too (C2.1), without the Paused card: dropping or cancelling resumes.
      this.#clock = runFrame(b, this.#clock, deltaMs, this.#speed, this.#paused || this.#aim !== null).clock;
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
    this.#aim = null; // a new wave never inherits an aiming ring
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

  /**
   * Use a meteor power (C10). It waits for the next tick like every command, and game-core decides: a use with no
   * charge, twice in a wave, inside the lockout or outside a wave comes back as commandRejected with the reason.
   * `target` is where a Comet Burst lands, as route progress in units (the aiming ring's point on the route).
   */
  usePower(powerId: string, target?: number): void {
    this.#command(target === undefined ? { kind: "usePower", powerId } : { kind: "usePower", powerId, target });
  }

  /**
   * A pad pressed (pointer) or chosen (keyboard). With a shop card armed and the pad open and empty, the armed class is
   * placed there (D4 "Placing"); otherwise the pad is selected (or deselected with null). Either way the card is
   * put down: one card, one placement.
   */
  selectPad(padId: string | null): void {
    const armed = this.#armed;
    this.#armed = null;
    const b = this.#battle;
    const pad = padId === null ? undefined : this.config.pads.find((p) => p.id === padId);
    if (armed !== null && b !== null && pad !== undefined && padOpen(this.config, pad, b.wave) && !b.towers.some((t) => t.padId === pad.id)) {
      this.#selectedPad = null;
      this.place(pad.id, armed);
      return;
    }
    this.#selectedPad = padId;
  }

  /** Choose a shop card (D4), or put it down with null. Choosing one clears the pad selection. */
  arm(classId: string | null): void {
    this.#armed = classId;
    if (classId !== null) this.#selectedPad = null;
  }

  focusPad(padId: string | null): void {
    this.#focusedPad = padId;
  }

  /**
   * Start aiming a power that needs a target (Comet Burst): only during a wave; the ring starts on the front-most
   * alien (C10), or the middle of the route when none is out. The battle pauses until dropAim or cancelAim.
   */
  startAim(powerId: string): void {
    const b = this.#battle;
    if (b === null || b.status !== "IN_WAVE") {
      this.#emit("commandRejected", { command: { kind: "usePower", powerId }, reason: "NOT_NOW" });
      return;
    }
    const front = b.aliens.length === 0 ? Math.floor(this.config.route.length / 2) : Math.max(...b.aliens.map((a) => a.progress));
    this.#aim = { powerId, target: front };
  }

  /** Move the ring along the route by `steps` half tiles (negative: back towards the portal), kept on the route. */
  moveAim(steps: number): void {
    if (this.#aim !== null) this.aimAt(this.#aim.target + steps * AIM_STEP);
  }

  /** Put the ring at a route progress (a pointer press on the route), kept on the route. */
  aimAt(progress: number): void {
    if (this.#aim === null) return;
    this.#aim = { ...this.#aim, target: Math.max(0, Math.min(this.config.route.length, Math.round(progress))) };
  }

  /** Drop the power where the ring is; game-core decides on the next tick whether the use is allowed. */
  dropAim(): void {
    const aim = this.#aim;
    if (aim === null) return;
    this.#aim = null;
    this.usePower(aim.powerId, aim.target);
  }

  cancelAim(): void {
    this.#aim = null;
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
