// Plain words for the speech refusals admin-api can give (G R18, R20, R21), so the operator knows what to do next.
// Anything else falls back to the shared wording (api.ts describeError).

import { ApiError, describeError } from "../api";

const RULES: Readonly<Record<string, string>> = {
  phoneme_word_only: "This sound is taught only inside words (its listening verdict is word-only), so it cannot be a sound clip on its own.",
  phoneme_prefix: "A sound's ID must be phoneme- followed by the sound, for example phoneme-sh.",
  clip_mismatch: "The clip you played is not the clip of the saved draft. Preview again and listen before approving.",
  not_previewed: "There is no preview of this exact draft. Press Preview and listen first.",
  xml: "The SSML is not well formed: check every tag is closed.",
  tag: "The SSML uses a tag the voice service does not allow here (allowed: break, phoneme, prosody, s, p, sub, w).",
  attribute: "The SSML has an attribute or value that is not allowed (for example pitch, or an empty ph).",
  declaration: "The SSML may not contain declarations or comments.",
};

export function speechError(error: unknown): string {
  if (error instanceof ApiError && error.code === "VALIDATION_FAILED") {
    const known = error.details.map((p) => RULES[p.rule]).filter((m): m is string => m !== undefined);
    if (known.length > 0) return known.join(" ");
  }
  return describeError(error);
}
