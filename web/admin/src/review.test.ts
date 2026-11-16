import { describe, expect, it } from "vitest";
import { LIMITS } from "@scd/shared";
import type { SpeechDraft } from "./api";
import {
  canApprove,
  canPublish,
  LISTENING_CHECKLIST,
  nextTake,
  previewBody,
  PUBLISH_CHECKLIST,
  tickAll,
} from "./review";

const listened = Object.fromEntries(LISTENING_CHECKLIST.map((item) => [item.key, true]));
const reviewed = Object.fromEntries(PUBLISH_CHECKLIST.map((item) => [item.key, true]));

describe("Approve", () => {
  const base = { dirty: false, draftRevision: 2, draftClipKey: "k2", preview: { draftRevision: 2, clipKey: "k2" }, played: true, ticks: listened };

  it("is allowed only for the saved, previewed revision with every check ticked", () => {
    expect(canApprove(base)).toEqual({ ok: true });
    expect(canApprove({ ...base, dirty: true }).ok).toBe(false);
    expect(canApprove({ ...base, preview: null }).ok).toBe(false);
    expect(canApprove({ ...base, preview: { draftRevision: 1, clipKey: "k2" } }).ok).toBe(false);
    expect(canApprove({ ...base, preview: { draftRevision: 2, clipKey: "other" } }).ok).toBe(false);
    expect(canApprove({ ...base, ticks: { ...listened, purity: false } }).ok).toBe(false);
    expect(canApprove({ ...base, draftClipKey: null }).ok).toBe(false);
    expect(canApprove({ ...base, played: false })).toEqual({ ok: false, reason: "Play the clip to the end first." });
  });
});

describe("Publish", () => {
  const base = { dirty: false, draftRevision: 4, validated: { draftRevision: 4, valid: true }, solvedRevision: 4, ticks: reviewed };

  it("needs validate and preview-solve on this revision and all seven lines", () => {
    expect(canPublish(base)).toEqual({ ok: true });
    expect(canPublish({ ...base, validated: { draftRevision: 3, valid: true } }).ok).toBe(false);
    expect(canPublish({ ...base, validated: { draftRevision: 4, valid: false } }).ok).toBe(false);
    expect(canPublish({ ...base, solvedRevision: 3 }).ok).toBe(false);
    expect(canPublish({ ...base, ticks: { ...reviewed, noTraps: false } }).ok).toBe(false);
    expect(canPublish({ ...base, dirty: true }).ok).toBe(false);
  });

  it("has the seven checklist keys admin-api expects", () => {
    expect(PUBLISH_CHECKLIST.map((item) => item.key)).toEqual([
      "workedAnswer",
      "oneRightAnswer",
      "wordingSuitsAge",
      "picturesClear",
      "listenedToClips",
      "noTraps",
      "nothingPersonal",
    ]);
  });
});

describe("One tick", () => {
  it("sets or clears every key of a checklist at once", () => {
    expect(tickAll(PUBLISH_CHECKLIST, true)).toEqual(reviewed);
    expect(Object.values(tickAll(PUBLISH_CHECKLIST, false))).toEqual(PUBLISH_CHECKLIST.map(() => false));
    expect(canApprove({ dirty: false, draftRevision: 1, draftClipKey: "k", preview: { draftRevision: 1, clipKey: "k" }, played: true, ticks: tickAll(LISTENING_CHECKLIST, true) })).toEqual({ ok: true });
  });
});

describe("Takes", () => {
  it("counts up to the speechTake limit and no further", () => {
    expect(LIMITS.speechTake).toEqual({ min: 1, max: 50 });
    expect(nextTake(1)).toBe(2);
    expect(nextTake(LIMITS.speechTake.max - 1)).toBe(LIMITS.speechTake.max);
    expect(nextTake(LIMITS.speechTake.max)).toBeNull();
  });

  it("previews the saved body with the saved take", () => {
    const draft: SpeechDraft = {
      kind: "WORD",
      provider: "polly",
      engine: "generative",
      voiceId: "Amy",
      draftRevision: 3,
      take: 4,
      updatedAt: "2026-11-15T10:00:00Z",
      clipKey: "k",
      text: "ship.",
    };
    expect(previewBody(draft)).toEqual({ text: "ship.", take: 4 });
    const { text: _text, ...withoutText } = draft;
    expect(previewBody({ ...withoutText, ssml: "<s>ship.</s>" })).toEqual({ ssml: "<s>ship.</s>", take: 4 });
  });
});
