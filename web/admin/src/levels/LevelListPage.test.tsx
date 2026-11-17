// @vitest-environment jsdom
// Admin → Levels (Gate M, LD3): New level from a template, Upload level file, Delete with a confirm.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearFlash } from "../flash";
import { FakeAdminApi } from "../testing/fakeApi";
import { levelFileDownload, newLevel } from "./levelFile";
import { LevelListPage, slugOf } from "./LevelListPage";

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
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Blob Rush" } });
    fireEvent.change(screen.getByLabelText(/Start from/), { target: { value: "zigzag" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("#levels/blob-rush"));
    expect(fake.levels.get("blob-rush")?.level.map.pads[0]?.id).toBe("blob-rush-p01");
  });

  it("says when the ID is taken", async () => {
    await fake.api.createLevel(newLevel("blob-rush", "Old", "blank"));
    render(<LevelListPage api={fake.api} navigate={vi.fn()} />);
    await screen.findByRole("link", { name: "Old" });
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Blob Rush" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText(/already exists/)).toBeTruthy();
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
