// P13 Settings and resets (Phase 55, M4-06; D4 P13, F §12.5): the three account resets, written for the grown-up. Each
// dialog says what changes and what stays; the confirm button works only after typing the word shown, and the client
// then sends confirm = type (spine S8.2). A reset needs a connection and an empty queue. The whole-profile reset may
// discard unsent progress after saying so; afterwards the device's local database goes and Profile setup opens.
// "Give up current game" is on Saved games (an ABANDON op, not a reset).
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PlayerApi, ResetType } from "../api/playerApi";
import { COPY } from "../copy/en-GB";
import { useOnline } from "../shell/useOnline";
import type { SyncQueue } from "../sync/queue";

export function Settings({
  api,
  queue,
  onBack,
  onReset,
  testerCode,
}: {
  api: Pick<PlayerApi, "postReset">;
  queue: Pick<SyncQueue, "getSnapshot" | "subscribe">;
  onBack: () => void;
  /** Called after a reset has finished (the shell refreshes the profile, or starts again after WHOLE_PROFILE). */
  onReset: (type: ResetType) => void;
  /** The account's ID (its Cognito sub: opaque, not personal data), which the level designer lists as a tester to
   *  share preview levels with this account (Gate M, LD7). */
  testerCode?: string;
}) {
  const online = useOnline();
  const pending = useSyncExternalStore(queue.subscribe, () => queue.getSnapshot().pending);
  const [open, setOpen] = useState<ResetType | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open !== null) field.current?.focus();
  }, [open]);
  const chosen = COPY.settings.resets.find((r) => r.type === open);
  // Whole profile may go ahead with unsent progress (it is said plainly); the partial resets wait for an empty queue.
  const blocked = !online ? COPY.settings.offline : pending > 0 && open !== "WHOLE_PROFILE" ? COPY.settings.wait : null;

  async function confirm(type: ResetType) {
    setBusy(true);
    const result = await api.postReset({ type, confirm: type });
    setBusy(false);
    if (result.kind === "ok") {
      setOpen(null);
      setTyped("");
      setMessage(COPY.settings.done);
      onReset(type);
    } else {
      setMessage(COPY.settings.failed);
    }
  }

  return (
    <main className="screen settings">
      <header className="games-top">
        <h1>{COPY.settings.heading}</h1>
        <button type="button" className="btn btn-small" onClick={onBack}>
          {COPY.settings.back}
        </button>
      </header>
      <section className="panel" aria-labelledby="resets-heading">
        <h2 id="resets-heading">{COPY.settings.resetsHeading}</h2>
        <div className="settings-resets">
          {COPY.settings.resets.map((r) => (
            <button
              key={r.type}
              type="button"
              className="btn btn-small"
              onClick={() => {
                setOpen(r.type);
                setTyped("");
                setMessage(null);
              }}
            >
              {r.button}
            </button>
          ))}
        </div>
        {message !== null ? <p role="status">{message}</p> : null}
      </section>
      {testerCode !== undefined ? (
        <section className="panel" aria-labelledby="tester-heading">
          <h2 id="tester-heading">{COPY.settings.testerHeading}</h2>
          <p className="reason">{COPY.settings.testerHint}</p>
          <p>
            {COPY.settings.testerCode}: <code className="tester-code">{testerCode}</code>
          </p>
        </section>
      ) : null}
      {chosen !== undefined ? (
        <div className="dialog-backdrop">
          <div className="panel dialog" role="alertdialog" aria-modal="true" aria-labelledby="reset-heading">
            <h2 id="reset-heading">{chosen.button}</h2>
            <h3>{COPY.settings.changes}</h3>
            <p>{chosen.changes}</p>
            <h3>{COPY.settings.stays}</h3>
            <p>{chosen.stays}</p>
            {chosen.type === "WHOLE_PROFILE" && pending > 0 ? <p className="notice">{COPY.settings.pendingLost}</p> : null}
            {chosen.type !== "WHOLE_PROFILE" ? <p className="reason">{COPY.settings.offlineDevice}</p> : null}
            <label>
              {COPY.settings.typeWord(chosen.word)}{" "}
              <input ref={field} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
            </label>
            {blocked !== null ? <p className="reason">{blocked}</p> : null}
            <div className="dialog-buttons">
              <button type="button" className="btn btn-big btn-go" onClick={() => setOpen(null)}>
                {COPY.settings.cancel}
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={busy || blocked !== null || typed.trim().toLowerCase() !== chosen.word}
                onClick={() => void confirm(chosen.type)}
              >
                {chosen.button}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
