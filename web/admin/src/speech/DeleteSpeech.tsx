import { useId, useRef, useState } from "react";
import { ApiError, speechUsers, type AdminApi } from "../api";
import { ConfirmDialog, useFocusReturn } from "../ConfirmDialog";
import { hrefOf } from "../routes";
import { speechError } from "./messages";

// "Delete speech" (owner ask 2026-11-16, "I can't delete sounds"): removes a speech definition through R32, behind
// one confirm dialog with Cancel focused. admin-api deletes the header, the draft and every approved version, and
// refuses while any activity draft or version names the definition: the refusal lists those activities here, as
// links, so the operator can change or delete them first. Clips stay in the audio bucket (content-addressed, and
// another definition may share one).

type Props = {
  readonly api: AdminApi;
  readonly speechId: string;
  /** After the delete (or when it was gone already): the page goes back to the list with this message. */
  readonly onDeleted: (message: string) => void;
};

export function DeleteSpeech({ api, speechId, onDeleted }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [users, setUsers] = useState<string[]>([]);
  const headingId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  useFocusReturn(open, triggerRef);

  async function confirm() {
    setBusy(true);
    setMessage(null);
    setUsers([]);
    try {
      const { deletedVersions } = await api.deleteSpeech(speechId);
      const n = deletedVersions.length;
      onDeleted(`Speech ${speechId} deleted${n === 0 ? "" : `, with ${n} approved version${n === 1 ? "" : "s"}`}.`);
    } catch (error) {
      if (error instanceof ApiError && error.code === "NOT_FOUND") {
        onDeleted(`Speech ${speechId} was already deleted.`); // an earlier try whose answer was lost, or another tab
        return;
      }
      setBusy(false);
      setOpen(false);
      const using = speechUsers(error);
      setUsers(using);
      setMessage(using.length > 0 ? null : speechError(error));
    }
  }

  return (
    <section className="danger-zone" aria-label="Delete speech">
      <button type="button" className="danger" ref={triggerRef} onClick={() => setOpen(true)} disabled={busy}>
        Delete speech
      </button>
      {users.length > 0 && (
        <div className="error" role="status">
          <p>
            {speechId} can't be deleted: {users.length === 1 ? "this activity uses it" : `these ${users.length} activities use it`}.
            Change or delete {users.length === 1 ? "it" : "them"} first. A published activity keeps its sound in every
            version until the activity itself is deleted.
          </p>
          <ul>
            {users.map((id) => (
              <li key={id}>
                <a href={hrefOf({ page: "activity", id })}>{id}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {message !== null && (
        <p className="error" role="status">
          {message}
        </p>
      )}
      {open && (
        <ConfirmDialog labelledBy={headingId} onCancel={() => !busy && setOpen(false)}>
          {(cancelRef) => (
            <>
              <h3 id={headingId}>Delete speech {speechId}?</h3>
              <p>This removes the speech definition for good: its draft and every approved version. The clips stay.</p>
              <p>
                <strong>This cannot be undone.</strong>
              </p>
              <p className="muted">
                If any activity uses this speech, in its draft or in any published version, nothing is deleted and you
                get the list of those activities.
              </p>
              <p className="dialog-actions">
                <button type="button" ref={cancelRef} onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </button>
                <button type="button" className="danger" onClick={() => void confirm()} disabled={busy}>
                  {busy ? "Deleting…" : "Delete speech"}
                </button>
              </p>
            </>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
