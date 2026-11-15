// Watches the sync queue's transport so the run screen can wait for one op's answer (the durability rule, spine S4:
// in online-only mode attempt feedback waits for the server's acknowledgement) and see each authoritative run view.
// It wraps the transport rather than changing the queue: the queue still decides what to resend and when.
import type { ApiResult, OpResult, OpsBatchBody, OpsResponse } from "@scd/shared";
import type { SyncTransport } from "../sync/queue";

/**
 * `applied`: the server applied the op (or had already applied it); `result.attempt` is its judgement of an attempt.
 * `refused`: the op will never be applied as sent (REJECTED, STALE_SESSION, or not processed after one of those,
 * or a definite HTTP refusal such as 400 or 404). The queue has stopped; the screen re-reads the cloud save.
 */
export type Ack = { kind: "applied"; result: OpResult } | { kind: "refused"; code: string | null };

type RunListener = (run: OpsResponse["run"]) => void;

function hasResults(body: unknown): body is OpsResponse {
  return typeof body === "object" && body !== null && Array.isArray((body as OpsResponse).results) && typeof (body as OpsResponse).run === "object";
}

export class AckTracker {
  readonly #waiting = new Map<string, (ack: Ack) => void>();
  readonly #settled = new Map<string, Ack>();
  readonly #runListeners = new Set<RunListener>();

  /** The transport to give the SyncQueue. */
  wrap(inner: SyncTransport): SyncTransport {
    return {
      sendOps: async (runId: string, body: OpsBatchBody): Promise<ApiResult<OpsResponse>> => {
        const result = await inner.sendOps(runId, body);
        this.#observe(body, result);
        return result;
      },
    };
  }

  /** Resolves once the server has decided this op. Transient failures keep it waiting: the queue resends. */
  waitFor(opId: string): Promise<Ack> {
    const done = this.#settled.get(opId);
    if (done !== undefined) {
      this.#settled.delete(opId);
      return Promise.resolve(done);
    }
    return new Promise((resolve) => this.#waiting.set(opId, resolve));
  }

  onRunView(listener: RunListener): () => void {
    this.#runListeners.add(listener);
    return () => this.#runListeners.delete(listener);
  }

  #settle(opId: string, ack: Ack): void {
    const resolve = this.#waiting.get(opId);
    if (resolve !== undefined) {
      this.#waiting.delete(opId);
      resolve(ack);
      return;
    }
    // Only attempts are waited for; keep a few answers for a waitFor() that comes a moment later.
    if (this.#settled.size > 64) this.#settled.clear();
    this.#settled.set(opId, ack);
  }

  #observe(body: OpsBatchBody, result: ApiResult<OpsResponse>): void {
    const payload = result.kind === "ok" || result.kind === "error" ? result.body : null;
    if (hasResults(payload)) {
      const stopped = payload.results.some((r) => r.result === "REJECTED" || r.result === "STALE_SESSION");
      for (const r of payload.results) {
        if (r.result === "APPLIED" || r.result === "ALREADY_APPLIED") this.#settle(r.opId, { kind: "applied", result: r });
        else if (r.result === "REJECTED" || r.result === "STALE_SESSION") this.#settle(r.opId, { kind: "refused", code: r.code ?? r.result });
        // NOT_PROCESSED after a refusal is never resent; after a 503 THROTTLED it is, so it keeps waiting.
        else if (stopped) this.#settle(r.opId, { kind: "refused", code: "NOT_PROCESSED" });
      }
      for (const listener of this.#runListeners) listener(payload.run);
      return;
    }
    if (result.kind === "error") {
      const transient = result.status === 429 || result.status >= 500 || result.code === "PROTOCOL_UNSUPPORTED";
      if (!transient) for (const op of body.ops) this.#settle(op.opId, { kind: "refused", code: result.code });
    }
  }
}
