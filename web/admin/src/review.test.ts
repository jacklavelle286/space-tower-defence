import { describe, expect, it } from "vitest";
import type { Definition } from "./api";
import { applyForm, canApprove, canPublish, formOf, isCorrect, LISTENING_CHECKLIST, PUBLISH_CHECKLIST } from "./review";

const listened = Object.fromEntries(LISTENING_CHECKLIST.map((item) => [item.key, true]));
const reviewed = Object.fromEntries(PUBLISH_CHECKLIST.map((item) => [item.key, true]));

const PH_0102: Definition = {
  schemaVersion: 1,
  activityId: "ph-0102",
  title: "Which letters make /sh/?",
  subject: "phonics",
  topicId: "phonics-gpc-consonant-digraphs",
  minAge: 5,
  maxAge: 6,
  rewardCategory: "NORMAL",
  interactionType: "MULTIPLE_CHOICE",
  authoringMode: "FIXED",
  audioRequirement: "REQUIRED",
  curriculumReference: ["EYFS26.ELG.WordReading-1"],
  prompt: { text: "Listen. Which letters make this sound?" },
  activityPayload: {
    optionStyle: "GRAPHEME",
    options: [
      { id: "a", text: "s" },
      { id: "b", text: "sh" },
      { id: "c", text: "ch" },
      { id: "d", text: "th" },
    ],
  },
  answerSpecification: { accepted: ["b"] },
  speechDefinitionReferences: { prompt: { speechId: "phoneme-sh" } },
};

describe("Approve", () => {
  const base = { dirty: false, draftRevision: 2, draftClipKey: "k2", preview: { draftRevision: 2, clipKey: "k2" }, ticks: listened };

  it("is allowed only for the saved, previewed revision with every check ticked", () => {
    expect(canApprove(base)).toEqual({ ok: true });
    expect(canApprove({ ...base, dirty: true }).ok).toBe(false);
    expect(canApprove({ ...base, preview: null }).ok).toBe(false);
    expect(canApprove({ ...base, preview: { draftRevision: 1, clipKey: "k2" } }).ok).toBe(false);
    expect(canApprove({ ...base, preview: { draftRevision: 2, clipKey: "other" } }).ok).toBe(false);
    expect(canApprove({ ...base, ticks: { ...listened, purity: false } }).ok).toBe(false);
    expect(canApprove({ ...base, draftClipKey: null }).ok).toBe(false);
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

describe("Preview-solve and the editor", () => {
  it("judges the option ID against the answer key", () => {
    expect(isCorrect(PH_0102, "b")).toBe(true);
    expect(isCorrect(PH_0102, "a")).toBe(false);
  });

  it("round-trips a draft unchanged and keeps fields the form does not show", () => {
    expect(applyForm(PH_0102, formOf(PH_0102))).toEqual(PH_0102);
    const edited = applyForm(PH_0102, { ...formOf(PH_0102), correct: "c", promptSpeechId: "" });
    expect(edited.answerSpecification).toEqual({ accepted: ["c"] });
    expect(edited.speechDefinitionReferences).toEqual({});
    expect(edited["curriculumReference"]).toEqual(["EYFS26.ELG.WordReading-1"]);
  });
});
