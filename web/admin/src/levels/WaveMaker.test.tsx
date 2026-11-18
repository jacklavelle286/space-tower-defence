// @vitest-environment jsdom
// Waves tab → Make the waves for me (Gate M, LD15): 50 waves in one edit, the campaign card for a level without one,
// tuning with the test player (a fake worker here), and stopping.
import { marginTarget, toughnessAt } from "@scd/game-core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LevelFile } from "../api";
import type { CurveReply, CurveRequest, CurveWorker } from "./curves/measure";
import { newLevel } from "./levelFile";
import { WaveMaker } from "./WaveMaker";

afterEach(cleanup);

/** A worker answering each wave with `factor(request number)` x the target margin; `hold` never answers. */
function workers(factor: (request: number) => number, hold = false) {
  let requests = 0;
  const make = (): CurveWorker => {
    const worker: CurveWorker = {
      onmessage: null,
      terminate: vi.fn(),
      postMessage: (request: CurveRequest) => {
        const f = factor(requests);
        requests += 1;
        if (hold) return;
        queueMicrotask(() => {
          for (const wave of request.waves) {
            worker.onmessage?.({ data: { type: "wave", measure: { wave, margin: Math.round(marginTarget(wave) * f * 100) / 100, seconds: 40, boss: wave % 10 === 0 } } } as MessageEvent<CurveReply>);
          }
          worker.onmessage?.({ data: { type: "done" } } as MessageEvent<CurveReply>);
        });
      },
    };
    return worker;
  };
  return { make, requests: () => requests };
}

function open(level: LevelFile, make: () => CurveWorker) {
  const onEdit = vi.fn<(level: LevelFile) => void>();
  render(<WaveMaker level={level} onEdit={onEdit} firstSeed={3} makeWorker={make} />);
  fireEvent.click(screen.getByText("Make the waves for me"));
  return onEdit;
}

describe("WaveMaker", () => {
  it("makes 50 waves and gives a level without the campaign the campaign card, in one edit", () => {
    const onEdit = open(newLevel("zig", "Zig", "zigzag"), workers(() => 1).make);
    expect(screen.getByText(/does not have the campaign yet/u)).toBeTruthy();
    fireEvent.click(screen.getByLabelText(/Tune with the test player/u));
    fireEvent.click(screen.getByRole("button", { name: "Make the waves" }));
    const made = onEdit.mock.calls[0]?.[0] as LevelFile;
    expect(made.waves).toHaveLength(50);
    expect(made.waves?.map((w) => w.hpMult).slice(0, 3)).toEqual([toughnessAt(1), toughnessAt(2), toughnessAt(3)]);
    expect(made.waveSets["campaign"]?.mapId).toBe("zig");
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toBe("Waves 3 are in, health from the toughness curve. Ctrl+Z puts back the waves you had.");
  });

  it("tunes: health set to meet the target, measured again, then one edit", async () => {
    const fake = workers((request) => (request < 3 ? 2 : 1)); // first pass: twice the room the target wants
    const onEdit = open(newLevel("lvl", "Level", "moonbeam-campaign"), fake.make);
    fireEvent.click(screen.getByRole("button", { name: "Make the waves" }));
    await waitFor(() => expect(onEdit).toHaveBeenCalledTimes(1));
    const made = onEdit.mock.calls[0]?.[0] as LevelFile;
    expect(made.waves?.[0]?.hpMult).toBe(2); // x1 at twice the target's room: twice as tough
    expect(fake.requests()).toBe(6); // two passes of three workers
    expect(screen.getByRole("status").textContent).toMatch(/^Waves 3 are in and tuned: 50 of 50 are within 15 % of the difficulty target\. /u);
  });

  it("uses only the aliens left ticked, and says why with none", () => {
    const onEdit = open(newLevel("lvl", "Level", "moonbeam-campaign"), workers(() => 1).make);
    for (const box of screen.getAllByRole("checkbox").filter((b) => b.closest("fieldset") !== null)) fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: "Make the waves" }));
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Choose at least one alien.");
  });

  it("Stop leaves the waves as they were", async () => {
    const onEdit = open(newLevel("lvl", "Level", "moonbeam-campaign"), workers(() => 1, true).make);
    fireEvent.click(screen.getByRole("button", { name: "Make the waves" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Stopped: the waves were not changed."));
    expect(onEdit).not.toHaveBeenCalled();
  });

  it("needs a route first", () => {
    open(newLevel("lvl", "Level", "blank"), workers(() => 1).make);
    expect((screen.getByRole("button", { name: "Make the waves" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
