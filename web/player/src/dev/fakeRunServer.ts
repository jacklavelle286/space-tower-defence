// DEVELOPMENT AND TESTS ONLY. A stand-in for player-api's run routes (R7-R11, R13-R15) that keeps runs in memory
// (or in whatever the caller persists) and applies ops with game-core's reducer, the same rules the server mirrors.
// Used by the development backend (devServices.ts, `npm run dev` only, never in dist) and by the run screen tests.
//
// It is deliberately small: one wave set, one multiple-choice activity (the M1 seed, C25.5 Example B), one clip.
// No selection, no bounds, no fencing beyond "the generation must match".
import { compileBattleConfig, initialRunState, reduce, type RunState } from "@scd/game-core";
import { sha256Hex } from "@scd/shared/audio";
import type { GameData } from "../game/gameData";

export interface FakeClip {
  readonly clipKey: string;
  readonly bytes: Uint8Array;
  readonly contentType: string;
}

export interface FakeReply {
  status: number;
  body: unknown;
}

interface StoredRun {
  runId: string;
  planetId: string;
  waveSetId: string;
  rulesetVersion: string;
  campaignVersion: string;
  createdAt: string;
  lastPlayedAt: string;
  state: RunState;
  recentOpIds: string[];
}

interface Lease {
  sessionId: string;
  generation: number;
  runId: string;
}

export interface FakeServerState {
  runs: StoredRun[];
  lease: Lease | null;
}

/** The M1 seed activity (content/seed/activities/ph-0102.json), as the pack would carry it. */
export const SEED_ACTIVITY = {
  activityId: "ph-0102",
  activityVersion: "20261115T120000Z",
  interactionType: "MULTIPLE_CHOICE",
  prompt: { text: "Listen. Which letters make this sound?" },
  activityPayload: {
    optionStyle: "GRAPHEME",
    options: [
      { id: "a", text: "s" },
      { id: "b", text: "sh" },
      { id: "c", text: "ch" },
      { id: "d", text: "th" },
    ],
  },
  answerSpecification: { accepted: ["b"] },
  presentation: { optionOrder: ["c", "a", "d", "b"] },
} as const;

const err = (status: number, code: string, details?: unknown): FakeReply => ({
  status,
  body: { error: { code, message: code, ...(details === undefined ? {} : { details }) } },
});

export class FakeRunServer {
  readonly #data: GameData;
  readonly #clip: FakeClip;
  readonly #urlFor: (clip: FakeClip) => string;
  readonly #now: () => string;
  readonly #seen: (state: FakeServerState) => void;
  #state: FakeServerState;
  /** Every request, for tests: "METHOD path". */
  readonly log: string[] = [];

  constructor(options: {
    data: GameData;
    clip: FakeClip;
    urlFor: (clip: FakeClip) => string;
    now?: () => string;
    initial?: FakeServerState;
    onChange?: (state: FakeServerState) => void;
  }) {
    this.#data = options.data;
    this.#clip = options.clip;
    this.#urlFor = options.urlFor;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#seen = options.onChange ?? (() => undefined);
    this.#state = options.initial ?? { runs: [], lease: null };
  }

  get state(): FakeServerState {
    return this.#state;
  }

  #save(): void {
    this.#seen(this.#state);
  }

  #run(runId: string): StoredRun | undefined {
    return this.#state.runs.find((r) => r.runId === runId);
  }

  #leaseView(lease: Lease) {
    return {
      sessionId: lease.sessionId,
      generation: lease.generation,
      leaseExpiresAt: new Date(Date.parse(this.#now()) + 180_000).toISOString(),
      leaseSeconds: 180,
      renewAfterSeconds: 60,
    };
  }

  #claim(runId: string, sessionId: string): Lease {
    const held = this.#state.lease;
    const lease = held !== null && held.sessionId === sessionId ? { ...held, runId } : { sessionId, generation: (held?.generation ?? 0) + 1, runId };
    this.#state.lease = lease;
    return lease;
  }

  summary(run: StoredRun) {
    const s = run.state;
    return {
      runId: run.runId,
      planetId: run.planetId,
      waveSetId: run.waveSetId,
      mode: s.mode,
      status: s.status,
      stage: s.stage,
      ...(s.phase === undefined ? {} : { phase: s.phase }),
      wave: s.wave,
      finalWave: s.finalWave,
      highestCompletedWave: s.highestCompletedWave,
      lastPlayedAt: run.lastPlayedAt,
      createdAt: run.createdAt,
      revision: s.revision,
      playable: true,
    };
  }

  #view(run: StoredRun) {
    const s = run.state;
    const currentId = s.phase === "ACTIVITY" ? `N-${String(s.wave - 1).padStart(3, "0")}` : null;
    const current = s.slots.find((slot) => slot.slotId === currentId);
    return {
      ...this.summary(run),
      plannedThrough: s.plannedThrough,
      ...(s.snapshot === undefined ? {} : { snapshot: s.snapshot }),
      seed: `seed-${run.runId.slice(0, 8)}`,
      pins: { ageBand: 6, rulesetVersion: run.rulesetVersion, campaignVersion: run.campaignVersion, assetManifestVersion: null, protocolVersion: 1 },
      currentSlot:
        current === undefined
          ? null
          : {
              slotId: current.slotId,
              kind: current.kind,
              status: current.status,
              attempts: current.attempts.map((a) => ({ n: a.n, answer: a.answer, correct: a.correct })),
              withdrawn: current.withdrawn,
            },
      recentOpIds: run.recentOpIds.slice(-32),
    };
  }

  /** Runs for GET /api/me. */
  runs() {
    return this.#state.runs.map((r) => this.summary(r));
  }

  async createRun(body: Record<string, unknown>): Promise<FakeReply> {
    this.log.push("POST /api/runs");
    const runId = String(body.runId);
    const existing = this.#run(runId);
    const sessionId = String(body.sessionId);
    if (existing !== undefined) {
      if (existing.state.status !== "IN_PROGRESS") return err(409, "RUN_TERMINAL");
      return { status: 200, body: { run: this.#view(existing), session: this.#leaseView(this.#claim(runId, sessionId)) } };
    }
    const waveSetId = String(body.waveSetId);
    const config = compileBattleConfig(this.#data.ruleset, this.#data.planet, waveSetId);
    const now = this.#now();
    const run: StoredRun = {
      runId,
      planetId: String(body.planetId),
      waveSetId,
      rulesetVersion: String(body.rulesetVersion),
      campaignVersion: String(body.campaignVersion),
      createdAt: now,
      lastPlayedAt: now,
      state: initialRunState(this.#data.ruleset, config, [...SEED_ACTIVITY.answerSpecification.accepted]),
      recentOpIds: [],
    };
    this.#state.runs.push(run);
    const lease = this.#claim(runId, sessionId);
    this.#save();
    return { status: 201, body: { run: this.#view(run), session: this.#leaseView(lease) } };
  }

  async getRun(runId: string): Promise<FakeReply> {
    this.log.push(`GET /api/runs/${runId}`);
    const run = this.#run(runId);
    if (run === undefined) return err(404, "NOT_FOUND");
    const slots = run.state.slots.map((s) => ({ slotId: s.slotId, kind: s.kind, status: s.status, attemptsUsed: s.attempts.length }));
    return { status: 200, body: { ...this.#view(run), slots } };
  }

  async getPack(runId: string): Promise<FakeReply> {
    this.log.push(`GET /api/runs/${runId}/pack`);
    const run = this.#run(runId);
    if (run === undefined) return err(404, "NOT_FOUND");
    const slots = run.state.slots
      .filter((s) => s.status === "UNRESOLVED")
      .map((s) => ({
        slotId: s.slotId,
        kind: s.kind,
        subject: "phonics",
        topicId: "phonics-gpc-consonant-digraphs",
        ...SEED_ACTIVITY,
        intro: null,
        clips: { prompt: this.#clip.clipKey },
        reward: s.reward,
        withdrawn: s.withdrawn,
      }));
    return {
      status: 200,
      body: {
        protocolVersion: 1,
        runId,
        revision: run.state.revision,
        plannedThrough: run.state.plannedThrough,
        packHash: "0".repeat(64),
        gameData: { rulesetVersion: run.rulesetVersion, campaignVersion: run.campaignVersion, assetManifestVersion: null },
        slots,
        packStatus: { state: "COMPLETE", missing: [] },
      },
    };
  }

  async session(body: Record<string, unknown>): Promise<FakeReply> {
    this.log.push(`PUT /api/session ${String(body.mode)}`);
    const runId = String(body.runId);
    const run = this.#run(runId);
    if (body.mode === "renew") {
      const held = this.#state.lease;
      if (held === null || held.sessionId !== body.sessionId || held.generation !== body.generation) return err(409, "STALE_SESSION");
      return { status: 200, body: { ...this.#leaseView(held), runId } };
    }
    if (run === undefined) return err(404, "NOT_FOUND");
    if (run.state.status !== "IN_PROGRESS") return err(409, "RUN_TERMINAL");
    const lease = this.#claim(runId, String(body.sessionId));
    this.#save();
    return { status: 200, body: { ...this.#leaseView(lease), runId } };
  }

  async release(body: Record<string, unknown>): Promise<FakeReply> {
    this.log.push("DELETE /api/session");
    const held = this.#state.lease;
    if (held !== null && held.sessionId === body.sessionId && held.generation === body.generation) {
      this.#state.lease = null;
      this.#save();
    }
    return { status: 204, body: null };
  }

  async ops(runId: string, body: { sessionId: string; generation: number; ops: Record<string, unknown>[] }): Promise<FakeReply> {
    this.log.push(`POST /api/runs/${runId}/ops`);
    const run = this.#run(runId);
    if (run === undefined) return err(404, "NOT_FOUND");
    const held = this.#state.lease;
    const results: Record<string, unknown>[] = [];
    let stopped = false;
    for (const op of body.ops) {
      const opId = String(op.opId);
      if (stopped) {
        results.push({ opId, result: "NOT_PROCESSED" });
        continue;
      }
      if (run.recentOpIds.includes(opId)) {
        results.push({ opId, result: "ALREADY_APPLIED", appliedRevision: run.state.revision });
        continue;
      }
      if (held === null || held.sessionId !== body.sessionId || held.generation !== body.generation) {
        results.push({ opId, result: "STALE_SESSION" });
        stopped = true;
        continue;
      }
      const outcome = reduce(run.state, op);
      if (outcome.result !== "APPLIED") {
        results.push({ opId, result: "REJECTED", code: outcome.code });
        stopped = true;
        continue;
      }
      run.state = outcome.state;
      run.recentOpIds.push(opId);
      run.lastPlayedAt = this.#now();
      results.push({
        opId,
        result: "APPLIED",
        appliedRevision: run.state.revision,
        ...(outcome.outcome === undefined ? {} : { outcome: outcome.outcome }),
        ...(outcome.attempt === undefined ? {} : { attempt: outcome.attempt }),
      });
    }
    this.#save();
    return { status: 200, body: { results, run: this.#view(run) } };
  }

  async speech(body: Record<string, unknown>): Promise<FakeReply> {
    this.log.push("POST /api/speech");
    const run = this.#run(String(body.runId));
    const slot = run?.state.slots.find((s) => s.slotId === body.slotId);
    if (slot === undefined || body.variant !== "prompt") return err(404, "NOT_FOUND");
    const bytes = this.#clip.bytes.slice();
    return {
      status: 200,
      body: {
        clipKey: this.#clip.clipKey,
        sha256: await sha256Hex(bytes.buffer),
        url: this.#urlFor(this.#clip),
        expiresInSeconds: 300,
        contentType: this.#clip.contentType,
        bytes: bytes.byteLength,
      },
    };
  }
}
