// The Lambda entry point (Node 24, `index.handler`). Invoked only by the game-data publisher (its role alone may
// invoke it, infrastructure/main/publisher.tf); the event is a CheckInput and the answer a CheckOutput. It has no
// AWS permissions beyond its own logs.
import { check, type CheckInput, type CheckOutput } from "./check";

export async function handler(event: CheckInput): Promise<CheckOutput> {
  return check(event);
}
