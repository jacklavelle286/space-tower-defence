// @vitest-environment jsdom
// The map editor in the DOM (Gate M, LD3): a whole map drawn with the keyboard only (exit criterion "every editor
// action works by keyboard"), saved with Ctrl+S; problems that jump to their cell; unsaved edits kept in the tab; a save
// someone else beat shows the conflict screen.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeAdminApi } from "../testing/fakeApi";
import { LevelEditor } from "./LevelEditor";
import { newLevel } from "./levelFile";

let fake: FakeAdminApi;

beforeEach(async () => {
  fake = new FakeAdminApi();
  window.sessionStorage.clear();
  await fake.api.createLevel(newLevel("lvl", "My level", "blank"));
});
afterEach(cleanup);

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

describe("LevelEditor", () => {
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
    press(canvas, "Enter");
    expect(await screen.findByText("Start the route on the left edge.")).toBeTruthy();
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
});
