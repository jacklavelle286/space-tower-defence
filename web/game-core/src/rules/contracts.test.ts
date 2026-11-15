// The contracts stay one definition: the generated TypeScript is up to date with contracts/, and every limit that
// appears inside a schema equals the shared limits file.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { staleFiles } from "../../scripts/gen-contracts";
import { LIMITS, SCHEMAS } from "./contracts.generated";

const CONTRACTS = resolve(import.meta.dirname, "..", "..", "..", "..", "contracts");

/** Follow a JSON pointer such as "/$defs/answer/maxLength" into one of the embedded schemas. */
function at(schemaId: string, pointer: string): unknown {
  let node: unknown = SCHEMAS[schemaId];
  for (const part of pointer.split("/").filter((p) => p !== "")) {
    node = typeof node === "object" && node !== null ? (node as Record<string, unknown>)[part] : undefined;
  }
  return node;
}

describe("generated contract files", () => {
  it("are up to date with contracts/ (run `node game-core/scripts/gen-contracts.ts` in web/ if this fails)", () => {
    expect(staleFiles()).toEqual([]);
  });

  it("carry contracts/limits.json without its comment", () => {
    const { $comment: _comment, ...limits } = JSON.parse(readFileSync(resolve(CONTRACTS, "limits.json"), "utf8")) as Record<string, unknown>;
    expect(LIMITS).toEqual(limits);
  });
});

describe("schemas use the shared limits", () => {
  const cases: [string, string, unknown][] = [
    ["common.schema.json", "/$defs/uuid/pattern", LIMITS.ids.uuid],
    ["common.schema.json", "/$defs/slotId/pattern", LIMITS.ids.slotId],
    ["common.schema.json", "/$defs/keyId/pattern", LIMITS.ids.keyId],
    ["common.schema.json", "/$defs/count/maximum", LIMITS.integerMax],
    ["common.schema.json", "/$defs/wave/maximum", LIMITS.endless.finalWave],
    ["common.schema.json", "/$defs/targeting/enum", LIMITS.targeting],
    ["common.schema.json", "/$defs/placement/properties/level/minimum", LIMITS.placementLevel.min],
    ["common.schema.json", "/$defs/placement/properties/level/maximum", LIMITS.placementLevel.max],
    ["common.schema.json", "/$defs/placements/maxItems", LIMITS.placementsMax],
    ["common.schema.json", "/$defs/answer/maxLength", LIMITS.answer.maxLength],
    ["common.schema.json", "/$defs/answer/pattern", LIMITS.answer.pattern],
    ["common.schema.json", "/$defs/clientTime/maxLength", LIMITS.clientTimeMaxLength],
    ["op-envelope.schema.json", "/properties/ops/minItems", LIMITS.opsPerBatch.min],
    ["op-envelope.schema.json", "/properties/ops/maxItems", LIMITS.opsPerBatch.max],
    ["op-envelope.schema.json", "/properties/protocolVersion/maximum", LIMITS.integerMax],
    ["run-state.schema.json", "/properties/highestCompletedWave/maximum", LIMITS.endless.finalWave],
    ["run-state.schema.json", "/properties/plannedThrough/maximum", LIMITS.endless.maxPlannedInterval],
    ["run-state.schema.json", "/$defs/slot/properties/attempts/maxItems", LIMITS.attemptsPerSlot],
    ["run-state.schema.json", "/$defs/attempt/properties/n/maximum", LIMITS.attemptsPerSlot],
    ["op-result.schema.json", "/$defs/attemptResult/properties/n/maximum", LIMITS.attemptsPerSlot],
    ["op-result.schema.json", "/$defs/phaseMismatchDetails/properties/currentSlotId/pattern", LIMITS.ids.slotId],
  ];

  it.each(cases)("%s %s", (schemaId, pointer, limit) => {
    expect(at(schemaId, pointer)).toEqual(limit);
  });

  it("the answer pattern's length bound is the answer limit", () => {
    expect(LIMITS.answer.pattern.endsWith(`{1,${LIMITS.answer.maxLength}}$`)).toBe(true);
  });

  it("the answer pattern allows each reserved separator (they join answer parts) and nothing upper case", () => {
    const pattern = new RegExp(LIMITS.answer.pattern, "u");
    for (const separator of LIMITS.answer.reservedSeparators) expect(pattern.test(`a${separator}b`)).toBe(true);
    expect(pattern.test("A")).toBe(false);
  });

  it("every schema rejects unknown fields on every object with properties", () => {
    const open: string[] = [];
    const walk = (node: unknown, where: string): void => {
      if (typeof node !== "object" || node === null) return;
      const record = node as Record<string, unknown>;
      const properties = record["properties"];
      if (record["type"] === "object" && typeof properties === "object" && properties !== null && record["additionalProperties"] !== false) {
        open.push(where);
      }
      for (const [key, value] of Object.entries(record)) walk(value, `${where}/${key}`);
    };
    for (const [id, schema] of Object.entries(SCHEMAS)) walk(schema, id);
    expect(open).toEqual([]);
  });
});
