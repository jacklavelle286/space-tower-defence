// The speech list's search and filters (Phase 40). R17 returns every header (all pages, api.ts listSpeech) and the
// browser filters them, as the activity list does (activityList.ts).

import type { SpeechKind, SpeechSummary } from "../api";

export type SpeechFilter = { readonly search: string; readonly kind: SpeechKind | ""; readonly state: SpeechSummary["state"] | "" };

export const NO_SPEECH_FILTER: SpeechFilter = { search: "", kind: "", state: "" };

/** Search covers the ID and the title; kind and state match exactly. Sorted by ID. */
export function filterSpeech(items: readonly SpeechSummary[], filter: SpeechFilter): SpeechSummary[] {
  const needle = filter.search.trim().toLowerCase();
  return items
    .filter((item) => filter.kind === "" || item.kind === filter.kind)
    .filter((item) => filter.state === "" || item.state === filter.state)
    .filter((item) => needle === "" || item.speechId.includes(needle) || item.title.toLowerCase().includes(needle))
    .sort((a, b) => a.speechId.localeCompare(b.speechId));
}
