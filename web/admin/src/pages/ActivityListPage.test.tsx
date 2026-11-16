// @vitest-environment jsdom
// The activity list (A2, owner request 2026-11-16): a filter for every column in the row under the headers, sortable
// headers with aria-sort, "Showing n of m", Clear filters, and filters kept for the tab in sessionStorage.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NO_FILTER, STORAGE_KEY, DEFAULT_SORT } from "../activityList";
import type { ActivitySummary, AdminApi } from "../api";
import { ActivityListPage } from "./ActivityListPage";

const row = (over: Partial<ActivitySummary>): ActivitySummary => ({
  activityId: "ph-0001",
  title: "Which letters make /sh/?",
  subject: "phonics",
  topicId: "phonics-gpc-consonant-digraphs",
  rewardCategory: "NORMAL",
  interactionType: "MULTIPLE_CHOICE",
  authoringMode: "FIXED",
  state: "DRAFT",
  publishedVersion: null,
  minAge: 5,
  maxAge: 6,
  updatedAt: new Date().toISOString(),
  ...over,
});

const ITEMS = [
  row({ activityId: "ph-0102", state: "PUBLISHED", publishedVersion: "v-abc" }),
  row({ activityId: "ma-0101", title: "Count the ships", subject: "maths", topicId: "maths-count", minAge: 5, maxAge: 5 }),
  row({ activityId: "sp-0001", title: "Spell ship", subject: "spelling", minAge: 7, maxAge: 7, updatedAt: "2025-01-01T00:00:00Z" }),
];

const api = { listActivities: async () => ({ items: ITEMS.map((i) => ({ ...i })) }) } as unknown as AdminApi;

async function openList() {
  render(<ActivityListPage api={api} />);
  await screen.findByText("Showing 3 of 3.");
}

/** The activity IDs in the table body, in order. */
const shownIds = () =>
  within(screen.getByRole("table").querySelector("tbody") as HTMLElement)
    .queryAllByRole("link")
    .map((a) => a.textContent);

beforeEach(() => window.sessionStorage.clear());
afterEach(cleanup);

describe("Activity list", () => {
  it("has a labelled filter for every column", async () => {
    await openList();
    for (const name of [
      "Filter ID: contains",
      "Filter Title: contains",
      "Filter Subject",
      "Filter Topic: contains",
      "Filter Ages: includes age",
      "Filter Type",
      "Filter Mode",
      "Filter Reward",
      "Filter State",
      "Filter Published version: contains",
      "Filter Updated",
    ]) {
      expect(screen.getByLabelText(name)).toBeTruthy();
    }
  });

  it("filters, counts and clears", async () => {
    await openList();
    const clear = screen.getByRole("button", { name: "Clear filters" }) as HTMLButtonElement;
    expect(clear.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("Filter Title: contains"), { target: { value: "ship" } });
    expect(shownIds()).toEqual(["ma-0101", "sp-0001"]);
    expect(screen.getByText("Showing 2 of 3.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Filter Subject"), { target: { value: "maths" } });
    expect(shownIds()).toEqual(["ma-0101"]);

    fireEvent.click(clear);
    expect(shownIds()).toEqual(["ma-0101", "ph-0102", "sp-0001"]);
    expect((screen.getByLabelText("Filter Title: contains") as HTMLInputElement).value).toBe("");
  });

  it("filters ages, state, published version and updated", async () => {
    await openList();
    fireEvent.change(screen.getByLabelText("Filter Ages: includes age"), { target: { value: "7" } });
    expect(shownIds()).toEqual(["sp-0001"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    fireEvent.change(screen.getByLabelText("Filter State"), { target: { value: "PUBLISHED" } });
    expect(shownIds()).toEqual(["ph-0102"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    fireEvent.change(screen.getByLabelText("Filter Published version: contains"), { target: { value: "abc" } });
    expect(shownIds()).toEqual(["ph-0102"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    fireEvent.change(screen.getByLabelText("Filter Updated"), { target: { value: "30" } });
    expect(shownIds()).toEqual(["ma-0101", "ph-0102"]);
  });

  it("sorts by a header click, and reverses on a second click", async () => {
    await openList();
    const idHeader = screen.getByRole("columnheader", { name: /^ID/u });
    expect(idHeader.getAttribute("aria-sort")).toBe("ascending");

    fireEvent.click(within(idHeader).getByRole("button"));
    expect(idHeader.getAttribute("aria-sort")).toBe("descending");
    expect(shownIds()).toEqual(["sp-0001", "ph-0102", "ma-0101"]);

    const ages = screen.getByRole("columnheader", { name: /^Ages/u });
    fireEvent.click(within(ages).getByRole("button"));
    expect(ages.getAttribute("aria-sort")).toBe("ascending");
    expect(idHeader.getAttribute("aria-sort")).toBeNull();
    expect(shownIds()).toEqual(["ma-0101", "ph-0102", "sp-0001"]);
  });

  it("keeps filters and sort for the tab", async () => {
    await openList();
    fireEvent.change(screen.getByLabelText("Filter Subject"), { target: { value: "spelling" } });
    fireEvent.click(within(screen.getByRole("columnheader", { name: /^Title/u })).getByRole("button"));
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toContain("spelling");
    cleanup();

    render(<ActivityListPage api={api} />);
    await screen.findByText("Showing 1 of 3.");
    expect((screen.getByLabelText("Filter Subject") as HTMLSelectElement).value).toBe("spelling");
    expect(screen.getByRole("columnheader", { name: /^Title/u }).getAttribute("aria-sort")).toBe("ascending");
  });

  it("shows a restored dropdown filter even when no row has that value any more", async () => {
    // The owner filtered State = draft, then published the last draft: the saved filter must still show, not "any".
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ filter: { ...NO_FILTER, state: "DRAFT", age: "9" }, sort: DEFAULT_SORT }),
    );
    const noDrafts = {
      listActivities: async () => ({ items: [row({ state: "PUBLISHED", publishedVersion: "v-1" })] }),
    } as unknown as AdminApi;
    render(<ActivityListPage api={noDrafts} />);
    await screen.findByText("Showing 0 of 1.");
    const state = screen.getByLabelText("Filter State") as HTMLSelectElement;
    expect(state.value).toBe("DRAFT");
    expect(state.selectedOptions[0]?.textContent).toBe("draft");
    expect((screen.getByLabelText("Filter Ages: includes age") as HTMLSelectElement).value).toBe("9");

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await screen.findByText("Showing 1 of 1.");
    expect(state.value).toBe("");
    expect([...state.options].map((o) => o.value)).toEqual(["", "PUBLISHED"]);
  });

  it("says so when nothing matches, and keeps the filter row", async () => {
    await openList();
    fireEvent.change(screen.getByLabelText("Filter ID: contains"), { target: { value: "zz" } });
    expect(screen.getByText("No activity matches these filters.")).toBeTruthy();
    expect(screen.getByLabelText("Filter ID: contains")).toBeTruthy();
  });
});
