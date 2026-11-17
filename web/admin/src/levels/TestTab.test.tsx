// @vitest-environment jsdom
// The Test tab (Gate M, LD5): runs on the saved draft only, shows each wave set's verdict and table, and records the
// test play on the draft revision (R45). Workers are replaced by a stand-in that runs the same jobs on this thread.
import { runJob } from "@scd/game-core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeAdminApi } from "../testing/fakeApi";
import type { CheckWorker, WorkerRequest } from "./checkRun";
import { LevelEditor } from "./LevelEditor";
import { CURRENT_RULESET, mergedLevel, newLevel } from "./levelFile";

function inlineWorker(): CheckWorker {
  const worker: CheckWorker = {
    onmessage: null,
    terminate() {},
    postMessage(message: WorkerRequest) {
      setTimeout(() => {
        const planet = mergedLevel(message.level, message.base);
        for (const job of message.jobs) worker.onmessage?.({ data: { type: "result", result: runJob(CURRENT_RULESET, planet, job) } } as MessageEvent);
      }, 0);
    },
  };
  return worker;
}

let fake: FakeAdminApi;
beforeEach(async () => {
  fake = new FakeAdminApi();
  window.sessionStorage.clear();
  const level = newLevel("zig", "Zig", "zigzag");
  level.waveSets["zig-rush"] = {
    mode: "CHALLENGE", name: "Zig Rush", mapId: "zig", waves: [1, 2], meteorAfter: [], startCredits: 200,
    colonyHealth: 20, classes: ["nova", "pip"], padsOpenAsForWave: 1, presetPlacements: [],
  };
  await fake.api.createLevel(level);
});
afterEach(cleanup);

describe("Test tab", () => {
  it("runs the checks on the saved draft, shows the report and records the test play", async () => {
    render(<LevelEditor api={fake.api} levelId="zig" makeWorker={inlineWorker} />);
    await screen.findByRole("application");
    fireEvent.click(screen.getByRole("tab", { name: "Test" }));
    fireEvent.click(screen.getByRole("button", { name: "Run checks" }));
    expect(await screen.findByRole("heading", { name: "zig-rush" }, { timeout: 15000 })).toBeTruthy();
    expect(screen.getByText(/Competent at 0% learning clears all\./)).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Competent 60%" })).toBeTruthy();
    await waitFor(() => expect(fake.levels.get("zig")?.review?.testPlayedDraftRevision).toBe(0));
    expect(await screen.findByText(/Last checked: draft revision 0 \(this one\)/)).toBeTruthy();
  }, 20000);

  it("asks for a save first when there are unsaved edits", async () => {
    render(<LevelEditor api={fake.api} levelId="zig" makeWorker={inlineWorker} />);
    const canvas = await screen.findByRole("application");
    canvas.focus();
    fireEvent.keyDown(canvas, { key: "2" });
    fireEvent.keyDown(canvas, { key: "ArrowUp" });
    fireEvent.keyDown(canvas, { key: "ArrowUp" });
    fireEvent.keyDown(canvas, { key: "Enter" }); // a pad: an unsaved edit
    fireEvent.click(screen.getByRole("tab", { name: "Test" }));
    expect(screen.getByRole("button", { name: "Run checks" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/Save first/)).toBeTruthy();
  });
});
