// Runs the shared answer vectors (contracts/fixtures/answers/vectors.json) against the canonicaliser, and checks
// that limits.ts is the generated copy of contracts/limits.json.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LIMITS } from "../limits";
import { canonicalise, isCanonicalAnswerShape } from "./canonical";

const CONTRACTS = resolve(import.meta.dirname, "..", "..", "..", "..", "contracts");

type CanonicalVector = {
  name: string;
  interactionType: "MULTIPLE_CHOICE";
  optionIds: string[];
  input: string | null;
  expected?: string;
  refused?: string;
};
type ShapeVector = { answer: string; valid: boolean };
type Vectors = { canonical: CanonicalVector[]; shape: ShapeVector[] };

const vectors = JSON.parse(readFileSync(resolve(CONTRACTS, "fixtures", "answers", "vectors.json"), "utf8")) as Vectors;

describe("answer vectors: canonicalise", () => {
  it("has vectors for every refusal reason and for success", () => {
    const outcomes = new Set(vectors.canonical.map((v) => v.refused ?? "OK"));
    expect([...outcomes].sort()).toEqual(["INCOMPLETE", "NOT_AN_OPTION", "NOT_CANONICAL", "OK"]);
  });

  it.each(vectors.canonical.map((v) => [v.name, v]))("%s", (_name, vector) => {
    const result = canonicalise({ interactionType: vector.interactionType, optionIds: vector.optionIds }, vector.input);
    if (vector.expected !== undefined) {
      expect(result).toEqual({ ok: true, answer: vector.expected });
    } else {
      expect(result).toEqual({ ok: false, reason: vector.refused });
    }
  });

  it("only ever produces answers of the canonical shape", () => {
    for (const vector of vectors.canonical) {
      if (vector.expected !== undefined) expect(isCanonicalAnswerShape(vector.expected)).toBe(true);
    }
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
  it.each(["trim", "trimStart", "trimEnd", "Number(", "parseInt", "toLowerCase", "toUpperCase", "toLocaleLowerCase", "localeCompare", "normalize("])(
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
