// The editor and admin-api agree on each type's JSON shape (Phase 39). contracts/fixtures/activities/editor-drafts.json
// holds one draft per editor kind; api/tests/unit/test_activity_fixtures.py proves admin-api's validation finds no
// problem in any of them. Here: the editor reads each draft into its fields and writes back exactly the same draft
// (so a draft the editor makes from those fields is one the server accepts), the child's panel can show it, and the
// answer the UI tests solve with is one of its accepted answers. editor.test.tsx builds each one through the form.
import { describe, expect, it } from "vitest";
import { DRAFTS } from "../testing/drafts";
import { acceptedOf, fromDefinition, KINDS, toDefinition } from "./model";
import { previewActivity } from "./PreviewSolve";

describe("the shared editor drafts", () => {
  it("cover every editor kind and a two-step activity", () => {
    expect(DRAFTS.map((d) => d.kind).sort()).toEqual([...KINDS.map((k) => k.kind), "TWO_STEP"].sort());
  });

  for (const draft of DRAFTS) {
    describe(draft.kind, () => {
      const definition = draft.definition;

      it("round-trips through the editor's fields unchanged", () => {
        expect(toDefinition(definition, fromDefinition(definition))).toEqual(definition);
      });

      it("has every answer in the canonicaliser's form", () => {
        const state = fromDefinition(definition);
        expect(acceptedOf(state.step).every((built) => built.canonical)).toBe(true);
        if (state.second !== null) expect(acceptedOf(state.second.step).every((built) => built.canonical)).toBe(true);
      });

      it("shows in the child's panel, and the solving answer is accepted", () => {
        const activity = previewActivity(definition);
        expect(activity).not.toBeNull();
        expect(activity?.accepted).toContain(draft.solve);
      });

      it("names only the speech it lists", () => {
        const ids = Object.values(definition.speechDefinitionReferences ?? {}).map((r) => r.speechId);
        expect(ids.sort()).toEqual([...draft.speech].sort());
      });
    });
  }
});
