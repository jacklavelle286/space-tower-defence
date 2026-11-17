// Runs every op-sequence fixture in contracts/fixtures/ops/ through the reducer (format: contracts/fixtures/README.md),
// then checks the promises that are about the reducer itself rather than about one sequence.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { RunState } from "./contracts.generated";
import { reduce, type ReduceResult } from "./reducer";
import { validate } from "./schema";

const OPS_DIR = resolve(import.meta.dirname, "..", "..", "..", "..", "contracts", "fixtures", "ops");

type Expectation = {
  result: string;
  code?: string;
  details?: unknown;
  outcome?: string;
  attempt?: unknown;
  state?: Record<string, unknown>;
  removed?: string[];
};
type Step = { note?: string; op?: unknown; resend?: number; expect: Expectation };
type Fixture = { name: string; description: string; sources: string[]; start: RunState; steps: Step[] };

/** F section 3.5's columns (every op the reducers apply) and rows (each IN_PROGRESS phase, then the terminal statuses). */
const OP_TYPES = [
  "SAVE_PREP",
  "START_WAVE",
  "COMPLETE_WAVE",
  "SUBMIT_ATTEMPT",
  "DISMISS_SLOT",
  "DEFEAT",
  "ABANDON",
  "CHOOSE_ENDLESS",
  "FINISH_RUN",
] as const;
const MATRIX_ROWS = ["BUILD", "IN_WAVE", "ACTIVITY", "METEOR", "COMPLETION_OFFER", "TERMINAL"] as const;

function load(file: string): Fixture {
  return JSON.parse(readFileSync(resolve(OPS_DIR, file), "utf8")) as Fixture;
}

const files = readdirSync(OPS_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

/** Freeze a value and everything inside it, so any mutation by the reducer throws. */
function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

/** The reducer's answer without the state, in the shape a fixture's `expect` uses. */
function verdict(result: ReduceResult): Record<string, unknown> {
  const { state: _state, ...rest } = result as ReduceResult & { state?: RunState };
  return rest;
}

describe("op-sequence fixtures", () => {
  it("exist", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  describe.each(files)("%s", (file) => {
    const fixture = load(file);

    it("is well formed: name matches the file, start state matches the run-state schema", () => {
      expect(`${fixture.name}.json`).toBe(file);
      expect(fixture.sources.length).toBeGreaterThan(0);
      expect(validate("run-state.schema.json", fixture.start, "start")).toEqual([]);
    });

    it("produces the expected result and state after every op", () => {
      let actual: RunState = deepFreeze(structuredClone(fixture.start));
      let expected: Record<string, unknown> = structuredClone(fixture.start);
      fixture.steps.forEach((step, index) => {
        if (step.resend !== undefined) return; // duplicate memory is the handler's job, not the pure reducer's (I.2.3)
        const label = `step ${index}${step.note === undefined ? "" : ` (${step.note})`}`;
        const { state: changes, removed, ...want } = step.expect;
        const result = reduce(actual, deepFreeze(structuredClone(step.op)));
        expect(verdict(result), label).toEqual(want);
        if (result.result === "APPLIED") {
          expected = { ...expected, ...changes };
          for (const key of removed ?? []) delete expected[key];
          expect(result.state, label).toEqual(expected);
          expect(validate("run-state.schema.json", result.state, "state"), label).toEqual([]);
          actual = deepFreeze(result.state);
        } else {
          expect(changes, `${label}: a refusal changes nothing`).toBeUndefined();
        }
      });
    });
  });

  it("cover every op type, both results and every reducer refusal code", () => {
    const steps = files.flatMap((file) => load(file).steps);
    const types = new Set(steps.map((s) => (s.op as { type?: string } | undefined)?.type));
    for (const type of OP_TYPES) expect(types.has(type), type).toBe(true);
    const codes = new Set(steps.map((s) => s.expect.code).filter((c) => c !== undefined));
    expect([...codes].sort()).toEqual(["PHASE_MISMATCH", "RUN_TERMINAL", "STALE_REVISION", "VALIDATION_FAILED"]);
    const outcomes = new Set(steps.map((s) => s.expect.outcome).filter((o) => o !== undefined));
    expect([...outcomes].sort()).toEqual(["DECLINED", "INCORRECT", "NO_OP_VOIDED_SLOT", "RESOLVED_FAILED", "RESOLVED_SUCCEEDED", "VOIDED"]);
  });

  it("cover every cell of F section 3.5's phase x op matrix (Phase 29 exit criterion)", () => {
    // Replays each fixture (the per-file test above proves the reducer matches it) and notes the run's row (its phase,
    // or TERMINAL) for every op whose type is valid.
    const seen = new Set<string>();
    for (const file of files) {
      const fixture = load(file);
      let state = fixture.start;
      for (const step of fixture.steps) {
        if (step.resend !== undefined) continue;
        const type = (step.op as { type?: unknown } | undefined)?.type;
        if (typeof type === "string" && (OP_TYPES as readonly string[]).includes(type)) {
          seen.add(`${state.status === "IN_PROGRESS" ? state.phase : "TERMINAL"} x ${type}`);
        }
        const result = reduce(state, step.op);
        if (result.result === "APPLIED") state = result.state;
      }
    }
    const missing = MATRIX_ROWS.flatMap((row) => OP_TYPES.map((type) => `${row} x ${type}`)).filter((cell) => !seen.has(cell));
    expect(missing).toEqual([]);
  });
});

describe("reduce", () => {
  const start = load("m1-challenge-happy-path.json").start;
  const saveprep = {
    opId: "00000000-0000-4000-8000-000000000001",
    expectedRevision: 0,
    type: "SAVE_PREP",
    clientTime: "2026-11-15T10:00:00Z",
    payload: { credits: 100, placements: [{ padId: "p04", classId: "nova", level: 1, targeting: "FRONT" }] },
  };

  it("never changes its inputs and shares no mutable objects with the op", () => {
    const state = structuredClone(start);
    const op = structuredClone(saveprep);
    const result = reduce(state, op);
    expect(state).toEqual(start);
    expect(op).toEqual(saveprep);
    if (result.result !== "APPLIED") throw new Error("expected APPLIED");
    expect(result.state.snapshot?.placements[0]).not.toBe(op.payload.placements[0]);
  });

  it("gives the same answer for the same inputs", () => {
    expect(reduce(start, saveprep)).toEqual(reduce(start, saveprep));
  });

  it("refuses every non-op with VALIDATION_FAILED instead of throwing", () => {
    for (const junk of [null, undefined, 42, "SAVE_PREP", [], {}]) {
      expect(reduce(start, junk)).toMatchObject({ result: "REJECTED", code: "VALIDATION_FAILED" });
    }
  });

  it("names a reason for every refusal", () => {
    const refusals = files
      .flatMap((file) => load(file).steps)
      .filter((s) => s.expect.result === "REJECTED")
      .map((s) => s.expect.code);
    expect(refusals.length).toBeGreaterThan(0);
    expect(refusals.every((code) => typeof code === "string" && code.length > 0)).toBe(true);
  });

  it("throws on a broken run state rather than guessing", () => {
    const { phase: _phase, ...noPhase } = start;
    expect(() => reduce(noPhase, saveprep)).toThrow("no phase");
  });
});
