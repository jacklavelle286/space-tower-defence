// What a new activity's identity is filled in from, so the operator types none of it: the topic (plan C19, the
// registry in @scd/shared) gives the subject, the ages and a starting title, and the activity list gives the next free
// activity ID. Pure functions; NewActivity.tsx and ActivityEditor.tsx call them.
import { bandRangeName, TOPICS, type Topic } from "@scd/shared";
import type { StepKind } from "./model";
import { kindInfo } from "./model";

/** C19's type column uses C20's abbreviations. */
const TYPE_CODES: Record<string, string> = {
  MULTIPLE_CHOICE: "MC",
  PICTURE_SELECT: "PS",
  NUMBER_SELECT: "NS",
  OBJECT_MOVE: "OM",
  ARRANGE: "AR",
  TYPED: "TY",
};

/** Plan C §activityId: the subject's prefix and four digits, immutable and never reused. */
export const ID_PREFIX: Record<string, string> = { maths: "ma-", phonics: "ph-", spelling: "sp-" };

const SUBJECT_NAMES: Record<string, string> = { maths: "Maths", phonics: "Phonics", spelling: "Spelling" };

export function subjectName(subject: string): string {
  return SUBJECT_NAMES[subject] ?? subject;
}

/** "5", or "5–6" when the topic spans more than one age. */
export function agesText(ages: readonly number[]): string {
  const first = ages[0];
  const last = ages[ages.length - 1];
  if (first === undefined || last === undefined) return "";
  return bandRangeName(first, last); // YG1: bands are school years
}

/** The select's label for a topic: "Count objects to 10 — ages 5–6" ("age 5" for one age). */
export function topicLabel(topic: Topic): string {
  return `${topic.title} — ${agesText(topic.ages)}`;
}

/** Whether C19 lists the step kind's interaction type for this topic. */
export function topicSuits(topic: Topic, kind: StepKind): boolean {
  const code = TYPE_CODES[kindInfo(kind).interactionType];
  return code !== undefined && topic.types.includes(code);
}

export type TopicGroup = { readonly subject: string; readonly label: string; readonly topics: readonly Topic[] };

/**
 * The registry grouped by subject, in registry order, keeping topics that match `filter` (title, ID or description,
 * any case). Within a subject, the topics that suit `kind` come first. `keep` stays listed whatever the filter says,
 * so the chosen topic never disappears from its own select.
 */
export function topicGroups(kind: StepKind, filter = "", keep = "", subjects?: readonly string[]): TopicGroup[] {
  const needle = filter.trim().toLowerCase();
  const matches = (t: Topic) =>
    t.topicId === keep ||
    needle === "" ||
    t.title.toLowerCase().includes(needle) ||
    t.topicId.includes(needle) ||
    t.description.toLowerCase().includes(needle);
  const groups: TopicGroup[] = [];
  for (const subject of Object.keys(ID_PREFIX)) {
    if (subjects !== undefined && !subjects.includes(subject)) continue;
    const mine = TOPICS.filter((t) => t.subject === subject && matches(t));
    const topics = [...mine.filter((t) => topicSuits(t, kind)), ...mine.filter((t) => !topicSuits(t, kind))];
    if (topics.length > 0) groups.push({ subject, label: subjectName(subject), topics });
  }
  return groups;
}

/** The starting ages for a topic: its youngest age, and at most one year above it (admin-api's age_span rule). */
export function defaultAges(topic: Topic): { minAge: number; maxAge: number } {
  const first = topic.ages[0] ?? 5;
  const last = topic.ages[topic.ages.length - 1] ?? first;
  return { minAge: first, maxAge: Math.min(last, first + 1) };
}

/** The oldest ages allowed with `minAge` for this topic: the topic's ages from minAge up to one year above it. */
export function oldestChoices(topic: Topic, minAge: number): number[] {
  return topic.ages.filter((age) => age >= minAge && age <= minAge + 1);
}

/**
 * The next free activity ID for a subject: its prefix and one more than the highest four-digit number already used
 * by any activity (draft, published or retired: an ID is never reused), from 0001.
 */
export function nextActivityId(subject: string, takenIds: readonly string[], after?: string): string {
  const prefix = ID_PREFIX[subject] ?? `${subject.slice(0, 2)}-`;
  const pattern = new RegExp(`^${prefix}([0-9]{4,})$`, "u");
  let highest = 0;
  for (const id of after === undefined ? takenIds : [...takenIds, after]) {
    const match = pattern.exec(id);
    if (match?.[1] !== undefined) highest = Math.max(highest, Number.parseInt(match[1], 10));
  }
  return `${prefix}${String(highest + 1).padStart(4, "0")}`;
}
