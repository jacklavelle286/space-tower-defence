// Pack entry -> what the panel shows (activity.ts), for the three choice types, and the refusals that keep an unfair
// or broken question away from a child (D-8: four to six choices; pictures must resolve and have alt text).
import { describe, expect, it } from "vitest";
import { answerSpecOf, answerWords, numberSetValues, panelSteps, restoreAnswer, toPanelActivity, type ActivitySource } from "./activity";

const resolve = (assetId: string) => (assetId.startsWith("pic-") || assetId.startsWith("dice-") ? `/assets/activity/${assetId}.png` : null);
const base = { slotId: "N-001", prompt: { text: "Which one?" }, audioRequired: false, reward: { credits: 30 } };
const textOptions = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "abcdef"[i], text: `w${i}` }));
const pictureOptions = (n: number) => Array.from({ length: n }, (_, i) => ({ id: "abcdef"[i], assetId: `pic-${i}`, alt: `thing ${i}` }));

const mc = (options: unknown[], order?: string[]): ActivitySource => ({
  ...base,
  interactionType: "MULTIPLE_CHOICE",
  activityPayload: { optionStyle: "GRAPHEME", options },
  answerSpecification: { accepted: ["b"] },
  ...(order ? { presentation: { optionOrder: order } } : {}),
});
const ps = (options: unknown[], extra: Record<string, unknown> = {}, order?: string[]): ActivitySource => ({
  ...base,
  interactionType: "PICTURE_SELECT",
  activityPayload: { layout: "GRID", options, ...extra },
  answerSpecification: { accepted: ["a"] },
  ...(order ? { presentation: { optionOrder: order } } : {}),
});
const ns = (numberSet: unknown, display: unknown = "TRACK", extra: Record<string, unknown> = {}): ActivitySource => ({
  ...base,
  interactionType: "NUMBER_SELECT",
  activityPayload: { numberSet, display, ...extra },
  answerSpecification: { accepted: ["8"] },
});

describe("toPanelActivity", () => {
  it("MULTIPLE_CHOICE: options in the slot's presentation order", () => {
    const activity = toPanelActivity(mc(textOptions(4), ["c", "a", "d", "b"]), resolve);
    expect(activity?.interactionType).toBe("MULTIPLE_CHOICE");
    expect(activity && "options" in activity ? activity.options.map((o) => o.id) : null).toEqual(["c", "a", "d", "b"]);
  });

  it("PICTURE_SELECT: resolves each picture, keeps alt text and captions, in presentation order", () => {
    const options = [...pictureOptions(4)];
    options[1] = { ...options[1]!, caption: "cat" } as (typeof options)[number];
    const activity = toPanelActivity(ps(options, {}, ["b", "a", "c", "d"]), resolve);
    expect(activity).toMatchObject({
      interactionType: "PICTURE_SELECT",
      prompt: "Which one?",
      accepted: ["a"],
      options: [
        { id: "b", imageUrl: "/assets/activity/pic-1.png", alt: "thing 1", caption: "cat" },
        { id: "a", imageUrl: "/assets/activity/pic-0.png", alt: "thing 0" },
        { id: "c" },
        { id: "d" },
      ],
    });
  });

  it("PICTURE_SELECT: a stimulus picture is resolved too", () => {
    const activity = toPanelActivity(ps(pictureOptions(4), { stimulus: { assetId: "dice-4", alt: "four dots" } }), resolve);
    expect(activity?.stimulus).toEqual({ imageUrl: "/assets/activity/dice-4.png", alt: "four dots" });
  });

  it.each([
    ["three options (D-8)", ps(pictureOptions(3))],
    ["seven options (D-8)", ps([...pictureOptions(6), { id: "g", assetId: "pic-6", alt: "x" }])],
    ["a picture this app does not have", ps([...pictureOptions(3), { id: "d", assetId: "obj-unknown", alt: "x" }])],
    ["a picture with no alt text", ps([...pictureOptions(3), { id: "d", assetId: "pic-9", alt: "" }])],
    ["repeated option IDs", ps([...pictureOptions(3), { id: "a", assetId: "pic-9", alt: "x" }])],
    ["an order missing an option", ps(pictureOptions(4), {}, ["a", "b", "c"])],
    ["an order naming one twice", ps(pictureOptions(4), {}, ["a", "b", "c", "c"])],
    ["a stimulus with no picture", ps(pictureOptions(4), { stimulus: { assetId: "nope", alt: "x" } })],
    ["three text options (D-8)", mc(textOptions(3))],
    ["a text option without text", mc([...textOptions(3), { id: "d" }])],
    ["a number set that is not valid", ns({ kind: "RANGE", min: 0, max: 10, step: 3 })],
    ["an unknown display", ns({ kind: "RANGE", min: 0, max: 10, step: 1 }, "WHEEL")],
    ["a TYPED payload with no mode", { ...base, interactionType: "TYPED", activityPayload: { maxLength: 3 } }],
    ["no payload (withdrawn)", { ...base, interactionType: "PICTURE_SELECT" }],
  ])("refuses %s", (_name, source) => {
    expect(toPanelActivity(source as ActivitySource, resolve)).toBeNull();
  });

  it("NUMBER_SELECT: a track, and a track too long to fit becomes a hundred square", () => {
    expect(toPanelActivity(ns({ kind: "RANGE", min: 0, max: 20, step: 1 }), resolve)).toMatchObject({
      interactionType: "NUMBER_SELECT",
      display: "TRACK",
      numbers: Array.from({ length: 21 }, (_, i) => i),
    });
    expect(toPanelActivity(ns({ kind: "RANGE", min: 0, max: 21, step: 1 }), resolve)).toMatchObject({ display: "GRID" });
    expect(toPanelActivity(ns({ kind: "RANGE", min: 1, max: 100, step: 1 }, "GRID"), resolve)).toMatchObject({ display: "GRID" });
  });
});

describe("numberSetValues", () => {
  it.each([
    [{ kind: "RANGE", min: 0, max: 10, step: 1 }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]],
    [{ kind: "RANGE", min: 0, max: 100, step: 10 }, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]],
    [{ kind: "LIST", values: [30, 38, 80, 83, 3] }, [30, 38, 80, 83, 3]],
  ])("%j", (set, values) => {
    expect(numberSetValues(set)).toEqual(values);
  });

  it.each([
    ["a step that does not divide the range", { kind: "RANGE", min: 0, max: 10, step: 3 }],
    ["a step of zero", { kind: "RANGE", min: 0, max: 10, step: 0 }],
    ["above 100", { kind: "RANGE", min: 0, max: 101, step: 1 }],
    ["below 0", { kind: "LIST", values: [-1, 2, 3, 4, 5] }],
    ["a fraction", { kind: "LIST", values: [1.5, 2, 3, 4, 5] }],
    ["a repeat", { kind: "LIST", values: [2, 2, 3, 4, 5] }],
    ["a number as text", { kind: "LIST", values: ["2", 3, 4, 5, 6] }],
    ["an empty list", { kind: "LIST", values: [] }],
    ["min above max", { kind: "RANGE", min: 9, max: 1, step: 1 }],
    ["an unknown kind", { kind: "SET", values: [1, 2, 3, 4, 5] }],
    ["not an object", [1, 2, 3]],
  ])("refuses %s", (_name, set) => {
    expect(numberSetValues(set)).toBeNull();
  });
});

describe("answerSpecOf and answerWords", () => {
  it("one spec per type, and the words for 'The answer was …'", () => {
    const pictures = toPanelActivity(ps(pictureOptions(4)), resolve)!;
    expect(answerSpecOf(pictures)).toEqual({ interactionType: "PICTURE_SELECT", optionIds: ["a", "b", "c", "d"] });
    expect(answerWords(pictures)).toBe("thing 0");
    const numbers = toPanelActivity(ns({ kind: "RANGE", min: 0, max: 10, step: 1 }), resolve)!;
    expect(answerSpecOf(numbers)).toEqual({ interactionType: "NUMBER_SELECT", values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
    expect(answerWords(numbers)).toBe("8");
    const text = toPanelActivity(mc(textOptions(4)), resolve)!;
    expect(answerWords(text)).toBe("w1");
  });
});

// --- Phase 38: object move, arrange, typed, two-step ---

const src = (interactionType: string, activityPayload: unknown, accepted: string[], extra: Partial<ActivitySource> = {}): ActivitySource => ({
  ...base,
  interactionType,
  activityPayload,
  answerSpecification: { accepted },
  ...extra,
});
const share = (extra: Record<string, unknown> = {}) =>
  src("OBJECT_MOVE", { mode: "DISTRIBUTE", objectAssetId: "pic-star", objectAlt: "a star", sourceCount: 6, requireAllPlaced: true, zones: [{ id: "z1", label: "Nova" }, { id: "z2", label: "Pip" }], ...extra }, ["z1=3;z2=3"]);
const sortObjects = [
  { id: "o1", text: "sea", alt: "sea" },
  { id: "o2", text: "head", alt: "head" },
  { id: "o3", text: "dream", alt: "dream" },
  { id: "o4", assetId: "pic-bread", alt: "bread" },
];
const sortBins = [{ id: "ee", label: "like tree" }, { id: "e", label: "like bed" }];
const sorting = (objects: unknown[] = sortObjects, bins: unknown[] = sortBins) => src("OBJECT_MOVE", { mode: "SORT", objects, bins }, ["o1=ee;o2=e;o3=ee;o4=e"]);
const cat = [{ id: "t1", value: "t" }, { id: "t2", value: "o" }, { id: "t3", value: "c" }, { id: "t4", value: "a" }, { id: "t5", value: "n" }];
const letters = (tiles: unknown[] = cat, slots = 3, cue: unknown = { assetId: "pic-cat", alt: "a cat" }) =>
  src("ARRANGE", { mode: "LETTERS", tiles, slots, ...(cue === undefined ? {} : { cue }) }, ["cat"]);
const seqTiles = ["38", "83", "30", "80"].map((v, i) => ({ id: "abcd"[i], value: v }));
const sequence = (tiles: unknown[] = seqTiles, slots = 4) => src("ARRANGE", { mode: "SEQUENCE", tiles, slots, orderLabel: "smallest first" }, ["30,38,80,83"]);
const typed = (mode: string, maxLength: number, extra: Record<string, unknown> = {}, spec: Record<string, unknown> = {}) =>
  ({ ...src("TYPED", { mode, maxLength, ...extra }, ["16"]), answerSpecification: { accepted: ["16"], ...spec } }) as ActivitySource;
const twoStep = (accepted = ["c|30"], steps: unknown[] = [{ interactionType: "TYPED", prompt: { text: "5 × 6 = ?" }, activityPayload: { mode: "NUMERIC", maxLength: 2 }, answerSpecification: { accepted: ["30"] } }]) =>
  ({ ...mc(textOptions(4)), activityPayload: { optionStyle: "NUMERAL", options: textOptions(4), partPrompt: "Which is in the 5 times table?" }, answerSpecification: { accepted }, additionalSteps: steps }) as ActivitySource;

describe("toPanelActivity: Phase 38 types", () => {
  it("OBJECT_MOVE DISTRIBUTE: the object picture, the count and the zones", () => {
    expect(toPanelActivity(share(), resolve)).toMatchObject({
      interactionType: "OBJECT_MOVE",
      mode: "DISTRIBUTE",
      object: { imageUrl: "/assets/activity/pic-star.png", alt: "a star" },
      sourceCount: 6,
      requireAllPlaced: true,
      zones: [{ id: "z1", label: "Nova" }, { id: "z2", label: "Pip" }],
    });
  });

  it("OBJECT_MOVE SORT: words and pictures, bins in order", () => {
    const shown = toPanelActivity(sorting(), resolve);
    expect(shown).toMatchObject({ mode: "SORT", bins: sortBins });
    expect(shown && "objects" in shown ? shown.objects[3] : null).toEqual({ id: "o4", alt: "bread", imageUrl: "/assets/activity/pic-bread.png" });
  });

  it("ARRANGE: tiles in stored order, text defaults to the value, cue and order label kept", () => {
    expect(toPanelActivity(letters(), resolve)).toMatchObject({
      mode: "LETTERS",
      slots: 3,
      tiles: [{ id: "t1", value: "t", text: "t" }, { id: "t2" }, { id: "t3" }, { id: "t4" }, { id: "t5" }],
      cue: { imageUrl: "/assets/activity/pic-cat.png", alt: "a cat" },
    });
    expect(toPanelActivity(sequence(), resolve)).toMatchObject({ mode: "SEQUENCE", slots: 4, orderLabel: "smallest first" });
  });

  it("ARRANGE: the slot's tileOrder (C24.4 step 7) sets the order shown; one that does not name every tile once is refused", () => {
    const withOrder = (order: string[]) => ({ ...letters(), presentation: { tileOrder: order } });
    const shown = toPanelActivity(withOrder(["t4", "t2", "t5", "t1", "t3"]), resolve);
    expect(shown && "tiles" in shown ? shown.tiles.map((t) => t.id) : null).toEqual(["t4", "t2", "t5", "t1", "t3"]);
    expect(toPanelActivity(withOrder(["t4", "t2", "t5", "t1"]), resolve)).toBeNull();
    expect(toPanelActivity(withOrder(["t4", "t4", "t5", "t1", "t3"]), resolve)).toBeNull();
    expect(toPanelActivity(withOrder(["t4", "t2", "t5", "t1", "zz"]), resolve)).toBeNull();
  });

  it("TYPED: mode, maxLength, cue; caseSensitive only for words", () => {
    expect(toPanelActivity(typed("NUMERIC", 2), resolve)).toMatchObject({ mode: "NUMERIC", maxLength: 2, caseSensitive: false });
    expect(toPanelActivity(typed("WORD", 12, { cue: { text: "hop + ing" } }, { caseSensitive: true }), resolve)).toMatchObject({
      mode: "WORD",
      caseSensitive: true,
      cue: { text: "hop + ing" },
    });
    expect(toPanelActivity(typed("NUMERIC", 2, {}, { caseSensitive: true }), resolve)).toMatchObject({ caseSensitive: false });
  });

  it("two-step: the part prompt, the second part, and one accepted list per part", () => {
    const shown = toPanelActivity(twoStep(["c|30", "c|31"]), resolve)!;
    expect(shown.partPrompt).toBe("Which is in the 5 times table?");
    const steps = panelSteps(shown);
    expect(steps.map((s) => s.interactionType)).toEqual(["MULTIPLE_CHOICE", "TYPED"]);
    expect(steps.map((s) => s.accepted)).toEqual([["c"], ["30", "31"]]);
    expect(steps.map((s) => s.prompt)).toEqual(["Which is in the 5 times table?", "5 × 6 = ?"]);
    expect(answerWords(shown)).toBe("w2 and 30");
  });

  it.each([
    ["share: one object", share({ sourceCount: 1 })],
    ["share: thirteen objects", share({ sourceCount: 13 })],
    ["share: four zones", share({ zones: [1, 2, 3, 4].map((n) => ({ id: `z${n}`, label: `Z${n}` })) })],
    ["share: no zones", share({ zones: [] })],
    ["share: repeated zone IDs", share({ zones: [{ id: "z1", label: "A" }, { id: "z1", label: "B" }] })],
    ["share: an object picture this app does not have", share({ objectAssetId: "obj-nope" })],
    ["share: requireAllPlaced missing", share({ requireAllPlaced: undefined })],
    ["sort: three objects", sorting(sortObjects.slice(0, 3))],
    ["sort: one bin", sorting(sortObjects, sortBins.slice(0, 1))],
    ["sort: an object with both text and picture", sorting([...sortObjects.slice(0, 3), { id: "o4", text: "x", assetId: "pic-x", alt: "x" }])],
    ["sort: an object with no alt text", sorting([...sortObjects.slice(0, 3), { id: "o4", text: "x" }])],
    ["letters: more than slots + 3 tiles", letters([...cat, { id: "t6", value: "s" }, { id: "t7", value: "p" }], 3)],
    ["letters: fewer tiles than spaces", letters(cat.slice(0, 2), 3)],
    ["letters: one space", letters(cat.slice(0, 2), 1)],
    ["letters: repeated tile IDs", letters([...cat.slice(0, 4), { id: "t1", value: "n" }])],
    ["letters: a cue picture with no alt text", letters(cat, 3, { assetId: "pic-cat" })],
    ["letters: an empty cue", letters(cat, 3, {})],
    ["sequence: two tiles", sequence(seqTiles.slice(0, 2), 2)],
    ["sequence: fewer spaces than tiles", sequence(seqTiles, 3)],
    ["typed number: four digits", typed("NUMERIC", 4)],
    ["typed word: one letter", typed("WORD", 1)],
    ["typed: unknown mode", typed("SPOKEN", 3)],
    ["two-step: two additional steps", twoStep(["c|30"], [1, 2].map(() => ({ interactionType: "TYPED", activityPayload: { mode: "NUMERIC", maxLength: 2 } })))],
    ["two-step: an accepted answer with one part", twoStep(["c"])],
    ["two-step: a second part that cannot be shown", twoStep(["c|30"], [{ interactionType: "TYPED", activityPayload: { mode: "NUMERIC" } }])],
  ])("refuses %s", (_name, source) => {
    expect(toPanelActivity(source, resolve)).toBeNull();
  });
});

describe("restoreAnswer and the Phase 38 answer words", () => {
  it("rebuilds the raw answer from a recorded step answer", () => {
    const sharing = toPanelActivity(share(), resolve)!;
    expect(restoreAnswer(sharing, "z1=2;z2=4")).toEqual({ z1: 2, z2: 4 });
    const sorted = toPanelActivity(sorting(), resolve)!;
    expect(restoreAnswer(sorted, "o1=ee;o2=e")).toEqual({ o1: "ee", o2: "e" });
    expect(restoreAnswer(toPanelActivity(letters(), resolve)!, "cot")).toEqual(["t3", "t2", "t1"]);
    expect(restoreAnswer(toPanelActivity(letters(), resolve)!, "dog")).toBeNull();
    expect(restoreAnswer(toPanelActivity(sequence(), resolve)!, "30,38,80,83")).toEqual(["c", "a", "d", "b"]);
    expect(restoreAnswer(toPanelActivity(typed("NUMERIC", 2), resolve)!, "16")).toBe("16");
    expect(restoreAnswer(toPanelActivity(mc(textOptions(4)), resolve)!, "z")).toBeNull();
  });

  it("LETTERS: graphemes rebuild with the tiles that fit (sh + i + p)", () => {
    const ship = toPanelActivity(letters([{ id: "a", value: "s" }, { id: "b", value: "sh" }, { id: "c", value: "i" }, { id: "d", value: "p" }], 3, { text: "a boat" }), resolve)!;
    expect(restoreAnswer(ship, "ship")).toEqual(["b", "c", "d"]);
  });

  it("the words for 'The answer was …'", () => {
    expect(answerWords(toPanelActivity(share(), resolve)!)).toBe("Nova 3, Pip 3");
    expect(answerWords(toPanelActivity(sorting(), resolve)!)).toBe("like tree: sea, dream; like bed: head, bread");
    expect(answerWords(toPanelActivity(letters(), resolve)!)).toBe("cat");
    expect(answerWords(toPanelActivity(sequence(), resolve)!)).toBe("30, 38, 80, 83");
    expect(answerWords(toPanelActivity(typed("NUMERIC", 2), resolve)!)).toBe("16");
  });

  it("answer specs for the canonicaliser", () => {
    expect(answerSpecOf(toPanelActivity(share(), resolve)!)).toEqual({ interactionType: "OBJECT_MOVE", mode: "DISTRIBUTE", zoneIds: ["z1", "z2"], sourceCount: 6, requireAllPlaced: true });
    expect(answerSpecOf(toPanelActivity(letters(), resolve)!)).toMatchObject({ interactionType: "ARRANGE", mode: "LETTERS", slots: 3 });
  });
});
