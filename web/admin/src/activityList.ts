// The activity list's filters, sort and labels (D §D8.2, A2). The server returns the whole header partition (R22, limit
// 200, one consistent query) and the browser filters it, so these are pure functions the list page calls on every change.
//
// Every column has one filter (owner request, 2026-11-16): "contains" text for the free-text columns, a dropdown built
// from the values present for the coded columns, and "last N days" for Updated.

import type { ActivitySummary } from "./api";

export type ListFilter = {
  /** "contains", ignoring case and surrounding spaces. */
  readonly activityId: string;
  readonly title: string;
  readonly topicId: string;
  readonly publishedVersion: string;
  /** Exact match on the code. */
  readonly subject: string;
  readonly interactionType: string;
  readonly authoringMode: string;
  readonly rewardCategory: string;
  readonly state: string;
  /** "" for any age, or one age such as "6": the activity's age range must include it. */
  readonly age: string;
  /** "" for any time, or a whole number of days: updated within the last N days. */
  readonly updatedWithinDays: string;
};

export const NO_FILTER: ListFilter = {
  activityId: "",
  title: "",
  topicId: "",
  publishedVersion: "",
  subject: "",
  interactionType: "",
  authoringMode: "",
  rewardCategory: "",
  state: "",
  age: "",
  updatedWithinDays: "",
};

/** The text ("contains") filters. */
export const TEXT_FILTERS = ["activityId", "title", "topicId", "publishedVersion"] as const;

/** The exact-match dropdown filters. Their options come from the data, so a new subject or type needs no admin change. */
export const FACETS = ["subject", "interactionType", "authoringMode", "rewardCategory", "state"] as const;
export type Facet = (typeof FACETS)[number];

/** The "Updated" choices: [days, label]. */
export const UPDATED_WITHIN = [
  ["1", "last day"],
  ["7", "last 7 days"],
  ["30", "last 30 days"],
  ["90", "last 90 days"],
] as const;

/** The table's columns, in order. `key` is the column's sort key; `filter` names the filter in its filter-row cell. */
export const COLUMNS = [
  { key: "activityId", label: "ID" },
  { key: "title", label: "Title" },
  { key: "subject", label: "Subject" },
  { key: "topicId", label: "Topic" },
  { key: "ages", label: "Ages" },
  { key: "interactionType", label: "Type" },
  { key: "authoringMode", label: "Mode" },
  { key: "rewardCategory", label: "Reward" },
  { key: "state", label: "State" },
  { key: "publishedVersion", label: "Published version" },
  { key: "updatedAt", label: "Updated" },
] as const;

export type SortKey = (typeof COLUMNS)[number]["key"];
export type Sort = { readonly key: SortKey; readonly dir: "asc" | "desc" };
export const DEFAULT_SORT: Sort = { key: "activityId", dir: "asc" };

const DAY_MS = 24 * 60 * 60 * 1000;

function contains(value: string | null, needle: string): boolean {
  const n = needle.trim().toLowerCase();
  return n === "" || (value ?? "").toLowerCase().includes(n);
}

/** True when the item passes every filter. `now` is milliseconds since the epoch (the page passes Date.now()). */
export function matches(item: ActivitySummary, filter: ListFilter, now: number): boolean {
  if (!TEXT_FILTERS.every((key) => contains(item[key], filter[key]))) return false;
  if (!FACETS.every((key) => filter[key] === "" || item[key] === filter[key])) return false;
  if (filter.age !== "") {
    const age = Number(filter.age);
    if (!(item.minAge <= age && age <= item.maxAge)) return false;
  }
  if (filter.updatedWithinDays !== "") {
    const updated = Date.parse(item.updatedAt);
    if (Number.isNaN(updated) || now - updated > Number(filter.updatedWithinDays) * DAY_MS) return false;
  }
  return true;
}

function compare(a: ActivitySummary, b: ActivitySummary, key: SortKey): number {
  switch (key) {
    case "ages":
      return a.minAge - b.minAge || a.maxAge - b.maxAge;
    case "publishedVersion":
      // Unpublished ("—") sorts after every published version when ascending.
      if (a.publishedVersion === b.publishedVersion) return 0;
      if (a.publishedVersion === null) return 1;
      if (b.publishedVersion === null) return -1;
      return a.publishedVersion.localeCompare(b.publishedVersion);
    case "subject":
    case "interactionType":
    case "authoringMode":
    case "rewardCategory":
    case "state":
      // Sort by the words the table shows, not the code: BOTH reads "normal or meteor", so it sorts under N.
      return words(a[key]).localeCompare(words(b[key]));
    default:
      return a[key].localeCompare(b[key]);
  }
}

/** The rows to show: filtered, then sorted (ties broken by ID, ascending, so the order is stable). */
export function filterActivities(
  items: readonly ActivitySummary[],
  filter: ListFilter,
  sort: Sort = DEFAULT_SORT,
  now: number = Date.now(),
): ActivitySummary[] {
  const sign = sort.dir === "asc" ? 1 : -1;
  return items
    .filter((item) => matches(item, filter, now))
    .sort((a, b) => sign * compare(a, b, sort.key) || a.activityId.localeCompare(b.activityId));
}

/** The values a facet can take, from the data itself. */
export function facetValues(items: readonly ActivitySummary[], key: Facet): string[] {
  return [...new Set(items.map((item) => item[key]).filter((v) => v !== ""))].sort();
}

/**
 * The options a dropdown offers: the given values plus the current choice when the data no longer has it (a saved
 * "draft" filter after the last draft was published, say). Without it, the select would read "any" while the filter
 * still hid every row.
 */
export function withCurrent(values: readonly string[], current: string): string[] {
  return current === "" || values.includes(current) ? [...values] : [...values, current];
}

/** Every age some activity covers, ascending, as strings ("5", "6", "7"). */
export function ageValues(items: readonly ActivitySummary[]): string[] {
  const ages = new Set<number>();
  for (const item of items) {
    for (let age = item.minAge; age <= item.maxAge; age += 1) ages.add(age);
  }
  return [...ages].sort((a, b) => a - b).map(String);
}

/** True when no filter is set. */
export function isEmpty(filter: ListFilter): boolean {
  return (Object.keys(NO_FILTER) as (keyof ListFilter)[]).every((key) => filter[key] === "");
}

/** Clicking a header: the sorted column flips direction; another column starts ascending. */
export function nextSort(current: Sort, key: SortKey): Sort {
  return current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" };
}

// Filters and sort are remembered per tab (sessionStorage), so opening an activity and coming back keeps them.
// Storage can be missing or throw (private windows, blocked site data), so every read and write is guarded.
export const STORAGE_KEY = "scd.admin.activityList.v1";

const SORT_KEYS: readonly string[] = COLUMNS.map((c) => c.key);

/** The saved filters and sort, or the defaults when nothing usable is saved. */
export function loadListState(): { filter: ListFilter; sort: Sort } {
  const fallback = { filter: NO_FILTER, sort: DEFAULT_SORT };
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return fallback;
    const { filter, sort } = parsed as { filter?: Record<string, unknown>; sort?: Record<string, unknown> };
    const merged: Record<string, string> = { ...NO_FILTER };
    for (const key of Object.keys(NO_FILTER)) {
      const value = filter?.[key];
      if (typeof value === "string") merged[key] = value;
    }
    const sortOk =
      typeof sort?.key === "string" && SORT_KEYS.includes(sort.key) && (sort.dir === "asc" || sort.dir === "desc");
    return { filter: merged as ListFilter, sort: sortOk ? (sort as Sort) : DEFAULT_SORT };
  } catch {
    return fallback;
  }
}

export function saveListState(filter: ListFilter, sort: Sort): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ filter, sort }));
  } catch {
    // Not remembered this time; the list still works.
  }
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
