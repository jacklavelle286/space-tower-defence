// The battle preview handoff (Gate M, LD12; scope-level-designer.md §4 option C): the level editor (admin) opens the
// real battlefield in a new tab on the admin site, /preview/battle-preview.html, and passes it the draft over a
// same-origin BroadcastChannel. No server is involved: the preview never calls the API, so it can never create a run,
// bounds or a reward (AC-04).
//
//   preview tab  -> {type: "ready", session}            as soon as it loads (again every second until it has a draft)
//   editor tab   -> {type: "draft", session, draft}     once, to the session it opened
//
// `session` is a random ID the editor puts in the preview's address, so two previews open at once never swap drafts.

export const PREVIEW_CHANNEL = "scd-battle-preview";
/** Where the preview is published on the admin site (web/player's second build entry). */
export const PREVIEW_PATH = "/preview/battle-preview.html";

export type PreviewMode = "watch" | "play";
export type PreviewSpeed = 1 | 2 | 4;

export interface PreviewDraft {
  /** The live ruleset as R46 sent it. */
  readonly ruleset: unknown;
  /** The level merged into its live planet (game-core mergeLevel), as JSON. */
  readonly planet: unknown;
  readonly waveSetId: string;
  /** The wave to start at (1-based position in the wave set). */
  readonly wave: number;
  /** watch: the competent test player's towers, Ready pressed by itself; play: the operator plays. */
  readonly mode: PreviewMode;
  readonly speed: PreviewSpeed;
  /** Shown in the preview's title bar: the level's name. */
  readonly title: string;
}

export type PreviewMessage =
  | { readonly type: "ready"; readonly session: string }
  | { readonly type: "draft"; readonly session: string; readonly draft: PreviewDraft };

const SESSION = /^[0-9a-f-]{36}$/u;

/** A message from the channel, checked (anything else from the channel is ignored). */
export function previewMessage(data: unknown): PreviewMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const m = data as Record<string, unknown>;
  if (typeof m["session"] !== "string" || !SESSION.test(m["session"])) return null;
  if (m["type"] === "ready") return { type: "ready", session: m["session"] };
  if (m["type"] !== "draft" || typeof m["draft"] !== "object" || m["draft"] === null) return null;
  const d = m["draft"] as Record<string, unknown>;
  const wave = d["wave"];
  const ok =
    typeof d["waveSetId"] === "string" &&
    typeof wave === "number" &&
    Number.isInteger(wave) &&
    wave >= 1 &&
    wave <= 60 &&
    (d["mode"] === "watch" || d["mode"] === "play") &&
    (d["speed"] === 1 || d["speed"] === 2 || d["speed"] === 4) &&
    typeof d["title"] === "string";
  return ok ? { type: "draft", session: m["session"], draft: d as unknown as PreviewDraft } : null;
}
