// @vitest-environment jsdom
// The map editor in the DOM (Gate M, LD3): a whole map drawn with the keyboard only (exit criterion "every editor
// action works by keyboard"), saved with Ctrl+S; problems that jump to their cell; unsaved edits kept in the tab; a save
// someone else beat shows the conflict screen.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { makeChallenge, parseRuleset } from "@scd/game-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type LevelFile } from "../api";
import { FakeAdminApi } from "../testing/fakeApi";
import { LevelEditor } from "./LevelEditor";
import { mergedLevel, newLevel, REPO_BASE, resetLiveBase } from "./levelFile";
import type { ChallengeReply, ChallengeRequest, ChallengeWorker } from "./maker/challenges";

let fake: FakeAdminApi;

beforeEach(async () => {
  fake = new FakeAdminApi();
  window.sessionStorage.clear();
  await fake.api.createLevel(newLevel("lvl", "My level", "blank"));
});
afterEach(() => {
  cleanup();
  resetLiveBase();
});

async function open() {
  render(<LevelEditor api={fake.api} levelId="lvl" />);
  const canvas = await screen.findByRole("application");
  canvas.focus();
  return canvas;
}

const press = (el: Element, key: string, extra: Partial<KeyboardEventInit> = {}) => fireEvent.keyDown(el, { key, ...extra });
const times = (el: Element, key: string, n: number) => {
  for (let i = 0; i < n; i += 1) press(el, key);
};

/** The challenge worker on the main thread. */
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

describe("LevelEditor", () => {
  it("checks against the live version from admin-api, and a failed load turns publishing off (LD7)", async () => {
    await open();
    await screen.findByText(new RegExp(`checked against ${REPO_BASE.version}$`, "u"));
    expect(fake.callsNamed("getGameData")).toHaveLength(1);
    cleanup();
    resetLiveBase();
    fake.gameDataError = new ApiError(503, "THROTTLED");
    await open();
    expect((await screen.findByRole("alert")).textContent).toMatch(/could not be loaded/u);
    act(() => screen.getByRole("tab", { name: "Publish" }).click());
    expect(screen.getByText(/The live game data could not be loaded, so publishing is off/u)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("draws a route and places pads with the keyboard only, then saves with Ctrl+S", async () => {
    const canvas = await open();
    // The cursor starts at (0, 5). Route: start, then right to the edge.
    press(canvas, "Enter");
    times(canvas, "ArrowRight", 19);
    press(canvas, "Enter");
    expect(screen.getByText(/Route 19 tiles/)).toBeTruthy();
    // Pads tool, up two rows, place one.
    press(canvas, "2");
    times(canvas, "ArrowUp", 2);
    press(canvas, "Enter");
    expect(screen.getByText(/Cell 19,3, pad 1/)).toBeTruthy();
    press(window.document.body, "s", { ctrlKey: true });
    await waitFor(() => expect(fake.levels.get("lvl")?.draftRevision).toBe(1));
    const saved = fake.levels.get("lvl")?.level;
    expect(saved?.map.route).toEqual([
      [0, 5],
      [19, 5],
    ]);
    expect(saved?.map.pads).toEqual([{ id: "lvl-p01", x: 19, y: 3, opensAfterWave: 0 }]);
    await screen.findByText("Saved.");
    // The server gives the level back with its keys in another order (DynamoDB): still saved, nothing to save again.
    expect(Object.keys(saved ?? {})).toEqual([...Object.keys(saved ?? {})].sort());
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("undo and redo from the keyboard", async () => {
    const canvas = await open();
    press(canvas, "Enter");
    times(canvas, "ArrowRight", 4);
    press(canvas, "Enter");
    expect(screen.getByText(/Route 4 tiles/)).toBeTruthy();
    press(canvas, "z", { ctrlKey: true });
    expect(screen.getByText(/Route 0 tiles/)).toBeTruthy();
    press(canvas, "z", { ctrlKey: true, shiftKey: true });
    expect(screen.getByText(/Route 4 tiles/)).toBeTruthy();
  });

  it("says why an edit was refused", async () => {
    const canvas = await open();
    press(canvas, "ArrowRight");
    press(canvas, "ArrowDown");
    press(canvas, "Enter");
    expect(await screen.findByText("Start the route on an edge of the map.")).toBeTruthy();
  });

  it("lists problems, and a problem with a cell moves the cursor there", async () => {
    const canvas = await open();
    press(canvas, "Enter");
    times(canvas, "ArrowRight", 19);
    press(canvas, "Enter");
    press(canvas, "2");
    times(canvas, "ArrowLeft", 19);
    press(canvas, "ArrowUp"); // (0, 4): beside the portal, inside its picture
    press(canvas, "Enter");
    const go = screen.getAllByRole("button", { name: /Go to cell 0,4/ })[0];
    if (go === undefined) throw new Error("no problem with a cell");
    times(canvas, "ArrowRight", 5);
    fireEvent.click(go);
    expect(screen.getByText(/Cell 0,4/)).toBeTruthy();
    expect(screen.getByText(/A map has 12 to 16 pads/)).toBeTruthy();
  });

  it("keeps unsaved edits in the tab across a reload", async () => {
    const canvas = await open();
    press(canvas, "Enter");
    cleanup();
    await open();
    expect(await screen.findByText("Your unsaved changes were kept.")).toBeTruthy();
    expect(screen.getByText(/1 of 16 waypoints/)).toBeTruthy();
  });

  it("a save someone else beat shows the conflict screen; Keep mine saves over it", async () => {
    const canvas = await open();
    // Another tab saves first.
    const stored = fake.levels.get("lvl");
    if (stored === undefined) throw new Error("no level");
    await act(() => fake.api.saveLevel("lvl", { draftRevision: 0, level: { ...stored.level, name: "Theirs" } }));
    press(canvas, "Enter");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alertdialog", { name: /Someone saved this level/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep mine and save" }));
    await waitFor(() => expect(fake.levels.get("lvl")?.draftRevision).toBe(2));
    expect(fake.levels.get("lvl")?.level.map.route).toEqual([[0, 5]]);
  });

  it("a challenge astronaut on a pad that is not open yet is taken off; Make it all again remakes map, waves and challenges", async () => {
    const start = newLevel("old", "Lava Meltdown", "blank");
    const level: LevelFile = {
      ...start,
      levelId: "lvl",
      map: {
        ...start.map,
        route: [
          [0, 5],
          [19, 5],
        ],
        pads: [
          { id: "lvl-p01", x: 3, y: 4, opensAfterWave: 0 },
          { id: "lvl-p02", x: 9, y: 4, opensAfterWave: 20 },
        ],
      },
      waveSets: {
        "lvl-meteor-mite-surprise": {
          mode: "CHALLENGE",
          name: "Meteor Mite Surprise",
          mapId: "lvl",
          waves: [14, 15],
          meteorAfter: [],
          startCredits: 200,
          colonyHealth: 20,
          classes: ["nova"],
          padsOpenAsForWave: 14,
          presetPlacements: [
            { padId: "lvl-p01", classId: "nova", level: 1, targeting: "FRONT" },
            { padId: "lvl-p02", classId: "nova", level: 1, targeting: "FRONT" },
          ],
        },
      },
    };
    fake = new FakeAdminApi();
    await fake.api.createLevel(level);
    render(<LevelEditor api={fake.api} levelId="lvl" maker={{ firstSeed: 4, workers: { challenge: challengeWorker } }} />);
    await screen.findByRole("application");
    // Saved before the fix: fitted when it opens, said, and unsaved until saved.
    expect((await screen.findByText(/1 astronaut was taken off challenge pads/u)).textContent).toMatch(/Meteor Mite Surprise \(1\)/u);
    expect(screen.queryByText(/is not open when preparing wave/u)).toBeNull();
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false);

    const maker = screen.getByRole("group", { name: "Make it all again" });
    const inMaker = within(maker);
    expect((inMaker.getByLabelText("Challenges") as HTMLSelectElement).value).toBe("1");
    fireEvent.click(inMaker.getByLabelText(/Tune the waves/u));
    fireEvent.click(inMaker.getByRole("button", { name: "Make it all again" }));
    await screen.findByText(/^Made it all again \(not saved yet/u, {}, { timeout: 30_000 });
    expect(screen.queryByText(/is not open when preparing wave/u)).toBeNull();
    press(window.document.body, "s", { ctrlKey: true });
    await waitFor(() => expect(fake.levels.get("lvl")?.draftRevision).toBe(1));
    const saved = fake.levels.get("lvl")?.level;
    expect(saved?.name).toBe("Lava Meltdown");
    expect(saved?.map.pads.length).toBeGreaterThanOrEqual(13);
    const sets = Object.values(saved?.waveSets ?? {});
    expect(sets).toHaveLength(1);
    const pads = new Map((saved?.map.pads ?? []).map((p) => [p.id, p]));
    for (const set of sets) for (const p of set.presetPlacements) expect(pads.get(p.padId)?.opensAfterWave ?? 99).toBeLessThan(set.padsOpenAsForWave);
  }, 60_000);
});
