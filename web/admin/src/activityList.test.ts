import { describe, expect, it } from "vitest";
import { agesLabel, facetValues, filterActivities, NO_FILTER, words } from "./activityList";
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
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, topicId: "maths-count" }))).toEqual(["ma-0101"]);
  });

  it("filters by age inside the activity's range", () => {
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, age: "5" }))).toEqual(["ma-0101", "ph-0102"]);
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, age: "6" }))).toEqual(["ma-0200", "ph-0102"]);
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, age: "7" }))).toEqual(["ma-0200", "sp-0001"]);
  });

  it("searches ID and title, ignoring case and surrounding spaces", () => {
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, search: "  SHIP " }))).toEqual(["ma-0101", "sp-0001"]);
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, search: "ph-01" }))).toEqual(["ph-0102"]);
  });

  it("combines filters", () => {
    expect(ids(filterActivities(ITEMS, { ...NO_FILTER, subject: "maths", age: "7" }))).toEqual(["ma-0200"]);
    expect(filterActivities(ITEMS, { ...NO_FILTER, subject: "phonics", age: "7" })).toEqual([]);
  });

  it("offers each facet's values from the data", () => {
    expect(facetValues(ITEMS, "subject")).toEqual(["maths", "phonics", "spelling"]);
    expect(facetValues(ITEMS, "state")).toEqual(["DRAFT", "PUBLISHED", "RETIRED"]);
  });

  it("labels ages and codes for reading", () => {
    expect(agesLabel({ minAge: 5, maxAge: 6 })).toBe("5–6");
    expect(agesLabel({ minAge: 7, maxAge: 7 })).toBe("7");
    expect(words("MULTIPLE_CHOICE")).toBe("multiple choice");
    expect(words("BOTH")).toBe("normal or meteor");
  });
});
