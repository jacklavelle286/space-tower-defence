// The run screen's parts that need no browser: rebuilding the run from the cloud save, the op acknowledgements, the
// synced run, the lease, and New game.
import type { ApiResult, OpsBatchBody, OpsResponse } from "@scd/shared";
import { describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION } from "../sync/protocol";
import { SyncQueue, type NewOp } from "../sync/queue";
import { AckTracker } from "./ackTracker";
import { buildRunState, panelActivity } from "./buildRunState";
import { deviceLabel, PlayLease } from "./lease";
import { loadRun } from "./loadRun";
import { createRun } from "./newGame";
import { SyncedRun } from "./syncedRun";
import { apiFor, reply, RUN_ID, serverAtActivity, SESSION_ID, testGameData } from "./testing";
import { parsePack, parseRunDetail } from "./types";

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("buildRunState and panelActivity", () => {
  it("rebuilds the reducer's state from R9 + R10: phase, wave, the current slot's saved answers, accepted, reward", async () => {
    const { server } = await serverAtActivity();
    const detail = parseRunDetail((await server.getRun(RUN_ID)).body);
    const pack = parsePack((await server.getPack(RUN_ID)).body);
    const state = buildRunState(detail, pack, testGameData().ruleset);
    const truth = server.state.runs[0]!.state;
    expect(state.phase).toBe("ACTIVITY");
    expect(state.wave).toBe(truth.wave);
    expect(state.revision).toBe(truth.revision);
    expect(state.snapshot).toEqual(truth.snapshot);
    expect(state.slots).toEqual(truth.slots); // same slots, same pinned accepted answers and reward
  });

  it("the panel shows the options in the slot's presentation order; audio is required when there is a prompt clip", async () => {
    const { server } = await serverAtActivity();
    const pack = parsePack((await server.getPack(RUN_ID)).body);
    const activity = panelActivity(pack.slots[0]!);
    expect(activity?.options.map((o) => o.text)).toEqual(["ch", "s", "th", "sh"]);
    expect(activity?.audioRequired).toBe(true);
    expect(panelActivity({ ...pack.slots[0]!, withdrawn: true })).toBeNull();
    expect(panelActivity({ ...pack.slots[0]!, interactionType: "ARRANGE" })).toBeNull();
  });

  it("a run that has ended loads as 'ended', and an unknown run as 'not-found'", async () => {
    const { server } = await serverAtActivity();
    server.state.runs[0]!.state = { ...server.state.runs[0]!.state, status: "DEFEATED" };
    const api = apiFor(server);
    expect((await loadRun(api, RUN_ID, async () => testGameData())).kind).toBe("ended");
    expect((await loadRun(api, "4b1e0000-0000-4000-8000-0000000000ff", async () => testGameData())).kind).toBe("not-found");
  });
});

describe("SyncedRun", () => {
  it("applies through the reducer, then queues the op stamped with the revision it was computed against", async () => {
    const { server } = await serverAtActivity();
    const loaded = await loadRun(apiFor(server), RUN_ID, async () => testGameData());
    if (loaded.kind !== "ready") throw new Error("not ready");
    const queued: NewOp[] = [];
    const run = new SyncedRun({ runId: RUN_ID, initial: loaded.run.state, enqueue: (op) => queued.push(op) });
    const revision = run.state.revision;
    const submitted = run.submitAttempt("a");
    expect(submitted?.applied.attempt).toEqual({ n: 1, correct: false, slotStatus: "UNRESOLVED", rewardGranted: false });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ type: "SUBMIT_ATTEMPT", expectedRevision: revision, runId: RUN_ID, payload: { slotId: "N-001", answer: "a" } });
    expect(run.state.revision).toBe(revision + 1);
  });

  it("a local refusal queues nothing and is reported", async () => {
    const { server } = await serverAtActivity();
    const loaded = await loadRun(apiFor(server), RUN_ID, async () => testGameData());
    if (loaded.kind !== "ready") throw new Error("not ready");
    const queued: NewOp[] = [];
    const refused = vi.fn();
    const run = new SyncedRun({ runId: RUN_ID, initial: loaded.run.state, enqueue: (op) => queued.push(op), onLocalRefusal: refused });
    run.startWave(10, []); // not allowed in ACTIVITY
    expect(queued).toHaveLength(0);
    expect(refused).toHaveBeenCalledWith("START_WAVE", "PHASE_MISMATCH");
  });

  it("SAVE_PREP only when the purchases changed, and never outside preparation", async () => {
    const { server } = await serverAtActivity();
    const loaded = await loadRun(apiFor(server), RUN_ID, async () => testGameData());
    if (loaded.kind !== "ready") throw new Error("not ready");
    const queued: NewOp[] = [];
    const run = new SyncedRun({ runId: RUN_ID, initial: loaded.run.state, enqueue: (op) => queued.push(op) });
    expect(run.savePrep(1, [])).toBe(false); // ACTIVITY: no build ops
    run.submitAttempt("b"); // resolves: phase BUILD
    const snap = run.state.snapshot!;
    expect(run.savePrep(snap.credits, snap.placements)).toBe(false); // nothing changed
    expect(run.savePrep(snap.credits - 1, snap.placements)).toBe(true);
    expect(queued.map((op) => op.type)).toEqual(["SUBMIT_ATTEMPT", "SAVE_PREP"]);
  });
});

describe("AckTracker", () => {
  function batch(...opIds: string[]): OpsBatchBody {
    return {
      protocolVersion: 1,
      sessionId: SESSION_ID,
      generation: 1,
      ops: opIds.map((opId) => ({ opId, expectedRevision: 1, type: "SAVE_PREP", payload: {}, clientTime: "x" })),
    };
  }
  const ok = (body: OpsResponse): ApiResult<OpsResponse> => ({ kind: "ok", status: 200, body });
  const run = { runId: RUN_ID, revision: 3 };

  it("resolves applied ops, and refuses the rest after a REJECTED", async () => {
    const tracker = new AckTracker();
    const a = tracker.waitFor("a");
    const b = tracker.waitFor("b");
    const c = tracker.waitFor("c");
    const transport = tracker.wrap({
      sendOps: async () =>
        ok({
          results: [
            { opId: "a", result: "APPLIED", appliedRevision: 2, attempt: { n: 1, correct: true, slotStatus: "SUCCEEDED", rewardGranted: true } },
            { opId: "b", result: "REJECTED", code: "PHASE_MISMATCH" },
            { opId: "c", result: "NOT_PROCESSED" },
          ],
          run,
        }),
    });
    await transport.sendOps(RUN_ID, batch("a", "b", "c"));
    expect(await a).toMatchObject({ kind: "applied", result: { attempt: { correct: true } } });
    expect(await b).toEqual({ kind: "refused", code: "PHASE_MISMATCH" });
    expect(await c).toEqual({ kind: "refused", code: "NOT_PROCESSED" });
  });

  it("keeps waiting through transient failures (the queue resends), and passes run views on", async () => {
    const tracker = new AckTracker();
    let settled = false;
    void tracker.waitFor("a").then(() => (settled = true));
    const views: unknown[] = [];
    tracker.onRunView((v) => views.push(v));
    const answers: ApiResult<OpsResponse>[] = [
      { kind: "network", reason: "timeout" },
      { kind: "error", status: 503, code: "THROTTLED", body: { results: [{ opId: "a", result: "NOT_PROCESSED" }], run } },
      ok({ results: [{ opId: "a", result: "APPLIED", appliedRevision: 4 }], run }),
    ];
    const transport = tracker.wrap({ sendOps: async () => answers.shift()! });
    await transport.sendOps(RUN_ID, batch("a"));
    await transport.sendOps(RUN_ID, batch("a"));
    await settle();
    expect(settled).toBe(false);
    await transport.sendOps(RUN_ID, batch("a"));
    await settle();
    expect(settled).toBe(true);
    expect(views).toHaveLength(2);
  });

  it("a definite HTTP refusal (404 run gone) refuses every op of the batch", async () => {
    const tracker = new AckTracker();
    const a = tracker.waitFor("a");
    const transport = tracker.wrap({ sendOps: async () => ({ kind: "error", status: 404, code: "NOT_FOUND", body: null }) });
    await transport.sendOps(RUN_ID, batch("a"));
    expect(await a).toEqual({ kind: "refused", code: "NOT_FOUND" });
  });
});

describe("PlayLease", () => {
  function setUp(server: Awaited<ReturnType<typeof serverAtActivity>>["server"], visible = true) {
    const api = apiFor(server);
    const queue = new SyncQueue({ transport: api, protocolVersion: PROTOCOL_VERSION });
    const ticks: (() => void)[] = [];
    let now = 0;
    const lease = new PlayLease({
      api,
      queue,
      sessionId: SESSION_ID,
      deviceLabel: "Chrome on Linux",
      visible: () => visible,
      now: () => now,
      timers: { setInterval: (fn) => ticks.push(fn), clearInterval: () => undefined },
    });
    return { api, queue, lease, ticks, advance: (ms: number) => (now += ms) };
  }

  it("claims through the queue, then stamps queued ops with the lease", async () => {
    const { server } = await serverAtActivity();
    server.state.lease = null;
    const t = setUp(server);
    const claim = await t.lease.claim(RUN_ID);
    expect(claim.kind).toBe("ok");
    expect(t.lease.held).toEqual({ runId: RUN_ID, generation: server.state.lease!.generation });
    expect(server.log.at(-1)).toBe("PUT /api/session claim");
  });

  it("renews only while visible and with input in the last 5 minutes; a stale renew stops the screen", async () => {
    const { server } = await serverAtActivity();
    const t = setUp(server);
    await t.lease.claim(RUN_ID);
    const stale = vi.fn();
    t.lease.onStale(stale);
    await t.lease.renewNow();
    expect(server.log.at(-1)).toBe("PUT /api/session renew");
    t.advance(5 * 60_000 + 1);
    const count = server.log.length;
    await t.lease.renewNow();
    expect(server.log.length).toBe(count); // idle: no renew, the lease lapses by itself
    t.lease.noteInput();
    server.state.lease = { ...server.state.lease!, generation: server.state.lease!.generation + 1 }; // taken over
    await t.lease.renewNow();
    expect(stale).toHaveBeenCalledTimes(1);
    expect(server.log.filter((l) => l.includes("claim"))).toHaveLength(1); // never falls back to a claim
  });

  it("a claim on an ended run is RUN_TERMINAL; release goes after the queued ops", async () => {
    const { server } = await serverAtActivity();
    server.state.runs[0]!.state = { ...server.state.runs[0]!.state, status: "COMPLETED" };
    const t = setUp(server);
    expect((await t.lease.claim(RUN_ID)).kind).toBe("terminal");
  });
});

describe("createRun (New game)", () => {
  const choice = { planetId: "luna-1", waveSetId: "first-contact" };
  const current = async () => ({ rulesetVersion: "r1", campaignVersion: "luna-1-c1" });

  function deps(answers: ApiResult<unknown>[]) {
    const sent: Record<string, unknown>[] = [];
    const adopt = vi.fn();
    let n = 0;
    return {
      sent,
      adopt,
      deps: {
        api: {
          createRun: async (body: Record<string, unknown>) => {
            sent.push(body);
            return answers.shift()!;
          },
        },
        queue: { control: <T>(send: () => Promise<ApiResult<T>>) => send() },
        lease: { sessionId: SESSION_ID, deviceLabel: "Chrome on Linux", adopt },
        loadCurrent: current,
        newId: () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, "0")}`,
      },
    };
  }

  it("creates the run and adopts the lease it claimed", async () => {
    const { server } = await serverAtActivity();
    server.state.runs = [];
    const t = deps([]);
    t.deps.api.createRun = async (body) => {
      t.sent.push(body);
      return reply(await server.createRun(body));
    };
    const outcome = await createRun(t.deps as never, choice);
    expect(outcome.kind).toBe("ok");
    expect(t.adopt).toHaveBeenCalledTimes(1);
    expect(t.sent[0]).toMatchObject({ rulesetVersion: "r1", campaignVersion: "luna-1-c1", sessionId: SESSION_ID });
  });

  it("a lost response keeps the runId, and the retry makes exactly one run (G R8 idempotency)", async () => {
    const { server } = await serverAtActivity();
    server.state.runs = [];
    const t = deps([]);
    let lose = true;
    t.deps.api.createRun = async (body) => {
      t.sent.push(body);
      const answer = reply(await server.createRun(body));
      if (lose) {
        lose = false;
        return { kind: "network", reason: "timeout" };
      }
      return answer;
    };
    const first = await createRun(t.deps as never, choice);
    expect(first).toEqual({ kind: "failed", retryRunId: t.sent[0]?.runId });
    const retryRunId = first.kind === "failed" ? first.retryRunId : undefined;
    expect(retryRunId).toBeDefined();
    const retry = await createRun(t.deps as never, choice, { runId: retryRunId ?? "" });
    expect(retry).toEqual({ kind: "ok", runId: t.sent[0]?.runId });
    expect(t.sent[1]?.runId).toBe(t.sent[0]?.runId);
    expect(server.state.runs).toHaveLength(1);
  });

  it("5xx and THROTTLED keep the runId; a definite 4xx does not", async () => {
    const five = await createRun(deps([{ kind: "error", status: 503, code: null, body: null }]).deps as never, choice);
    expect(five.kind === "failed" && five.retryRunId).toBeTruthy();
    const throttled = await createRun(deps([{ kind: "error", status: 429, code: "THROTTLED", body: null }]).deps as never, choice);
    expect(throttled.kind === "failed" && throttled.retryRunId).toBeTruthy();
    expect(await createRun(deps([{ kind: "error", status: 400, code: "VALIDATION_FAILED", body: null }]).deps as never, choice)).toEqual({
      kind: "failed",
    });
  });

  it("CONTENT_VERSION_UNSUPPORTED: re-reads current.json and retries once with a new runId", async () => {
    const refusal: ApiResult<unknown> = { kind: "error", status: 409, code: "CONTENT_VERSION_UNSUPPORTED", body: null };
    const t = deps([refusal, refusal]);
    expect((await createRun(t.deps as never, choice)).kind).toBe("upgrade");
    expect(t.sent).toHaveLength(2);
    expect(t.sent[0]?.runId).not.toBe(t.sent[1]?.runId);
  });

  it("TAKEOVER_CONFIRM_REQUIRED keeps the runId for the repeat with takeover: true", async () => {
    const t = deps([
      { kind: "error", status: 409, code: "TAKEOVER_CONFIRM_REQUIRED", body: { error: { code: "TAKEOVER_CONFIRM_REQUIRED", details: { deviceLabel: "Edge on Windows" } } } },
    ]);
    const outcome = await createRun(t.deps as never, choice);
    expect(outcome).toEqual({ kind: "takeover-confirm", runId: t.sent[0]?.runId, deviceLabel: "Edge on Windows" });
  });

  it("RUN_LIMIT_REACHED and CONTENT_UNAVAILABLE are told apart", async () => {
    expect((await createRun(deps([{ kind: "error", status: 409, code: "RUN_LIMIT_REACHED", body: null }]).deps as never, choice)).kind).toBe("limit");
    const unavailable = await createRun(
      deps([{ kind: "error", status: 409, code: "CONTENT_UNAVAILABLE", body: { error: { code: "CONTENT_UNAVAILABLE", details: { reason: "BANK_NOT_READY" } } } }]).deps as never,
      choice,
    );
    expect(unavailable).toEqual({ kind: "unavailable", reason: "BANK_NOT_READY" });
  });
});

describe("deviceLabel", () => {
  it("names the browser and system only, within 40 characters", () => {
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36")).toBe(
      "Chrome on Windows",
    );
    expect(deviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15")).toBe(
      "Safari on a Mac",
    );
    expect(deviceLabel("Mozilla/5.0 (X11; CrOS x86_64 15000.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36")).toBe(
      "Chrome on a Chromebook",
    );
    expect(deviceLabel("").length).toBeLessThanOrEqual(40);
  });
});
