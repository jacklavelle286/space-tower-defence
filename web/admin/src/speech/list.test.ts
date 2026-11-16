import { describe, expect, it } from "vitest";
import type { SpeechSummary } from "../api";
import { filterSpeech, NO_SPEECH_FILTER } from "./list";

const row = (speechId: string, kind: SpeechSummary["kind"], state: SpeechSummary["state"], title = speechId): SpeechSummary => ({
  speechId,
  title,
  kind,
  state,
  approvedVersion: state === "APPROVED" ? "v" : null,
  updatedAt: "2026-11-16T00:00:00Z",
});

describe("Speech list filter", () => {
  const items = [row("word-ship", "WORD", "APPROVED"), row("phoneme-sh", "PHONEME", "DRAFT", "Sound sh, as in shop"), row("word-cat", "WORD", "DRAFT")];

  it("matches kind and state exactly, searches ID and title, and sorts by ID", () => {
    expect(filterSpeech(items, NO_SPEECH_FILTER).map((i) => i.speechId)).toEqual(["phoneme-sh", "word-cat", "word-ship"]);
    expect(filterSpeech(items, { ...NO_SPEECH_FILTER, kind: "WORD", state: "DRAFT" }).map((i) => i.speechId)).toEqual(["word-cat"]);
    expect(filterSpeech(items, { ...NO_SPEECH_FILTER, search: " SHOP " }).map((i) => i.speechId)).toEqual(["phoneme-sh"]);
  });
});
