// @vitest-environment jsdom
// P13 Settings (Phase 55, D4 P13, F §12.5): a reset is confirmed by typing the word shown, sends confirm = type, needs a
// connection and (for the partial resets) an empty queue; the whole-profile reset warns about unsent progress.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Settings } from "./Settings";

afterEach(cleanup);

function setUp(pending = 0, testerCode?: string) {
  const postReset = vi.fn(async (body: { type: string }) => ({ kind: "ok" as const, status: 200, body: { type: body.type, completedAt: "x" } }));
  const onReset = vi.fn();
  const queue = { getSnapshot: () => ({ pending }), subscribe: () => () => {} } as never;
  render(<Settings api={{ postReset } as never} queue={queue} onBack={() => {}} onReset={onReset} {...(testerCode !== undefined ? { testerCode } : {})} />);
  return { postReset, onReset };
}

describe("Settings resets (Phase 55)", () => {
  it("the confirm button works only after typing the word, then sends confirm = type", async () => {
    const { postReset, onReset } = setUp();
    act(() => screen.getByRole("button", { name: "Clear planets and badges" }).click());
    expect(screen.getByText("This clears your best waves and badges.")).toBeTruthy();
    expect(screen.getByText("Your saved games stay, and you can earn badges again.")).toBeTruthy();
    const confirm = screen.getAllByRole("button", { name: "Clear planets and badges" }).at(-1)!;
    expect(confirm).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "badge" } });
    expect(confirm).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Badges" } });
    await act(async () => confirm.click());
    expect(postReset).toHaveBeenCalledWith({ type: "CAMPAIGN_PROGRESS", confirm: "CAMPAIGN_PROGRESS" });
    expect(onReset).toHaveBeenCalledWith("CAMPAIGN_PROGRESS");
    expect(screen.getByRole("status").textContent).toBe("Done.");
  });

  it("shows the tester code the level designer adds to its testers (Gate M, LD7)", () => {
    setUp(0, "a6c2b2b4-7051-70ef-b1e8-739ac38dd0cb");
    expect(screen.getByRole("heading", { name: "Testing new levels" })).toBeTruthy();
    expect(screen.getByText("a6c2b2b4-7051-70ef-b1e8-739ac38dd0cb")).toBeTruthy();
  });

  it("a partial reset waits until everything is saved; the whole profile warns and may go ahead", () => {
    setUp(2);
    act(() => screen.getByRole("button", { name: "Clear learning stars" }).click());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "stars" } });
    expect(screen.getByText("Wait until everything is saved to the cloud.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Clear learning stars" }).at(-1)).toHaveProperty("disabled", true);
    act(() => screen.getByRole("button", { name: "Keep everything" }).click());
    act(() => screen.getByRole("button", { name: "Start my profile again" }).click());
    expect(screen.getByText("Some progress on this laptop hasn't saved yet and will be lost.")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "delete" } });
    expect(screen.getAllByRole("button", { name: "Start my profile again" }).at(-1)).toHaveProperty("disabled", false);
  });
});
