// The play-session lease on the client (spine S3.4, G §7, F §5): claim when a run is opened, renew every
// `renewAfterSeconds` while the page is visible and the child did something in the last 5 minutes, release after the
// queue has flushed when the run screen is left. Every lease request goes through the account's serial queue, so it
// never overtakes an op batch (G §7.1 "who sends").
import { LIMITS, type ApiResult } from "@scd/shared";
import { readMeta, writeMeta } from "@scd/shared/audio";
import type { PlayerApi } from "../api/playerApi";
import type { SyncQueue } from "../sync/queue";
import { parseLease, type LeaseView } from "./types";

export type ClaimOutcome =
  | { kind: "ok"; lease: LeaseView }
  | { kind: "takeover-confirm"; deviceLabel: string }
  | { kind: "elsewhere"; deviceLabel: string; retryAfterSeconds: number }
  | { kind: "terminal" }
  | { kind: "not-found" }
  | { kind: "auth-required" }
  | { kind: "failed" };

/** How long without input before renewing stops (spine S3.4: the lease then lapses by itself). */
export const IDLE_MS = 5 * 60_000;

export interface Timers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface PlayLeaseOptions {
  api: Pick<PlayerApi, "putSession" | "deleteSession">;
  queue: Pick<SyncQueue, "control" | "setSession">;
  sessionId: string;
  deviceLabel: string;
  visible?: () => boolean;
  now?: () => number;
  timers?: Timers;
}

function details(result: ApiResult<unknown>): Record<string, unknown> {
  if (result.kind !== "error" || typeof result.body !== "object" || result.body === null) return {};
  const error = (result.body as { error?: { details?: unknown } }).error;
  return typeof error?.details === "object" && error.details !== null ? (error.details as Record<string, unknown>) : {};
}

/** Turns a claim (R13) or create (R8) refusal into what the screen shows (D7.3). */
export function claimRefusal(result: ApiResult<unknown>): ClaimOutcome {
  if (result.kind === "auth-required" || result.kind === "identity-changed") return { kind: "auth-required" };
  if (result.kind !== "error") return { kind: "failed" };
  const d = details(result);
  const device = typeof d.deviceLabel === "string" ? d.deviceLabel : "";
  switch (result.code) {
    case "TAKEOVER_CONFIRM_REQUIRED":
      return { kind: "takeover-confirm", deviceLabel: device };
    case "ACTIVE_SESSION_ELSEWHERE":
      return { kind: "elsewhere", deviceLabel: device, retryAfterSeconds: typeof d.retryAfterSeconds === "number" ? d.retryAfterSeconds : 0 };
    case "RUN_TERMINAL":
      return { kind: "terminal" };
    case "NOT_FOUND":
      return { kind: "not-found" };
    default:
      return { kind: "failed" };
  }
}

export class PlayLease {
  readonly sessionId: string;
  readonly deviceLabel: string;
  #held: { runId: string; lease: LeaseView } | null = null;
  #timer: unknown = null;
  #lastInput: number;
  readonly #options: PlayLeaseOptions;
  readonly #visible: () => boolean;
  readonly #now: () => number;
  readonly #timers: Timers;
  readonly #staleListeners = new Set<() => void>();

  constructor(options: PlayLeaseOptions) {
    this.#options = options;
    this.sessionId = options.sessionId;
    this.deviceLabel = options.deviceLabel;
    this.#visible = options.visible ?? (() => globalThis.document?.visibilityState !== "hidden");
    this.#now = options.now ?? (() => Date.now());
    this.#timers = options.timers ?? {
      setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
      clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
    };
    this.#lastInput = this.#now();
  }

  get held(): { runId: string; generation: number } | null {
    return this.#held === null ? null : { runId: this.#held.runId, generation: this.#held.lease.generation };
  }

  /** Renew failed with STALE_SESSION: another browser holds the lease now (F §5). The run screen stops. */
  onStale(listener: () => void): () => void {
    this.#staleListeners.add(listener);
    return () => this.#staleListeners.delete(listener);
  }

  /** Any pointer or key input: renewing continues for another 5 minutes. */
  noteInput(): void {
    this.#lastInput = this.#now();
  }

  /** The lease a create (R8) already claimed, or a claim's result: ops are stamped with it from now on. */
  adopt(runId: string, lease: LeaseView): void {
    this.#held = { runId, lease };
    this.#options.queue.setSession({ sessionId: lease.sessionId, generation: lease.generation });
    this.#startRenewing(lease.renewAfterSeconds);
  }

  /** R13 claim for this run. Ask the child before passing `takeover: true` (D7.3 TAKEOVER_CONFIRM_REQUIRED). */
  async claim(runId: string, takeover = false): Promise<ClaimOutcome> {
    const result = await this.#options.queue.control(() =>
      this.#options.api.putSession({
        mode: "claim",
        runId,
        sessionId: this.sessionId,
        deviceLabel: this.deviceLabel,
        ...(takeover ? { takeover: true } : {}),
      }),
    );
    if (result.kind !== "ok") return claimRefusal(result);
    let lease: LeaseView;
    try {
      lease = parseLease(result.body);
    } catch {
      return { kind: "failed" };
    }
    this.adopt(runId, lease);
    return { kind: "ok", lease };
  }

  #startRenewing(seconds: number): void {
    this.#stopRenewing();
    const every = Math.max(10, Number.isFinite(seconds) && seconds > 0 ? seconds : LIMITS.lease.renewSeconds) * 1000;
    this.#timer = this.#timers.setInterval(() => void this.renewNow(), every);
  }

  #stopRenewing(): void {
    if (this.#timer !== null) this.#timers.clearInterval(this.#timer);
    this.#timer = null;
  }

  /** One renew, if the page is visible and there was input in the last 5 minutes (spine S3.4). */
  async renewNow(): Promise<void> {
    const held = this.#held;
    if (held === null || !this.#visible() || this.#now() - this.#lastInput > IDLE_MS) return;
    const result = await this.#options.queue.control(() =>
      this.#options.api.putSession({
        mode: "renew",
        runId: held.runId,
        sessionId: this.sessionId,
        generation: held.lease.generation,
        deviceLabel: this.deviceLabel,
      }),
    );
    // A failed renew never falls back to a claim (G R13): the screen stops instead.
    if (result.kind === "error" && result.code === "STALE_SESSION") {
      this.#stopRenewing();
      this.#held = null;
      for (const listener of this.#staleListeners) listener();
    }
  }

  /**
   * Release after everything queued before it has been sent (R14). The queue may be stuck (signed out, refused);
   * after `timeoutMs` the screen moves on anyway and the lease lapses by itself.
   */
  async release(timeoutMs = 5_000): Promise<void> {
    this.#stopRenewing();
    const held = this.#held;
    this.#held = null;
    if (held === null) return;
    const sent = this.#options.queue.control(() =>
      this.#options.api.deleteSession({ sessionId: this.sessionId, generation: held.lease.generation }),
    );
    await Promise.race([sent, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  }

  /** Stop renewing without releasing (page unload, identity change): the lease lapses after 180 s. */
  stop(): void {
    this.#stopRenewing();
    this.#held = null;
  }
}

const SESSION_KEY = "sessionId";
const SESSION_FALLBACK_KEY = "scd-session-id";
const UUID = new RegExp(LIMITS.ids.uuid);

/**
 * This browser's play-session ID (spine S3.4): a random UUID kept in the account's IndexedDB `meta` store; in
 * sessionStorage when IndexedDB is unavailable; in memory as a last resort.
 */
export async function browserSessionId(db: IDBDatabase | null, newId: () => string = () => crypto.randomUUID()): Promise<string> {
  if (db !== null) {
    const stored = await readMeta(db, SESSION_KEY);
    if (typeof stored === "string" && UUID.test(stored)) return stored;
    const id = newId();
    try {
      await writeMeta(db, SESSION_KEY, id);
      return id;
    } catch {
      // fall through to sessionStorage
    }
  }
  try {
    const kept = globalThis.sessionStorage?.getItem(SESSION_FALLBACK_KEY);
    if (kept && UUID.test(kept)) return kept;
    const id = newId();
    globalThis.sessionStorage?.setItem(SESSION_FALLBACK_KEY, id);
    return id;
  } catch {
    return newId();
  }
}

/** "Chrome on Windows": shown to the child on another laptop (D7.3), at most 40 characters, nothing identifying. */
export function deviceLabel(userAgent: string): string {
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "a browser";
  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /CrOS/.test(userAgent)
      ? "a Chromebook"
      : /iPad|iPhone/.test(userAgent)
        ? "an iPad"
        : /Mac OS X|Macintosh/.test(userAgent)
          ? "a Mac"
          : /Android/.test(userAgent)
            ? "Android"
            : /Linux/.test(userAgent)
              ? "Linux"
              : "this computer";
  return `${browser} on ${os}`.slice(0, LIMITS.deviceLabelMaxLength);
}
