// Validation problems in words (D §D8.4: "each problem links to its field"). admin-api names a problem by field path
// and rule (`activityPayload.options.2.text`, `length`) and never echoes values (G §1.3); this file says which field
// that is on the editor and what the rule means. The field path is also the input's element ID (fieldId), so a
// problem can move the cursor to its field.
import type { Problem } from "../api";

/** The element ID of the input for a field path. */
export function fieldId(path: string): string {
  return `f-${path.replaceAll(".", "-")}`;
}

/** Fields the editor no longer shows (curriculum codes, curriculum note, source): an older draft may still hold them,
 * and only a save removes them. Their problems point at the notice beside Save, which says so. */
const LEGACY = new Set(["curriculumReference", "curriculumNote", "source"]);
export const LEGACY_NOTICE_ID = "legacy-fields";

/** The input to focus for a problem: the field's own input, or the nearest enclosing one that exists. */
export function focusTarget(path: string, exists: (id: string) => boolean): string | null {
  const parts = path.split(".");
  if (LEGACY.has(parts[0] ?? "")) return exists(LEGACY_NOTICE_ID) ? LEGACY_NOTICE_ID : null;
  for (let n = parts.length; n > 0; n -= 1) {
    const id = fieldId(parts.slice(0, n).join("."));
    if (exists(id)) return id;
  }
  return null;
}

const RULES: Record<string, string> = {
  required: "is missing",
  additionalProperties: "is not a field this activity can have",
  length: "is empty or too long",
  pattern: "has characters that are not allowed",
  enum: "is not one of the allowed values",
  range: "is out of range",
  count: "has the wrong number of entries",
  type: "has the wrong kind of value",
  shape: "is not complete",
  duplicate: "repeats another entry",
  markup: "contains < or >",
  const: "has a value that cannot change",
  matches_path: "does not match this activity",
  age_span: "is more than one year above the youngest age",
  topic_subject: "must start with the subject, for example maths-",
  unknown_topic: "is not in the topic list for this subject: choose one from the list",
  topic_ages: "is not for these ages: set the youngest and oldest ages to ages the topic is for (shown under Topic)",
  locked_after_publish: "cannot change after the first publish",
  not_supported_yet: "is not supported yet",
  unique_a_to_f: "must be a to f, each once",
  exactly_one: "needs exactly one right answer",
  not_an_option: "is not one of the options",
  not_in_set: "is not one of the numbers shown",
  answer_format: "is not written the way the game records answers",
  answer_shape: "is too long or has characters a recorded answer cannot have",
  zone_order: "must give every zone a number",
  object_order: "must put every object in a group",
  not_a_bin: "names a group that does not exist",
  bin_empty: "leaves a group with nothing in it",
  nothing_placed: "places nothing",
  too_many: "places more objects than there are",
  all_placed: "must place every object",
  single_zone_target: "would be right just by moving everything (use between 1 and two fewer than all)",
  not_buildable: "cannot be made from the tiles in the number of spaces",
  shuffle_spells_answer: "already shows in the stored tile order (tiles next to each other spell it); reorder the tiles",
  not_a_permutation: "must use every tile once",
  values_distinct: "has two tiles with the same value",
  max_length: "is longer than the answer box allows",
  typed_word_age5: "cannot ask a 5-year-old to type a word (D-7): use letter tiles, or set the ages to 6 or 7",
  track_max: "has more than 21 numbers, which do not fit on a track (use the hundred square)",
  text_or_asset: "needs a word or a picture, not both",
  needs_asset: "is alt text for a picture that is not there",
  empty: "needs a picture or some text",
  cue_required: "needs a cue: a picture, rule text, or a prompt clip",
  unknown_asset: "is not in the picture library",
  not_text_free: "has text in it, which activity pictures may not have",
  asset_not_listed: "is not in the activity's picture list",
  asset_unused: "is listed but not used",
  review_note_required: "is needed when there is more than one accepted answer: say why each one is right",
  variant: "is not a clip slot this activity can have",
  speech_not_approved: "points at a speech clip that is not approved yet",
  audio_required: "needs a prompt, option or group clip because audio is required",
  phonics_needs_clip: "needs at least one clip: every phonics activity has one",
  steps_product: "must list every combination of the two parts' right answers",
  not_in_step: "has a second part that is not one of that part's right answers",
  checklist_incomplete: "is not complete: tick every line",
  preview_solve_stale: "was solved on an older version of the draft: solve it again",
  max_bytes: "is too large (8 KB at most)",
  not_for_template: "is made by the generator on a template, so it cannot be written here",
  not_for_fixed: "is only for template activities",
  unknown_generator: "is not a generator the server has",
  unknown_version: "is not a version of this generator the server has",
  generator_output: "cannot be made by this generator",
  domain_too_large: "makes more than 5,000 questions: narrow the ranges",
  domain_empty: "makes no questions: widen the ranges",
  shape_three: "does not fit three one-digit numbers",
};

/** Registry rules (plan C19): described as the topic's problem. */
const TOPIC_RULES = new Set(["unknown_topic", "topic_ages"]);

const FIELDS: Record<string, string> = {
  title: "Title",
  subject: "Subject",
  topicId: "Topic",
  rewardCategory: "Reward",
  interactionType: "Interaction type",
  authoringMode: "Authoring mode",
  minAge: "Youngest age",
  maxAge: "Oldest age",
  audioRequirement: "Audio",
  curriculumReference: "The old curriculum code list",
  curriculumNote: "The old curriculum note",
  source: "The old source field",
  reviewNote: "Review note",
  prompt: "Question",
  "prompt.text": "Question",
  activityPayload: "Answer area",
  answerSpecification: "Right answer",
  "answerSpecification.accepted": "Right answer",
  speechDefinitionReferences: "Clips",
  visualAssetReferences: "Pictures",
  definition: "The draft",
  schemaVersion: "Schema version",
  activityId: "Activity ID",
  "review.checklist": "The review checklist",
  "review.previewSolvedDraftRevision": "Preview and solve",
  template: "Template",
};

const PARTS: Record<string, string> = {
  options: "option",
  zones: "zone",
  objects: "object",
  bins: "group",
  tiles: "tile",
  accepted: "right answer",
};

const PLURALS: Record<string, string> = {
  options: "options",
  zones: "zones",
  objects: "objects",
  bins: "groups",
  tiles: "tiles",
};

const WORDS: Record<string, string> = {
  text: "text",
  alt: "alt text",
  assetId: "picture",
  caption: "caption",
  label: "label",
  value: "value",
  id: "ID",
  stimulus: "question picture",
  cue: "cue",
  numberSet: "numbers",
  display: "layout",
  optionStyle: "option style",
  sourceCount: "number of objects",
  objectAssetId: "object picture",
  objectAlt: "object alt text",
  requireAllPlaced: "place every object",
  slots: "spaces",
  maxLength: "longest answer",
  orderLabel: "order label",
  partPrompt: "first part's question",
  mode: "mode",
  speechId: "speech",
  caseSensitive: "case sensitive",
};

const OPTION_LETTERS = "abcdef";

/** "activityPayload.options.2.text" -> "Option c text"; "additionalSteps.0.activityPayload.maxLength" -> "Part 2: longest answer". */
export function fieldLabel(path: string): string {
  const whole = FIELDS[path];
  if (whole !== undefined) return whole;
  let parts = path.split(".");
  let prefix = "";
  if (parts[0] === "additionalSteps" && parts[1] === "0") {
    prefix = "Part 2: ";
    parts = parts.slice(2);
    if (parts.length === 0) return "Part 2";
  }
  if (parts[0] === "speechDefinitionReferences" && parts[1] !== undefined) return `${prefix}Clip "${parts[1]}"`;
  if (parts[0] === "answerSpecification" && parts[1] === "accepted" && parts[2] !== undefined && /^[0-9]+$/u.test(parts[2])) {
    return `${prefix}Right answer ${Number.parseInt(parts[2], 10) + 1}`;
  }
  const head = parts[0] ?? "";
  if (parts.length === 1 || FIELDS[parts.join(".")] !== undefined) {
    return `${prefix}${FIELDS[parts.join(".")] ?? FIELDS[head] ?? head}`;
  }
  const words: string[] = [];
  for (let i = 1; i < parts.length; i += 1) {
    const part = parts[i] ?? "";
    const next = parts[i + 1];
    const family = PARTS[part];
    if (family !== undefined && next !== undefined && /^[0-9]+$/u.test(next)) {
      const index = Number.parseInt(next, 10);
      words.push(part === "options" ? `${family} ${OPTION_LETTERS[index] ?? next}` : `${family} ${index + 1}`);
      i += 1;
    } else {
      words.push(WORDS[part] ?? PLURALS[part] ?? part);
    }
  }
  const base = head === "activityPayload" ? "" : `${FIELDS[head] ?? head} `;
  const text = `${base}${words.join(" ")}`.trim();
  return `${prefix}${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** One problem as a sentence: "Option c text is empty or too long." */
export function describeProblem(problem: Problem): string {
  const rule = RULES[problem.rule] ?? `breaks the rule "${problem.rule}"`;
  // The topic rules are about the topic, whichever field admin-api names (topic_ages may name minAge or topicId).
  const root = problem.field.split(".")[0] ?? "";
  if (LEGACY.has(root)) return `${FIELDS[root] ?? root} ${rule}. The editor no longer uses this field: save the draft to remove it.`;
  const label = TOPIC_RULES.has(problem.rule) ? "Topic" : fieldLabel(problem.field);
  return `${label} ${rule}.`;
}
