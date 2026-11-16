import { PANEL_COPY } from "@scd/shared/learning";
import { useId, useRef, useState } from "react";
import { ApiError, describeError, type AdminApi } from "../api";
import { ConfirmDialog, useFocusReturn } from "../ConfirmDialog";
import { forgetUnsaved } from "../editor/unsaved";
import { setFlash } from "../flash";
import { hrefOf } from "../routes";

// "Delete activity" (owner decision 2026-11-16, "just do delete"): the one place in the admin that removes an
// activity, through R31. One confirm dialog, Cancel focused, says what goes and what happens to games in progress:
// admin-api deletes the header, the draft and every version; a run that pinned a deleted version reads it as
// withdrawn (api/shared/selection/bank.py), so the slot is voided with its reward and the run carries on. A device
// that already loaded the run still shows the activity once; the server voids that answer (reward kept, not counted).

type Props = {
  readonly api: AdminApi;
  readonly activityId: string;
  readonly navigate?: (hash: string) => void;
};

export function DeleteActivity({ api, activityId, navigate = (hash) => window.location.assign(hash) }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const headingId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  useFocusReturn(open, triggerRef); // closing the dialog puts focus back on the button that opened it

  function leave(flash: string) {
    forgetUnsaved(activityId); // an ID used again later must not get this activity's kept edits back
    setFlash(flash);
    navigate(hrefOf({ page: "activities" }));
  }

  async function confirm() {
    setBusy(true);
    setMessage(null);
    try {
      const { deletedVersions } = await api.deleteActivity(activityId);
      const n = deletedVersions.length;
      leave(`Activity ${activityId} deleted${n === 0 ? "" : `, with ${n} published version${n === 1 ? "" : "s"}`}.`);
    } catch (error) {
      if (error instanceof ApiError && error.code === "NOT_FOUND") {
        // Gone already: an earlier try whose answer was lost, or another tab. That is what the operator asked for.
        leave(`Activity ${activityId} was already deleted.`);
        return;
      }
      setBusy(false);
      setOpen(false);
      setMessage(describeError(error));
    }
  }

  return (
    <section className="danger-zone" aria-label="Delete activity">
      <button type="button" className="danger" ref={triggerRef} onClick={() => setOpen(true)} disabled={busy}>
        Delete activity
      </button>
      {message !== null && (
        <p className="error" role="status">
          {message}
        </p>
      )}
      {open && (
        <ConfirmDialog labelledBy={headingId} onCancel={() => !busy && setOpen(false)}>
          {(cancelRef) => (
            <>
              <h3 id={headingId}>Delete activity {activityId}?</h3>
              <p>This removes the activity for good: its draft and every published version. Speech clips it uses stay.</p>
              <p>
                <strong>This cannot be undone.</strong>
              </p>
              <p>
                New games stop choosing it straight away. Games already in progress keep going and lose nothing: the
                next time a child's game loads this activity it is skipped, they still get its reward, and it does not
                count in their learning summary. They see: “{PANEL_COPY.voided}”
              </p>
              <p>
                A child whose game already has it loaded may still play it once. Their answer is not counted, but they
                keep the reward.
              </p>
              <p className="muted">If too few activities are left for an age, new games for that age can't start until more are published.</p>
              <p className="dialog-actions">
                <button type="button" ref={cancelRef} onClick={() => setOpen(false)} disabled={busy}>
                  Cancel
                </button>
                <button type="button" className="danger" onClick={() => void confirm()} disabled={busy}>
                  {busy ? "Deleting…" : "Delete activity"}
                </button>
              </p>
            </>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
