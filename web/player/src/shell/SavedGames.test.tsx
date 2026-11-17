// @vitest-environment jsdom
import type { RunList, RunSummary } from "@scd/shared";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerApi } from "../api/playerApi";
import { playedLabel, progressLabel, SavedGames } from "./SavedGames";

afterEach(cleanup);

const run = (n: number, extra: Partial<RunSummary> = {}): RunSummary => ({
  runId: `run-${n}`,
  planetId: "luna-1",
  waveSetId: "first-contact",
  mode: "CHALLENGE",
  status: "IN_PROGRESS",
  stage: "AUTHORED",
  wave: 2,
  finalWave: 2,
  highestCompletedWave: 1,
  lastPlayedAt: "2026-11-17T09:00:00Z",
  createdAt: "2026-11-16T09:00:00Z",
  revision: 3,
  playable: true,
  ...extra,
});

function fakeApi(pages: Record<string, RunList>): PlayerApi {
  return {
    getPlanets: async () => ({
      kind: "ok",
      status: 200,
      body: { ageBand: 5, planets: [{ planetId: "luna-1", name: "Moonbeam", unlocked: true, waveSets: [{ waveSetId: "first-contact", mode: "CHALLENGE", name: "First contact", finalWave: 2, available: true }] }] },
    }),
    getRuns: async (state: "open" | "done", cursor?: string) => {
      const body = pages[`${state}${cursor === undefined ? "" : `:${cursor}`}`];
      return body === undefined ? { kind: "network", reason: "failed" } : { kind: "ok", status: 200, body };
    },
  } as unknown as PlayerApi;
}

const NOW = () => new Date("2026-11-17T18:00:00Z");

describe("SavedGames (Phase 32, D4 P5)", () => {
  it("lists playing games with Continue and Give up, and finished ones with their result", async () => {
    const onContinue = vi.fn();
    const onEnd = vi.fn();
    const api = fakeApi({
      open: { items: [run(1), run(2, { playable: false, reason: "CONTENT_VERSION_UNSUPPORTED" })], nextCursor: null },
      done: { items: [run(3, { status: "ABANDONED", highestCompletedWave: 4 })], nextCursor: null },
    });
    render(<SavedGames api={api} onContinue={onContinue} onEnd={onEnd} onBack={() => {}} now={NOW} />);
    expect(await screen.findAllByText("Moonbeam · First contact")).toHaveLength(2);
    expect(screen.getAllByText("Today")).toHaveLength(2);
    act(() => screen.getAllByRole("button", { name: "Continue" })[0]?.click());
    expect(onContinue).toHaveBeenCalledWith("run-1");
    act(() => screen.getByRole("button", { name: "Give up…" }).click());
    expect(onEnd).toHaveBeenCalledWith("run-1");
    expect(screen.getByText("This game can't be opened right now.")).toBeTruthy();
    act(() => screen.getByRole("tab", { name: "Finished" }).click());
    expect(await screen.findByText("Gave up after wave 4")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("follows the cursor with Show more", async () => {
    const api = fakeApi({
      open: { items: [run(1)], nextCursor: "c1" },
      "open:c1": { items: [run(2, { lastPlayedAt: "2026-11-16T09:00:00Z" })], nextCursor: null },
    });
    render(<SavedGames api={api} onContinue={() => {}} onEnd={() => {}} onBack={() => {}} now={NOW} />);
    await screen.findByText("Today");
    await act(async () => screen.getByRole("button", { name: "Show more" }).click());
    expect(await screen.findByText("Yesterday")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("says Finish… once the campaign is complete", async () => {
    const api = fakeApi({ open: { items: [run(1, { mode: "CAMPAIGN", campaignCompletedAt: "2026-11-17T08:00:00Z" })], nextCursor: null } });
    render(<SavedGames api={api} onContinue={() => {}} onEnd={() => {}} onBack={() => {}} now={NOW} />);
    expect(await screen.findByRole("button", { name: "Finish…" })).toBeTruthy();
  });

  it("words progress and dates as D4 P5 says", () => {
    expect(progressLabel(run(1, { wave: 12 }))).toBe("Wave 12");
    expect(progressLabel(run(1, { stage: "ENDLESS", wave: 63 }))).toBe("Wave 63 · endless");
    expect(progressLabel(run(1, { status: "COMPLETED" }))).toBe("Completed!");
    expect(progressLabel(run(1, { status: "DEFEATED", highestCompletedWave: 16 }))).toBe("Cleared 16 waves");
    expect(playedLabel("2026-11-03T12:00:00Z", NOW())).toBe("3 Nov");
  });
});
