// The answer canonicaliser (C section 20.1, spine S3.3): the one place an answer is turned into the canonical string
// sent in SUBMIT_ATTEMPT. The browser (player app, offline) and the server both judge by exact equality with the
// pinned accepted answers, and Python checks only the shape, so there is no second normaliser that could disagree.
//
// Built-ins that behave differently across engines are deliberately not used: no trim(), no Number(), no case
// folding (toLowerCase/toUpperCase/localeCompare). Each type's rules are written out as explicit steps.
// Phase 11 covers MULTIPLE_CHOICE; the other five interaction types arrive in Phases 37-38.
//
// Vectors: contracts/fixtures/answers/vectors.json (also read by pytest from Phase 12).
import { LIMITS } from "../limits";

export type InteractionType = "MULTIPLE_CHOICE";

/** Why an answer cannot become an op. The panel blocks Check (INCOMPLETE) or treats the others as a client bug. */
export type RefusalReason = "INCOMPLETE" | "NOT_AN_OPTION" | "NOT_CANONICAL";

export type CanonicalResult =
  | { readonly ok: true; readonly answer: string }
  | { readonly ok: false; readonly reason: RefusalReason };

/** What the canonicaliser needs to know about a MULTIPLE_CHOICE activity: its option IDs (a-f, from the pack). */
export type MultipleChoiceSpec = {
  readonly interactionType: "MULTIPLE_CHOICE";
  readonly optionIds: readonly string[];
};

export type AnswerSpec = MultipleChoiceSpec;

const SHAPE = new RegExp(LIMITS.answer.pattern, "u");

/**
 * The shape every canonical answer has, for every interaction type: one string of 1 to 64 characters from the
 * allowed set (lower-case letters, digits, apostrophe, space, hyphen and the separators ; = , |).
 * This is all the Python side checks.
 */
export function isCanonicalAnswerShape(answer: string): boolean {
  return answer.length <= LIMITS.answer.maxLength && SHAPE.test(answer);
}

/** MULTIPLE_CHOICE: the canonical answer is the selected option's ID, exactly as authored ("c"). */
function multipleChoice(spec: MultipleChoiceSpec, selected: string | null): CanonicalResult {
  if (selected === null || selected === "") return { ok: false, reason: "INCOMPLETE" };
  if (!spec.optionIds.includes(selected)) return { ok: false, reason: "NOT_AN_OPTION" };
  return isCanonicalAnswerShape(selected) ? { ok: true, answer: selected } : { ok: false, reason: "NOT_CANONICAL" };
}

/**
 * Turn the panel's raw answer into the canonical string, or refuse. A refusal never becomes an op, so it never
 * uses up an attempt (spine S3.3).
 */
export function canonicalise(spec: AnswerSpec, raw: string | null): CanonicalResult {
  switch (spec.interactionType) {
    case "MULTIPLE_CHOICE":
      return multipleChoice(spec, raw);
  }
}
