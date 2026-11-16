// Template instances (Phase 41, C25) through the real learning panel and the TypeScript canonicaliser. The instances are
// the Python generator snapshots in api/tests/snapshots/generators/ (never edited; api/tests/unit/test_generators.py).
// For each one: the panel can show it exactly like a FIXED activity (toPanelActivity), and the answer a child would give
// canonicalises to the generated accepted answer, so generated answers are already canonical (C20.1, C25.3).
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { answerSpecOf, panelSteps, toPanelActivity } from "./activity";
import { canonicalise, type RawAnswer } from "./canonical";

type Payload = {
  tiles?: { id: string; value: string }[];
};
type Instance = {
  prompt: { text: string };
  activityPayload: Payload;
  answerSpecification: { accepted: string[] };
};
type Snapshot = { kind: string; version: number; cases: { name: string; interactionType: string; instances: Record<string, Instance> }[] };

const DIR = resolve(import.meta.dirname, "..", "..", "..", "..", "api", "tests", "snapshots", "generators");
const snapshots = readdirSync(DIR)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(resolve(DIR, name), "utf8")) as Snapshot);
const resolveAsset = (assetId: string) => `/assets/activity/${assetId}.png`;

/** What the child does to give `answer`, as the panel reports it (canonical.ts RawAnswer). */
function rawFor(interactionType: string, payload: Payload, answer: string): RawAnswer {
  if (interactionType === "OBJECT_MOVE") {
    const pairs = answer.split(";").map((p) => p.split("=") as [string, string]);
    return Object.fromEntries(pairs.map(([k, v]) => [k, /^[0-9]+$/u.test(v) ? Number(v) : v]));
  }
  if (interactionType === "ARRANGE") {
    const byValue = new Map((payload.tiles ?? []).map((t) => [t.value, t.id]));
    return answer.split(",").map((value) => byValue.get(value) ?? null);
  }
  return answer;
}

describe("generated template instances", () => {
  it("has a snapshot for every generator kind", () => {
    expect(snapshots.length).toBeGreaterThanOrEqual(17);
  });

  const cases = snapshots.flatMap((s) => s.cases.flatMap((c) => Object.entries(c.instances).map(([i, inst]) => [`${s.kind}-v${s.version} ${c.name} #${i}`, c.interactionType, inst] as const)));

  it.each(cases)("%s shows in the panel and its answer is canonical", (_name, interactionType, instance) => {
    const activity = toPanelActivity(
      {
        slotId: "N-001",
        interactionType,
        prompt: instance.prompt,
        activityPayload: instance.activityPayload,
        answerSpecification: instance.answerSpecification,
        audioRequired: false,
        reward: { credits: 30 },
      },
      resolveAsset,
    );
    expect(activity).not.toBeNull();
    const [step] = panelSteps(activity!);
    const [answer] = instance.answerSpecification.accepted;
    const result = canonicalise(answerSpecOf(step!), rawFor(interactionType, instance.activityPayload, answer!));
    expect(result).toEqual({ ok: true, answer });
  });
});
