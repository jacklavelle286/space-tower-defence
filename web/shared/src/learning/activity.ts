// What the learning panel shows for one activity, and how a pack entry (G R10) or, later, the admin preview-solve
// (Phase 39) turns into it. One parser per interaction type; anything the panel cannot show safely gives null, and
// the caller shows its "cannot show this one" card instead of a broken question.
//
// Payloads follow C20.1 (field names as admin-api's publish validation, api/shared/activity_types.py). Rules the client
// enforces as well as publish validation, so a bad pack entry never reaches a child as an unfair question (D-8: four
// to six choices keep "three wrong = no reward" a real outcome):
// - choice types (MULTIPLE_CHOICE, PICTURE_SELECT): 4-6 options, IDs unique, every option in the presentation order;
// - every picture resolves to a file and has alt text;
// - NUMBER_SELECT: whole numbers 0-100, no repeats, at most 101 of them;
// - OBJECT_MOVE: DISTRIBUTE 2-12 objects and 1-3 zones; SORT 4-8 objects and 2-3 bins; IDs unique;
// - ARRANGE: LETTERS 2-8 spaces and between `slots` and `slots + 3` tiles; SEQUENCE 3-6 tiles, one space each;
// - TYPED: NUMERIC up to 1-3 digits, WORD 2-12 characters;
// - two-step (C20.3): exactly one additional step, and every accepted answer has one part per step.
// Tiles and objects are shown in their stored order: publish validation makes sure the stored order of tiles does not
// already spell the answer (C20.1), so it is not shuffled again here.
import { decimal, splitSteps, type AnswerSpec, type InteractionType, type RawAnswer } from "./canonical";

/** D-8 (C20.1): choice activities have four to six options. */
export const CHOICE_OPTIONS = { min: 4, max: 6 } as const;
/** C20.1: numbers 0-100; a track holds at most 21 (more are shown as a hundred square). */
export const NUMBER_SELECT_LIMITS = { min: 0, max: 100, maxCount: 101, trackMax: 21 } as const;
/** C20.1 limits of the Phase 38 types (the same numbers as publish validation). */
export const STEP_LIMITS = {
  sourceCount: { min: 2, max: 12 },
  zones: { min: 1, max: 3 },
  sortObjects: { min: 4, max: 8 },
  bins: { min: 2, max: 3 },
  letterSlots: { min: 2, max: 8 },
  letterExtraTiles: 3,
  sequenceTiles: { min: 3, max: 6 },
  numericMaxLength: { min: 1, max: 3 },
  wordMaxLength: { min: 2, max: 12 },
} as const;

export interface PanelOption {
  readonly id: string;
  readonly text: string;
}

export interface PanelPicture {
  readonly id: string;
  /** Where the browser loads the picture from (resolved from the asset ID by the app). */
  readonly imageUrl: string;
  /** The picture's alt text: its accessible name, and the words in "The answer was …". */
  readonly alt: string;
  readonly caption?: string;
}

/** A picture shown with the question (a dice face, a set of objects to count). [ASSUMPTION] shape: {assetId, alt}. */
export interface PanelStimulus {
  readonly imageUrl: string;
  readonly alt: string;
}

/** ARRANGE LETTERS and TYPED WORD: the cue that says which word (C20.1): a picture with alt text and/or rule text. */
export interface PanelCue {
  readonly imageUrl?: string;
  readonly alt?: string;
  readonly text?: string;
}

/** A zone of OBJECT_MOVE DISTRIBUTE ("Nova", "Pip"), with an optional picture. */
export interface PanelZone {
  readonly id: string;
  readonly label: string;
  readonly imageUrl?: string;
}

/** An object of OBJECT_MOVE SORT: a word or a picture, and its alt text (its accessible name). */
export interface PanelSortObject {
  readonly id: string;
  readonly alt: string;
  readonly text?: string;
  readonly imageUrl?: string;
}

export interface PanelBin {
  readonly id: string;
  readonly label: string;
}

/** An ARRANGE tile. `value` is what the answer is made of; `text` is what the tile shows (the value unless authored). */
export interface PanelTile {
  readonly id: string;
  readonly value: string;
  readonly text: string;
  readonly imageUrl?: string;
  readonly alt?: string;
}

export interface MultipleChoiceFields {
  readonly interactionType: "MULTIPLE_CHOICE";
  /** In presentation order. */
  readonly options: readonly PanelOption[];
}

export interface PictureSelectFields {
  readonly interactionType: "PICTURE_SELECT";
  /** In presentation order. */
  readonly options: readonly PanelPicture[];
}

export interface NumberSelectFields {
  readonly interactionType: "NUMBER_SELECT";
  readonly numbers: readonly number[];
  /** TRACK: one line of numbers (wraps on a narrow screen). GRID: a hundred square, rows of ten. */
  readonly display: "TRACK" | "GRID";
}

export interface DistributeFields {
  readonly interactionType: "OBJECT_MOVE";
  readonly mode: "DISTRIBUTE";
  /** The one kind of object in the tray (a star), `sourceCount` of them. */
  readonly object: PanelStimulus;
  readonly sourceCount: number;
  readonly zones: readonly PanelZone[];
  readonly requireAllPlaced: boolean;
}

export interface SortFields {
  readonly interactionType: "OBJECT_MOVE";
  readonly mode: "SORT";
  readonly objects: readonly PanelSortObject[];
  readonly bins: readonly PanelBin[];
}

export interface ArrangeFields {
  readonly interactionType: "ARRANGE";
  readonly mode: "LETTERS" | "SEQUENCE";
  /** In stored order. */
  readonly tiles: readonly PanelTile[];
  readonly slots: number;
  readonly cue?: PanelCue;
  /** SEQUENCE: "smallest first". */
  readonly orderLabel?: string;
}

export interface TypedFields {
  readonly interactionType: "TYPED";
  readonly mode: "NUMERIC" | "WORD";
  readonly maxLength: number;
  readonly caseSensitive: boolean;
  readonly cue?: PanelCue;
}

/** What one step of an activity asks for: the interaction type and its payload, ready to show. */
export type StepFields = MultipleChoiceFields | PictureSelectFields | NumberSelectFields | DistributeFields | SortFields | ArrangeFields | TypedFields;

/** One step as the panel shows it: its fields, its own accepted answers, and its part prompt and picture, if any. */
export type PanelStep = StepFields & {
  readonly accepted: readonly string[];
  /** The part's own question in a two-step activity ("5 × 6 = ?"). */
  readonly prompt?: string;
  readonly stimulus?: PanelStimulus;
};

export interface PanelActivityBase {
  readonly slotId: string;
  readonly prompt: string;
  /** Accepted canonical answers of the whole activity (two steps: joined by "|"), for "The answer was …" once the
   * activity has ended (never shown before). */
  readonly accepted: readonly string[];
  /** Phonics: the answer area waits for the sound, and Check asks for Play first (D6.2, D6.5). */
  readonly audioRequired: boolean;
  readonly reward: { readonly credits: number; readonly powerName?: string };
  readonly stimulus?: PanelStimulus;
  /** Two-step activities (C20.3): the first part's own question, from the payload's `partPrompt`. */
  readonly partPrompt?: string;
  /** Two-step activities (C20.3): the second part. The first part is the activity's own fields. */
  readonly additionalStep?: PanelStep;
}

export type MultipleChoiceActivity = PanelActivityBase & MultipleChoiceFields;
export type PictureSelectActivity = PanelActivityBase & PictureSelectFields;
export type NumberSelectActivity = PanelActivityBase & NumberSelectFields;
export type DistributeActivity = PanelActivityBase & DistributeFields;
export type SortActivity = PanelActivityBase & SortFields;
export type ArrangeActivity = PanelActivityBase & ArrangeFields;
export type TypedActivity = PanelActivityBase & TypedFields;

/** What the panel shows for one slot. Options are already in presentation order. */
export type PanelActivity = PanelActivityBase & StepFields;

/** The interaction types this client can show. Pack entries of any other type give null. */
export const PANEL_TYPES: readonly InteractionType[] = ["MULTIPLE_CHOICE", "PICTURE_SELECT", "NUMBER_SELECT", "OBJECT_MOVE", "ARRANGE", "TYPED"];

/** The "choose one" types: options are greyed once tried, and a wrong choice is cleared (D6.2, D-8). */
export function isChoiceStep(step: StepFields): step is MultipleChoiceFields | PictureSelectFields | NumberSelectFields {
  return step.interactionType === "MULTIPLE_CHOICE" || step.interactionType === "PICTURE_SELECT" || step.interactionType === "NUMBER_SELECT";
}

function unique(list: readonly string[]): string[] {
  return list.filter((v, i) => list.indexOf(v) === i);
}

/**
 * The activity's steps: one, or two for a two-step activity (C20.3). Each step carries its own accepted answers: for a
 * two-step activity, the parts of the joined accepted answers ("c|30" -> "c" for the first step, "30" for the second).
 */
export function panelSteps(activity: PanelActivity): PanelStep[] {
  const { slotId: _slotId, prompt: _prompt, accepted, audioRequired: _audio, reward: _reward, stimulus, partPrompt, additionalStep, ...fields } = activity;
  const first = { ...(fields as StepFields), ...(stimulus !== undefined ? { stimulus } : {}) };
  if (additionalStep === undefined) return [{ ...first, accepted } as PanelStep];
  const parts = accepted.map((a) => splitSteps(a, 2)).filter((p): p is string[] => p !== null);
  return [
    { ...first, accepted: unique(parts.map((p) => p[0] ?? "")), ...(partPrompt !== undefined ? { prompt: partPrompt } : {}) } as PanelStep,
    { ...additionalStep, accepted: unique(parts.map((p) => p[1] ?? "")) },
  ];
}

/** The canonicaliser's view of one step. */
export function answerSpecOf(step: StepFields): AnswerSpec {
  switch (step.interactionType) {
    case "MULTIPLE_CHOICE":
    case "PICTURE_SELECT":
      return { interactionType: step.interactionType, optionIds: step.options.map((o) => o.id) };
    case "NUMBER_SELECT":
      return { interactionType: "NUMBER_SELECT", values: step.numbers };
    case "OBJECT_MOVE":
      return step.mode === "DISTRIBUTE"
        ? { interactionType: "OBJECT_MOVE", mode: "DISTRIBUTE", zoneIds: step.zones.map((z) => z.id), sourceCount: step.sourceCount, requireAllPlaced: step.requireAllPlaced }
        : { interactionType: "OBJECT_MOVE", mode: "SORT", objectIds: step.objects.map((o) => o.id), binIds: step.bins.map((b) => b.id) };
    case "ARRANGE":
      return { interactionType: "ARRANGE", mode: step.mode, tiles: step.tiles.map((t) => ({ id: t.id, value: t.value })), slots: step.slots };
    case "TYPED":
      return { interactionType: "TYPED", mode: step.mode, maxLength: step.maxLength, caseSensitive: step.caseSensitive };
  }
}

/** A step before anything is chosen, placed or typed. */
export function emptyAnswer(step: StepFields): RawAnswer {
  switch (step.interactionType) {
    case "OBJECT_MOVE":
      return {};
    case "ARRANGE":
      return Array.from({ length: step.slots }, () => null);
    default:
      return null;
  }
}

/** `a=1;b=2` as [["a", "1"], ["b", "2"]], or null when it is not that form. */
function pairs(answer: string): [string, string][] | null {
  const result: [string, string][] = [];
  for (const part of answer.split(";")) {
    const at = part.indexOf("=");
    if (at <= 0 || at === part.length - 1) return null;
    result.push([part.slice(0, at), part.slice(at + 1)]);
  }
  return result;
}

const DIGITS = "0123456789";
function wholeNumber(text: string): number | null {
  if (text === "") return null;
  let n = 0;
  for (const character of text) {
    const digit = DIGITS.indexOf(character);
    if (digit === -1) return null;
    n = n * 10 + digit;
  }
  return n;
}

/** LETTERS: which tiles spell `word` in exactly `slots` tiles (each tile once), or null. */
function spell(word: string, tiles: readonly PanelTile[], slots: number): string[] | null {
  const used = new Set<string>();
  const ids: string[] = [];
  const build = (rest: string): boolean => {
    if (ids.length === slots) return rest === "";
    for (const tile of tiles) {
      if (used.has(tile.id) || tile.value === "" || !rest.startsWith(tile.value)) continue;
      used.add(tile.id);
      ids.push(tile.id);
      if (build(rest.slice(tile.value.length))) return true;
      ids.pop();
      used.delete(tile.id);
    }
    return false;
  };
  return build(word) ? ids : null;
}

/**
 * The raw answer that gives a recorded canonical step answer, so a refresh shows a locked right part, and an arrangement
 * or typed answer "stays" after a wrong try (D6.3), exactly as recorded (spine S3.7). Null when it cannot be rebuilt.
 */
export function restoreAnswer(step: StepFields, answer: string): RawAnswer {
  switch (step.interactionType) {
    case "MULTIPLE_CHOICE":
    case "PICTURE_SELECT":
      return step.options.some((o) => o.id === answer) ? answer : null;
    case "NUMBER_SELECT":
    case "TYPED":
      return answer;
    case "OBJECT_MOVE": {
      const list = pairs(answer);
      if (list === null) return null;
      if (step.mode === "SORT") return Object.fromEntries(list);
      const counts: Record<string, number> = {};
      for (const [zone, count] of list) {
        const n = wholeNumber(count);
        if (n === null) return null;
        counts[zone] = n;
      }
      return counts;
    }
    case "ARRANGE": {
      if (step.mode === "LETTERS") return spell(answer, step.tiles, step.slots);
      const used = new Set<string>();
      const ids: string[] = [];
      for (const value of answer.split(",")) {
        const tile = step.tiles.find((t) => t.value === value && !used.has(t.id));
        if (tile === undefined) return null;
        used.add(tile.id);
        ids.push(tile.id);
      }
      return ids.length === step.slots ? ids : null;
    }
  }
}

/** The fields of a pack entry (or a draft) the panel needs. Everything else in the entry is ignored. */
export interface ActivitySource {
  readonly slotId: string;
  readonly interactionType?: string;
  readonly prompt?: { readonly text?: string };
  readonly activityPayload?: unknown;
  readonly answerSpecification?: { readonly accepted?: readonly string[]; readonly caseSensitive?: boolean };
  /** C20.3: at most one `{interactionType, prompt?, activityPayload, answerSpecification}`. */
  readonly additionalSteps?: readonly unknown[];
  /** Fixed at run creation (C24.4 step 7): the option order for the choice types, the tile order for ARRANGE. */
  readonly presentation?: { readonly optionOrder?: readonly string[]; readonly tileOrder?: readonly string[] };
  readonly audioRequired: boolean;
  readonly reward: { readonly credits: number; readonly powerName?: string };
}

/** Turns an asset ID into the URL the browser loads, or null when this app has no such picture. */
export type AssetResolver = (assetId: string) => string | null;

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v !== "";
const isWhole = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);
const within = (n: unknown, range: { readonly min: number; readonly max: number }): n is number => isWhole(n) && n >= range.min && n <= range.max;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? (v as unknown[]) : []);
const distinctIds = (items: readonly { id: string }[]) => new Set(items.map((i) => i.id)).size === items.length;

/**
 * The numbers of a NUMBER_SELECT activity, in display order, or null when the set is not valid (C20.1):
 * `{kind: "RANGE", min, max, step}` (step divides the range evenly) or `{kind: "LIST", values}`; whole numbers
 * 0-100, no repeats, at most 101.
 */
export function numberSetValues(numberSet: unknown): number[] | null {
  if (!isObject(numberSet)) return null;
  const { min, max } = NUMBER_SELECT_LIMITS;
  let values: number[];
  if (numberSet.kind === "RANGE") {
    const { min: low, max: high, step } = numberSet;
    if (!isWhole(low) || !isWhole(high) || !isWhole(step) || step < 1 || low < min || high > max || low > high) return null;
    if ((high - low) % step !== 0) return null;
    values = [];
    for (let n = low; n <= high; n += step) values.push(n);
  } else if (numberSet.kind === "LIST") {
    if (!Array.isArray(numberSet.values)) return null;
    values = [];
    for (const n of numberSet.values as unknown[]) {
      if (!isWhole(n) || n < min || n > max || values.includes(n)) return null;
      values.push(n);
    }
  } else {
    return null;
  }
  return values.length >= 1 && values.length <= NUMBER_SELECT_LIMITS.maxCount ? values : null;
}

/** Options in the slot's presentation order (fixed when the run was created), checked for D-8. */
function ordered<T extends { id: string }>(options: readonly T[], order: readonly string[] | undefined): T[] | null {
  if (options.length < CHOICE_OPTIONS.min || options.length > CHOICE_OPTIONS.max) return null;
  const byId = new Map(options.map((o) => [o.id, o]));
  if (byId.size !== options.length) return null;
  const ids = order ?? options.map((o) => o.id);
  const result = ids.flatMap((id) => {
    const o = byId.get(id);
    return o === undefined ? [] : [o];
  });
  return result.length === options.length && new Set(ids).size === ids.length ? result : null;
}

/** A picture `{assetId, alt}`: undefined when absent, null when broken (no file, no alt text). */
function picture(value: unknown, resolve: AssetResolver): PanelStimulus | undefined | null {
  if (value === undefined) return undefined;
  if (!isObject(value) || !isText(value.assetId) || !isText(value.alt)) return null;
  const imageUrl = resolve(value.assetId);
  return imageUrl === null ? null : { imageUrl, alt: value.alt };
}

/** A cue `{assetId?, alt?, text?}`: a picture needs alt text; at least one of picture and text. */
function cueOf(value: unknown, resolve: AssetResolver): PanelCue | undefined | null {
  if (value === undefined) return undefined;
  if (!isObject(value)) return null;
  const text = isText(value.text) ? value.text : undefined;
  if (value.assetId === undefined) return text === undefined ? null : { text };
  const shown = picture({ assetId: value.assetId, alt: value.alt }, resolve);
  if (shown === undefined || shown === null) return null;
  return { ...shown, ...(text !== undefined ? { text } : {}) };
}

function parseOptions(options: unknown[], order: readonly string[] | undefined): PanelOption[] | null {
  const parsed: PanelOption[] = [];
  for (const o of options) {
    if (!isObject(o) || !isText(o.id) || !isText(o.text)) return null;
    parsed.push({ id: o.id, text: o.text });
  }
  return ordered(parsed, order);
}

function parsePictures(options: unknown[], order: readonly string[] | undefined, resolve: AssetResolver): PanelPicture[] | null {
  const parsed: PanelPicture[] = [];
  for (const o of options) {
    if (!isObject(o) || !isText(o.id) || !isText(o.assetId) || !isText(o.alt)) return null;
    const imageUrl = resolve(o.assetId);
    if (imageUrl === null) return null;
    parsed.push({ id: o.id, imageUrl, alt: o.alt, ...(isText(o.caption) ? { caption: o.caption } : {}) });
  }
  return ordered(parsed, order);
}

function parseDistribute(payload: Json, resolve: AssetResolver): DistributeFields | null {
  const object = picture({ assetId: payload.objectAssetId, alt: payload.objectAlt }, resolve);
  if (!object || !within(payload.sourceCount, STEP_LIMITS.sourceCount) || typeof payload.requireAllPlaced !== "boolean") return null;
  const zones: PanelZone[] = [];
  for (const z of list(payload.zones)) {
    if (!isObject(z) || !isText(z.id) || !isText(z.label)) return null;
    let imageUrl: string | undefined;
    if (z.assetId !== undefined) {
      const url = isText(z.assetId) ? resolve(z.assetId) : null;
      if (url === null) return null;
      imageUrl = url;
    }
    zones.push({ id: z.id, label: z.label, ...(imageUrl !== undefined ? { imageUrl } : {}) });
  }
  if (!within(zones.length, STEP_LIMITS.zones) || !distinctIds(zones)) return null;
  return { interactionType: "OBJECT_MOVE", mode: "DISTRIBUTE", object, sourceCount: payload.sourceCount, zones, requireAllPlaced: payload.requireAllPlaced };
}

function parseSort(payload: Json, resolve: AssetResolver): SortFields | null {
  const objects: PanelSortObject[] = [];
  for (const o of list(payload.objects)) {
    if (!isObject(o) || !isText(o.id) || !isText(o.alt)) return null;
    if (isText(o.text) === isText(o.assetId)) return null; // a word or a picture, not both (C20.1)
    if (isText(o.text)) {
      objects.push({ id: o.id, alt: o.alt, text: o.text });
    } else {
      const imageUrl = resolve(o.assetId as string);
      if (imageUrl === null) return null;
      objects.push({ id: o.id, alt: o.alt, imageUrl });
    }
  }
  const bins: PanelBin[] = [];
  for (const b of list(payload.bins)) {
    if (!isObject(b) || !isText(b.id) || !isText(b.label)) return null;
    bins.push({ id: b.id, label: b.label });
  }
  if (!within(objects.length, STEP_LIMITS.sortObjects) || !within(bins.length, STEP_LIMITS.bins)) return null;
  if (!distinctIds(objects) || !distinctIds(bins)) return null;
  return { interactionType: "OBJECT_MOVE", mode: "SORT", objects, bins };
}

function parseArrange(payload: Json, mode: "LETTERS" | "SEQUENCE", tileOrder: readonly string[] | undefined, resolve: AssetResolver): ArrangeFields | null {
  const stored: PanelTile[] = [];
  for (const t of list(payload.tiles)) {
    if (!isObject(t) || !isText(t.id) || !isText(t.value)) return null;
    let image: PanelStimulus | undefined;
    if (t.assetId !== undefined) {
      const shown = picture({ assetId: t.assetId, alt: t.alt }, resolve);
      if (!shown) return null;
      image = shown;
    }
    stored.push({
      id: t.id,
      value: t.value,
      text: isText(t.text) ? t.text : t.value,
      ...(image !== undefined ? { imageUrl: image.imageUrl, alt: image.alt } : {}),
    });
  }
  if (!distinctIds(stored) || !isWhole(payload.slots)) return null;
  // The run's tile order, when the slot carries one, must name every tile once; without one the stored order is shown.
  const byId = new Map(stored.map((t) => [t.id, t]));
  const tiles = tileOrder === undefined ? stored : tileOrder.flatMap((id) => byId.get(id) ?? []);
  if (tiles.length !== stored.length || new Set(tiles.map((t) => t.id)).size !== stored.length) return null;
  const slots = payload.slots;
  if (mode === "LETTERS") {
    if (!within(slots, STEP_LIMITS.letterSlots) || tiles.length < slots || tiles.length > slots + STEP_LIMITS.letterExtraTiles) return null;
  } else if (!within(tiles.length, STEP_LIMITS.sequenceTiles) || slots !== tiles.length) {
    return null;
  }
  const cue = cueOf(payload.cue, resolve);
  if (cue === null) return null;
  return {
    interactionType: "ARRANGE",
    mode,
    tiles,
    slots,
    ...(cue !== undefined ? { cue } : {}),
    ...(isText(payload.orderLabel) ? { orderLabel: payload.orderLabel } : {}),
  };
}

function parseTyped(payload: Json, mode: "NUMERIC" | "WORD", caseSensitive: boolean, resolve: AssetResolver): TypedFields | null {
  const range = mode === "NUMERIC" ? STEP_LIMITS.numericMaxLength : STEP_LIMITS.wordMaxLength;
  if (!within(payload.maxLength, range)) return null;
  const cue = cueOf(payload.cue, resolve);
  if (cue === null) return null;
  return { interactionType: "TYPED", mode, maxLength: payload.maxLength, caseSensitive: mode === "WORD" && caseSensitive, ...(cue !== undefined ? { cue } : {}) };
}

/** One step's fields and question picture, or null when the step cannot be shown. */
function parseStep(
  interactionType: unknown,
  payload: unknown,
  caseSensitive: boolean,
  order: readonly string[] | undefined,
  resolve: AssetResolver,
  tileOrder?: readonly string[],
): { fields: StepFields; stimulus?: PanelStimulus } | null {
  if (!isObject(payload)) return null;
  const stimulus = picture(payload.stimulus, resolve);
  if (stimulus === null) return null;
  const withStimulus = (fields: StepFields | null) => (fields === null ? null : { fields, ...(stimulus !== undefined ? { stimulus } : {}) });
  const options = list(payload.options);
  switch (interactionType) {
    case "MULTIPLE_CHOICE": {
      const parsed = parseOptions(options, order);
      return withStimulus(parsed === null ? null : { interactionType: "MULTIPLE_CHOICE", options: parsed });
    }
    case "PICTURE_SELECT": {
      const parsed = parsePictures(options, order, resolve);
      return withStimulus(parsed === null ? null : { interactionType: "PICTURE_SELECT", options: parsed });
    }
    case "NUMBER_SELECT": {
      const numbers = numberSetValues(payload.numberSet);
      if (numbers === null || (payload.display !== "TRACK" && payload.display !== "GRID")) return null;
      // A track longer than 21 numbers would not fit: it is shown as a hundred square instead.
      const display = payload.display === "TRACK" && numbers.length > NUMBER_SELECT_LIMITS.trackMax ? "GRID" : payload.display;
      return withStimulus({ interactionType: "NUMBER_SELECT", numbers, display });
    }
    case "OBJECT_MOVE":
      if (payload.mode === "DISTRIBUTE") return withStimulus(parseDistribute(payload, resolve));
      if (payload.mode === "SORT") return withStimulus(parseSort(payload, resolve));
      return null;
    case "ARRANGE":
      return payload.mode === "LETTERS" || payload.mode === "SEQUENCE" ? withStimulus(parseArrange(payload, payload.mode, tileOrder, resolve)) : null;
    case "TYPED":
      return payload.mode === "NUMERIC" || payload.mode === "WORD" ? withStimulus(parseTyped(payload, payload.mode, caseSensitive, resolve)) : null;
    default:
      return null;
  }
}

/** The second part of a two-step activity (C20.3), or null when it cannot be shown. */
function parseAdditionalStep(raw: unknown, resolve: AssetResolver): PanelStep | null {
  if (!isObject(raw)) return null;
  const spec = isObject(raw.answerSpecification) ? raw.answerSpecification : {};
  const parsed = parseStep(raw.interactionType, raw.activityPayload, spec.caseSensitive === true, undefined, resolve);
  if (parsed === null) return null;
  const prompt = isObject(raw.prompt) && isText(raw.prompt.text) ? raw.prompt.text : undefined;
  return {
    ...parsed.fields,
    accepted: [],
    ...(prompt !== undefined ? { prompt } : {}),
    ...(parsed.stimulus !== undefined ? { stimulus: parsed.stimulus } : {}),
  } as PanelStep;
}

/**
 * What the learning panel shows for one activity, or null when it cannot be shown: an interaction type this client
 * does not know, or a payload that breaks the rules above.
 */
export function toPanelActivity(source: ActivitySource, resolve: AssetResolver): PanelActivity | null {
  const primary = parseStep(source.interactionType, source.activityPayload, source.answerSpecification?.caseSensitive === true, source.presentation?.optionOrder, resolve, source.presentation?.tileOrder);
  if (primary === null) return null;
  const accepted = [...(source.answerSpecification?.accepted ?? [])];
  let additionalStep: PanelStep | undefined;
  if (source.additionalSteps !== undefined && source.additionalSteps.length > 0) {
    if (source.additionalSteps.length !== 1) return null;
    const second = parseAdditionalStep(source.additionalSteps[0], resolve);
    // Every accepted answer of a two-step activity has one part per step (C20.3).
    if (second === null || accepted.some((a) => splitSteps(a, 2) === null)) return null;
    additionalStep = second;
  }
  const payload = source.activityPayload as Json;
  return {
    ...primary.fields,
    slotId: source.slotId,
    prompt: source.prompt?.text ?? "",
    accepted,
    audioRequired: source.audioRequired,
    reward: source.reward,
    ...(primary.stimulus !== undefined ? { stimulus: primary.stimulus } : {}),
    ...(additionalStep !== undefined && isText(payload.partPrompt) ? { partPrompt: payload.partPrompt } : {}),
    ...(additionalStep !== undefined ? { additionalStep } : {}),
  };
}

/** The label of a zone, bin or object by ID, for the answer words. */
function nameOf(items: readonly { id: string; label?: string; text?: string; alt?: string }[], id: string): string {
  const item = items.find((i) => i.id === id);
  return item?.label ?? item?.text ?? item?.alt ?? id;
}

/**
 * The words for "The answer was …" for one step: option text, picture alt text, the number, the word, the order, the
 * shares ("Nova 3, Pip 3") or the finished sort ("like tree: sea, dream; like bed: head, bread"). Only the first
 * accepted answer for the types that can have several.
 */
export function stepAnswerWords(step: PanelStep): string {
  const first = step.accepted[0];
  switch (step.interactionType) {
    case "MULTIPLE_CHOICE":
      return step.options.filter((o) => step.accepted.includes(o.id)).map((o) => o.text).join(", ");
    case "PICTURE_SELECT":
      return step.options.filter((o) => step.accepted.includes(o.id)).map((o) => o.alt).join(", ");
    case "NUMBER_SELECT":
      return step.numbers
        .flatMap((n) => {
          const text = decimal(n);
          return text !== null && step.accepted.includes(text) ? [text] : [];
        })
        .join(", ");
    case "TYPED":
      return first ?? "";
    case "ARRANGE": {
      if (first === undefined) return "";
      if (step.mode === "LETTERS") return first;
      return first
        .split(",")
        .map((value) => step.tiles.find((t) => t.value === value)?.text ?? value)
        .join(", ");
    }
    case "OBJECT_MOVE": {
      const found = first === undefined ? null : pairs(first);
      if (found === null) return "";
      if (step.mode === "DISTRIBUTE") return found.map(([zone, count]) => `${nameOf(step.zones, zone)} ${count}`).join(", ");
      return step.bins
        .map((bin) => `${bin.label}: ${found.filter(([, b]) => b === bin.id).map(([object]) => nameOf(step.objects, object)).join(", ")}`)
        .join("; ");
    }
  }
}

/** The words for "The answer was …" for the whole activity (two steps: "25 and 30"). */
export function answerWords(activity: PanelActivity): string {
  return panelSteps(activity)
    .map(stepAnswerWords)
    .filter((w) => w !== "")
    .join(" and ");
}
