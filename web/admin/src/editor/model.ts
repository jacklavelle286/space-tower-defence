// The activity editor's model (Phase 39, M3-04; D §D8.4): what the operator edits, and how it becomes the draft
// definition admin-api stores (C22.1). The operator never edits JSON: each interaction type has its own fields, and
// this file turns those fields into exactly the JSON shape admin-api validates (api/shared/activity_types.py; the
// shared fixtures in contracts/fixtures/activities/ prove the two agree, in both test suites).
//
// Rules this model applies so the operator does not have to:
// - IDs of options (a-f), zones (z1..), bins (b1..), objects (o1..) and tiles (t1..) are given by the editor, never typed.
// - Accepted answers are built in canonical form by the shared canonicaliser (@scd/shared canonicalise, C22.2 rule 7:
//   "computed by the shared TS package in the admin app"). When it refuses (an incomplete answer), the plain form is
//   kept, so the server's validation names the problem; the server is the authority.
// - `visualAssetReferences` lists every picture used, in order of first use, and nothing else (C22.2 rule 4).
// - A two-step activity's own accepted answers are every pair of step answers joined by "|" (C20.3).
// - Fields the editor does not know (a future `introductionContent`, say) are kept as they were, so the server can
//   refuse them by name.
import { canonicalise, decimal, LIMITS, type AnswerSpec, type RawAnswer } from "@scd/shared";
import type { Definition } from "../api";

// --- The editor's kinds: an interaction type, and its mode where it has one ---------------------------------------

export type StepKind =
  | "MULTIPLE_CHOICE"
  | "PICTURE_SELECT"
  | "NUMBER_SELECT"
  | "DISTRIBUTE"
  | "SORT"
  | "LETTERS"
  | "SEQUENCE"
  | "NUMERIC"
  | "WORD";

export type KindInfo = {
  readonly kind: StepKind;
  readonly interactionType: string;
  readonly mode: string | null;
  readonly label: string;
};

export const KINDS: readonly KindInfo[] = [
  { kind: "MULTIPLE_CHOICE", interactionType: "MULTIPLE_CHOICE", mode: null, label: "Multiple choice (words, letters or numbers)" },
  { kind: "PICTURE_SELECT", interactionType: "PICTURE_SELECT", mode: null, label: "Picture select" },
  { kind: "NUMBER_SELECT", interactionType: "NUMBER_SELECT", mode: null, label: "Number select (track or hundred square)" },
  { kind: "DISTRIBUTE", interactionType: "OBJECT_MOVE", mode: "DISTRIBUTE", label: "Object move: share or count" },
  { kind: "SORT", interactionType: "OBJECT_MOVE", mode: "SORT", label: "Object move: sort into groups" },
  { kind: "LETTERS", interactionType: "ARRANGE", mode: "LETTERS", label: "Arrange: letter tiles into a word" },
  { kind: "SEQUENCE", interactionType: "ARRANGE", mode: "SEQUENCE", label: "Arrange: put in order" },
  { kind: "NUMERIC", interactionType: "TYPED", mode: "NUMERIC", label: "Typed: a number" },
  { kind: "WORD", interactionType: "TYPED", mode: "WORD", label: "Typed: a word" },
];

export function kindInfo(kind: StepKind): KindInfo {
  const info = KINDS.find((k) => k.kind === kind);
  if (info === undefined) throw new Error(`unknown kind ${kind}`);
  return info;
}

/** The editor kind of a stored step, or null when its type or mode is not one the editor knows. */
export function kindOf(interactionType: unknown, payload: unknown): StepKind | null {
  const mode = isObject(payload) ? payload.mode : undefined;
  const modes = KINDS.filter((k) => k.interactionType === interactionType);
  if (modes.length === 1) return modes[0]?.kind ?? null;
  return modes.find((k) => k.mode === mode)?.kind ?? modes[0]?.kind ?? null;
}

// --- Each kind's payload, as admin-api checks it (C20.1) -----------------------------------------------------------

export type Picture = { assetId: string; alt: string };
export type TextOption = { id: string; text: string };
export type PictureOption = { id: string; assetId: string; alt: string; caption: string };
export type NumberSet = { kind: "RANGE"; min: number; max: number; step: number } | { kind: "LIST"; values: number[] };
export type Zone = { id: string; label: string; assetId: string };
export type SortObject = { id: string; text: string; assetId: string; alt: string; picture: boolean };
export type Bin = { id: string; label: string };
export type Tile = { id: string; value: string; assetId: string; alt: string };
export type Cue = { assetId: string; alt: string; text: string };

export type StepDraft =
  | { kind: "MULTIPLE_CHOICE"; optionStyle: string; options: TextOption[]; stimulus: Picture | null; answer: string }
  | { kind: "PICTURE_SELECT"; options: PictureOption[]; stimulus: Picture | null; answer: string }
  | { kind: "NUMBER_SELECT"; numberSet: NumberSet; display: "TRACK" | "GRID"; stimulus: Picture | null; answer: string }
  | {
      kind: "DISTRIBUTE";
      object: Picture;
      sourceCount: number;
      zones: Zone[];
      requireAllPlaced: boolean;
      /** zone ID -> how many objects go there, as typed. */
      answer: Record<string, string>;
    }
  | { kind: "SORT"; objects: SortObject[]; bins: Bin[]; /** object ID -> bin ID */ answer: Record<string, string> }
  | { kind: "LETTERS"; tiles: Tile[]; slots: number; cue: Cue | null; /** accepted words */ answer: string[] }
  | { kind: "SEQUENCE"; tiles: Tile[]; orderLabel: string; /** tile IDs in the right order */ answer: string[] }
  | { kind: "NUMERIC"; maxLength: number; stimulus: Picture | null; answer: string }
  | { kind: "WORD"; maxLength: number; cue: Cue | null; /** accepted words */ answer: string[] };

/** The second part of a two-step activity: its own question and its step. */
export type SecondStep = { prompt: string; step: StepDraft };

export type SpeechRef = { variant: string; speechId: string };

/** Everything the operator edits on one activity. */
export type EditorState = {
  title: string;
  subject: string;
  topicId: string;
  rewardCategory: string;
  minAge: number;
  maxAge: number;
  audioRequirement: string;
  reviewNote: string;
  prompt: string;
  /** The first part's own question, two-step activities only. */
  partPrompt: string;
  step: StepDraft;
  second: SecondStep | null;
  speech: SpeechRef[];
};

export const SUBJECTS = ["maths", "phonics", "spelling"] as const;
/** Which between-wave slot may use the activity (C22.1). BOTH: either a normal or a meteor slot; the slot, never the
 * activity, decides the reward (space credits after a normal wave, a power charge after a meteor wave). */
export const REWARD_CATEGORIES = ["BOTH", "NORMAL", "METEOR"] as const;
export const AUDIO_REQUIREMENTS = ["NONE", "OPTIONAL", "REQUIRED"] as const;

/** Plain labels for the codes above, so an operator does not need the plan to choose (the stored value is the code). */
export const REWARD_OPTIONS = [
  { value: "BOTH", label: "Normal or meteor (either slot)" },
  { value: "NORMAL", label: "Normal only (space credits)" },
  { value: "METEOR", label: "Meteor only (charges a power)" },
] as const;
/** The hint under the Reward field: what the chosen value lets the game do (the slot always decides the reward). */
export function rewardHint(category: string): string {
  switch (category) {
    case "NORMAL":
      return "Normal only: the game uses it only after a normal wave, which pays space credits.";
    case "METEOR":
      return "Meteor only: the game uses it only after a meteor wave, which charges a power.";
    default:
      return "Either slot: the game may use it after a normal wave (pays space credits) or a meteor wave (charges a power). The slot decides the reward.";
  }
}
export const AUDIO_OPTIONS = [
  { value: "NONE", label: "No sound" },
  { value: "OPTIONAL", label: "Sound optional" },
  { value: "REQUIRED", label: "Child must press Play first" },
] as const;
export const OPTION_STYLES = ["TEXT", "GRAPHEME", "WORD", "NUMERAL"] as const;
export const AGES: readonly number[] = LIMITS.ageBands;
export const OPTION_IDS = ["a", "b", "c", "d", "e", "f"] as const;

/** C20.1 sizes the editor's add and remove buttons keep to (the server checks them again). */
export const SIZES = {
  options: { min: 4, max: 6 },
  zones: { min: 1, max: 3 },
  sortObjects: { min: 4, max: 8 },
  bins: { min: 2, max: 3 },
  letterTiles: { min: 2, max: 11 },
  letterSlots: { min: 2, max: 8 },
  sequenceTiles: { min: 3, max: 6 },
  acceptedWords: { min: 1, max: 8 },
} as const;

// --- Blank steps for a new activity -------------------------------------------------------------------------------

export function blankStep(kind: StepKind): StepDraft {
  switch (kind) {
    case "MULTIPLE_CHOICE":
      return { kind, optionStyle: "TEXT", options: ["a", "b", "c", "d"].map((id) => ({ id, text: "" })), stimulus: null, answer: "" };
    case "PICTURE_SELECT":
      return { kind, options: ["a", "b", "c", "d"].map((id) => ({ id, assetId: "", alt: "", caption: "" })), stimulus: null, answer: "" };
    case "NUMBER_SELECT":
      return { kind, numberSet: { kind: "RANGE", min: 0, max: 10, step: 1 }, display: "TRACK", stimulus: null, answer: "" };
    case "DISTRIBUTE":
      return {
        kind,
        object: { assetId: "obj-star", alt: "a star" },
        sourceCount: 6,
        zones: [
          { id: "z1", label: "", assetId: "" },
          { id: "z2", label: "", assetId: "" },
        ],
        requireAllPlaced: true,
        answer: {},
      };
    case "SORT":
      return {
        kind,
        objects: ["o1", "o2", "o3", "o4"].map((id) => ({ id, text: "", assetId: "", alt: "", picture: false })),
        bins: [
          { id: "b1", label: "" },
          { id: "b2", label: "" },
        ],
        answer: {},
      };
    case "LETTERS":
      return { kind, tiles: ["t1", "t2", "t3"].map((id) => blankTile(id)), slots: 3, cue: null, answer: [""] };
    case "SEQUENCE":
      return { kind, tiles: ["t1", "t2", "t3"].map((id) => blankTile(id)), orderLabel: "", answer: [] };
    case "NUMERIC":
      return { kind, maxLength: 2, stimulus: null, answer: "" };
    case "WORD":
      return { kind, maxLength: 8, cue: null, answer: [""] };
  }
}

export function blankTile(id: string): Tile {
  return { id, value: "", assetId: "", alt: "" };
}

/** The next free ID in a family: "z" + 1, 2, 3 ... (or the next letter a-f for options). */
export function nextId(prefix: string, taken: readonly string[]): string {
  if (prefix === "") return OPTION_IDS.find((id) => !taken.includes(id)) ?? "f";
  for (let n = 1; ; n += 1) {
    const id = `${prefix}${decimal(n) ?? ""}`;
    if (!taken.includes(id)) return id;
  }
}

// --- Reading a stored definition into the editor ------------------------------------------------------------------

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObject) : []);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function pictureOf(v: unknown): Picture | null {
  return isObject(v) ? { assetId: str(v.assetId), alt: str(v.alt) } : null;
}

function cueOf(v: unknown): Cue | null {
  return isObject(v) ? { assetId: str(v.assetId), alt: str(v.alt), text: str(v.text) } : null;
}

function tilesOf(v: unknown): Tile[] {
  return list(v).map((t) => ({ id: str(t.id), value: str(t.value), assetId: str(t.assetId), alt: str(t.alt) }));
}

/** `a=1;b=2` as {a: "1", b: "2"} (an unreadable answer gives what could be read). */
function pairs(answer: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (answer ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0) result[part.slice(0, at)] = part.slice(at + 1);
  }
  return result;
}

/** One stored step (payload and its own accepted answers) as the editor's fields. */
export function stepOf(kind: StepKind, payloadValue: unknown, accepted: readonly string[]): StepDraft {
  const p = isObject(payloadValue) ? payloadValue : {};
  const first = accepted[0] ?? "";
  switch (kind) {
    case "MULTIPLE_CHOICE":
      return {
        kind,
        optionStyle: str(p.optionStyle) || "TEXT",
        options: list(p.options).map((o) => ({ id: str(o.id), text: str(o.text) })),
        stimulus: pictureOf(p.stimulus),
        answer: first,
      };
    case "PICTURE_SELECT":
      return {
        kind,
        options: list(p.options).map((o) => ({ id: str(o.id), assetId: str(o.assetId), alt: str(o.alt), caption: str(o.caption) })),
        stimulus: pictureOf(p.stimulus),
        answer: first,
      };
    case "NUMBER_SELECT": {
      const set = isObject(p.numberSet) ? p.numberSet : {};
      const numberSet: NumberSet =
        set.kind === "LIST"
          ? { kind: "LIST", values: Array.isArray(set.values) ? set.values.filter((n): n is number => typeof n === "number") : [] }
          : { kind: "RANGE", min: num(set.min, 0), max: num(set.max, 10), step: num(set.step, 1) };
      return { kind, numberSet, display: p.display === "GRID" ? "GRID" : "TRACK", stimulus: pictureOf(p.stimulus), answer: first };
    }
    case "DISTRIBUTE":
      return {
        kind,
        object: { assetId: str(p.objectAssetId), alt: str(p.objectAlt) },
        sourceCount: num(p.sourceCount, 6),
        zones: list(p.zones).map((z) => ({ id: str(z.id), label: str(z.label), assetId: str(z.assetId) })),
        requireAllPlaced: p.requireAllPlaced !== false,
        answer: pairs(first),
      };
    case "SORT":
      return {
        kind,
        objects: list(p.objects).map((o) => ({
          id: str(o.id),
          text: str(o.text),
          assetId: str(o.assetId),
          alt: str(o.alt),
          picture: typeof o.assetId === "string",
        })),
        bins: list(p.bins).map((b) => ({ id: str(b.id), label: str(b.label) })),
        answer: pairs(first),
      };
    case "LETTERS":
      return { kind, tiles: tilesOf(p.tiles), slots: num(p.slots, 3), cue: cueOf(p.cue), answer: accepted.length > 0 ? [...accepted] : [""] };
    case "SEQUENCE": {
      const tiles = tilesOf(p.tiles);
      const used = new Set<string>();
      const order = first === "" ? [] : first.split(",");
      const answer = order.map((value) => {
        const tile = tiles.find((t) => t.value === value && !used.has(t.id));
        if (tile === undefined) return "";
        used.add(tile.id);
        return tile.id;
      });
      return { kind, tiles, orderLabel: str(p.orderLabel), answer };
    }
    case "NUMERIC":
      return { kind, maxLength: num(p.maxLength, 2), stimulus: pictureOf(p.stimulus), answer: first };
    case "WORD":
      return { kind, maxLength: num(p.maxLength, 8), cue: cueOf(p.cue), answer: accepted.length > 0 ? [...accepted] : [""] };
  }
}

function unique(values: readonly string[]): string[] {
  return values.filter((v, i) => values.indexOf(v) === i);
}

/** The editor's fields for a stored draft. A draft with no payload yet (just created) gets the blank step of `kind`. */
export function fromDefinition(definition: Definition, newKind?: StepKind): EditorState {
  const payload = definition.activityPayload;
  const kind = newKind ?? kindOf(definition.interactionType, payload) ?? "MULTIPLE_CHOICE";
  const accepted = strings(definition.answerSpecification?.accepted);
  const steps = Array.isArray(definition.additionalSteps) ? definition.additionalSteps.filter(isObject) : [];
  const raw = steps[0];
  let second: SecondStep | null = null;
  let firsts = accepted;
  if (raw !== undefined) {
    const secondKind = kindOf(raw.interactionType, raw.activityPayload) ?? "NUMERIC";
    const spec = isObject(raw.answerSpecification) ? raw.answerSpecification : {};
    second = {
      prompt: isObject(raw.prompt) ? str(raw.prompt.text) : "",
      step: stepOf(secondKind, raw.activityPayload, strings(spec.accepted)),
    };
    firsts = unique(accepted.map((a) => a.split(LIMITS.answer.stepJoiner)[0] ?? ""));
  }
  const refs = isObject(definition.speechDefinitionReferences) ? definition.speechDefinitionReferences : {};
  return {
    title: str(definition.title),
    subject: str(definition.subject),
    topicId: str(definition.topicId),
    rewardCategory: str(definition.rewardCategory) || "NORMAL",
    minAge: num(definition.minAge, 5),
    maxAge: num(definition.maxAge, 5),
    audioRequirement: str(definition.audioRequirement) || "NONE",
    reviewNote: str(definition.reviewNote),
    prompt: str(definition.prompt?.text),
    partPrompt: isObject(payload) ? str(payload.partPrompt) : "",
    step: payload === undefined ? blankStep(kind) : stepOf(kind, payload, firsts),
    second,
    speech: Object.entries(refs).map(([variant, ref]) => ({ variant, speechId: isObject(ref) ? str(ref.speechId) : "" })),
  };
}

// --- Building the definition -------------------------------------------------------------------------------------

/** Fields whose value an optional input left empty: dropped, so the server sees "absent", not "". */
function withText<T extends Json>(target: T, name: string, value: string): T {
  return value.trim() === "" ? target : { ...target, [name]: value.trim() };
}

function pictureJson(picture: Picture): Json {
  return { assetId: picture.assetId, alt: picture.alt.trim() };
}

function cueJson(cue: Cue): Json {
  let out: Json = {};
  if (cue.assetId !== "") out = { assetId: cue.assetId, alt: cue.alt.trim() };
  return withText(out, "text", cue.text);
}

function tileJson(tile: Tile): Json {
  const out: Json = { id: tile.id, value: tile.value.trim() };
  return tile.assetId === "" ? out : { ...out, assetId: tile.assetId, alt: tile.alt.trim() };
}

/** The step's payload, as stored (C20.1). */
export function payloadOf(step: StepDraft): Json {
  const stimulus = (picture: Picture | null): Json => (picture === null ? {} : { stimulus: pictureJson(picture) });
  switch (step.kind) {
    case "MULTIPLE_CHOICE":
      return { optionStyle: step.optionStyle, options: step.options.map((o) => ({ id: o.id, text: o.text.trim() })), ...stimulus(step.stimulus) };
    case "PICTURE_SELECT":
      return {
        layout: "GRID",
        options: step.options.map((o) => withText({ id: o.id, assetId: o.assetId, alt: o.alt.trim() }, "caption", o.caption)),
        ...stimulus(step.stimulus),
      };
    case "NUMBER_SELECT":
      return { numberSet: { ...step.numberSet }, display: step.display, ...stimulus(step.stimulus) };
    case "DISTRIBUTE":
      return {
        mode: "DISTRIBUTE",
        objectAssetId: step.object.assetId,
        objectAlt: step.object.alt.trim(),
        sourceCount: step.sourceCount,
        zones: step.zones.map((z) => {
          const zone: Json = { id: z.id, label: z.label.trim() };
          return z.assetId === "" ? zone : { ...zone, assetId: z.assetId };
        }),
        requireAllPlaced: step.requireAllPlaced,
      };
    case "SORT":
      return {
        mode: "SORT",
        objects: step.objects.map((o) =>
          // A word's accessible name is the word itself; a picture needs its own alt text.
          o.picture ? { id: o.id, assetId: o.assetId, alt: o.alt.trim() } : { id: o.id, text: o.text.trim(), alt: o.text.trim() },
        ),
        bins: step.bins.map((b) => ({ id: b.id, label: b.label.trim() })),
      };
    case "LETTERS":
      return { mode: "LETTERS", tiles: step.tiles.map(tileJson), slots: step.slots, ...(step.cue === null ? {} : { cue: cueJson(step.cue) }) };
    case "SEQUENCE":
      return { mode: "SEQUENCE", tiles: step.tiles.map(tileJson), slots: step.tiles.length, orderLabel: step.orderLabel.trim() };
    case "NUMERIC":
      return { mode: "NUMERIC", maxLength: step.maxLength, ...stimulus(step.stimulus) };
    case "WORD":
      return { mode: "WORD", maxLength: step.maxLength, ...(step.cue === null ? {} : { cue: cueJson(step.cue) }) };
  }
}

/** What the canonicaliser needs to know about a step (the same spec the child's panel uses). */
export function specOf(step: StepDraft): AnswerSpec {
  switch (step.kind) {
    case "MULTIPLE_CHOICE":
    case "PICTURE_SELECT":
      return { interactionType: step.kind, optionIds: step.options.map((o) => o.id) };
    case "NUMBER_SELECT":
      return { interactionType: "NUMBER_SELECT", values: numberValues(step.numberSet) };
    case "DISTRIBUTE":
      return { interactionType: "OBJECT_MOVE", mode: "DISTRIBUTE", zoneIds: step.zones.map((z) => z.id), sourceCount: step.sourceCount, requireAllPlaced: step.requireAllPlaced };
    case "SORT":
      return { interactionType: "OBJECT_MOVE", mode: "SORT", objectIds: step.objects.map((o) => o.id), binIds: step.bins.map((b) => b.id) };
    case "LETTERS":
      return { interactionType: "ARRANGE", mode: "LETTERS", tiles: step.tiles.map((t) => ({ id: t.id, value: t.value.trim() })), slots: step.slots };
    case "SEQUENCE":
      return { interactionType: "ARRANGE", mode: "SEQUENCE", tiles: step.tiles.map((t) => ({ id: t.id, value: t.value.trim() })), slots: step.tiles.length };
    case "NUMERIC":
      return { interactionType: "TYPED", mode: "NUMERIC", maxLength: step.maxLength };
    case "WORD":
      return { interactionType: "TYPED", mode: "WORD", maxLength: step.maxLength };
  }
}

/** The numbers of a number set, for the answer picker (an empty list for a set the server will refuse). */
export function numberValues(set: NumberSet): number[] {
  if (set.kind === "LIST") return set.values.filter((n) => Number.isSafeInteger(n) && n >= 0 && n <= 100);
  const { min, max, step } = set;
  if (![min, max, step].every(Number.isSafeInteger) || step < 1 || min < 0 || max > 100 || min > max) return [];
  const values: number[] = [];
  for (let n = min; n <= max; n += step) values.push(n);
  return values;
}

/** One accepted answer: the canonicaliser's form, or the plain form when it refuses (the server then says why). */
type Built = { readonly answer: string; readonly canonical: boolean };

function build(spec: AnswerSpec, raw: RawAnswer, plain: string): Built {
  const result = canonicalise(spec, raw);
  return result.ok ? { answer: result.answer, canonical: true } : { answer: plain, canonical: false };
}

/** The step's accepted answers, each with whether the canonicaliser accepted the operator's input as it is. */
export function acceptedOf(step: StepDraft): Built[] {
  const spec = specOf(step);
  switch (step.kind) {
    case "MULTIPLE_CHOICE":
    case "PICTURE_SELECT":
    case "NUMBER_SELECT":
    case "NUMERIC":
      return step.answer === "" ? [] : [build(spec, step.answer, step.answer)];
    case "DISTRIBUTE": {
      const counts: Record<string, number | null> = {};
      const plain: string[] = [];
      for (const zone of [...step.zones].sort((a, b) => (a.id < b.id ? -1 : 1))) {
        const typed = (step.answer[zone.id] ?? "").trim();
        counts[zone.id] = /^[0-9]{1,2}$/u.test(typed) ? Number.parseInt(typed, 10) : null;
        plain.push(`${zone.id}=${typed}`);
      }
      return [build(spec, counts, plain.join(";"))];
    }
    case "SORT": {
      const placed: Record<string, string | null> = {};
      const plain: string[] = [];
      for (const object of [...step.objects].sort((a, b) => (a.id < b.id ? -1 : 1))) {
        placed[object.id] = step.answer[object.id] ?? null;
        plain.push(`${object.id}=${step.answer[object.id] ?? ""}`);
      }
      return [build(spec, placed, plain.join(";"))];
    }
    case "LETTERS":
    case "WORD":
      return step.answer
        .map((word) => word.trim())
        .filter((word) => word !== "")
        .map((word) => (step.kind === "WORD" ? build(spec, word, word) : { answer: word, canonical: true }));
    case "SEQUENCE": {
      if (step.answer.length === 0) return [];
      const values = step.answer.map((id) => step.tiles.find((t) => t.id === id)?.value.trim() ?? "");
      return [build(spec, step.answer, values.join(","))];
    }
  }
}

/** The pictures a step uses, in order. */
function stepAssets(step: StepDraft): string[] {
  const out: string[] = [];
  const add = (id: string) => {
    if (id !== "") out.push(id);
  };
  const stimulus = "stimulus" in step ? step.stimulus : null;
  switch (step.kind) {
    case "PICTURE_SELECT":
      step.options.forEach((o) => add(o.assetId));
      break;
    case "DISTRIBUTE":
      add(step.object.assetId);
      step.zones.forEach((z) => add(z.assetId));
      break;
    case "SORT":
      step.objects.forEach((o) => {
        if (o.picture) add(o.assetId);
      });
      break;
    case "LETTERS":
    case "SEQUENCE":
      step.tiles.forEach((t) => add(t.assetId));
      break;
    default:
      break;
  }
  if (stimulus !== null) add(stimulus.assetId);
  if ((step.kind === "LETTERS" || step.kind === "WORD") && step.cue !== null) add(step.cue.assetId);
  return out;
}

/**
 * The fields this editor writes. Anything else in a stored draft is kept untouched, except the three the editor no
 * longer shows: curriculumReference (publish copies the topic's curriculum list from the registry, plan C19),
 * curriculumNote and source. The server still accepts them, so older drafts stay valid, but a save removes them.
 */
export const LEGACY_FIELDS = ["curriculumReference", "curriculumNote", "source"] as const;

/** The legacy fields (above) a stored draft still has. A save removes them, so the editor offers Save while any remain. */
export function legacyFields(definition: Definition): string[] {
  return LEGACY_FIELDS.filter((name) => Object.hasOwn(definition, name));
}

const MANAGED = [
  "title",
  "subject",
  "topicId",
  "rewardCategory",
  "interactionType",
  "minAge",
  "maxAge",
  "audioRequirement",
  ...LEGACY_FIELDS,
  "reviewNote",
  "prompt",
  "activityPayload",
  "answerSpecification",
  "additionalSteps",
  "speechDefinitionReferences",
  "visualAssetReferences",
];

/** The draft definition for `state`, on top of the stored `base` (its activityId, authoringMode, schemaVersion). */
export function toDefinition(base: Definition, state: EditorState): Definition {
  const kept: Json = {};
  for (const [name, value] of Object.entries(base)) if (!MANAGED.includes(name)) kept[name] = value;
  const info = kindInfo(state.step.kind);
  const firsts = acceptedOf(state.step).map((b) => b.answer);
  let payload = payloadOf(state.step);
  let accepted = firsts;
  let additional: Json = {};
  if (state.second !== null) {
    const second = state.second;
    const seconds = acceptedOf(second.step).map((b) => b.answer);
    payload = withText(payload, "partPrompt", state.partPrompt);
    accepted = firsts.flatMap((a) => seconds.map((b) => `${a}${LIMITS.answer.stepJoiner}${b}`));
    additional = {
      additionalSteps: [
        {
          interactionType: kindInfo(second.step.kind).interactionType,
          ...(second.prompt.trim() === "" ? {} : { prompt: { text: second.prompt.trim() } }),
          activityPayload: payloadOf(second.step),
          answerSpecification: { accepted: seconds },
        },
      ],
    };
  }
  const assets = unique([...stepAssets(state.step), ...(state.second === null ? [] : stepAssets(state.second.step))]);
  const speech: Record<string, { speechId: string }> = {};
  for (const ref of state.speech) if (ref.variant !== "" && ref.speechId !== "") speech[ref.variant] = { speechId: ref.speechId };
  let definition: Json = {
    ...kept,
    schemaVersion: base.schemaVersion ?? 1,
    activityId: base.activityId,
    title: state.title.trim(),
    subject: state.subject,
    topicId: state.topicId.trim(),
    rewardCategory: state.rewardCategory,
    interactionType: info.interactionType,
    authoringMode: base.authoringMode,
    minAge: state.minAge,
    maxAge: state.maxAge,
    audioRequirement: state.audioRequirement,
    prompt: { text: state.prompt.trim() },
    activityPayload: payload,
    ...additional,
    answerSpecification: { accepted },
    speechDefinitionReferences: speech,
  };
  definition = withText(definition, "reviewNote", state.reviewNote);
  if (assets.length > 0) definition.visualAssetReferences = assets;
  return definition as Definition;
}

// --- Speech variants the operator may attach (C21) -----------------------------------------------------------------

/** The clip variants that fit the activity: prompt, instruction, answer, one per option, one per sorting bin. */
export function speechVariants(state: EditorState): string[] {
  const variants = ["prompt", "instruction", "answer"];
  for (const step of [state.step, state.second?.step]) {
    if (step === undefined) continue;
    if (step.kind === "MULTIPLE_CHOICE" || step.kind === "PICTURE_SELECT") variants.push(...step.options.map((o) => `option-${o.id}`));
    if (step.kind === "SORT") variants.push(...step.bins.map((b) => `bin-${b.id}`));
  }
  return unique(variants);
}

/** A stable comparison of two definitions (key order does not matter), for "unsaved changes". */
export function sameDefinition(a: Definition, b: Definition): boolean {
  return stableJson(a) === stableJson(b);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
