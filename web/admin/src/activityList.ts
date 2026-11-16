// The activity list's filters and search (D §D8.2, A2). The server returns the whole header partition (R22, limit 200,
// one consistent query) and the browser filters it, so this is a pure function the list page calls on every change.

import type { ActivitySummary } from "./api";

export type ListFilter = {
  readonly search: string;
  readonly subject: string;
  /** "" for any age, or one of 5, 6, 7: the activity's age range must include it. */
  readonly age: string;
  readonly interactionType: string;
  readonly state: string;
  readonly topicId: string;
  readonly rewardCategory: string;
  readonly authoringMode: string;
};

export const NO_FILTER: ListFilter = {
  search: "",
  subject: "",
  age: "",
  interactionType: "",
  state: "",
  topicId: "",
  rewardCategory: "",
  authoringMode: "",
};

export const AGES = ["5", "6", "7"] as const;

/** The exact-match filters, in the order the page shows them. */
export const FACETS = [
  { key: "subject", label: "Subject" },
  { key: "interactionType", label: "Type" },
  { key: "state", label: "State" },
  { key: "topicId", label: "Topic" },
  { key: "rewardCategory", label: "Reward" },
  { key: "authoringMode", label: "Mode" },
] as const satisfies readonly { key: keyof ListFilter & keyof ActivitySummary; label: string }[];

export type Facet = (typeof FACETS)[number]["key"];

/**
 * Search covers ID and title. D §D8.2 also lists the prompt, but R22 returns headers only (no definition body), so
 * searching prompts would need a read per activity; it waits for the editor phase if it is wanted.
 */
export function filterActivities(items: readonly ActivitySummary[], filter: ListFilter): ActivitySummary[] {
  const needle = filter.search.trim().toLowerCase();
  const age = filter.age === "" ? null : Number(filter.age);
  return items
    .filter((item) => FACETS.every(({ key }) => filter[key] === "" || item[key] === filter[key]))
    .filter((item) => age === null || (item.minAge <= age && age <= item.maxAge))
    .filter(
      (item) => needle === "" || item.activityId.toLowerCase().includes(needle) || item.title.toLowerCase().includes(needle),
    )
    .sort((a, b) => a.activityId.localeCompare(b.activityId));
}

/** The values a facet can take, from the data itself, so a new subject or type needs no admin change. */
export function facetValues(items: readonly ActivitySummary[], key: Facet): string[] {
  return [...new Set(items.map((item) => item[key]).filter((v): v is string => typeof v === "string" && v !== ""))].sort();
}

/** "5–6", or "5" when the range is one age. */
export function agesLabel(item: Pick<ActivitySummary, "minAge" | "maxAge">): string {
  return item.minAge === item.maxAge ? `${item.minAge}` : `${item.minAge}–${item.maxAge}`;
}

/** Codes whose plain words are not just the code lower-cased. */
const PHRASES: Record<string, string> = { BOTH: "normal or meteor" };

/** MULTIPLE_CHOICE -> "multiple choice", FIXED -> "fixed", BOTH -> "normal or meteor": the list reads as words, the filters keep the codes. */
export function words(code: string): string {
  return PHRASES[code] ?? code.toLowerCase().replace(/_/gu, " ");
}
