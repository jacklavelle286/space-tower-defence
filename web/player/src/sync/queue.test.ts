import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeTransport } from "./fakeTransport";
import { SyncQueue, type NewOp } from "./queue";

const RUN = "4b1e0000-0000-4000-8000-000000000001";
const RUN2 = "4b1e0000-0000-4000-8000-000000000002";
let n = 0;
function op(runId = RUN, payload: Record<string, unknown> = { credits: 10, placements: [] }): NewOp {
  n += 1;
  return {
    runId,
    opId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    expectedRevision: n,
    type: "SAVE_PREP",
    payload,
    clientTime: "2026-11-15T10:00:00Z",
  };
}

async function tick() {
  await vi.advanceTimersByTimeAsync(0);
}

function makeQueue(transport = new FakeTransport()) {
  const queue = new SyncQueue({ transport, protocolVersion: 1, random: () => 0 });
  queue.setSession({ sessionId: "c0a80000-0000-4000-8000-000000000001", generation: 7 });
  return { queue, transport };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("SyncQueue", () => {
  it("refuses ops without a lease and stamps each op with the generation current when it was queued", async () => {
    const queue = new SyncQueue({ transport: new FakeTransport(), protocolVersion: 1 });
    expect(() => queue.enqueue(op())).toThrow(/claim the lease/);
    queue.setSession({ sessionId: "s1", generation: 7 });
    const a = queue.enqueue(op());
    queue.setSession({ sessionId: "s1", generation: 8 });
    const b = queue.enqueue(op());
    expect([a.generation, b.generation]).toEqual([7, 8]);
  });

  it("keeps one request in flight and never mixes generations or runs in one batch", async () => {
    const { queue, transport } = makeQueue();
    queue.enqueue(op());
    await tick();
    queue.enqueue(op()); // gen 7, queued while the first batch is out
    queue.setSession({ sessionId: "c0a80000-0000-4000-8000-000000000001", generation: 8 });
    queue.enqueue(op());
    queue.enqueue(op(RUN2));
    await tick();
    expect(transport.sent).toHaveLength(1);

    transport.applyAll();
    await tick();
    expect(transport.sent).toHaveLength(2);
    expect(transport.last.body.generation).toBe(7);
    expect(transport.last.body.ops).toHaveLength(1);

    transport.applyAll();
    await tick();
    expect(transport.last.body.generation).toBe(8);
    expect(transport.last.runId).toBe(RUN);

    transport.applyAll();
    await tick();
    expect(transport.last.runId).toBe(RUN2);
    transport.applyAll();
    await tick();
    expect(transport.maxInFlight).toBe(1);
    expect(queue.getSnapshot()).toMatchObject({ status: "SYNCED", pending: 0 });
  });

  it("batches at most 25 ops", async () => {
    const { queue, transport } = makeQueue();
    queue.setSession(null);
    queue.setSession({ sessionId: "s", generation: 1 });
    for (let i = 0; i < 30; i++) queue.enqueue(op());
    await tick();
    expect(transport.sent[0]?.body.ops).toHaveLength(1); // the first op went out alone, before the rest were queued
    transport.applyAll();
    await tick();
    expect(transport.last.body.ops).toHaveLength(25);
    transport.applyAll();
    await tick();
    expect(transport.last.body.ops).toHaveLength(4);
  });

  it("resends the same ops unchanged after a transient failure, with back-off", async () => {
    const { queue, transport } = makeQueue();
    queue.enqueue(op());
    queue.enqueue(op());
    await tick();
    const first = structuredClone(transport.last.body);
    transport.last.respond({ kind: "error", status: 503, code: "THROTTLED", body: { error: { code: "THROTTLED" } } });
    await tick();
    expect(queue.getSnapshot().status).toBe("RETRYING");
    expect(transport.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(499); // base 1000 ms, jitter factor 0.5 with random() = 0
    expect(transport.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(transport.sent).toHaveLength(2);
    // The same ops, byte for byte, with the same stamp; ops queued since then may ride along behind them.
    const resent = transport.last.body;
    expect({ ...resent, ops: resent.ops.slice(0, first.ops.length) }).toEqual(first);
    expect(queue.getSnapshot().status).toBe("PENDING");
  });

  it.each([
    ["network", { kind: "network", reason: "timeout" } as const],
    ["gateway 429", { kind: "error", status: 429, code: null, body: { message: "Too Many Requests" } } as const],
    ["500", { kind: "error", status: 500, code: "INTERNAL", body: {} } as const],
    ["CloudFront 504", { kind: "error", status: 504, code: null, body: "<html>" } as const],
  ])("treats %s as RETRYING and keeps the ops", async (_label, result) => {
    const { queue, transport } = makeQueue();
    queue.enqueue(op());
    await tick();
    transport.last.respond(result);
    await tick();
    expect(queue.getSnapshot()).toMatchObject({ status: "RETRYING", pending: 1, retryReason: "transient" });
  });

  it("drops ops a 503 body reports as applied before retrying the rest", async () => {
    const { queue, transport } = makeQueue();
    queue.enqueue(op()); // goes out at once, alone
    const b = queue.enqueue(op());
    const c = queue.enqueue(op());
    await tick();
    transport.applyAll();
    await tick();
    expect(transport.last.body.ops.map((o) => o.opId)).toEqual([b.opId, c.opId]);
    transport.last.respond({
      kind: "error",
      status: 503,
      code: "THROTTLED",
      body: {
        error: { code: "THROTTLED" },
        results: [
          { opId: b.opId, result: "APPLIED", appliedRevision: 3 },
          { opId: c.opId, result: "NOT_PROCESSED" },
        ],
        run: { runId: RUN, revision: 3 },
      },
    });
    await tick();
    expect(queue.getSnapshot()).toMatchObject({ status: "RETRYING", pending: 1 });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(transport.last.body.ops.map((o) => o.opId)).toEqual([c.opId]);
  });

  it("PROTOCOL_UNSUPPORTED pauses saving and resends later, never a refusal", async () => {
    const { queue, transport } = makeQueue();
    queue.enqueue(op());
    await tick();
    transport.last.respond({ kind: "error", status: 409, code: "PROTOCOL_UNSUPPORTED", body: { error: { code: "PROTOCOL_UNSUPPORTED" } } });
    await tick();
    expect(queue.getSnapshot()).toMatchObject({ status: "RETRYING", retryReason: "protocol", pending: 1 });
  });

  it("a REJECTED op stops the queue for good (never retried)", async () => {
    const { queue, transport } = makeQueue();
    const a = queue.enqueue(op());
    queue.enqueue(op());
    await tick();
    transport.last.respond({
      kind: "ok",
      status: 200,
      body: { results: [{ opId: a.opId, result: "REJECTED", code: "PHASE_MISMATCH" }], run: { runId: RUN, revision: 2 } },
    });
    await tick();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(queue.getSnapshot()).toMatchObject({ status: "DIVERGED", divergedReason: "REJECTED", pending: 2 });
    expect(transport.sent).toHaveLength(1);
  });

  it("409 STALE_SESSION diverges after dropping the ops that landed", async () => {
    const { queue, transport } = makeQueue();
    const a = queue.enqueue(op());
    await tick();
    transport.last.respond({
      kind: "error",
      status: 409,
      code: "STALE_SESSION",
      body: { error: { code: "STALE_SESSION" }, results: [{ opId: a.opId, result: "STALE_SESSION" }], run: { runId: RUN, revision: 4 } },
    });
    await tick();
    expect(queue.getSnapshot()).toMatchObject({ status: "DIVERGED", divergedReason: "STALE_SESSION", pending: 1 });
  });

  it("426 asks for a reload and keeps the queue", async () => {
    const { queue, transport } = makeQueue();
    queue.enqueue(op());
    await tick();
    transport.last.respond({ kind: "error", status: 426, code: "CLIENT_UPGRADE_REQUIRED", body: {} });
    await tick();
    expect(queue.getSnapshot()).toMatchObject({ status: "UPGRADE_REQUIRED", pending: 1 });
  });

  it("auth-required holds the ops until the same child signs in again, then resends them", async () => {
    const { queue, transport } = makeQueue();
    queue.enqueue(op());
    await tick();
    const body = structuredClone(transport.last.body);
    transport.last.respond({ kind: "auth-required" });
    await tick();
    queue.enqueue(op());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(queue.getSnapshot()).toMatchObject({ status: "AUTH_REQUIRED", pending: 2 });
    expect(transport.sent).toHaveLength(1);
    queue.resumeAfterSignIn();
    await tick();
    expect(transport.sent).toHaveLength(2);
    expect(transport.last.body.ops[0]).toEqual(body.ops[0]);
  });

  it("an identity change stops everything without marking the queue diverged", async () => {
    const onIdentityChanged = vi.fn();
    const transport = new FakeTransport();
    const queue = new SyncQueue({ transport, protocolVersion: 1, onIdentityChanged });
    queue.setSession({ sessionId: "s", generation: 1 });
    queue.enqueue(op());
    await tick();
    transport.last.respond({ kind: "identity-changed" });
    await tick();
    expect(onIdentityChanged).toHaveBeenCalledOnce();
    expect(queue.isStopped).toBe(true);
    expect(queue.getSnapshot().status).toBe("PENDING");
    expect(() => queue.enqueue(op())).toThrow(/stopped/);
    expect(await queue.control(async () => ({ kind: "ok", status: 200, body: null }))).toEqual({ kind: "identity-changed" });
  });

  it("runs lease requests in order with op batches, one at a time", async () => {
    const { queue, transport } = makeQueue();
    const order: string[] = [];
    queue.enqueue(op());
    const claim = queue.control(async () => {
      order.push(`control while ${transport.inFlight} in flight`);
      return { kind: "ok", status: 200, body: { generation: 8 } };
    });
    await tick();
    expect(order).toEqual([]);
    transport.applyAll();
    await expect(claim).resolves.toMatchObject({ kind: "ok" });
    expect(order).toEqual(["control while 0 in flight"]);
  });

  it("notifies listeners only when the visible state changes", async () => {
    const { queue, transport } = makeQueue();
    const listener = vi.fn();
    queue.subscribe(listener);
    const before = queue.getSnapshot();
    expect(queue.getSnapshot()).toBe(before); // stable between changes (useSyncExternalStore)
    queue.enqueue(op());
    await tick();
    transport.applyAll();
    await tick();
    expect(listener.mock.calls.length).toBeLessThanOrEqual(3);
    expect(queue.getSnapshot().status).toBe("SYNCED");
  });
});
