// @vitest-environment jsdom
// Delete speech (owner ask 2026-11-16, "I can't delete sounds"): one button below the speech editor, one confirm dialog
// with Cancel focused, R32 on confirm, then the speech list with nothing chosen and a status message. A definition an
// activity uses is refused, and the refusal lists those activities as links to their pages.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError, type AdminApi } from "../api";
import { SpeechPage } from "../pages/SpeechPage";
import { FakeAdminApi } from "../testing/fakeApi";

const ID = "phoneme-sh";

let fake: FakeAdminApi;

beforeEach(() => {
  fake = new FakeAdminApi();
  window.history.replaceState(null, "", `#speech/${ID}`);
});
afterEach(cleanup);

async function openPage(api: AdminApi = fake.api) {
  render(<SpeechPage api={api} initial={ID} />);
  await screen.findByText(/draft revision/);
}

const deleteButton = () => within(screen.getByRole("region", { name: "Delete speech" })).getByRole("button", { name: "Delete speech" });
const confirmDialog = () => screen.queryByRole("dialog", { name: `Delete speech ${ID}?` });

function openDialog(): HTMLElement {
  fireEvent.click(deleteButton());
  return screen.getByRole("dialog", { name: `Delete speech ${ID}?` });
}

describe("Delete speech", () => {
  it("asks first, says what goes, with Cancel focused", async () => {
    await openPage();
    expect(confirmDialog()).toBeNull();
    const dialog = openDialog();
    expect(dialog.textContent).toContain("its draft and every approved version");
    expect(dialog.textContent).toContain("The clips stay.");
    expect(dialog.textContent).toContain("This cannot be undone.");
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(fake.callsNamed("deleteSpeech")).toEqual([]);
  });

  it("Cancel and Escape close the dialog and delete nothing", async () => {
    await openPage();
    fireEvent.click(within(openDialog()).getByRole("button", { name: "Cancel" }));
    expect(confirmDialog()).toBeNull();
    expect(document.activeElement).toBe(deleteButton());
    fireEvent(openDialog(), new Event("cancel", { cancelable: true }));
    expect(confirmDialog()).toBeNull();
    expect(document.activeElement).toBe(deleteButton());
    expect(fake.callsNamed("deleteSpeech")).toEqual([]);
  });

  it("confirm deletes and goes back to the list, which says so and no longer shows it", async () => {
    await openPage();
    fireEvent.click(within(openDialog()).getByRole("button", { name: "Delete speech" }));
    expect(await screen.findByText(`Speech ${ID} deleted, with 1 approved version.`)).toBeTruthy();
    expect(fake.callsNamed("deleteSpeech")).toEqual([{ name: "deleteSpeech", args: [ID] }]);
    expect(screen.getByText("Choose a speech definition, or make a new one.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Delete speech" })).toBeNull();
    expect(window.location.hash).toBe("#speech");
    await waitFor(() => expect(screen.queryByRole("button", { name: new RegExp(`^${ID}`) })).toBeNull());
  });

  it("a definition already gone counts as deleted", async () => {
    await openPage();
    fake.deletedSpeech.add(ID); // another tab deleted it after this page loaded
    fireEvent.click(within(openDialog()).getByRole("button", { name: "Delete speech" }));
    expect(await screen.findByText(`Speech ${ID} was already deleted.`)).toBeTruthy();
  });

  it("a definition activities use is refused, and the activities are listed as links", async () => {
    fake.speechUsers[ID] = ["ph-0102", "ph-0199"];
    await openPage();
    fireEvent.click(within(openDialog()).getByRole("button", { name: "Delete speech" }));
    const region = screen.getByRole("region", { name: "Delete speech" });
    await within(region).findByText(/these 2 activities use it/);
    expect(confirmDialog()).toBeNull();
    const links = within(region).getAllByRole("link");
    expect(links.map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["ph-0102", "#activities/ph-0102"],
      ["ph-0199", "#activities/ph-0199"],
    ]);
    expect(screen.getByText(/draft revision/)).toBeTruthy(); // still on the definition
    // The refusal text is committed before React flushes the effect that returns focus, so wait for it.
    await waitFor(() => expect(document.activeElement).toBe(deleteButton()));
  });

  it("any other error is shown and the definition stays open", async () => {
    await openPage({ ...fake.api, deleteSpeech: () => Promise.reject(new ApiError(503, "THROTTLED")) });
    fireEvent.click(within(openDialog()).getByRole("button", { name: "Delete speech" }));
    expect(await screen.findByText("Busy. Wait a moment and try again.")).toBeTruthy();
    expect(screen.getByText(/draft revision/)).toBeTruthy();
  });
});
