import { useState, useSyncExternalStore } from "react";
import { COPY } from "../copy/en-GB";
import type { SyncQueue, SyncState } from "./queue";

function chipCopy(s: SyncState): { line: string; icon: string; grownUp?: string; button?: string } {
  switch (s.status) {
    case "SYNCED":
      return COPY.sync.SYNCED;
    case "PENDING":
      return COPY.sync.PENDING;
    case "RETRYING":
      return s.retryReason === "protocol" ? COPY.sync.RETRYING_PROTOCOL : COPY.sync.RETRYING;
    case "AUTH_REQUIRED":
      return COPY.sync.AUTH_REQUIRED;
    case "DIVERGED":
      return s.divergedReason === "STALE_SESSION" ? COPY.sync.DIVERGED_STALE : COPY.sync.DIVERGED_REJECTED;
    case "UPGRADE_REQUIRED":
      return COPY.sync.UPGRADE_REQUIRED;
  }
}

/**
 * The sync chip (D7.1): icon plus words, never colour alone (D1 rule 7). It reads the queue's `getState`, a new object only
 * when the status changes, so queueing ops re-renders nothing (React re-renders on a changed snapshot object only).
 */
export function SyncChip({
  queue,
  onSignIn,
  onReload,
  signInWarning,
}: {
  queue: SyncQueue;
  onSignIn: () => void;
  onReload?: () => void;
  /** Asked when Sign in is pressed: a line to show first (D7.1: in a wave, "Wave N will start again from the
   * beginning."), or null to go straight to sign-in. The second press then signs in. */
  signInWarning?: () => string | null;
}) {
  const snapshot = useSyncExternalStore(queue.subscribe, queue.getState);
  const copy = chipCopy(snapshot);
  // The warning belongs to this AUTH_REQUIRED episode only: `getState` gives a new object when the status changes.
  const [shown, setShown] = useState<{ text: string; during: SyncState } | null>(null);
  const warning = shown !== null && shown.during === snapshot ? shown.text : null;
  const pressSignIn = () => {
    if (warning === null) {
      const first = signInWarning?.() ?? null;
      if (first !== null) {
        setShown({ text: first, during: snapshot });
        return;
      }
    }
    onSignIn();
  };
  return (
    <div className="sync-chip" role="status" aria-live="polite" data-status={snapshot.status} title={copy.grownUp}>
      <img src={`/assets/ui/${copy.icon}.svg`} alt="" width={32} height={32} />
      <span className="sync-chip-line">{copy.line}</span>
      {copy.grownUp ? <span className="sync-chip-grown-up">{copy.grownUp}</span> : null}
      {snapshot.status === "AUTH_REQUIRED" ? (
        <button type="button" className="btn btn-small" onClick={pressSignIn}>
          {warning ?? COPY.sync.AUTH_REQUIRED.button}
        </button>
      ) : null}
      {snapshot.status === "UPGRADE_REQUIRED" ? (
        <button type="button" className="btn btn-small" onClick={onReload ?? (() => window.location.reload())}>
          {COPY.sync.UPGRADE_REQUIRED.button}
        </button>
      ) : null}
    </div>
  );
}
