// Unsaved changes survive navigation (Phase 39 review point 4). The editor keeps the operator's edits in this tab's
// sessionStorage, keyed by activity, together with the draft revision they were made on. Coming back to the activity
// (Back, a nav link, a refresh) restores them when the draft has not been saved since; if someone saved a newer
// revision in between, the stale edits are not restored over it (DRAFT_CONFLICT would refuse them anyway). Closing
// the tab with unsaved edits asks first (beforeunload). sessionStorage is per tab and is cleared when the tab closes;
// it holds content text only, never a token.
import type { EditorState } from "./model";

const PREFIX = "scd-admin-unsaved:";

type Stored = { readonly draftRevision: number; readonly state: EditorState };

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function keepUnsaved(activityId: string, draftRevision: number, state: EditorState): void {
  try {
    storage()?.setItem(`${PREFIX}${activityId}`, JSON.stringify({ draftRevision, state } satisfies Stored));
  } catch {
    // Storage full or blocked: the beforeunload prompt still protects a refresh or a closed tab.
  }
}

export function forgetUnsaved(activityId: string): void {
  try {
    storage()?.removeItem(`${PREFIX}${activityId}`);
  } catch {
    // nothing to forget
  }
}

/** The edits kept for this activity, if they were made on `draftRevision`. */
export function unsavedFor(activityId: string, draftRevision: number): EditorState | null {
  try {
    const raw = storage()?.getItem(`${PREFIX}${activityId}`);
    if (raw === null || raw === undefined) return null;
    const stored = JSON.parse(raw) as Partial<Stored>;
    if (stored.draftRevision !== draftRevision || typeof stored.state !== "object" || stored.state === null) return null;
    return stored.state;
  } catch {
    return null;
  }
}
