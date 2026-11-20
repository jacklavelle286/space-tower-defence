// @vitest-environment jsdom
// Admin → Levels (Gate M, LD3): New level from a template, Upload level file, Delete with a confirm; LD18: Make it all
// for me (the default "Start from"), with the challenge maker run in a fake worker that does the real work at once.
import { makeChallenge, parseRuleset } from "@scd/game-core";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearFlash, peekFlash } from "../flash";
import { FakeAdminApi } from "../testing/fakeApi";
import { levelFileDownload, mergedLevel, newLevel } from "./levelFile";
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

describe("LevelListPage (Maps, LD22)", () => {
  it("suggests a map ID from the name: a letter first", () => {
    expect(slugOf("Blob Rush!")).toBe("blob-rush");
    expect(slugOf("3 Moons")).toBe("moons");
    expect(slugOf("  ")).toBe("");
  });

  it("makes a map from a template: its own planet, with the Moon's 50 waves, then opens it", async () => {
    const navigate = vi.fn();
    render(<LevelListPage api={fake.api} navigate={navigate} />);
    await screen.findByText("No maps of your own yet.");
    expect(screen.queryByLabelText(/^Planet/u)).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Blob Rush" } });
    fireEvent.change(screen.getByLabelText(/Start from/), { target: { value: "zigzag" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("#levels/blob-rush"));
    const stored = fake.levels.get("blob-rush");
    expect(stored?.planetId).toBe("blob-rush");
    expect(stored?.level.map.pads[0]?.id).toBe("blob-rush-p01");
    expect(stored?.level.waves).toHaveLength(50);
    expect(fake.planets.get("blob-rush")).toMatchObject({ name: "Blob Rush", status: "DRAFT" });
  });

  it("lists maps with where they are for children, and makes an older Moon level its own map", async () => {
    fake.planets.set("ice-world", { planetId: "ice-world", name: "Ice World", status: "RELEASED", artSet: "moon" });
    await fake.api.createLevel(newLevel("ice-world", "Ice World", "moonbeam-campaign"), "ice-world");
    await fake.api.createLevel(newLevel("lava", "Lava", "moonbeam-campaign"));
    const lava = fake.levels.get("lava");
    if (lava !== undefined) lava.versions = [{ campaignVersion: "luna-1-a1", draftRevision: 0, sourceVersion: "luna-1-c2", publishedAt: "2026-11-19T02:13:19Z", by: "op" }];
    const navigate = vi.fn();
    render(<LevelListPage api={fake.api} navigate={navigate} />);
    const maps = await screen.findByRole("region", { name: "Maps" });
    const iceRow = (await within(maps).findByRole("link", { name: "Ice World" })).closest("tr") as HTMLElement;
    await within(iceRow).findByText("On Home");
    const moon = screen.getByRole("region", { name: "Older levels on the Moon" });
    const lavaRow = within(moon).getByRole("link", { name: "Lava" }).closest("tr") as HTMLElement;
    expect(within(lavaRow).getByText("Published on the Moon")).toBeTruthy();

    // Published on the Moon: it stays, and a copy becomes the map.
    fireEvent.click(within(lavaRow).getByRole("button", { name: "Make it its own map…" }));
    const dialog = screen.getByRole("dialog", { name: "Make Lava its own map?" });
    expect(within(dialog).getByText(/so it stays there/u)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Make it its own map" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("#levels/lava-2"));
    expect(fake.levels.get("lava")?.planetId).toBe("luna-1");
    expect(fake.levels.get("lava-2")?.planetId).toBe("lava-2");
    expect(fake.levels.get("lava-2")?.level.waves).toHaveLength(50);
    expect(peekFlash()).toMatch(/^Lava was copied into a map of its own, lava-2\./u);
  });

  it("says when the ID is taken, by a map or by the planet underneath one", async () => {
    await fake.api.createLevel(newLevel("blob-rush", "Old", "blank"));
    fake.planets.set("fire-pit", { planetId: "fire-pit", name: "Fire Pit", status: "RELEASED", artSet: "moon" });
    render(<LevelListPage api={fake.api} navigate={vi.fn()} />);
    await screen.findByRole("link", { name: "Old" });
    fireEvent.change(screen.getByLabelText(/Start from/), { target: { value: "blank" } });
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Blob Rush" } });
    expect(screen.getByText(/That ID is taken/u)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Create" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Fire Pit" } });
    await waitFor(() => expect(screen.getByText(/That ID is taken/u)).toBeTruthy());
  });

  it("makes a whole map with one button: map, its 50 waves and its challenges", { timeout: 60_000 }, async () => {
    const navigate = vi.fn();
    render(<LevelListPage api={fake.api} navigate={navigate} maker={{ firstSeed: 4, workers: { challenge: challengeWorker } }} />);
    await screen.findByText("No maps of your own yet.");
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Fire Pit" } });
    expect(screen.queryByLabelText(/The 50 campaign waves/u)).toBeNull();
    fireEvent.click(screen.getByLabelText(/Tune the waves/u));
    fireEvent.change(screen.getByLabelText("Challenges"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Make the map" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("#levels/fire-pit"), { timeout: 30_000 });
    const stored = fake.levels.get("fire-pit");
    expect(stored?.planetId).toBe("fire-pit");
    expect(stored?.level.waves).toHaveLength(50);
    expect(stored?.level.waveSets["campaign"]?.mapId).toBe("fire-pit");
    expect(Object.keys(stored?.level.waveSets ?? {}).filter((k) => k !== "campaign")).toHaveLength(1);
    expect(peekFlash()).toMatch(/^Map 4: .* Challenges: .+\.$/u);
  });

  it("Stop while tuning makes no map", async () => {
    const hold = (): CurveWorker => ({ onmessage: null, terminate: vi.fn(), postMessage: () => undefined });
    render(<LevelListPage api={fake.api} navigate={vi.fn()} maker={{ firstSeed: 4, workers: { curve: hold, challenge: challengeWorker } }} />);
    await screen.findByText("No maps of your own yet.");
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Halted" } });
    fireEvent.click(screen.getByRole("button", { name: "Make the map" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    expect(await screen.findByText("Stopped: no map was made.")).toBeTruthy();
    expect(fake.levels.has("halted")).toBe(false);
    expect(fake.planets.has("halted")).toBe(false);
  });

  it("uploads a level file as a map, and refuses one that is not", async () => {
    const navigate = vi.fn();
    render(<LevelListPage api={fake.api} navigate={navigate} />);
    const input = await screen.findByLabelText(/Upload level file/);
    const good = levelFileDownload(newLevel("kept", "Kept", "u-bends"));
    fireEvent.change(input, { target: { files: [new File([good.text], good.name, { type: "application/json" })] } });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("#levels/kept"));
    expect(fake.levels.get("kept")?.planetId).toBe("kept");
    fireEvent.change(input, { target: { files: [new File(["{}"], "x.json")] } });
    expect(await screen.findByText(/That file cannot be used: This is not a level file/)).toBeTruthy();
  });

  it("deletes a draft after the confirm", async () => {
    await fake.api.createLevel(newLevel("gone", "Gone", "blank"));
    render(<LevelListPage api={fake.api} navigate={vi.fn()} />);
    await screen.findByRole("link", { name: "Gone" });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete gone?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(fake.levels.has("gone")).toBe(false));
  });
});
