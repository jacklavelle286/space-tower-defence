// Runs contracts/fixtures/next-phase.json against the next-phase rule.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Slot, SlotKind } from "./contracts.generated";
import { currentSlotId, nextPhase, slotIdFor } from "./next-phase";

type Vectors = {
  cases: { name: string; interval: number; slots: Pick<Slot, "slotId" | "status">[]; expected: string }[];
  slotIds: { kind: SlotKind; interval: number; expected: string }[];
};

const vectors = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "..", "..", "..", "..", "contracts", "fixtures", "next-phase.json"), "utf8"),
) as Vectors;

describe("next-phase vectors", () => {
  it.each(vectors.cases.map((c) => [c.name, c]))("%s", (_name, vector) => {
    expect(nextPhase(vector.slots, vector.interval)).toBe(vector.expected);
  });

  it("cover all three answers", () => {
    expect(new Set(vectors.cases.map((c) => c.expected))).toEqual(new Set(["ACTIVITY", "METEOR", "BUILD"]));
  });
});

describe("slot IDs", () => {
  it.each(vectors.slotIds.map((v) => [v.expected, v]))("%s", (_name, vector) => {
    expect(slotIdFor(vector.kind, vector.interval)).toBe(vector.expected);
  });
});

describe("current slot", () => {
  it("is N-<wave-1> in ACTIVITY, M-<wave-1> in METEOR, and none otherwise", () => {
    expect(currentSlotId({ phase: "ACTIVITY", wave: 2 })).toBe("N-001");
    expect(currentSlotId({ phase: "METEOR", wave: 10 })).toBe("M-009");
    for (const phase of ["BUILD", "IN_WAVE", "COMPLETION_OFFER"] as const) expect(currentSlotId({ phase, wave: 10 })).toBeNull();
    expect(currentSlotId({ wave: 10 })).toBeNull();
  });
});
