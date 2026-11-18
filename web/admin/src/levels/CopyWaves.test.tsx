// @vitest-environment jsdom
// Waves tab → Copy from another level (Gate M, LD17): lists the other levels, says what the chosen one has, and copies
// it in one edit; the live campaign's waves too.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LevelFile } from "../api";
import { FakeAdminApi } from "../testing/fakeApi";
import { CopyWaves } from "./CopyWaves";
import { liveBase, newLevel } from "./levelFile";

let fake: FakeAdminApi;
beforeEach(async () => {
  fake = new FakeAdminApi();
  await fake.api.createLevel(newLevel("moon2", "Moon two", "moonbeam-campaign"));
  await fake.api.createLevel(newLevel("zig", "Zig", "zigzag"));
});
afterEach(cleanup);

async function open() {
  const onEdit = vi.fn<(level: LevelFile) => void>();
  render(<CopyWaves api={fake.api} level={newLevel("zig", "Zig", "zigzag")} onEdit={onEdit} />);
  const details = screen.getByText("Copy from another level").closest("details") as HTMLDetailsElement;
  details.open = true;
  fireEvent(details, new Event("toggle"));
  await screen.findByRole("option", { name: /Moon two/u });
  return onEdit;
}

describe("CopyWaves", () => {
  it("lists the other levels, not this one, and copies the chosen one's campaign", async () => {
    const onEdit = await open();
    expect(screen.queryByRole("option", { name: /^Zig/u })).toBeNull();
    fireEvent.change(screen.getByLabelText("Copy from"), { target: { value: "moon2" } });
    expect(await screen.findByText(/It has the 50 campaign waves, 0 challenges and 0 challenge waves\./u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    const copied = onEdit.mock.calls[0]?.[0] as LevelFile;
    expect(copied.waves).toHaveLength(50);
    expect(copied.waveSets["campaign"]?.mapId).toBe("zig");
    expect(screen.getByRole("status").textContent).toBe("Copied the 50 campaign waves and the campaign card. Ctrl+Z puts back what you had.");
  });

  it("copies the live campaign's waves", async () => {
    const onEdit = await open();
    fireEvent.change(screen.getByLabelText("Copy from"), { target: { value: "live campaign" } });
    fireEvent.click(await screen.findByRole("button", { name: "Copy" }));
    await waitFor(() => expect(onEdit).toHaveBeenCalledTimes(1));
    expect((onEdit.mock.calls[0]?.[0] as LevelFile | undefined)?.waves).toEqual(liveBase().planet.waves);
  });
});
