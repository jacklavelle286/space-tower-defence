// @vitest-environment jsdom
import type { Progress } from "@scd/shared";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PlayerApi } from "../api/playerApi";
import { MyProgress, subjectTotals } from "./MyProgress";

afterEach(cleanup);

const PROGRESS: Progress = {
  summaries: [
    { subject: "maths", topicId: "maths-count-objects-to10", completed: 5, succeeded: 4, failed: 1, lastResolvedAt: "2026-11-17T09:00:00Z" },
    { subject: "maths", topicId: "maths-count-subitise-to5", completed: 2, succeeded: 2, failed: 0, lastResolvedAt: "2026-11-17T09:00:00Z" },
    { subject: "phonics", topicId: "phonics-gpc-consonant-digraphs", completed: 1, succeeded: 1, failed: 0, lastResolvedAt: "2026-11-17T09:00:00Z" },
  ],
  planets: { "luna-1": { bestCompletedWave: 2 } },
  badges: {},
};

function api(progress: Progress | null): Pick<PlayerApi, "getProgress" | "getPlanets"> {
  return {
    getProgress: async () => (progress === null ? { kind: "network", reason: "failed" } : { kind: "ok", status: 200, body: progress }),
    getPlanets: async () => ({ kind: "ok", status: 200, body: { ageBand: 5, planets: [{ planetId: "luna-1", name: "Moonbeam Colony", unlocked: true, waveSets: [] }] } }),
  } as Pick<PlayerApi, "getProgress" | "getPlanets">;
}

describe("MyProgress (Phase 43, D4 P12)", () => {
  it("sums each subject: done, stars, still practising", () => {
    expect(subjectTotals(PROGRESS.summaries, "maths")).toEqual({ done: 7, stars: 6, practising: 1 });
    expect(subjectTotals(PROGRESS.summaries, "spelling")).toEqual({ done: 0, stars: 0, practising: 0 });
  });

  it("shows three subject cards with counts only, topics by title, and planet bests", async () => {
    render(<MyProgress api={api(PROGRESS)} onBack={() => {}} />);
    expect(await screen.findByText("Activities done: 7 · Stars: 6")).toBeTruthy();
    expect(screen.getByText("Still practising: 1")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Spelling" })).toBeTruthy();
    expect(await screen.findByText("Moonbeam Colony: best 2 waves cleared")).toBeTruthy();
    act(() => screen.getAllByRole("button", { name: "Show topics" })[0]?.click());
    expect(screen.getByText("Count objects to 10")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/%|grade|age \d/i); // no percentages, grades or ages
  });

  it("says so when there is nothing yet, and when it cannot load", async () => {
    render(<MyProgress api={api({ summaries: [], planets: {}, badges: {} })} onBack={() => {}} />);
    expect(await screen.findByText("Nothing here yet. Play a game to start!")).toBeTruthy();
    cleanup();
    render(<MyProgress api={api(null)} onBack={() => {}} />);
    expect(await screen.findByText(/couldn't load your progress/)).toBeTruthy();
  });
});
