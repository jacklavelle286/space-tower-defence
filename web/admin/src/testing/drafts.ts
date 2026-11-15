// The shared editor drafts (contracts/fixtures/activities/editor-drafts.json), read from the repository for tests:
// one per editor kind, which admin-api's validation accepts (api/tests/unit/test_activity_fixtures.py).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Definition } from "../api";

export type SharedDraft = {
  readonly kind: string;
  /** The speech definitions it refers to. */
  readonly speech: readonly string[];
  /** A right answer, as the child's panel sends it. */
  readonly solve: string;
  readonly definition: Definition;
};

export const DRAFTS: readonly SharedDraft[] = (
  JSON.parse(readFileSync(resolve(__dirname, "../../../../contracts/fixtures/activities/editor-drafts.json"), "utf8")) as { drafts: SharedDraft[] }
).drafts;

export function draftOf(kind: string): SharedDraft {
  const draft = DRAFTS.find((d) => d.kind === kind);
  if (draft === undefined) throw new Error(`no shared draft for ${kind}`);
  return draft;
}
