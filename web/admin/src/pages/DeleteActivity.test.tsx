// @vitest-environment jsdom
// Delete activity (owner decision 2026-11-16): one button on the activity page, one confirm dialog with Cancel focused,
// R31 on confirm, then the activity list with a status message. Errors read through describeError.
import { PANEL_COPY } from "@scd/shared/learning";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type AdminApi } from "../api";
import { keepUnsaved, unsavedFor } from "../editor/unsaved";
import { clearFlash, peekFlash } from "../flash";
import { draftOf } from "../testing/drafts";
import { FakeAdminApi } from "../testing/fakeApi";
import { ActivityListPage } from "./ActivityListPage";
import { ActivityPage } from "./ActivityPage";

const DRAFT = draftOf("MULTIPLE_CHOICE").definition;
const ID = DRAFT.activityId;

let fake: FakeAdminApi;

beforeEach(() => {
  fake = new FakeAdminApi();
  fake.seed(DRAFT, 2, "20261115T120000Z");
  window.sessionStorage.clear();
  clearFlash();
});
afterEach(cleanup);

async function openPage(api: AdminApi = fake.api) {
  const navigate = vi.fn();
  render(<ActivityPage api={api} activityId={ID} navigate={navigate} />);
  await screen.findByDisplayValue(DRAFT.title);
  return navigate;
}

const deleteButton = () => within(screen.getByRole("region", { name: "Delete activity" })).getByRole("button", { name: "Delete activity" });

/** The confirm dialog, or null (the editor's preview panel is a dialog too, so this one is found by its name). */
const confirmDialog = () => screen.queryByRole("dialog", { name: `Delete activity ${ID}?` });

function openDialog(): HTMLElement {
  fireEvent.click(deleteButton());
  return screen.getByRole("dialog", { name: `Delete activity ${ID}?` });
}

describe("Delete activity", () => {
  it("asks first, says what goes and what happens to games in progress, with Cancel focused", async () => {
    await openPage();
    expect(confirmDialog()).toBeNull();
    const dialog = openDialog();
    expect(dialog.textContent).toContain("its draft and every published version");
    expect(dialog.textContent).toContain("This cannot be undone.");
    expect(dialog.textContent).toContain("Games already in progress keep going and lose nothing");
    expect(dialog.textContent).toContain(PANEL_COPY.voided);
    expect(dialog.textContent).toContain("already has it loaded may still play it once");
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(fake.callsNamed("deleteActivity")).toEqual([]);
  });

  it("Cancel closes the dialog and deletes nothing", async () => {
    const navigate = await openPage();
    const dialog = openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(confirmDialog()).toBeNull();
    expect(fake.callsNamed("deleteActivity")).toEqual([]);
    expect(navigate).not.toHaveBeenCalled();
    expect(fake.activities.has(ID)).toBe(true);
    expect(document.activeElement).toBe(deleteButton()); // focus goes back to the button that opened it
  });

  it("Escape (the dialog's cancel event) closes it too", async () => {
    await openPage();
    fireEvent(openDialog(), new Event("cancel", { cancelable: true }));
    expect(confirmDialog()).toBeNull();
    expect(fake.callsNamed("deleteActivity")).toEqual([]);
    expect(document.activeElement).toBe(deleteButton());
  });

  it("confirm deletes, forgets kept edits and goes to the list, which says so", async () => {
    keepUnsaved(ID, 1, { kept: true } as never); // edits on an older revision: kept, not restored
    const navigate = await openPage();
    const dialog = openDialog();
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Delete activity" })));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("#activities"));
    expect(fake.callsNamed("deleteActivity")).toEqual([{ name: "deleteActivity", args: [ID] }]);
    expect(fake.activities.has(ID)).toBe(false);
    expect(unsavedFor(ID, 1)).toBeNull();
    cleanup();

    render(<ActivityListPage api={fake.api} />);
    expect(screen.getByRole("status").textContent).toBe(`Activity ${ID} deleted, with 1 published version.`);
    await waitFor(() => expect(peekFlash()).toBeNull()); // shown once
  });

  it("shows the error and stays on the page when the delete is refused", async () => {
    const refusing: AdminApi = { ...fake.api, deleteActivity: async () => Promise.reject(new ApiError(503, "THROTTLED")) };
    const navigate = await openPage(refusing);
    const dialog = openDialog();
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Delete activity" })));
    expect(await screen.findByText("Busy. Wait a moment and try again.")).toBeTruthy();
    expect(confirmDialog()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(deleteButton()).toHaveProperty("disabled", false);
    expect(document.activeElement).toBe(deleteButton());
  });

  it("treats NOT_FOUND as already deleted: goes to the list and says so", async () => {
    keepUnsaved(ID, 1, { kept: true } as never);
    const gone: AdminApi = { ...fake.api, deleteActivity: async () => Promise.reject(new ApiError(404, "NOT_FOUND")) };
    const navigate = await openPage(gone);
    const dialog = openDialog();
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Delete activity" })));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("#activities"));
    expect(peekFlash()).toBe(`Activity ${ID} was already deleted.`);
    expect(unsavedFor(ID, 1)).toBeNull();
    expect(screen.queryByText("Not found.")).toBeNull();
  });

  it("offers no Delete for an activity that did not load", async () => {
    render(<ActivityPage api={fake.api} activityId="zz-9999" navigate={vi.fn()} />);
    expect(await screen.findByText("Not found.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Delete activity" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete activity" })).toBeNull();
  });
});
