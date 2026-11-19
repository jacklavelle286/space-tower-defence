// @vitest-environment jsdom
// Admin → Levels (Gate M, LD3): New level from a template, Upload level file, Delete with a confirm; LD18: Make it all
// for me (the default "Start from"), with the challenge maker run in a fake worker that does the real work at once.
import { makeChallenge, parseRuleset } from "@scd/game-core";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearFlash, peekFlash } from "../flash";
import { FakeAdminApi } from "../testing/fakeApi";
import { levelFileDownload, mergedLevel, newLevel, REPO_BASE } from "./levelFile";
import type { CurveWorker } from "./curves/measure";
import type { ChallengeReply, ChallengeRequest, ChallengeWorker } from "./maker/challenges";
import { LevelListPage, slugOf } from "./LevelListPage";

/** challenges.worker.ts, run in this thread. */
function challengeWorker(): ChallengeWorker {
  const worker: ChallengeWorker = {
    onmessage: null,
    terminate: vi.fn(),
    postMessage: (r: ChallengeRequest) => {
      const made = makeChallenge(parseRuleset(r.ruleset), mergedLevel(r.level, r.base), r.plan, { seed: r.seed, levelId: r.level.levelId, ownsCampaign: r.ownsCampaign, index: r.index });
      queueMicrotask(() => worker.onmessage?.({ data: { type: "done", made } } as MessageEvent<ChallengeReply>));
    },
  };
  return worker;
}

let fake: FakeAdminApi;
beforeEach(() => {
  fake = new FakeAdminApi();
  clearFlash();
});
afterEach(cleanup);

describe("LevelListPage", () => {
  it("suggests an ID from the name", () => {
    expect(slugOf("Blob Rush!")).toBe("blob-rush");
    expect(slugOf("  ")).toBe("");
  });

  it("creates a level from a template and opens it", async () => {
    const navigate = vi.fn();
    render(<LevelListPage api={fake.api} navigate={navigate} />);
    await screen.findByText("No levels yet.");
    // With only the Moon, the planet is still shown: the level goes onto the Moon (owner 2026-11-19).
    const planet = (await screen.findByLabelText(/^Planet/u)) as HTMLSelectElement;
    expect([...planet.options].map((o) => o.textContent)).toEqual([REPO_BASE.planet.name]);
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Blob Rush" } });
    fireEvent.change(screen.getByLabelText(/Start from/), { target: { value: "zigzag" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("#levels/blob-rush"));
    expect(fake.levels.get("blob-rush")?.level.map.pads[0]?.id).toBe("blob-rush-p01");
  });

  it("a level of another planet belongs to it and starts with its default backdrop (LD10)", async () => {
    const BACK = "lib-" + "2".repeat(32);
    fake.planets.set("mars-1", { planetId: "mars-1", name: "Red Dust", status: "DRAFT", backdrop: BACK, artSet: "moon" });
    const navigate = vi.fn();
    render(<LevelListPage api={fake.api} navigate={navigate} />);
    fireEvent.change(await screen.findByLabelText(/^Planet/u), { target: { value: "mars-1" } });
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Dusty" } });
    fireEvent.change(screen.getByLabelText(/Start from/), { target: { value: "moonbeam" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("#levels/dusty"));
    expect(fake.levels.get("dusty")?.planetId).toBe("mars-1");
    expect(fake.levels.get("dusty")?.level.map.art.backdrop).toBe(BACK);
  });

  it("says when the ID is taken", async () => {
    await fake.api.createLevel(newLevel("blob-rush", "Old", "blank"));
    render(<LevelListPage api={fake.api} navigate={vi.fn()} />);
    await screen.findByRole("link", { name: "Old" });
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Blob Rush" } });
    fireEvent.change(screen.getByLabelText(/Start from/), { target: { value: "blank" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText(/already exists/)).toBeTruthy();
  });

  it("makes a whole level with one button: map, then its challenges with their own waves (no campaign on luna-1)", { timeout: 60_000 }, async () => {
    const navigate = vi.fn();
    render(<LevelListPage api={fake.api} navigate={navigate} maker={{ firstSeed: 4, workers: { challenge: challengeWorker } }} />);
    await screen.findByText("No levels yet.");
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Fire Pit" } });
    expect((screen.getByLabelText(/The 50 campaign waves/u) as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByLabelText(/Tune the waves/u));
    fireEvent.change(screen.getByLabelText("Challenges"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Make the level" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("#levels/fire-pit"), { timeout: 30_000 });
    const level = fake.levels.get("fire-pit")?.level;
    expect(level?.waves ?? []).toEqual([]);
    expect(level?.map.pads.length).toBeGreaterThanOrEqual(13);
    const sets = Object.entries(level?.waveSets ?? {});
    expect(sets).toHaveLength(1);
    expect(sets[0]?.[0]).toMatch(/^fire-pit-/u);
    expect(sets[0]?.[1].waves.every((w) => typeof w === "string" && Object.hasOwn(level?.challengeWaves ?? {}, w))).toBe(true);
    expect(peekFlash()).toMatch(/^Map 4: .* Challenges: .+\.$/u);
  });

  it("makes a level that carries the campaign when asked", { timeout: 60_000 }, async () => {
    const navigate = vi.fn();
    render(<LevelListPage api={fake.api} navigate={navigate} maker={{ firstSeed: 9, workers: { challenge: challengeWorker } }} />);
    await screen.findByText("No levels yet.");
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Lava Run" } });
    fireEvent.click(screen.getByLabelText(/The 50 campaign waves/u));
    fireEvent.click(screen.getByLabelText(/Tune the waves/u));
    fireEvent.change(screen.getByLabelText("Challenges"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Make the level" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("#levels/lava-run"), { timeout: 30_000 });
    const level = fake.levels.get("lava-run")?.level;
    expect(level?.waves).toHaveLength(50);
    expect(Object.keys(level?.waveSets ?? {})).toEqual(["campaign"]);
    expect(level?.waveSets["campaign"]?.mapId).toBe("lava-run");
  });

  it("Stop while tuning makes no level", async () => {
    const hold = (): CurveWorker => ({ onmessage: null, terminate: vi.fn(), postMessage: () => undefined });
    render(<LevelListPage api={fake.api} navigate={vi.fn()} maker={{ firstSeed: 4, workers: { curve: hold, challenge: challengeWorker } }} />);
    await screen.findByText("No levels yet.");
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Halted" } });
    fireEvent.click(screen.getByRole("button", { name: "Make the level" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    expect(await screen.findByText("Stopped: no level was made.")).toBeTruthy();
    expect(fake.levels.has("halted")).toBe(false);
  });

  it("uploads a level file, and refuses one that is not", async () => {
    const navigate = vi.fn();
    render(<LevelListPage api={fake.api} navigate={navigate} />);
    const input = await screen.findByLabelText(/Upload level file/);
    const good = levelFileDownload(newLevel("kept", "Kept", "u-bends"));
    fireEvent.change(input, { target: { files: [new File([good.text], good.name, { type: "application/json" })] } });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("#levels/kept"));
    fireEvent.change(input, { target: { files: [new File(["{}"], "x.json")] } });
    expect(await screen.findByText(/That file cannot be used: This is not a level file/)).toBeTruthy();
  });

  it("deletes a level after the confirm", async () => {
    await fake.api.createLevel(newLevel("gone", "Gone", "blank"));
    render(<LevelListPage api={fake.api} navigate={vi.fn()} />);
    await screen.findByRole("link", { name: "Gone" });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete level gone?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete level" }));
    await screen.findByText("No levels yet.");
    expect(fake.levels.has("gone")).toBe(false);
  });
});
