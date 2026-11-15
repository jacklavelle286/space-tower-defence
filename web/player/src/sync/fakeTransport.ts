import type { ApiResult, OpsBatchBody, OpsResponse } from "@scd/shared";
import type { SyncTransport } from "./queue";

export interface SentBatch {
  runId: string;
  body: OpsBatchBody;
  respond(result: ApiResult<OpsResponse>): void;
}

/**
 * A transport the test answers by hand: every `sendOps` waits until the test calls `respond`. It records the most
 * requests ever in flight at once, so a test can prove the queue never sends a second request early.
 */
export class FakeTransport implements SyncTransport {
  readonly sent: SentBatch[] = [];
  inFlight = 0;
  maxInFlight = 0;

  sendOps(runId: string, body: OpsBatchBody): Promise<ApiResult<OpsResponse>> {
    this.inFlight += 1;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    return new Promise((resolve) => {
      this.sent.push({
        runId,
        body: structuredClone(body),
        respond: (result) => {
          this.inFlight -= 1;
          resolve(result);
        },
      });
    });
  }

  get last(): SentBatch {
    const last = this.sent.at(-1);
    if (last === undefined) throw new Error("nothing sent yet");
    return last;
  }

  /** A 200 that applies every op of the last batch. */
  applyAll(revisionBase = 1): void {
    const batch = this.last;
    batch.respond({
      kind: "ok",
      status: 200,
      body: {
        results: batch.body.ops.map((op, i) => ({ opId: op.opId, result: "APPLIED", appliedRevision: revisionBase + i })),
        run: { runId: batch.runId, revision: revisionBase + batch.body.ops.length - 1 },
      },
    });
  }
}

/** Lets pending promise callbacks run (the queue reacts to a response in a microtask). */
export const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
