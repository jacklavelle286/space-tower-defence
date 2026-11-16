import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ageValues,
  agesLabel,
  DEFAULT_SORT,
  facetValues,
  filterActivities,
  isEmpty,
  loadListState,
  nextSort,
  NO_FILTER,
  saveListState,
  STORAGE_KEY,
  withCurrent,
  words,
} from "./activityList";
import type { ActivitySummary } from "./api";

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
  updatedAt: "2026-11-15T10:00:00Z",
  ...over,
});

const ITEMS = [
  row({ activityId: "ph-0102", state: "PUBLISHED", publishedVersion: "v-abc" }),
  row({ activityId: "ma-0101", title: "Count the ships", subject: "maths", topicId: "maths-count", interactionType: "NUMBER_SELECT", minAge: 5, maxAge: 5 }),
  row({ activityId: "sp-0001", title: "Spell ship", subject: "spelling", topicId: "spelling-sh", interactionType: "TYPED_RESPONSE", minAge: 7, maxAge: 7, rewardCategory: "METEOR" }),
  row({ activityId: "ma-0200", title: "Add two", subject: "maths", topicId: "maths-add", authoringMode: "TEMPLATE", minAge: 6, maxAge: 7, state: "RETIRED" }),
];

const ids = (items: ActivitySummary[]) => items.map((i) => i.activityId);

describe("activity list filters", () => {
  it("shows everything, sorted by ID, with no filter", () => {
    expect(ids(filterActivities(ITEMS, NO_FILTER))).toEqual(["ma-0101", "ma-0200", "ph-0102", "sp-0001"]);
  });

  it("filters by each facet exactly", () => {
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, subject: "maths" }))).toEqual(["ma-0101", "ma-0200"]);
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, state: "PUBLISHED" }))).toEqual(["ph-0102"]);
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, interactionType: "NUMBER_SELECT" }))).toEqual(["ma-0101"]);
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, rewardCategory: "METEOR" }))).toEqual(["sp-0001"]);
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, authoringMode: "TEMPLATE" }))).toEqual(["ma-0200"]);
  });

  it("filters by age inside the activity's range", () => {
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, age: "5" }))).toEqual(["ma-0101", "ph-0102"]);
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, age: "6" }))).toEqual(["ma-0200", "ph-0102"]);
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, age: "7" }))).toEqual(["ma-0200", "sp-0001"]);
  });

  it("text filters match 'contains', ignoring case and surrounding spaces", () => {
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, title: "  SHIP " }))).toEqual(["ma-0101", "sp-0001"]);
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, activityId: "ph-01" }))).toEqual(["ph-0102"]);
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, activityId: "ship" }))).toEqual([]);
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, topicId: "maths-" }))).toEqual(["ma-0101", "ma-0200"]);
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, publishedVersion: "ABC" }))).toEqual(["ph-0102"]);
  });

  it("filters Updated by the last N days", () => {
    const now = Date.parse("2026-11-16T10:00:00Z");
    const recent = [
      row({ activityId: "a", updatedAt: "2026-11-16T09:00:00Z" }),
      row({ activityId: "b", updatedAt: "2026-11-10T10:00:00Z" }),
      row({ activityId: "c", updatedAt: "2026-09-01T10:00:00Z" }),
    ];
    expect(ids(filterActivities(recent, { ...NO_FILTER, updatedWithinDays: "1" }, DEFAULT_SORT, now))).toEqual(["a"]);
    expect(ids(filterActivities(recent, { ...NO_FILTER, updatedWithinDays: "7" }, DEFAULT_SORT, now))).toEqual(["a", "b"]);
    expect(ids(filterActivities(recent, { ...NO_FILTER, updatedWithinDays: "90" }, DEFAULT_SORT, now))).toEqual(["a", "b", "c"]);
  });

  it("sorts by any column, both ways, ties broken by ID", () => {
    expect(ids(filterActivities(ITEMS, NO_FILTER, { key: "activityId", dir: "desc" }))).toEqual(["sp-0001", "ph-0102", "ma-0200", "ma-0101"]);
    expect(ids(filterActivities(ITEMS, NO_FILTER, { key: "subject", dir: "asc" }))).toEqual(["ma-0101", "ma-0200", "ph-0102", "sp-0001"]);
    expect(ids(filterActivities(ITEMS, NO_FILTER, { key: "ages", dir: "desc" }))).toEqual(["sp-0001", "ma-0200", "ph-0102", "ma-0101"]);
    // Unpublished rows go last when ascending.
    expect(ids(filterActivities(ITEMS, NO_FILTER, { key: "publishedVersion", dir: "asc" }))[0]).toBe("ph-0102");
    expect(ids(filterActivities(ITEMS, NO_FILTER, { key: "publishedVersion", dir: "desc" })).at(-1)).toBe("ph-0102");
  });

  it("sorts coded columns by the words shown, so BOTH ('normal or meteor') sorts under N", () => {
    const rewards = [
      row({ activityId: "a", rewardCategory: "NORMAL" }),
      row({ activityId: "b", rewardCategory: "BOTH" }),
      row({ activityId: "c", rewardCategory: "METEOR" }),
    ];
    // meteor < normal < normal or meteor
    expect(ids(filterActivities(rewards, NO_FILTER, { key: "rewardCategory", dir: "asc" }))).toEqual(["c", "a", "b"]);
    expect(ids(filterActivities(rewards, NO_FILTER, { key: "rewardCategory", dir: "desc" }))).toEqual(["b", "a", "c"]);
  });

  it("a header click flips the sorted column and starts others ascending", () => {
    expect(nextSort(DEFAULT_SORT, "activityId")).toEqual({ key: "activityId", dir: "desc" });
    expect(nextSort({ key: "activityId", dir: "desc" }, "activityId")).toEqual({ key: "activityId", dir: "asc" });
    expect(nextSort({ key: "activityId", dir: "desc" }, "title")).toEqual({ key: "title", dir: "asc" });
  });

  it("combines filters", () => {
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, subject: "maths", age: "7" }))).toEqual(["ma-0200"]);
    expect(filterActivities(ITEMS, { ...NO_FILTER, subject: "phonics", age: "7" })).toEqual([]);
  });

  it("offers each facet's values from the data", () => {
    expect(facetValues(ITEMS, "subject")).toEqual(["maths", "phonics", "spelling"]);
    expect(facetValues(ITEMS, "state")).toEqual(["DRAFT", "PUBLISHED", "RETIRED"]);
    expect(ageValues(ITEMS)).toEqual(["5", "6", "7"]);
    expect(ageValues([row({ minAge: 6, maxAge: 6 })])).toEqual(["6"]);
  });

  it("keeps the current choice among a dropdown's options when the data no longer has it", () => {
    expect(withCurrent(["PUBLISHED"], "DRAFT")).toEqual(["PUBLISHED", "DRAFT"]);
    expect(withCurrent(["DRAFT", "PUBLISHED"], "DRAFT")).toEqual(["DRAFT", "PUBLISHED"]);
    expect(withCurrent(["PUBLISHED"], "")).toEqual(["PUBLISHED"]);
  });

  it("knows when no filter is set", () => {
    expect(isEmpty(NO_FILTER)).toBe(true);
    expect(isEmpty({ ...NO_FILTER, state: "DRAFT" })).toBe(false);
  });

  it("labels ages and codes for reading", () => {
    expect(agesLabel({ minAge: 5, maxAge: 6 })).toBe("5–6");
    expect(agesLabel({ minAge: 7, maxAge: 7 })).toBe("7");
    expect(words("MULTIPLE_CHOICE")).toBe("multiple choice");
    expect(words("BOTH")).toBe("normal or meteor");
  });
});

// These stub `window`, so this file stays in the node environment.
describe("remembering filters for the tab", () => {
  let store: Map<string, string>;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("saves and loads filters and sort", () => {
    saveListState({ ...NO_FILTER, subject: "maths", title: "add" }, { key: "updatedAt", dir: "desc" });
    expect(loadListState()).toEqual({
      filter: { ...NO_FILTER, subject: "maths", title: "add" },
      sort: { key: "updatedAt", dir: "desc" },
    });
  });

  it("falls back to the defaults on nothing saved, junk or an unknown sort", () => {
    expect(loadListState()).toEqual({ filter: NO_FILTER, sort: DEFAULT_SORT });
    store.set(STORAGE_KEY, "{not json");
    expect(loadListState()).toEqual({ filter: NO_FILTER, sort: DEFAULT_SORT });
    store.set(STORAGE_KEY, JSON.stringify({ filter: { state: 3, title: "x", extra: "y" }, sort: { key: "nope", dir: "asc" } }));
    expect(loadListState()).toEqual({ filter: { ...NO_FILTER, title: "x" }, sort: DEFAULT_SORT });
  });

  it("works when storage throws", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(loadListState()).toEqual({ filter: NO_FILTER, sort: DEFAULT_SORT });
    expect(() => saveListState(NO_FILTER, DEFAULT_SORT)).not.toThrow();
  });
});
