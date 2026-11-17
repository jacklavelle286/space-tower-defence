// @vitest-environment jsdom
// The Waves and Wave sets tabs (Gate M, LD4): a challenge built and saved, its problems shown on its card; keyframes
// filled in, a wave varied and kept, and undo across tabs.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeAdminApi } from "../testing/fakeApi";
import { LevelEditor } from "./LevelEditor";
import { newLevel } from "./levelFile";

let fake: FakeAdminApi;
beforeEach(() => {
  fake = new FakeAdminApi();
  window.sessionStorage.clear();
});
afterEach(cleanup);

async function open(templateId: string, levelId = "zig") {
  await fake.api.createLevel(newLevel(levelId, "Zig", templateId));
  render(<LevelEditor api={fake.api} levelId={levelId} />);
  await screen.findByRole("application");
}

describe("Wave sets tab", () => {
  it("adds a challenge, shows its problems on its card, and saves it", async () => {
    await open("zigzag");
    fireEvent.click(screen.getByRole("tab", { name: "Wave sets" }));
    fireEvent.change(screen.getByLabelText("New challenge name"), { target: { value: "Blob Rush" } });
    fireEvent.click(screen.getByRole("button", { name: "Add challenge" }));
    const card = screen.getByRole("group", { name: /Challenge Blob Rush/ });
    // Down to one wave: the challenge-length rule lands on this card.
    fireEvent.click(within(card).getByRole("button", { name: "Remove 2" }));
    expect(within(card).getByText(/A challenge has 2 to 8 waves/)).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: "Add wave" }));
    expect(within(card).queryByText(/A challenge has 2 to 8 waves/)).toBeNull();
    // A preset Nova on the first open pad.
    fireEvent.change(within(card).getByLabelText("Preset pad"), { target: { value: "zig-p01" } });
    fireEvent.click(within(card).getByRole("button", { name: "Add preset" }));
    expect(within(card).getByText(/Pad 1: Nova level 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(fake.levels.get("zig")?.draftRevision).toBe(1));
    const set = fake.levels.get("zig")?.level.waveSets["zig-blob-rush"];
    expect(set?.waves).toEqual([1, 1]);
    expect(set?.presetPlacements).toEqual([{ padId: "zig-p01", classId: "nova", level: 1, targeting: "FRONT" }]);
  });
});

describe("Waves tab", () => {
  it("adds a challenge wave a challenge can play", async () => {
    await open("zigzag");
    fireEvent.click(screen.getByRole("tab", { name: "Waves" }));
    expect(screen.getByText(/does not own the campaign/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("New challenge wave name"), { target: { value: "burst" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    const row = screen.getByRole("group", { name: "zig-burst" });
    fireEvent.change(within(row).getByLabelText("zig-burst, group 1, count"), { target: { value: "20" } });
    expect(within(row).getByText(/20 aliens/)).toBeTruthy();
  });

  it("fills in between keyframes, varies a wave and keeps it, and undo puts it back", async () => {
    await open("moonbeam-campaign", "moon2");
    fireEvent.click(screen.getByRole("tab", { name: "Waves" }));
    const wave = (n: number) => screen.getByRole("group", { name: new RegExp(`^Wave ${n}( \\(boss\\))?$`) });
    const before = () => fake.levels.get("moon2")?.level.waves?.[2];
    fireEvent.click(within(wave(1)).getByLabelText("Keyframe"));
    fireEvent.click(within(wave(5)).getByLabelText("Keyframe"));
    fireEvent.click(screen.getByRole("button", { name: "Fill in between keyframes" }));
    // Wave 3 now lies between waves 1 (6 blobs) and 5: its first group is no longer the authored mites.
    expect(within(wave(3)).getByLabelText<HTMLSelectElement>("Wave 3, group 1, alien").value).toBe("blob");
    fireEvent.click(within(wave(7)).getByRole("button", { name: "Vary" }));
    const preview = screen.getByRole("group", { name: /Wave 7, varied \(seed 7001\)/ });
    fireEvent.click(within(preview).getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("group", { name: /Wave 7, varied/ })).toBeNull();
    // Undo twice: the Vary, then the fill-in.
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(within(wave(3)).getByLabelText<HTMLSelectElement>("Wave 3, group 1, alien").value).toBe("mite");
    expect(before()?.groups[0]?.type).toBe("mite"); // nothing saved yet
  });
});
