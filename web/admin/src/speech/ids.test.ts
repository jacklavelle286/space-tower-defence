import { describe, expect, it } from "vitest";
import { ID_MAX, planNewSpeech, slug } from "./ids";

const none = new Map<string, string>();

describe("New speech IDs", () => {
  it("follows the content's conventions for each kind", () => {
    expect(planNewSpeech("PHONEME", " SH ", none)).toEqual({
      ok: true,
      speechId: "phoneme-sh",
      title: "Sound sh",
      exists: false,
    });
    expect(planNewSpeech("LETTER_NAME", "b", none)).toEqual({
      ok: true,
      speechId: "letter-b",
      title: "Letter B",
      exists: false,
    });
    expect(planNewSpeech("WORD", "ship.", none)).toEqual({
      ok: true,
      speechId: "word-ship",
      title: "Word ship",
      exists: false,
    });
    expect(
      planNewSpeech("DICTATION", "The cat sat on the mat.", none),
    ).toMatchObject({
      speechId: "dictation-the-cat-sat-on-the",
      text: "The cat sat on the mat.",
    });
  });

  it("sends the word only when the ID cannot spell it back", () => {
    expect(planNewSpeech("WORD", "don't", none)).toMatchObject({
      speechId: "word-dont",
      text: "don't.",
    });
    expect(planNewSpeech("WORD", "ice cream", none)).not.toHaveProperty("text");
    expect(planNewSpeech("WORD", "café", none)).toMatchObject({
      speechId: "word-cafe",
      text: "café.",
    });
  });

  it("opens a sound, letter or word that exists, and numbers a sentence", () => {
    expect(
      planNewSpeech("WORD", "ship", new Map([["word-ship", "Word ship"]])),
    ).toMatchObject({ speechId: "word-ship", exists: true });
    const taken = new Map([
      ["instruction-listen", "Listen."],
      ["instruction-listen-2", "Listen now."],
    ]);
    expect(planNewSpeech("INSTRUCTION", "Listen!", taken)).toMatchObject({
      speechId: "instruction-listen-3",
      exists: false,
    });
  });

  it("opens a sentence that exists already instead of numbering a copy", () => {
    const taken = new Map([
      ["instruction-listen-which-word-is-this", "Listen. Which word is this?"],
      ["instruction-listen", "Listen."],
      ["instruction-listen-2", "Listen now."],
    ]);
    expect(
      planNewSpeech("INSTRUCTION", " Listen.  Which word is this? ", taken),
    ).toEqual({
      ok: true,
      speechId: "instruction-listen-which-word-is-this",
      title: "Listen. Which word is this?",
      exists: true,
    });
    const numbered = new Map([...taken, ["instruction-listen-3", "Listen!"]]);
    expect(planNewSpeech("INSTRUCTION", "Listen!", numbered)).toMatchObject({
      speechId: "instruction-listen-3",
      exists: true,
    });
    expect(
      planNewSpeech("INSTRUCTION", "Listen. Which word is this one?", taken),
    ).toMatchObject({
      speechId: "instruction-listen-which-word-is-this-2",
      exists: false,
    });
  });

  it("refuses a word whose ID would have to be cut, so an ID always spells its whole word", () => {
    const fits = "a".repeat(ID_MAX - "word-".length);
    expect(planNewSpeech("WORD", fits, none)).toMatchObject({
      ok: true,
      speechId: `word-${fits}`,
    });
    expect(planNewSpeech("WORD", `${fits}b`, none)).toEqual({
      ok: false,
      reason: `Keep the word to ${fits.length} letters.`,
    });
    expect(
      planNewSpeech("WORD", "an extraordinarily wonderful long phrase", none)
        .ok,
    ).toBe(false);
  });

  it("keeps every ID within the key pattern", () => {
    const long =
      "Supercalifragilistic expialidocious extraordinarily wonderful astonishing sentences";
    for (const kind of ["INSTRUCTION", "DICTATION"] as const) {
      const plan = planNewSpeech(kind, long, none);
      if (!plan.ok) throw new Error(plan.reason);
      expect(plan.speechId.length).toBeLessThanOrEqual(ID_MAX - 3);
      expect(plan.speechId).toMatch(/^[a-z0-9-]{1,40}$/u);
      expect(plan.speechId.endsWith("-")).toBe(false);
    }
    expect(slug("  Hello,  World! ")).toBe("hello-world");
  });

  it("refuses what cannot be that kind", () => {
    expect(planNewSpeech("PHONEME", "s h", none).ok).toBe(false);
    expect(planNewSpeech("PHONEME", "shhhh", none).ok).toBe(false);
    expect(planNewSpeech("LETTER_NAME", "bb", none).ok).toBe(false);
    expect(planNewSpeech("WORD", "!!", none).ok).toBe(false);
    expect(planNewSpeech("INSTRUCTION", "   ", none).ok).toBe(false);
    expect(planNewSpeech("DICTATION", "a".repeat(301), none).ok).toBe(false);
  });
});
