// "New speech" (Phase 40, M3-05): the operator picks a kind and types the word, sound, letter or sentence; this module
// turns that into the R18 request. The speechId follows the conventions the content already uses
// (content/listening-verdicts.json items, content/seed/speech, gate G-14):
//
//   PHONEME      phoneme-<sound>      phoneme-sh     G-14 finds the sound's verdict by this name (admin-api insists)
//   LETTER_NAME  letter-<letter>      letter-a
//   WORD         word-<word>          word-ship, word-ice-cream
//   INSTRUCTION  instruction-<slug>   instruction-listen      (the first few words of the sentence)
//   DICTATION    dictation-<slug>     dictation-the-cat-sat
//
// Collisions. A sound, letter or word names one thing, so an ID that exists already IS that speech: the page opens it
// instead of making a second copy (speech is reused across activities, O-2). A sentence is the same speech only when
// it is the same sentence: if a definition with this sentence's base ID (or its -2, -3, ...) has the sentence as its
// title (the title of a sentence is the sentence itself), that one is opened. Two different sentences can share their
// first words, so otherwise the first free ID of base, base-2, base-3, ... is used (admin-api's create is idempotent,
// so a clash would silently return the other sentence; NewSpeech also checks the returned draft for that).
//
// The body. For a sound or letter nothing is sent: admin-api starts the draft from the form the owner heard in the
// bake-off (api/shared/verdicts.py starting_body). A word is sent only when its ID cannot spell it back (an apostrophe,
// a capital); a sentence is always sent. A word whose ID would not fit in 40 characters is refused rather than cut, so an
// ID always spells its whole word back.

import { LIMITS } from "@scd/shared";
import type { SpeechKind } from "../api";

export const ID_MAX = 40; // contracts/limits.json ids.keyId: ^[a-z0-9-]{1,40}$
const TITLE_MAX = 80;
const TEXT_MAX: number = LIMITS.previewTextMaxLength;
const SENTENCE_WORDS = 5;
const SUFFIX_ROOM = 3; // "-99"

export type KindInfo = {
  readonly label: string;
  readonly prefix: string;
  /** The one field's label in the New speech form. */
  readonly ask: string;
  readonly placeholder: string;
  /** Plain text or SSML, as the kind needs it (the editor opens on this field for an empty draft). */
  readonly field: "text" | "ssml";
};

export const KIND_INFO: Readonly<Record<SpeechKind, KindInfo>> = {
  PHONEME: { label: "Sound", prefix: "phoneme", ask: "Sound (its letters)", placeholder: "sh", field: "ssml" },
  LETTER_NAME: { label: "Letter name", prefix: "letter", ask: "Letter", placeholder: "b", field: "text" },
  WORD: { label: "Word", prefix: "word", ask: "Word", placeholder: "ship", field: "text" },
  INSTRUCTION: { label: "Instruction", prefix: "instruction", ask: "Sentence", placeholder: "Tap the star.", field: "text" },
  DICTATION: { label: "Dictation", prefix: "dictation", ask: "Sentence", placeholder: "The cat sat on the mat.", field: "text" },
};

export type NewSpeechPlan =
  | { readonly ok: false; readonly reason: string }
  | {
      readonly ok: true;
      readonly speechId: string;
      readonly title: string;
      /** True when this ID exists already: open it rather than create. */
      readonly exists: boolean;
      /** The first body to send with R18, if any. */
      readonly text?: string;
    };

/** Lower case, accents dropped, apostrophes dropped, every other run of non-letters or digits one hyphen. */
export function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/gu, "")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

/** `prefix-slug`, cut at a hyphen so the whole ID is at most `max` characters. */
function idOf(prefix: string, words: string, max: number): string {
  let rest = words;
  while (`${prefix}-${rest}`.length > max && rest.includes("-")) rest = rest.slice(0, rest.lastIndexOf("-"));
  return `${prefix}-${rest}`.slice(0, max).replace(/-+$/u, "");
}

function shortTitle(value: string): string {
  return value.length <= TITLE_MAX ? value : `${value.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

/** Speech that exists already: speechId to its title (from the speech list). */
export type TakenSpeech = ReadonlyMap<string, string>;

/** The same sentence, ignoring Unicode form and runs of white space (what admin-api's canonical_text ignores). */
function sameSentence(a: string, b: string): boolean {
  const canon = (value: string) => value.normalize("NFC").replace(/\s+/gu, " ").trim();
  return canon(a) === canon(b);
}

/** The speechId, title and first body for what the operator typed, or the reason it cannot be one. */
export function planNewSpeech(kind: SpeechKind, typed: string, taken: TakenSpeech): NewSpeechPlan {
  const said = typed.trim().replace(/\s+/gu, " ");
  const { prefix } = KIND_INFO[kind];
  switch (kind) {
    case "PHONEME": {
      const sound = said.toLowerCase();
      if (!/^[a-z]{1,4}$/u.test(sound)) return { ok: false, reason: "Type the letters of the sound, for example sh or igh." };
      const speechId = `${prefix}-${sound}`;
      return { ok: true, speechId, title: `Sound ${sound}`, exists: taken.has(speechId) };
    }
    case "LETTER_NAME": {
      const letter = said.toLowerCase();
      if (!/^[a-z]$/u.test(letter)) return { ok: false, reason: "Type one letter, for example b." };
      const speechId = `${prefix}-${letter}`;
      return { ok: true, speechId, title: `Letter ${letter.toUpperCase()}`, exists: taken.has(speechId) };
    }
    case "WORD": {
      const word = said.replace(/[.!?]+$/u, "");
      const words = slug(word);
      if (words === "") return { ok: false, reason: "Type the word, for example ship." };
      const speechId = `${prefix}-${words}`;
      if (speechId.length > ID_MAX) return { ok: false, reason: `Keep the word to ${ID_MAX - prefix.length - 1} letters.` };
      const spelledBack = words.replace(/-/gu, " ") === word;
      return {
        ok: true,
        speechId,
        title: shortTitle(`Word ${word}`),
        exists: taken.has(speechId),
        ...(spelledBack ? {} : { text: `${word}.` }),
      };
    }
    case "INSTRUCTION":
    case "DICTATION": {
      const words = slug(said).split("-").slice(0, SENTENCE_WORDS).join("-");
      if (words === "") return { ok: false, reason: "Type the sentence the voice should say." };
      if (said.length > TEXT_MAX) return { ok: false, reason: `Keep it to ${TEXT_MAX} characters.` };
      const base = idOf(prefix, words, ID_MAX - SUFFIX_ROOM);
      const title = shortTitle(said);
      let speechId = base;
      for (let n = 2; taken.has(speechId); n += 1) {
        // The same sentence typed again is the speech that exists (a title only holds the whole sentence up to 80).
        if (title === said && sameSentence(taken.get(speechId) ?? "", said)) return { ok: true, speechId, title, exists: true };
        speechId = `${base}-${n}`;
      }
      return { ok: true, speechId, title, exists: false, text: said };
    }
  }
}
