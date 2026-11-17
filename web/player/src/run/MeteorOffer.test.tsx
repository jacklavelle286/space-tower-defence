// @vitest-environment jsdom
// The meteor offer (Phase 51, D4 P9, D-11): Have a go opens the activity; No thanks sends DISMISS_SLOT through the
// reducer (DECLINED, no reward) and says it is fine; a full power is mentioned. The server grants; the browser asks.
import type { RunState } from "@scd/game-core";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NewOp } from "../sync/queue";
import type { AckTracker } from "./ackTracker";
import { MeteorOffer } from "./MeteorOffer";
import { SyncedRun } from "./syncedRun";

afterEach(cleanup);

const STATE: RunState = {
  mode: "CAMPAIGN",
  status: "IN_PROGRESS",
  stage: "AUTHORED",
  phase: "METEOR",
  wave: 10,
  finalWave: 50,
  highestCompletedWave: 9,
  campaignCompleted: false,
  plannedThrough: 49,
  revision: 20,
  powerChargeCap: 2,
  snapshot: { credits: 300, placements: [], colony: { health: 20, shield: 0 }, powers: {} },
  slots: [
    { slotId: "N-009", kind: "NORMAL", status: "SUCCEEDED", attempts: [], accepted: ["a"], withdrawn: false, reward: { credits: 30 } },
    { slotId: "M-009", kind: "METEOR", status: "UNRESOLVED", attempts: [], accepted: ["b"], withdrawn: false, reward: { credits: 0, powerId: "frost-pulse" } },
  ],
};

function setUp(held = 0) {
  const queued: NewOp[] = [];
  const run = new SyncedRun({ runId: "run-1", initial: STATE, enqueue: (op) => queued.push(op) });
  const tracker = { waitFor: async () => ({ kind: "applied" }) } as unknown as AckTracker;
  const onHaveAGo = vi.fn();
  const onDone = vi.fn();
  render(
    <MeteorOffer
      run={run}
      powerId="frost-pulse"
      powerName="Frost Pulse"
      held={held}
      cap={2}
      tracker={tracker}
      onHaveAGo={onHaveAGo}
      onDone={onDone}
      onResync={() => {}}
    />,
  );
  return { run, queued, onHaveAGo, onDone };
}

describe("MeteorOffer (Phase 51)", () => {
  it("asks first, with the power by name; Have a go is focused and opens the activity", () => {
    const { onHaveAGo, queued } = setUp();
    expect(screen.getByRole("heading", { name: "Meteor challenge!" })).toBeTruthy();
    expect(screen.getByText("Frost Pulse")).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("Have a go");
    act(() => screen.getByRole("button", { name: "Have a go" }).click());
    expect(onHaveAGo).toHaveBeenCalled();
    expect(queued).toHaveLength(0);
  });

  it("No thanks sends DISMISS_SLOT: DECLINED, no charge, back to preparation with a kind word", async () => {
    const { run, queued, onDone } = setUp();
    await act(async () => screen.getByRole("button", { name: "No thanks" }).click());
    expect(queued.map((op) => [op.type, op.payload])).toEqual([["DISMISS_SLOT", { slotId: "M-009" }]]);
    expect(run.state.slots.find((s) => s.slotId === "M-009")?.status).toBe("DECLINED");
    expect(run.state.snapshot?.powers).toEqual({});
    expect(run.state.phase).toBe("BUILD");
    expect(screen.getByText("That's fine — you can still beat the boss!")).toBeTruthy();
    act(() => screen.getByRole("button", { name: "OK" }).click());
    expect(onDone).toHaveBeenCalled();
  });

  it("says when the power is already full (P8)", () => {
    setUp(2);
    expect(screen.getByText("Frost Pulse is full (2 of 2). Have a go anyway?")).toBeTruthy();
  });
});
