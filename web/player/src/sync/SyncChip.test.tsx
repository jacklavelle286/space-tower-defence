// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeTransport } from "./fakeTransport";
import { SyncQueue, type NewOp } from "./queue";
import { SyncChip } from "./SyncChip";

const RUN = "4b1e0000-0000-4000-8000-0000000000aa";
let n = 0;
function op(): NewOp {
  n += 1;
  return {
    runId: RUN,
    opId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    expectedRevision: n,
    type: "SAVE_PREP",
    payload: { credits: 5, placements: [] },
    clientTime: "2026-11-15T10:00:00Z",
  };
}

function setup(signInWarning?: () => string | null) {
  const transport = new FakeTransport();
  const queue = new SyncQueue({ transport, protocolVersion: 1, random: () => 0 });
  queue.setSession({ sessionId: "c0a80000-0000-4000-8000-000000000001", generation: 3 });
  const onSignIn = vi.fn();
  render(<SyncChip queue={queue} onSignIn={onSignIn} {...(signInWarning ? { signInWarning } : {})} />);
  return { queue, transport, onSignIn };
}

const chip = () => screen.getByRole("status");
const flush = () => act(() => vi.advanceTimersByTimeAsync(0));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SyncChip with the real queue and a fake transport", () => {
  it("starts as 'Saved to the cloud' with an icon and words", () => {
    setup();
    expect(chip()).toHaveProperty("textContent", "Saved to the cloud");
    expect(chip().querySelector("img")?.getAttribute("src")).toBe("/assets/ui/icon-sync-saved.svg");
  });

  it("never shows 'Saved to the cloud' while any op is pending or in flight", async () => {
    const { queue, transport } = setup();
    const assertNotSaved = () => {
      expect(queue.getSnapshot().pending).toBeGreaterThan(0);
      expect(chip().textContent).not.toContain("Saved to the cloud");
      expect(chip().dataset.status).not.toBe("SYNCED");
    };

    act(() => void queue.enqueue(op()));
    await flush();
    assertNotSaved(); // first op in flight
    expect(chip().textContent).toBe("Saving…");

    act(() => void queue.enqueue(op())); // queued behind the in-flight request
    transport.applyAll(); // acknowledges only the first op
    await flush();
    assertNotSaved(); // second op now in flight

    // The second request fails: still not saved, now retrying.
    transport.last.respond({ kind: "network", reason: "failed" });
    await flush();
    assertNotSaved();
    expect(chip().textContent).toBe("Couldn't save — trying again");

    await act(() => vi.advanceTimersByTimeAsync(1_000));
    assertNotSaved();
    transport.applyAll(2);
    await flush();
    expect(queue.getSnapshot().pending).toBe(0);
    expect(chip().textContent).toBe("Saved to the cloud");

    // An op waiting behind a lease request (nothing of it sent yet) is still unsaved.
    let releaseClaim!: () => void;
    const claim = queue.control<null>(
      () => new Promise((resolve) => (releaseClaim = () => resolve({ kind: "ok", status: 200, body: null }))),
    );
    act(() => void queue.enqueue(op()));
    await flush();
    expect(transport.inFlight).toBe(0);
    assertNotSaved();
    releaseClaim();
    await act(() => claim);
    await flush();
    transport.applyAll(3);
    await flush();
    expect(chip().textContent).toBe("Saved to the cloud");
  });

  it("shows the update wording for PROTOCOL_UNSUPPORTED, with the grown-up line", async () => {
    const { queue, transport } = setup();
    act(() => void queue.enqueue(op()));
    await flush();
    transport.last.respond({ kind: "error", status: 409, code: "PROTOCOL_UNSUPPORTED", body: { error: { code: "PROTOCOL_UNSUPPORTED" } } });
    await flush();
    expect(chip().textContent).toContain("Saving paused while the game updates");
    expect(chip().textContent).toContain("Nothing is lost.");
  });

  it("shows 'Sign in again to finish saving' with a Sign in button after a refused refresh", async () => {
    const { queue, transport, onSignIn } = setup();
    act(() => void queue.enqueue(op()));
    await flush();
    transport.last.respond({ kind: "auth-required" });
    await flush();
    expect(chip().textContent).toContain("Sign in again to finish saving");
    expect(chip().textContent).toContain("Your last change may need doing again.");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(onSignIn).toHaveBeenCalledOnce();
    expect(queue.getSnapshot().pending).toBe(1);
  });

  it("in a wave, Sign in first says the wave will start again; the second press signs in (D7.1)", async () => {
    const { queue, transport, onSignIn } = setup(() => "Wave 2 will start again from the beginning.");
    act(() => void queue.enqueue(op()));
    await flush();
    transport.last.respond({ kind: "auth-required" });
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(onSignIn).not.toHaveBeenCalled();
    const confirm = screen.getByRole("button", { name: "Wave 2 will start again from the beginning." });
    fireEvent.click(confirm);
    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it("settled() waits for the request in flight, then resolves", async () => {
    const { queue, transport } = setup();
    act(() => void queue.enqueue(op()));
    await flush();
    let done = false;
    void queue.settled().then(() => (done = true));
    await flush();
    expect(done).toBe(false);
    transport.last.respond({ kind: "auth-required" });
    await flush();
    expect(done).toBe(true);
    await expect(queue.settled()).resolves.toBeUndefined();
  });

  it("does not re-render when ops are queued and acknowledged within one state", async () => {
    const transport = new FakeTransport();
    const queue = new SyncQueue({ transport, protocolVersion: 1 });
    queue.setSession({ sessionId: "s", generation: 1 });
    act(() => void queue.enqueue(op()));
    await flush();
    let renders = 0;
    render(
      <Profiler id="chip" onRender={() => (renders += 1)}>
        <SyncChip queue={queue} onSignIn={() => {}} />
      </Profiler>,
    );
    const after = renders;
    act(() => {
      for (let i = 0; i < 10; i++) queue.enqueue(op()); // still PENDING: same words
    });
    await flush();
    expect(renders).toBe(after);
  });
});
