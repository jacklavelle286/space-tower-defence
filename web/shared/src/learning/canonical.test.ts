// Runs the shared answer vectors (contracts/fixtures/answers/vectors.json) against the canonicaliser, and checks
// that limits.ts is the generated copy of contracts/limits.json.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LIMITS } from "../limits";
import {
  canonicalise,
  canonicaliseSteps,
  decimal,
  isCanonicalAnswerShape,
  splitSteps,
  type AnswerSpec,
  type InteractionType,
  type RawAnswer,
} from "./canonical";

const CONTRACTS = resolve(import.meta.dirname, "..", "..", "..", "..", "contracts");

type SpecFields = {
  interactionType: InteractionType;
  mode?: string;
  optionIds?: string[];
  values?: number[];
  zoneIds?: string[];
  sourceCount?: number;
  requireAllPlaced?: boolean;
  objectIds?: string[];
  binIds?: string[];
  tiles?: { id: string; value: string }[];
  slots?: number;
  maxLength?: number;
  caseSensitive?: boolean;
};
type CanonicalVector = SpecFields & { name: string; input: RawAnswer; expected?: string; refused?: string };
type TwoStepVector = { name: string; steps: SpecFields[]; input: RawAnswer[]; expected?: string; refused?: string };
type ShapeVector = { answer: string; valid: boolean };
type Vectors = { canonical: CanonicalVector[]; twoStep: TwoStepVector[]; shape: ShapeVector[] };

const vectors = JSON.parse(readFileSync(resolve(CONTRACTS, "fixtures", "answers", "vectors.json"), "utf8")) as Vectors;

function specOf(vector: SpecFields): AnswerSpec {
  switch (vector.interactionType) {
    case "MULTIPLE_CHOICE":
    case "PICTURE_SELECT":
      return { interactionType: vector.interactionType, optionIds: vector.optionIds ?? [] };
    case "NUMBER_SELECT":
      return { interactionType: "NUMBER_SELECT", values: vector.values ?? [] };
    case "OBJECT_MOVE":
      return vector.mode === "SORT"
        ? { interactionType: "OBJECT_MOVE", mode: "SORT", objectIds: vector.objectIds ?? [], binIds: vector.binIds ?? [] }
        : {
            interactionType: "OBJECT_MOVE",
            mode: "DISTRIBUTE",
            zoneIds: vector.zoneIds ?? [],
            sourceCount: vector.sourceCount ?? 0,
            requireAllPlaced: vector.requireAllPlaced ?? false,
          };
    case "ARRANGE":
      return { interactionType: "ARRANGE", mode: vector.mode === "SEQUENCE" ? "SEQUENCE" : "LETTERS", tiles: vector.tiles ?? [], slots: vector.slots ?? 0 };
    case "TYPED":
      return {
        interactionType: "TYPED",
        mode: vector.mode === "WORD" ? "WORD" : "NUMERIC",
        maxLength: vector.maxLength ?? 0,
        ...(vector.caseSensitive !== undefined ? { caseSensitive: vector.caseSensitive } : {}),
      };
  }
}

const ALL_TYPES = ["MULTIPLE_CHOICE", "PICTURE_SELECT", "NUMBER_SELECT", "OBJECT_MOVE", "ARRANGE", "TYPED"] as const;
const MODES = ["DISTRIBUTE", "SORT", "LETTERS", "SEQUENCE", "NUMERIC", "WORD"] as const;

describe("answer vectors: canonicalise", () => {
  it.each(ALL_TYPES)("has vectors for every refusal reason and for success: %s", (type) => {
    const outcomes = new Set(vectors.canonical.filter((v) => v.interactionType === type).map((v) => v.refused ?? "OK"));
    const expected = type === "TYPED" ? ["INCOMPLETE", "NOT_CANONICAL", "OK"] : ["INCOMPLETE", "NOT_AN_OPTION", "NOT_CANONICAL", "OK"];
    expect([...outcomes].sort()).toEqual(expected);
  });

  it.each(MODES)("has accepted and refused vectors for mode %s", (mode) => {
    const outcomes = new Set(vectors.canonical.filter((v) => v.mode === mode).map((v) => (v.refused === undefined ? "OK" : "REFUSED")));
    expect([...outcomes].sort()).toEqual(["OK", "REFUSED"]);
  });

  it("TYPED vectors include whitespace, leading zeros, curly apostrophes, dashes and capitals (C20 tricky inputs)", () => {
    const inputs = vectors.canonical.filter((v) => v.interactionType === "TYPED").map((v) => v.input);
    for (const tricky of ["08", " 16 ", "\t1\u00a06\r\n", "Hopping", "don\u2019t", "x\u2013ray", "foot \t ball", "\u0130t"]) expect(inputs).toContain(tricky);
  });

  it("NUMBER_SELECT vectors include leading zeros, signs, whitespace and non-ASCII digits (C20 tricky inputs)", () => {
    const inputs = vectors.canonical.filter((v) => v.interactionType === "NUMBER_SELECT").map((v) => v.input);
    for (const tricky of ["08", "-3", "+8", " 8", "8.0", "\uff18"]) expect(inputs).toContain(tricky);
  });

  it.each(vectors.canonical.map((v) => [v.name, v]))("%s", (_name, vector) => {
    const result = canonicalise(specOf(vector), vector.input);
    if (vector.expected !== undefined) {
      expect(result).toEqual({ ok: true, answer: vector.expected });
    } else {
      expect(result).toEqual({ ok: false, reason: vector.refused });
    }
  });

  it("only ever produces answers of the canonical shape", () => {
    for (const vector of [...vectors.canonical, ...vectors.twoStep]) {
      if (vector.expected !== undefined) expect(isCanonicalAnswerShape(vector.expected)).toBe(true);
    }
  });
});

describe("answer vectors: two-step (C20.3)", () => {
  it.each(vectors.twoStep.map((v) => [v.name, v]))("%s", (_name, vector) => {
    const result = canonicaliseSteps(vector.steps.map(specOf), vector.input);
    if (vector.expected !== undefined) {
      expect(result).toEqual({ ok: true, answer: vector.expected });
    } else {
      expect(result).toEqual({ ok: false, reason: vector.refused });
    }
  });

  it("one step is the plain answer, with no joiner", () => {
    expect(canonicaliseSteps([{ interactionType: "MULTIPLE_CHOICE", optionIds: ["a", "b", "c", "d"] }], ["c"])).toEqual({ ok: true, answer: "c" });
  });

  it("splits a recorded answer back into its steps", () => {
    expect(splitSteps("c|30", 2)).toEqual(["c", "30"]);
    expect(splitSteps("c", 1)).toEqual(["c"]);
    expect(splitSteps("c", 2)).toBeNull();
  });
});

describe("decimal", () => {
  it.each([
    [0, "0"],
    [8, "8"],
    [10, "10"],
    [100, "100"],
    [2147483647, "2147483647"],
  ])("%d -> %s", (value, text) => {
    expect(decimal(value)).toBe(text);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])("refuses %d", (value) => {
    expect(decimal(value)).toBeNull();
  });
});

describe("answer vectors: shape", () => {
  it.each(vectors.shape.map((v) => [JSON.stringify(v.answer), v]))("%s", (_name, vector) => {
    expect(isCanonicalAnswerShape(vector.answer)).toBe(vector.valid);
  });

  it("allows exactly the limit's length and no more", () => {
    expect(isCanonicalAnswerShape("1".repeat(LIMITS.answer.maxLength))).toBe(true);
    expect(isCanonicalAnswerShape("1".repeat(LIMITS.answer.maxLength + 1))).toBe(false);
  });
});

describe("canonical.ts source", () => {
  // C section 20.1: the normaliser avoids built-ins that differ across engines.
  const source = readFileSync(resolve(import.meta.dirname, "canonical.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  it.each(["trim", "trimStart", "trimEnd", "Number(", "parseInt", "parseFloat", "String(", "toString(", "toLowerCase", "toUpperCase", "toLocaleLowerCase", "localeCompare", "normalize("])(
    "does not call %s",
    (name) => {
      expect(source).not.toContain(name);
    },
  );
});

describe("limits.ts", () => {
  it("equals contracts/limits.json without its comment", () => {
    const { $comment: _comment, ...limits } = JSON.parse(readFileSync(resolve(CONTRACTS, "limits.json"), "utf8")) as Record<string, unknown>;
    expect(LIMITS).toEqual(limits);
  });
});
