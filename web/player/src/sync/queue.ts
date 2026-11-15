import { LIMITS, type ApiResult, type OpsBatchBody, type OpsResponse, type WireOp } from "@scd/shared";

/**
 * Client sync states (F §7, spine S3.5). Phase 21 drives SYNCED, PENDING, RETRYING and AUTH_REQUIRED. DIVERGED and
 * UPGRADE_REQUIRED are definite server answers that must stop the queue at once; their dialogs come with the
 * divergence work (Phase 60) and versions (Phase 62), but the queue already stops on them so it can never resend a
 * refused op. OFFLINE_PENDING arrives with the offline queue (Phase 58).
 */
export type SyncStatus = "SYNCED" | "PENDING" | "RETRYING" | "AUTH_REQUIRED" | "DIVERGED" | "UPGRADE_REQUIRED";

export interface SyncSnapshot {
  status: SyncStatus;
  /** Ops not yet acknowledged by the server, including any in flight. */
  pending: number;
  /** RETRYING only: `protocol` after 409 PROTOCOL_UNSUPPORTED ("Saving paused while the game updates"). */
  retryReason: "transient" | "protocol" | null;
  /** DIVERGED only: which of the two D7 lines applies. */
  divergedReason: "STALE_SESSION" | "REJECTED" | null;
}

export type SyncState = Omit<SyncSnapshot, "pending">;

/** The lease values ops are stamped with when they are queued (spine S7.1; F §5.5). */
export interface SessionStamp {
  sessionId: string;
  generation: number;
}

export interface NewOp extends WireOp {
  runId: string;
}

/** An op as it sits in the queue: its stamp is fixed at enqueue time and never changes, even on retry. */
export interface QueuedOp extends NewOp, SessionStamp {
  protocolVersion: number;
}

export interface SyncTransport {
  sendOps(runId: string, body: OpsBatchBody): Promise<ApiResult<OpsResponse>>;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SyncQueueOptions {
  transport: SyncTransport;
  protocolVersion: number;
  /** The authoritative run view from each response (adopted by the run screen from Phase 22). */
  onRunView?: (run: OpsResponse["run"]) => void;
  /** The API client saw another account: the page is about to reload. */
  onIdentityChanged?: () => void;
  timers?: Timers;
  random?: () => number;
  /** First retry delay; doubles per failure up to `maxBackoffMs`, with jitter (spine S7.2). */
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}

type ControlEntry = {
  kind: "control";
  send: () => Promise<ApiResult<unknown>>;
  resolve: (result: ApiResult<unknown>) => void;
};
type OpEntry = { kind: "op"; op: QueuedOp };
type Entry = ControlEntry | OpEntry;

const BATCH_BYTES = LIMITS.bodyMaxBytes.ops;
const BATCH_OPS = LIMITS.opsPerBatch.max;

function wire(op: QueuedOp): WireOp {
  return {
    opId: op.opId,
    expectedRevision: op.expectedRevision,
    type: op.type,
    payload: op.payload,
    clientTime: op.clientTime,
  };
}

function sameBatch(a: QueuedOp, b: QueuedOp): boolean {
  return (
    a.runId === b.runId &&
    a.sessionId === b.sessionId &&
    a.generation === b.generation &&
    a.protocolVersion === b.protocolVersion
  );
}

/**
 * One serial queue per account (F §7): op batches and lease requests share it, and **one request is in flight at a
 * time**. Online only for now (Phase 58 adds IndexedDB): the queue lives in memory.
 *
 * Rules it keeps:
 * - Every op is stamped with the session generation current when it was queued; a batch never mixes generations,
 *   runs or protocol versions, and a resend is byte-for-byte the same ops (G §5.1).
 * - Only an APPLIED or ALREADY_APPLIED result removes an op. Transient failures (network, timeout, 5xx, 429,
 *   PROTOCOL_UNSUPPORTED) keep everything and retry with back-off. A definite refusal stops the queue (G §5.6).
 * - SYNCED means nothing is queued and nothing is in flight; the status is derived from the queue contents, so it
 *   cannot claim "saved" while an op is waiting.
 */
export class SyncQueue {
  private readonly entries: Entry[] = [];
  private session: SessionStamp | null = null;
  private inFlightOps = 0;
  private pumping = false;
  private stopped = false;
  private halted: { status: "AUTH_REQUIRED" | "DIVERGED" | "UPGRADE_REQUIRED"; reason: SyncSnapshot["divergedReason"] } | null = null;
  private retry: { handle: unknown; reason: "transient" | "protocol" } | null = null;
  private failures = 0;
  private snapshot: SyncSnapshot = { status: "SYNCED", pending: 0, retryReason: null, divergedReason: null };
  private state: SyncState = { status: "SYNCED", retryReason: null, divergedReason: null };
  private readonly listeners = new Set<() => void>();
  private readonly idleWaiters: (() => void)[] = [];
  private readonly timers: Timers;
  private readonly random: () => number;
  private readonly baseBackoffMs: number;
  private readonly maxBackoffMs: number;

  constructor(private readonly options: SyncQueueOptions) {
    this.timers = options.timers ?? {
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
    };
    this.random = options.random ?? Math.random;
    this.baseBackoffMs = options.baseBackoffMs ?? 1_000;
    this.maxBackoffMs = options.maxBackoffMs ?? 30_000;
  }

  // --- for React (useSyncExternalStore): a stable object that changes only when something visible changes ---

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): SyncSnapshot => this.snapshot;

  /** The snapshot without the op count: a new object only when the status (or its reason) changes. The chip uses
   * this, so queueing or acknowledging ops does not re-render it unless the words change. */
  getState = (): SyncState => this.state;

  // --- commands ---

  /** The lease this tab holds now (from a claim or renew), or null when it holds none. */
  setSession(stamp: SessionStamp | null): void {
    this.session = stamp === null ? null : { ...stamp };
  }

  /** Queue one op, stamped with the current session. Ops are only queued under a lease (spine S3.4). */
  enqueue(op: NewOp): QueuedOp {
    if (this.stopped) throw new Error("the sync queue is stopped");
    if (this.session === null) throw new Error("no play session: claim the lease before queueing ops");
    const queued: QueuedOp = {
      ...op,
      payload: structuredClone(op.payload),
      sessionId: this.session.sessionId,
      generation: this.session.generation,
      protocolVersion: this.options.protocolVersion,
    };
    this.entries.push({ kind: "op", op: queued });
    this.update();
    void this.pump();
    return queued;
  }

  /**
   * Run a lease request (claim, renew, release) through the same queue, after everything queued before it. The result
   * is the caller's to act on; the queue only notes an auth refusal.
   */
  control<T>(send: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
    if (this.stopped) return Promise.resolve({ kind: "identity-changed" });
    return new Promise<ApiResult<T>>((resolve) => {
      this.entries.push({
        kind: "control",
        send: send as () => Promise<ApiResult<unknown>>,
        resolve: resolve as (result: ApiResult<unknown>) => void,
      });
      void this.pump();
    });
  }

  /** After the same child has signed in again (AUTH_REQUIRED → PENDING): resend the same ops. */
  resumeAfterSignIn(): void {
    if (this.halted?.status !== "AUTH_REQUIRED") return;
    this.halted = null;
    this.update();
    void this.pump();
  }

  /** Send nothing more, ever (identity change, sign-out, reload). The state is left as it is. */
  stop(): void {
    this.stopped = true;
    if (this.retry) this.timers.clearTimeout(this.retry.handle);
    this.retry = null;
    for (const entry of this.entries) if (entry.kind === "control") entry.resolve({ kind: "identity-changed" });
    this.update();
  }

  get isStopped(): boolean {
    return this.stopped;
  }

  /** Resolves once no request is out (F §7: let the request in flight settle before a sign-in redirect). It does not
   * wait for queued ops that cannot be sent yet (AUTH_REQUIRED halts the pump). */
  settled(): Promise<void> {
    if (!this.pumping) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  // --- the pump: one request at a time ---

  private canSend(): boolean {
    return !this.stopped && this.halted === null && this.retry === null;
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.canSend()) {
        const head = this.entries[0];
        if (head === undefined) break;
        if (head.kind === "control") {
          this.entries.shift();
          const result = await head.send();
          if (result.kind === "auth-required") this.halt("AUTH_REQUIRED", null);
          if (result.kind === "identity-changed") this.identityChanged();
          head.resolve(result);
          continue;
        }
        await this.sendBatch(this.takeBatch());
      }
    } finally {
      this.pumping = false;
      this.update();
      for (const resolve of this.idleWaiters.splice(0)) resolve();
    }
  }

  /** The longest run of op entries at the head that can share one envelope (≤ 25 ops, ≤ 64 KB). */
  private takeBatch(): QueuedOp[] {
    const batch: QueuedOp[] = [];
    let bytes = 200; // envelope allowance
    for (const entry of this.entries) {
      if (entry.kind !== "op") break;
      const first = batch[0];
      if (first !== undefined && !sameBatch(first, entry.op)) break;
      const size = new TextEncoder().encode(JSON.stringify(wire(entry.op))).length + 1;
      if (batch.length > 0 && (batch.length >= BATCH_OPS || bytes + size > BATCH_BYTES)) break;
      batch.push(entry.op);
      bytes += size;
    }
    return batch;
  }

  private async sendBatch(batch: QueuedOp[]): Promise<void> {
    const first = batch[0];
    if (first === undefined) return;
    const body: OpsBatchBody = {
      protocolVersion: first.protocolVersion,
      sessionId: first.sessionId,
      generation: first.generation,
      ops: batch.map(wire),
    };
    this.inFlightOps = batch.length;
    this.update();
    let result: ApiResult<OpsResponse>;
    try {
      result = await this.options.transport.sendOps(first.runId, body);
    } catch {
      result = { kind: "network", reason: "failed" };
    }
    this.inFlightOps = 0;
    this.handle(batch, result);
    this.update();
  }

  private handle(batch: QueuedOp[], result: ApiResult<OpsResponse>): void {
    if (this.stopped) return; // stopped while the request was out: decide nothing, send nothing more
    switch (result.kind) {
      case "identity-changed":
        this.identityChanged();
        return;
      case "auth-required":
        this.halt("AUTH_REQUIRED", null);
        return;
      case "network":
        this.backOff("transient");
        return;
      case "ok": {
        const body = result.body;
        if (!isOpsResponse(body, batch)) {
          // Not the promised shape: resend the same ops later. The server deduplicates by opId (G §5.3 step a).
          this.backOff("transient");
          return;
        }
        this.dropAcknowledged(body);
        this.failures = 0;
        this.options.onRunView?.(body.run);
        if (body.results.some((r) => r.result === "REJECTED")) this.halt("DIVERGED", "REJECTED");
        else if (body.results.some((r) => r.result === "STALE_SESSION")) this.halt("DIVERGED", "STALE_SESSION");
        return;
      }
      case "error": {
        const body = result.body;
        if (isOpsResponse(body, batch)) {
          // 409 STALE_SESSION and 503 THROTTLED carry results: drop what did land before reacting (G §5.5).
          this.dropAcknowledged(body);
          this.options.onRunView?.(body.run);
        }
        const { status, code } = result;
        if (code === "STALE_SESSION") this.halt("DIVERGED", "STALE_SESSION");
        else if (code === "PROTOCOL_UNSUPPORTED") this.backOff("protocol");
        else if (status === 426 || code === "CLIENT_UPGRADE_REQUIRED") this.halt("UPGRADE_REQUIRED", null);
        else if (status === 429 || status >= 500) this.backOff("transient");
        else this.halt("DIVERGED", "REJECTED"); // 400 envelope, 404 run gone, anything else definite (G §5.6)
        return;
      }
    }
  }

  private dropAcknowledged(body: OpsResponse): void {
    const done = new Set(
      body.results.filter((r) => r.result === "APPLIED" || r.result === "ALREADY_APPLIED").map((r) => r.opId),
    );
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      if (entry?.kind === "op" && done.has(entry.op.opId)) this.entries.splice(i, 1);
    }
  }

  private backOff(reason: "transient" | "protocol"): void {
    const exp = Math.min(this.maxBackoffMs, this.baseBackoffMs * 2 ** this.failures);
    this.failures += 1;
    const delay = Math.round(exp * (0.5 + this.random() * 0.5));
    const handle = this.timers.setTimeout(() => {
      this.retry = null;
      this.update();
      void this.pump();
    }, delay);
    this.retry = { handle, reason };
  }

  private halt(status: "AUTH_REQUIRED" | "DIVERGED" | "UPGRADE_REQUIRED", reason: SyncSnapshot["divergedReason"]): void {
    this.halted = { status, reason };
  }

  private identityChanged(): void {
    this.stop();
    this.options.onIdentityChanged?.();
  }

  private pendingOps(): number {
    return this.entries.filter((e) => e.kind === "op").length;
  }

  private update(): void {
    const pending = this.pendingOps();
    let next: SyncSnapshot;
    if (this.halted) {
      next = { status: this.halted.status, pending, retryReason: null, divergedReason: this.halted.reason };
    } else if (this.retry) {
      next = { status: "RETRYING", pending, retryReason: this.retry.reason, divergedReason: null };
    } else if (pending > 0 || this.inFlightOps > 0) {
      next = { status: "PENDING", pending, retryReason: null, divergedReason: null };
    } else {
      next = { status: "SYNCED", pending: 0, retryReason: null, divergedReason: null };
    }
    const prev = this.snapshot;
    if (
      prev.status === next.status &&
      prev.pending === next.pending &&
      prev.retryReason === next.retryReason &&
      prev.divergedReason === next.divergedReason
    ) {
      return;
    }
    this.snapshot = next;
    const state = this.state;
    if (state.status !== next.status || state.retryReason !== next.retryReason || state.divergedReason !== next.divergedReason) {
      this.state = { status: next.status, retryReason: next.retryReason, divergedReason: next.divergedReason };
    }
    for (const listener of this.listeners) listener();
  }
}

function isOpsResponse(body: unknown, batch: QueuedOp[]): body is OpsResponse {
  if (typeof body !== "object" || body === null) return false;
  const { results, run } = body as Record<string, unknown>;
  if (!Array.isArray(results) || results.length !== batch.length) return false;
  if (typeof run !== "object" || run === null) return false;
  return results.every((r, i) => typeof r === "object" && r !== null && (r as { opId?: unknown }).opId === batch[i]?.opId);
}
