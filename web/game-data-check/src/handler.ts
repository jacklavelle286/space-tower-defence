// The Lambda entry point (Node 24, `index.handler`). Invoked only by the game-data publisher (its role alone may
// invoke it, infrastructure/main/publisher.tf); the event is a CheckInput and the answer a CheckOutput. It has no
// AWS permissions beyond its own logs.
// `mode: "rebuild"` (AM1) builds a published document's bounds under a new ruleset instead.
import { check, rebuild, type CheckInput, type CheckOutput, type RebuildInput, type RebuildOutput } from "./check";

export async function handler(event: CheckInput | RebuildInput): Promise<CheckOutput | RebuildOutput> {
  return "mode" in event && event.mode === "rebuild" ? rebuild(event) : check(event as CheckInput);
}
