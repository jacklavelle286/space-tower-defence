// The contract validator: strict schemas (unknown fields fail), the supported keywords, and the fixed problem order
// the Python mirror must copy.
import { describe, expect, it } from "vitest";
import { validate } from "./schema";

const OP_ID = "00000000-0000-4000-8000-000000000001";
const SESSION_ID = "00000000-0000-4000-8000-0000000000aa";

function op(type: string, payload: unknown): Record<string, unknown> {
  return { opId: OP_ID, expectedRevision: 0, type, payload, clientTime: "2026-11-15T10:00:00Z" };
}

const completeWave = {
  wave: 1,
  credits: 74,
  placements: [{ padId: "p03", classId: "nova", level: 1, targeting: "FRONT" }],
  colony: { health: 20, shield: 0 },
  powers: { "frost-pulse": 1 },
};

describe("op schema", () => {
  it.each([
    ["SAVE_PREP", { credits: 150, placements: [] }],
    ["START_WAVE", { wave: 1, credits: 150, placements: [] }],
    ["COMPLETE_WAVE", completeWave],
    ["SUBMIT_ATTEMPT", { slotId: "N-001", answer: "c" }],
    ["DEFEAT", { wave: 1 }],
    ["ABANDON", {}],
  ])("accepts a valid %s", (type, payload) => {
    expect(validate("op.schema.json", op(type, payload))).toEqual([]);
  });

  it.each([
    ["SAVE_PREP", { credits: 150, placements: [], extra: 1 }],
    ["START_WAVE", { wave: 1, credits: 150, placements: [], extra: 1 }],
    ["COMPLETE_WAVE", { ...completeWave, extra: 1 }],
    ["SUBMIT_ATTEMPT", { slotId: "N-001", answer: "c", extra: 1 }],
    ["DEFEAT", { wave: 1, extra: 1 }],
    ["ABANDON", { extra: 1 }],
  ])("refuses an unknown field in a %s payload", (type, payload) => {
    expect(validate("op.schema.json", op(type, payload))).toEqual([{ field: "op.payload.extra", rule: "additionalProperties" }]);
  });

  it("refuses unknown fields inside nested objects too", () => {
    const payload = {
      ...completeWave,
      placements: [{ padId: "p03", classId: "nova", level: 1, targeting: "FRONT", damage: 99 }],
      colony: { health: 20, shield: 0, regen: 1 },
    };
    expect(validate("op.schema.json", op("COMPLETE_WAVE", payload))).toEqual([
      { field: "op.payload.placements[0].damage", rule: "additionalProperties" },
      { field: "op.payload.colony.regen", rule: "additionalProperties" },
    ]);
  });

  it("checks power names with propertyNames and charges as counts", () => {
    const payload = { ...completeWave, powers: { Frost_Pulse: 1, "comet-burst": -1 } };
    expect(validate("op.schema.json", op("COMPLETE_WAVE", payload))).toEqual([
      { field: "op.payload.powers.Frost_Pulse", rule: "propertyNames" },
      { field: "op.payload.powers.comet-burst", rule: "minimum" },
    ]);
  });

  it("treats booleans and fractions as not integers, and 1.0 as an integer", () => {
    expect(validate("op.schema.json", op("DEFEAT", { wave: true }))).toEqual([{ field: "op.payload.wave", rule: "type" }]);
    expect(validate("op.schema.json", op("DEFEAT", { wave: 1.5 }))).toEqual([{ field: "op.payload.wave", rule: "type" }]);
    expect(validate("op.schema.json", op("DEFEAT", { wave: 1.0 }))).toEqual([]);
  });

  it("bounds waves to 1..999 and credits to 32 bits", () => {
    expect(validate("op.schema.json", op("DEFEAT", { wave: 0 }))).toEqual([{ field: "op.payload.wave", rule: "minimum" }]);
    expect(validate("op.schema.json", op("DEFEAT", { wave: 1000 }))).toEqual([{ field: "op.payload.wave", rule: "maximum" }]);
    expect(validate("op.schema.json", op("SAVE_PREP", { credits: 2147483648, placements: [] }))).toEqual([
      { field: "op.payload.credits", rule: "maximum" },
    ]);
  });

  it("limits the answer to 64 characters of the canonical alphabet", () => {
    const answer = (text: string) => validate("op.schema.json", op("SUBMIT_ATTEMPT", { slotId: "N-001", answer: text }));
    expect(answer("a".repeat(64))).toEqual([]);
    expect(answer("a".repeat(65))).toEqual([
      { field: "op.payload.answer", rule: "maxLength" },
      { field: "op.payload.answer", rule: "pattern" },
    ]);
    expect(answer("")).toEqual([{ field: "op.payload.answer", rule: "pattern" }]);
    expect(answer("c\n")).toEqual([{ field: "op.payload.answer", rule: "pattern" }]);
  });

  it("counts string length in code points", () => {
    // 64 astral characters are 128 UTF-16 units but 64 characters: only the pattern fails, not maxLength.
    const answer = "\u{1F680}".repeat(64);
    expect(validate("op.schema.json", op("SUBMIT_ATTEMPT", { slotId: "N-001", answer }))).toEqual([
      { field: "op.payload.answer", rule: "pattern" },
    ]);
  });

  it("checks slot IDs", () => {
    expect(validate("op.schema.json", op("SUBMIT_ATTEMPT", { slotId: "N-1", answer: "c" }))).toEqual([
      { field: "op.payload.slotId", rule: "pattern" },
    ]);
  });

  it("reports an op that is not an object at the root", () => {
    expect(validate("op.schema.json", "SAVE_PREP")).toEqual([{ field: "op", rule: "type" }]);
    expect(validate("op.schema.json", null)).toEqual([{ field: "op", rule: "type" }]);
  });

  it("reports a missing payload once", () => {
    const { payload: _payload, ...rest } = op("SAVE_PREP", {});
    expect(validate("op.schema.json", rest)).toEqual([{ field: "op.payload", rule: "required" }]);
  });
});

describe("op envelope schema", () => {
  const envelope = (ops: unknown[], extra: Record<string, unknown> = {}) => ({
    protocolVersion: 1,
    sessionId: SESSION_ID,
    generation: 7,
    ops,
    ...extra,
  });

  it("accepts 1 to 25 ops", () => {
    expect(validate("op-envelope.schema.json", envelope([op("ABANDON", {})]), "body")).toEqual([]);
    expect(validate("op-envelope.schema.json", envelope(Array.from({ length: 25 }, () => op("ABANDON", {}))), "body")).toEqual([]);
  });

  it("refuses an empty batch and a batch of 26", () => {
    expect(validate("op-envelope.schema.json", envelope([]), "body")).toEqual([{ field: "body.ops", rule: "minItems" }]);
    expect(validate("op-envelope.schema.json", envelope(Array.from({ length: 26 }, () => op("ABANDON", {}))), "body")).toEqual([
      { field: "body.ops", rule: "maxItems" },
    ]);
  });

  it("refuses unknown envelope fields and checks every op, payload included", () => {
    const bad = envelope([op("ABANDON", {}), op("CHOOSE_ENDLESS", {}), op("DEFEAT", { wave: 1, x: 1 })], { runId: SESSION_ID });
    expect(validate("op-envelope.schema.json", bad, "body")).toEqual([
      { field: "body.ops[1].type", rule: "enum" },
      { field: "body.ops[2].payload.x", rule: "additionalProperties" },
      { field: "body.runId", rule: "additionalProperties" },
    ]);
  });

  it("requires the session fields", () => {
    expect(validate("op-envelope.schema.json", { protocolVersion: 1, ops: [op("ABANDON", {})] }, "body")).toEqual([
      { field: "body.sessionId", rule: "required" },
      { field: "body.generation", rule: "required" },
    ]);
  });
});

describe("run state schema", () => {
  it("refuses a slot with more than three attempts", () => {
    const attempt = (n: number) => ({ n, attemptId: OP_ID, answer: "a", correct: false });
    const state = {
      mode: "CHALLENGE",
      status: "IN_PROGRESS",
      stage: "AUTHORED",
      phase: "ACTIVITY",
      wave: 2,
      finalWave: 2,
      highestCompletedWave: 1,
      campaignCompleted: false,
      plannedThrough: 1,
      revision: 3,
      powerChargeCap: 2,
      snapshot: { credits: 0, placements: [], colony: { health: 20, shield: 0 }, powers: {} },
      slots: [
        {
          slotId: "N-001",
          kind: "NORMAL",
          status: "UNRESOLVED",
          attempts: [attempt(1), attempt(2), attempt(3), attempt(4)],
          accepted: ["c"],
          withdrawn: false,
          reward: { credits: 30 },
        },
      ],
    };
    expect(validate("run-state.schema.json", state, "state")).toEqual([
      { field: "state.slots[0].attempts", rule: "maxItems" },
      { field: "state.slots[0].attempts[3].n", rule: "maximum" },
    ]);
  });
});

describe("validate", () => {
  it("throws for an unknown schema", () => {
    expect(() => validate("nope.schema.json", {})).toThrow("unknown schema");
  });
});
