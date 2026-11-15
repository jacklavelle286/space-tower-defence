// The answer canonicaliser (C section 20.1, spine S3.3): the one place an answer is turned into the canonical string
// sent in SUBMIT_ATTEMPT. The browser (player app, offline) and the server both judge by exact equality with the
// pinned accepted answers, and Python checks only the shape, so there is no second normaliser that could disagree.
//
// Built-ins that behave differently across engines are deliberately not used: no trim(), no Number(), no case
// folding (toLowerCase/toUpperCase/localeCompare). Each type's rules are written out as explicit steps.
// Phase 11 covered MULTIPLE_CHOICE; Phase 37 added PICTURE_SELECT and NUMBER_SELECT; Phase 38 adds OBJECT_MOVE,
// ARRANGE, TYPED and two-step answers (the step answers joined by `|`, C20.3).
//
// Vectors: contracts/fixtures/answers/vectors.json (also read by pytest, which checks the shape of every output).
import { LIMITS } from "../limits";

export type InteractionType = "MULTIPLE_CHOICE" | "PICTURE_SELECT" | "NUMBER_SELECT" | "OBJECT_MOVE" | "ARRANGE" | "TYPED";

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

/** PICTURE_SELECT: the same as multiple choice, the option IDs (a-f) of the picture cards. */
export type PictureSelectSpec = {
  readonly interactionType: "PICTURE_SELECT";
  readonly optionIds: readonly string[];
};

/** NUMBER_SELECT: the numbers on the track or hundred square (whole numbers 0-100, from the pack's numberSet). */
export type NumberSelectSpec = {
  readonly interactionType: "NUMBER_SELECT";
  readonly values: readonly number[];
};

/** OBJECT_MOVE (DISTRIBUTE): how many of `sourceCount` identical objects went into each zone. */
export type DistributeSpec = {
  readonly interactionType: "OBJECT_MOVE";
  readonly mode: "DISTRIBUTE";
  readonly zoneIds: readonly string[];
  readonly sourceCount: number;
  readonly requireAllPlaced: boolean;
};

/** OBJECT_MOVE (SORT): which bin each object went into. */
export type SortSpec = {
  readonly interactionType: "OBJECT_MOVE";
  readonly mode: "SORT";
  readonly objectIds: readonly string[];
  readonly binIds: readonly string[];
};

/** ARRANGE: the tiles (ID and value) and the number of spaces. LETTERS concatenates values; SEQUENCE joins them by ",". */
export type ArrangeSpec = {
  readonly interactionType: "ARRANGE";
  readonly mode: "LETTERS" | "SEQUENCE";
  readonly tiles: readonly { readonly id: string; readonly value: string }[];
  readonly slots: number;
};

/** TYPED: a whole number (NUMERIC) or a word (WORD), typed or entered on the on-screen keypad. */
export type TypedSpec = {
  readonly interactionType: "TYPED";
  readonly mode: "NUMERIC" | "WORD";
  readonly maxLength: number;
  /** WORD only: keep capitals (C20.1 `caseSensitive`). The canonical alphabet has no capitals, so a capital is refused. */
  readonly caseSensitive?: boolean;
};

export type AnswerSpec = MultipleChoiceSpec | PictureSelectSpec | NumberSelectSpec | DistributeSpec | SortSpec | ArrangeSpec | TypedSpec;

/**
 * The panel's raw answer for one step, before canonicalisation:
 * - choice types, NUMBER_SELECT and TYPED: the chosen option ID, the number in decimal, or the text typed (null = nothing);
 * - OBJECT_MOVE DISTRIBUTE: zone ID -> how many objects are in it (a zone left out holds none);
 * - OBJECT_MOVE SORT: object ID -> the bin it is in (null or left out = still in the tray);
 * - ARRANGE: the tile ID in each space, left to right (null = an empty space).
 */
export type RawAnswer = string | null | readonly (string | null)[] | Readonly<Record<string, number | string | null>>;

const SHAPE = new RegExp(LIMITS.answer.pattern, "u");
const STEP_JOINER = LIMITS.answer.stepJoiner;
const DIGITS = "0123456789";

/**
 * The shape every canonical answer has, for every interaction type: one string of 1 to 64 characters from the
 * allowed set (lower-case letters, digits, apostrophe, space, hyphen and the separators ; = , |).
 * This is all the Python side checks.
 */
export function isCanonicalAnswerShape(answer: string): boolean {
  return answer.length <= LIMITS.answer.maxLength && SHAPE.test(answer);
}

/**
 * A whole number 0 or more written in decimal, no sign and no leading zeros ("8", "40", "100"), or null when the
 * value is not a safe whole number of 0 or more. Written out digit by digit rather than with String() or
 * toString(), so the rule is visible here.
 */
export function decimal(value: number): string | null {
  if (!Number.isSafeInteger(value) || value < 0) return null;
  let text = "";
  let rest = value;
  do {
    text = `${DIGITS[rest % 10] ?? ""}${text}`;
    rest = Math.floor(rest / 10);
  } while (rest > 0);
  return text;
}

/** MULTIPLE_CHOICE and PICTURE_SELECT: the canonical answer is the selected option's ID, exactly as authored ("c"). */
function choice(optionIds: readonly string[], selected: string | null): CanonicalResult {
  if (selected === null || selected === "") return { ok: false, reason: "INCOMPLETE" };
  if (!optionIds.includes(selected)) return { ok: false, reason: "NOT_AN_OPTION" };
  return isCanonicalAnswerShape(selected) ? { ok: true, answer: selected } : { ok: false, reason: "NOT_CANONICAL" };
}

/**
 * NUMBER_SELECT (C20.1): a decimal whole number, no sign, no leading zeros ("8"). Steps:
 * 1. nothing chosen -> INCOMPLETE;
 * 2. any character other than the digits 0-9 (a sign, a space, a decimal point, an exponent) -> NOT_CANONICAL;
 * 3. drop leading zeros, keeping one digit ("08" -> "8", "000" -> "0");
 * 4. the result must be one of this activity's numbers -> otherwise NOT_AN_OPTION.
 */
function numberSelect(values: readonly number[], selected: string | null): CanonicalResult {
  if (selected === null || selected === "") return { ok: false, reason: "INCOMPLETE" };
  for (const character of selected) {
    if (!DIGITS.includes(character)) return { ok: false, reason: "NOT_CANONICAL" };
  }
  let start = 0;
  while (start < selected.length - 1 && selected[start] === "0") start += 1;
  const digits = selected.slice(start);
  if (!values.some((value) => decimal(value) === digits)) return { ok: false, reason: "NOT_AN_OPTION" };
  return isCanonicalAnswerShape(digits) ? { ok: true, answer: digits } : { ok: false, reason: "NOT_CANONICAL" };
}

const refuse = (reason: RefusalReason): CanonicalResult => ({ ok: false, reason });
const shaped = (answer: string): CanonicalResult => (isCanonicalAnswerShape(answer) ? { ok: true, answer } : refuse("NOT_CANONICAL"));
const isRecord = (raw: RawAnswer): raw is Readonly<Record<string, number | string | null>> => typeof raw === "object" && raw !== null && !Array.isArray(raw);
const isList = (raw: RawAnswer): raw is readonly (string | null)[] => Array.isArray(raw);

/** IDs in plain code-unit order. The IDs are ASCII (`^[a-z0-9]{1,8}$`), where this is the order Python's sorted() gives. */
function sortedIds(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * OBJECT_MOVE DISTRIBUTE (C20.1): every zone, sorted by zone ID, as `id=count`, joined by `;` ("z1=3;z2=3"). Steps:
 * 1. not a zone -> count map, or a count that is not a whole number of 0 or more -> NOT_CANONICAL;
 * 2. a zone this activity does not have -> NOT_AN_OPTION;
 * 3. more objects placed than there are -> NOT_AN_OPTION;
 * 4. nothing placed, or not all placed when the activity asks for all -> INCOMPLETE;
 * 5. every zone in ID order, a zone left out counting 0, each count in decimal.
 */
function distribute(spec: DistributeSpec, raw: RawAnswer): CanonicalResult {
  if (raw === null) return refuse("INCOMPLETE");
  if (!isRecord(raw)) return refuse("NOT_CANONICAL");
  let total = 0;
  for (const [zone, count] of Object.entries(raw)) {
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) return refuse("NOT_CANONICAL");
    if (!spec.zoneIds.includes(zone)) return refuse("NOT_AN_OPTION");
    total += count;
  }
  if (total > spec.sourceCount) return refuse("NOT_AN_OPTION");
  if (total === 0 || (spec.requireAllPlaced && total !== spec.sourceCount)) return refuse("INCOMPLETE");
  const parts = sortedIds(spec.zoneIds).map((zone) => `${zone}=${decimal(typeof raw[zone] === "number" ? raw[zone] : 0) ?? ""}`);
  return shaped(parts.join(";"));
}

/**
 * OBJECT_MOVE SORT (C20.1): every object, sorted by object ID, as `object=bin`, joined by `;` ("o1=ee;o2=e"). Steps:
 * 1. not an object -> bin map -> NOT_CANONICAL;
 * 2. an object or a bin this activity does not have -> NOT_AN_OPTION;
 * 3. any object still in the tray -> INCOMPLETE.
 */
function sort(spec: SortSpec, raw: RawAnswer): CanonicalResult {
  if (raw === null) return refuse("INCOMPLETE");
  if (!isRecord(raw)) return refuse("NOT_CANONICAL");
  for (const [object, bin] of Object.entries(raw)) {
    if (bin !== null && typeof bin !== "string") return refuse("NOT_CANONICAL");
    if (!spec.objectIds.includes(object) || (bin !== null && !spec.binIds.includes(bin))) return refuse("NOT_AN_OPTION");
  }
  const parts: string[] = [];
  for (const object of sortedIds(spec.objectIds)) {
    const bin = raw[object];
    if (typeof bin !== "string") return refuse("INCOMPLETE");
    parts.push(`${object}=${bin}`);
  }
  return shaped(parts.join(";"));
}

/**
 * ARRANGE (C20.1): the VALUES of the placed tiles, in order: concatenated for LETTERS ("cat"; the two "o" tiles of
 * "moon" are interchangeable and sh+i+p equals s+h+i+p), joined by "," for SEQUENCE ("30,38,80,83"). Steps:
 * 1. not a list of spaces -> NOT_CANONICAL; more spaces than the activity has -> NOT_CANONICAL;
 * 2. a tile ID this activity does not have, or one tile in two spaces -> NOT_AN_OPTION;
 * 3. an empty space -> INCOMPLETE.
 */
function arrange(spec: ArrangeSpec, raw: RawAnswer): CanonicalResult {
  if (raw === null) return refuse("INCOMPLETE");
  if (!isList(raw) || raw.length > spec.slots) return refuse("NOT_CANONICAL");
  const values: string[] = [];
  const used = new Set<string>();
  for (const id of raw) {
    if (id === null) continue;
    const tile = spec.tiles.find((t) => t.id === id);
    if (tile === undefined || used.has(id)) return refuse("NOT_AN_OPTION");
    used.add(id);
    values.push(tile.value);
  }
  if (values.length < spec.slots) return refuse("INCOMPLETE");
  return shaped(values.join(spec.mode === "LETTERS" ? "" : ","));
}

/** C20.1's whitespace set for typed answers, written out: space, tab, CR, LF and no-break space. */
const WHITESPACE = " \t\r\n ";
/** Curly apostrophes become "'" (U+2018, U+2019, U+02BC); dashes U+2010-U+2014 become "-". */
const APOSTROPHES = "‘’ʼ";
const DASHES = "‐‑‒–—";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const WORD_CHARACTERS = `${LOWER}' -`;

/**
 * TYPED NUMERIC (C20.1): an integer 0-999. Steps:
 * 1. remove every whitespace character (the set above); nothing left -> INCOMPLETE;
 * 2. anything but the digits 0-9 (a sign, a point, a full-width digit, a number word), or more than 3 digits -> NOT_CANONICAL;
 * 3. drop leading zeros, keeping one digit ("08" -> "8").
 */
function typedNumeric(raw: RawAnswer): CanonicalResult {
  if (raw === null) return refuse("INCOMPLETE");
  if (typeof raw !== "string") return refuse("NOT_CANONICAL");
  let digits = "";
  for (const character of raw) {
    if (WHITESPACE.includes(character)) continue;
    if (!DIGITS.includes(character)) return refuse("NOT_CANONICAL");
    digits += character;
  }
  if (digits === "") return refuse("INCOMPLETE");
  if (digits.length > 3) return refuse("NOT_CANONICAL");
  let start = 0;
  while (start < digits.length - 1 && digits[start] === "0") start += 1;
  return shaped(digits.slice(start));
}

/**
 * TYPED WORD (C20.1). Steps:
 * 1. whitespace (the set above) at either end is dropped, and each run inside becomes one space ("foot  ball" ->
 *    "foot ball"; internal spaces are kept, so "foot ball" is not "football"); nothing left -> INCOMPLETE;
 * 2. curly apostrophes become "'", dashes become "-";
 * 3. A-Z become a-z, letter by letter (not toLowerCase), unless the answer is case-sensitive;
 * 4. anything outside a-z, apostrophe, space and hyphen, or longer than maxLength -> NOT_CANONICAL.
 */
function typedWord(spec: TypedSpec, raw: RawAnswer): CanonicalResult {
  if (raw === null) return refuse("INCOMPLETE");
  if (typeof raw !== "string") return refuse("NOT_CANONICAL");
  let text = "";
  let pendingSpace = false;
  for (const character of raw) {
    if (WHITESPACE.includes(character)) {
      pendingSpace = text !== "";
      continue;
    }
    if (pendingSpace) text += " ";
    pendingSpace = false;
    let out = character;
    if (APOSTROPHES.includes(character)) out = "'";
    else if (DASHES.includes(character)) out = "-";
    else if (spec.caseSensitive !== true && UPPER.includes(character)) out = LOWER[UPPER.indexOf(character)] ?? character;
    text += out;
  }
  if (text === "") return refuse("INCOMPLETE");
  for (const character of text) {
    if (!WORD_CHARACTERS.includes(character)) return refuse("NOT_CANONICAL");
  }
  if (text.length > spec.maxLength) return refuse("NOT_CANONICAL");
  return shaped(text);
}

/**
 * Turn the panel's raw answer into the canonical string, or refuse. A refusal never becomes an op, so it never
 * uses up an attempt (spine S3.3).
 */
export function canonicalise(spec: AnswerSpec, raw: RawAnswer): CanonicalResult {
  switch (spec.interactionType) {
    case "MULTIPLE_CHOICE":
    case "PICTURE_SELECT":
      return typeof raw === "string" || raw === null ? choice(spec.optionIds, raw) : refuse("NOT_CANONICAL");
    case "NUMBER_SELECT":
      return typeof raw === "string" || raw === null ? numberSelect(spec.values, raw) : refuse("NOT_CANONICAL");
    case "OBJECT_MOVE":
      return spec.mode === "DISTRIBUTE" ? distribute(spec, raw) : sort(spec, raw);
    case "ARRANGE":
      return arrange(spec, raw);
    case "TYPED":
      return spec.mode === "NUMERIC" ? typedNumeric(raw) : typedWord(spec, raw);
  }
}

/**
 * A whole activity's answer: one step, or two steps joined by `|` (C20.3: one Check, one attempt, "c|30"). Any step
 * incomplete -> INCOMPLETE (Check is blocked with a nudge); otherwise the first step's refusal; the joined answer must
 * still be one canonical string of at most 64 characters.
 */
export function canonicaliseSteps(specs: readonly AnswerSpec[], raws: readonly RawAnswer[]): CanonicalResult {
  if (specs.length === 0 || raws.length !== specs.length) return refuse("NOT_CANONICAL");
  const results = specs.map((spec, i) => canonicalise(spec, raws[i] ?? null));
  if (results.some((r) => !r.ok && r.reason === "INCOMPLETE")) return refuse("INCOMPLETE");
  const parts: string[] = [];
  for (const result of results) {
    if (!result.ok) return result;
    parts.push(result.answer);
  }
  return shaped(parts.join(STEP_JOINER));
}

/** The step answers of a recorded canonical answer ("c|30" -> ["c", "30"]), or null when it has another number of parts. */
export function splitSteps(answer: string, steps: number): string[] | null {
  const parts = answer.split(STEP_JOINER);
  return parts.length === steps ? parts : null;
}
