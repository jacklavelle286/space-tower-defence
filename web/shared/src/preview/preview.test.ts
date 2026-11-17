// The battle preview handoff (Gate M, LD12): only well-formed messages for a session get through.
import { describe, expect, it } from "vitest";
import { previewMessage } from ".";

const session = "0f0f0f0f-1111-4222-8333-444444444444";
const draft = { ruleset: {}, planet: {}, waveSetId: "campaign", wave: 5, mode: "watch", speed: 4, title: "Zigzag" };

describe("previewMessage", () => {
  it("takes a ready and a draft", () => {
    expect(previewMessage({ type: "ready", session })).toEqual({ type: "ready", session });
    expect(previewMessage({ type: "draft", session, draft })?.type).toBe("draft");
  });

  it.each([
    ["no session", { type: "ready" }],
    ["a bad session", { type: "ready", session: "x" }],
    ["wave 0", { type: "draft", session, draft: { ...draft, wave: 0 } }],
    ["speed 3", { type: "draft", session, draft: { ...draft, speed: 3 } }],
    ["another mode", { type: "draft", session, draft: { ...draft, mode: "publish" } }],
    ["not an object", "ready"],
  ])("ignores %s", (_name, data) => {
    expect(previewMessage(data)).toBeNull();
  });
});
