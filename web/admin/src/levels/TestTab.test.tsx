// @vitest-environment jsdom
// The Test tab (Gate M, LD5): runs on the saved draft only, shows each wave set's verdict and table, and records the
// test play on the draft revision (R45). Workers are replaced by a stand-in that runs the same jobs on this thread.
import { runJob } from "@scd/game-core";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeAdminApi } from "../testing/fakeApi";
import type { CheckWorker, WorkerRequest } from "./checkRun";
import { LevelEditor } from "./LevelEditor";
import { currentRuleset, mergedLevel, newLevel } from "./levelFile";

function inlineWorker(): CheckWorker {
  const worker: CheckWorker = {
    onmessage: null,
    terminate() {},
    postMessage(message: WorkerRequest) {
      setTimeout(() => {
        const planet = mergedLevel(message.level, message.base);
        for (const job of message.jobs) worker.onmessage?.({ data: { type: "result", result: runJob(currentRuleset(), planet, job) } } as MessageEvent);
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

describe("Publish tab → Get it ready (LD16)", () => {
  it("saves the unsaved edit, runs and records the checks, then validates, and the Test tab shows the run", async () => {
    render(<LevelEditor api={fake.api} levelId="zig" makeWorker={inlineWorker} />);
    await screen.findByRole("application");
    fireEvent.click(screen.getByRole("tab", { name: "Wave sets" }));
    fireEvent.change(screen.getByLabelText("Starting credits"), { target: { value: "300" } }); // an unsaved edit
    fireEvent.click(screen.getByRole("tab", { name: "Publish" }));
    fireEvent.click(screen.getByRole("button", { name: "Get it ready" }));
    expect(await screen.findByText(/^Ready: saved, checked and validated\./u, undefined, { timeout: 15000 })).toBeTruthy();
    expect(fake.levels.get("zig")?.draftRevision).toBe(1);
    expect(fake.levels.get("zig")?.review?.testPlayedDraftRevision).toBe(1);
    expect(fake.callsNamed("validateLevel")[0]?.args).toEqual(["zig", 1]);
    for (const text of ["The draft is saved.", "The server's Validate passes (rules and pictures)."]) {
      expect(screen.getByText(text).closest("li")?.className).toBe("ok");
    }
    fireEvent.click(screen.getByRole("tab", { name: "Test" }));
    expect(screen.getByRole("heading", { name: "zig-rush" })).toBeTruthy();
  }, 20000);

  it("stops with the reason when the editor shows a problem that stops publishing", async () => {
    const broken = newLevel("zig", "Zig", "blank");
    fake.levels.clear();
    await fake.api.createLevel(broken);
    render(<LevelEditor api={fake.api} levelId="zig" makeWorker={inlineWorker} />);
    await screen.findByRole("application");
    fireEvent.click(screen.getByRole("tab", { name: "Publish" }));
    fireEvent.click(screen.getByRole("button", { name: "Get it ready" }));
    expect(await screen.findByText("First fix the problems the editor shows: they stop publishing.")).toBeTruthy();
    expect(fake.callsNamed("validateLevel")).toEqual([]);
  });
});
