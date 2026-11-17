// @vitest-environment jsdom
// P10 Campaign complete (Phase 54, D4 P10, G §6): Keep going flushes the queue, sends one CHOOSE_ENDLESS stamped with
// the lease to R12 and reloads the run; a refusal or no connection is said in words; Finish this game ends the game.
import type { RunState } from "@scd/game-core";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NewOp } from "../sync/queue";
import { CompletionOffer } from "./CompletionOffer";
import type { RunServices } from "./RunScreen";
import { SyncedRun } from "./syncedRun";

afterEach(cleanup);

const STATE: RunState = {
  mode: "CAMPAIGN",
  status: "IN_PROGRESS",
  stage: "AUTHORED",
  phase: "COMPLETION_OFFER",
  wave: 50,
  finalWave: 50,
  highestCompletedWave: 50,
  campaignCompleted: true,
  plannedThrough: 49,
  revision: 140,
  powerChargeCap: 2,
  snapshot: { credits: 300, placements: [], colony: { health: 20, shield: 0 }, powers: {} },
  slots: [],
};

function setUp(reply: unknown) {
  const queued: NewOp[] = [];
  const run = new SyncedRun({ runId: "run-1", initial: STATE, enqueue: (op) => queued.push(op) });
  const chooseEndless = vi.fn(async () => reply);
  const services = {
    api: { chooseEndless },
    queue: { getSnapshot: () => ({ pending: 0 }), subscribe: () => () => {} },
    lease: { sessionId: "11111111-1111-4111-8111-111111111111", held: { runId: "run-1", generation: 4 } },
  } as unknown as Pick<RunServices, "api" | "queue" | "lease">;
  const onEndless = vi.fn(async () => {});
  const onFinish = vi.fn();
  render(<CompletionOffer run={run} services={services} wavesCleared={50} planetId="luna-1" onEndless={onEndless} onFinish={onFinish} newId={() => "op-1"} />);
  return { chooseEndless, onEndless, onFinish, queued };
}

describe("CompletionOffer (Phase 54)", () => {
  it("shows the badge and waves cleared; Keep going sends one CHOOSE_ENDLESS with the lease, then reloads", async () => {
    const { chooseEndless, onEndless, queued } = setUp({ kind: "ok", status: 200, body: { results: [{ opId: "op-1", result: "APPLIED" }] } });
    expect(screen.getByRole("heading", { name: "You saved the colony!" })).toBeTruthy();
    expect(screen.getByText("Waves cleared: 50")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Colony Hero" }).getAttribute("src")).toBe("/assets/ui/badge-campaign-luna-1.png");
    await act(async () => screen.getByRole("button", { name: "Keep going" }).click());
    expect(chooseEndless).toHaveBeenCalledWith("run-1", {
      protocolVersion: 1,
      sessionId: "11111111-1111-4111-8111-111111111111",
      generation: 4,
      ops: [expect.objectContaining({ opId: "op-1", expectedRevision: 140, type: "CHOOSE_ENDLESS", payload: {} })],
    });
    expect(onEndless).toHaveBeenCalled();
    expect(queued).toHaveLength(0); // never queued
  });

  it("a refusal (no endless for this game data) and no connection are said in words", async () => {
    setUp({ kind: "ok", status: 200, body: { results: [{ opId: "op-1", result: "REJECTED", code: "CONTENT_VERSION_UNSUPPORTED" }] } });
    await act(async () => screen.getByRole("button", { name: "Keep going" }).click());
    expect(screen.getByRole("alert").textContent).toBe("Endless isn't ready yet. You can finish this game and keep your badge.");
    cleanup();
    setUp({ kind: "network", reason: "failed" });
    await act(async () => screen.getByRole("button", { name: "Keep going" }).click());
    expect(screen.getByRole("alert").textContent).toBe("You need the internet to keep going.");
  });

  it("Finish this game", () => {
    const { onFinish } = setUp({ kind: "network", reason: "failed" });
    act(() => screen.getByRole("button", { name: "Finish this game" }).click());
    expect(onFinish).toHaveBeenCalled();
  });
});
