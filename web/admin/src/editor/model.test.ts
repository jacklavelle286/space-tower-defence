// The editor model's own rules: IDs it gives, answers it builds, pictures it lists, fields it keeps.
import { describe, expect, it } from "vitest";
import { draftOf } from "../testing/drafts";
import { acceptedOf, blankStep, fromDefinition, KINDS, kindOf, legacyFields, nextId, numberValues, REWARD_CATEGORIES, REWARD_OPTIONS, rewardHint, speechVariants, toDefinition, type StepDraft } from "./model";

describe("IDs", () => {
  it("gives the next free option letter and part ID", () => {
    expect(nextId("", ["a", "b", "d"])).toBe("c");
    expect(nextId("z", ["z1", "z2"])).toBe("z3");
    expect(nextId("t", ["t2"])).toBe("t1");
  });
});

describe("kinds", () => {
  it("maps each stored type and mode to one editor kind", () => {
    for (const info of KINDS) expect(kindOf(info.interactionType, info.mode === null ? {} : { mode: info.mode })).toBe(info.kind);
    expect(kindOf("SOMETHING_NEW", {})).toBeNull();
  });

  it("starts every kind blank, with no right answer yet", () => {
    for (const info of KINDS) {
      const built = acceptedOf(blankStep(info.kind));
      expect(built.every((b) => b.answer === "" || !b.canonical || /=|,/.test(b.answer) === false)).toBe(true);
    }
  });
});

describe("answers", () => {
  it("builds DISTRIBUTE and SORT answers sorted by ID, through the shared canonicaliser", () => {
    const share: StepDraft = { ...(blankStep("DISTRIBUTE") as Extract<StepDraft, { kind: "DISTRIBUTE" }>), answer: { z2: "3", z1: "3" } };
    expect(acceptedOf(share)).toEqual([{ answer: "z1=3;z2=3", canonical: true }]);
    const sort = blankStep("SORT") as Extract<StepDraft, { kind: "SORT" }>;
    expect(acceptedOf({ ...sort, answer: { o4: "b2", o1: "b1", o2: "b2", o3: "b1" } })).toEqual([{ answer: "o1=b1;o2=b2;o3=b1;o4=b2", canonical: true }]);
  });

  it("keeps the plain form when the answer is incomplete, so the server can name the problem", () => {
    const sort = blankStep("SORT") as Extract<StepDraft, { kind: "SORT" }>;
    expect(acceptedOf({ ...sort, answer: { o1: "b1" } })).toEqual([{ answer: "o1=b1;o2=;o3=;o4=", canonical: false }]);
    const numeric = blankStep("NUMERIC") as Extract<StepDraft, { kind: "NUMERIC" }>;
    expect(acceptedOf({ ...numeric, answer: "07" })[0]?.answer).toBe("7"); // the canonicaliser drops a leading zero
    expect(acceptedOf({ ...numeric, answer: "x" })).toEqual([{ answer: "x", canonical: false }]);
  });

  it("joins a two-step activity's answers as every pair, step 1 | step 2", () => {
    const state = fromDefinition(draftOf("TWO_STEP").definition);
    const second = state.second;
    if (second === null || second.step.kind !== "NUMERIC") throw new Error("expected a numeric second part");
    const definition = toDefinition(draftOf("TWO_STEP").definition, { ...state, second: { ...second, step: { ...second.step, answer: "30" } } });
    expect(definition.answerSpecification?.accepted).toEqual(["c|30"]);
  });
});

describe("the definition", () => {
  it("lists every picture used, once, in order of first use", () => {
    const base = draftOf("PICTURE_SELECT").definition;
    const state = fromDefinition(base);
    if (state.step.kind !== "PICTURE_SELECT") throw new Error("expected picture select");
    const step = { ...state.step, stimulus: { assetId: "pic-knight", alt: "a knight" } };
    expect(toDefinition(base, { ...state, step }).visualAssetReferences).toEqual(["pic-night-sky", "pic-knight", "pic-kite", "pic-knot"]);
    const none = toDefinition(base, { ...state, step: blankStep("PICTURE_SELECT") });
    expect(none.visualAssetReferences).toBeUndefined();
  });

  it("keeps fields it does not edit, so the server can refuse them by name", () => {
    const base = { ...draftOf("NUMERIC").definition, introductionContent: { cards: [] } };
    expect(toDefinition(base, fromDefinition(base)).introductionContent).toEqual({ cards: [] });
  });

  it("drops an empty review note instead of sending an empty string", () => {
    const base = draftOf("NUMERIC").definition;
    expect(toDefinition(base, { ...fromDefinition(base), reviewNote: "  " })).not.toHaveProperty("reviewNote");
  });

  it("reads a draft that has curriculum codes, a note and a source, and saves it without them (the topic carries the curriculum)", () => {
    const base = { ...draftOf("NUMERIC").definition, curriculumReference: ["NC14.Ma.Y1.NPV-2"], curriculumNote: "a note", source: "HANDWRITTEN" };
    const definition = toDefinition(base, fromDefinition(base));
    expect(definition).not.toHaveProperty("curriculumReference");
    expect(definition).not.toHaveProperty("curriculumNote");
    expect(definition).not.toHaveProperty("source");
    expect(definition.prompt).toEqual(base.prompt);
    expect(legacyFields(base)).toEqual(["curriculumReference", "curriculumNote", "source"]);
    expect(legacyFields(definition)).toEqual([]);
  });

  it("words the reward hint for the chosen value", () => {
    expect(rewardHint("BOTH")).toMatch(/^Either slot/u);
    expect(rewardHint("NORMAL")).toMatch(/only after a normal wave/u);
    expect(rewardHint("NORMAL")).not.toMatch(/meteor/u);
    expect(rewardHint("METEOR")).toMatch(/only after a meteor wave/u);
    expect(rewardHint("METEOR")).not.toMatch(/normal/u);
  });

  it("keeps every reward category, including either slot (BOTH), through a load and a save", () => {
    expect(REWARD_CATEGORIES).toEqual(["BOTH", "NORMAL", "METEOR"]);
    expect(REWARD_OPTIONS.map((o) => o.value)).toEqual([...REWARD_CATEGORIES]);
    for (const rewardCategory of REWARD_CATEGORIES) {
      const base = { ...draftOf("WORD").definition, rewardCategory };
      const state = fromDefinition(base);
      expect(state.rewardCategory).toBe(rewardCategory);
      expect(toDefinition(base, state).rewardCategory).toBe(rewardCategory);
    }
  });

  it("gives a draft with no payload yet the blank step of its type (the first mode, when no mode is stored)", () => {
    const { activityPayload: _p, answerSpecification: _a, ...bare } = draftOf("WORD").definition;
    expect(fromDefinition(bare).step).toEqual(blankStep("NUMERIC"));
    expect(fromDefinition(bare, "WORD").step).toEqual(blankStep("WORD"));
  });
});

describe("numbers and clips", () => {
  it("lists a number set's values, or none for a set the server refuses", () => {
    expect(numberValues({ kind: "RANGE", min: 0, max: 10, step: 5 })).toEqual([0, 5, 10]);
    expect(numberValues({ kind: "RANGE", min: 5, max: 1, step: 1 })).toEqual([]);
    expect(numberValues({ kind: "LIST", values: [3, 101, 7] })).toEqual([3, 7]);
  });

  it("offers clip variants that fit: prompt, instruction, answer, options and groups", () => {
    expect(speechVariants(fromDefinition(draftOf("MULTIPLE_CHOICE").definition))).toEqual(["prompt", "instruction", "answer", "option-a", "option-b", "option-c", "option-d"]);
    expect(speechVariants(fromDefinition(draftOf("SORT").definition))).toEqual(["prompt", "instruction", "answer", "bin-b1", "bin-b2"]);
  });
});
