// @vitest-environment jsdom
// Waves tab → Difficulty curve (Gate M, LD13): health against the toughness curve, measured margins against the target,
// and setting health from either; the endless waves after the campaign.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LevelWave } from "../../api";
import { newLevel } from "../levelFile";
import { CurvePanel } from "./CurvePanel";
import type { CurveReply, CurveRequest, CurveWorker } from "./measure";

afterEach(cleanup);

/** A worker that answers each wave with a margin of 3 and 30 s. */
function fakeWorker(): CurveWorker {
  const worker: CurveWorker = {
    onmessage: null,
    terminate: vi.fn(),
    postMessage: (request: CurveRequest) => {
      queueMicrotask(() => {
        for (const wave of request.waves) worker.onmessage?.({ data: { type: "wave", measure: { wave, margin: 3, seconds: wave % 10 === 0 ? 30 : 31, boss: wave % 10 === 0 } } } as MessageEvent<CurveReply>);
        worker.onmessage?.({ data: { type: "done" } } as MessageEvent<CurveReply>);
      });
    },
  };
  return worker;
}

const level = () => newLevel("zigzag", "Zigzag", "moonbeam-campaign");

describe("CurvePanel", () => {
  it("sets health from the toughness curve over a range", () => {
    const start = level();
    const waves = (start.waves ?? []).map((w) => ({ ...w, hpMult: 2 }));
    const onSetWaves = vi.fn();
    render(<CurvePanel level={{ ...start, waves }} onSetWaves={onSetWaves} makeWorker={fakeWorker} />);
    fireEvent.click(screen.getByRole("button", { name: "Set health from the toughness curve" }));
    const set = onSetWaves.mock.calls[0]?.[0] as LevelWave[];
    expect(set.slice(0, 10).map((w) => w.hpMult)).toEqual([1, 1.05, 1.1, 1.15, 1.2, 1.2, 1.25, 1.3, 1.35, 1.4]);
    expect(set[10]?.hpMult).toBe(2); // outside the range: untouched
  });

  it("measures the range, then sets health to meet the margin target", async () => {
    const start = level();
    const onSetWaves = vi.fn();
    render(<CurvePanel level={start} onSetWaves={onSetWaves} makeWorker={fakeWorker} />);
    const meet = screen.getByRole("button", { name: "Set health to meet the margin target" }) as HTMLButtonElement;
    expect(meet.disabled).toBe(true); // nothing measured yet
    fireEvent.click(screen.getByRole("button", { name: "Measure margins" }));
    await waitFor(() => expect(meet.disabled).toBe(false));
    const row = screen.getByRole("row", { name: /^10 \(boss\)/u });
    expect(within(row).getByText("30 s (short)")).toBeTruthy(); // a boss wave under 40 s
    fireEvent.click(meet);
    const set = onSetWaves.mock.calls[0]?.[0] as LevelWave[];
    // Wave 1: health x1, margin 3 against a target of 4: three quarters as tough.
    expect(set[0]?.hpMult).toBe(0.75);
  });

  it("shows the endless waves 51 to 60", () => {
    render(<CurvePanel level={level()} onSetWaves={vi.fn()} makeWorker={fakeWorker} />);
    expect(screen.getByText(/Endless waves 51 to 60/u)).toBeTruthy();
    expect(screen.getAllByRole("row", { name: /^5[1-9]|^60/u }).length).toBe(10);
  });
});
