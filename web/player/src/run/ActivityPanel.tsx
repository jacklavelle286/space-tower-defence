// The activity between waves on the real run: the shared learning panel, fed from the run's saved slot and joined to
// the op queue and the Play rule.
//
// - Attempts and status come from the run state, which was rebuilt from the cloud save when the run was opened, so
//   a refresh shows the recorded tries greyed (spine S3.7, AC-17).
// - Check = one SUBMIT_ATTEMPT through the reducer and the queue. The panel's feedback waits until the server has
//   acknowledged it (durability in online-only mode, spine S4); the server's judgement is the one that counts: if it
//   disagrees with the reducer, the run is reloaded from the cloud save.
// - Play goes to the ClipPlayer only. Nothing about sound touches attempts (AC-22).
import { sounds } from "../sound/board";
import { trapTab } from "@scd/shared";
import { useClip, type ClipPlayer, type ClipRef } from "@scd/shared/audio";
import { LearningPanel, PANEL_COPY, type CheckResult, type PanelActivity, type PanelStatus } from "@scd/shared/learning";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { COPY } from "../copy/en-GB";
import type { AckTracker } from "./ackTracker";
import type { SyncedRun } from "./syncedRun";

export interface ActivityPanelProps {
  run: SyncedRun;
  slotId: string;
  /** Null when the pack has no definition the panel can show (withdrawn, or a type this client lacks). */
  activity: PanelActivity | null;
  /** The slot's clips map from the pack: variant -> clipKey. */
  clips: Readonly<Record<string, string>>;
  player: ClipPlayer;
  tracker: AckTracker;
  onContinue(): void;
  onSaveAndExit(): void;
  /** The server disagreed or refused: re-read the cloud save. */
  onResync(): void;
}

export function ActivityPanel(props: ActivityPanelProps) {
  const { run, slotId, activity, clips, player, tracker, onResync } = props;
  const state = useSyncExternalStore(
    (listener) => run.subscribe(() => listener()),
    () => run.state,
  );
  const slot = state.slots.find((s) => s.slotId === slotId);
  const prompt = useMemo<ClipRef | null>(
    () => (clips["prompt"] ? { runId: run.runId, slotId, variant: "prompt", clipKey: clips["prompt"] } : null),
    [clips, run.runId, slotId],
  );
  const instruction = useMemo<ClipRef | null>(
    () => (clips["instruction"] ? { runId: run.runId, slotId, variant: "instruction", clipKey: clips["instruction"] } : null),
    [clips, run.runId, slotId],
  );
  const audio = useClip(player, prompt);
  const readToMe = useClip(player, instruction);

  // Stop the sound when the panel closes or the page is hidden (E.9).
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === "hidden") player.stop();
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      player.stop();
    };
  }, [player]);

  if (slot === undefined) return null;

  async function check(answer: string): Promise<CheckResult> {
    const submitted = run.submitAttempt(answer);
    if (submitted === null) return { kind: "not-saved" };
    const ack = await tracker.waitFor(submitted.opId);
    if (ack.kind === "refused") {
      onResync();
      return { kind: "not-saved" };
    }
    const server = ack.result.attempt;
    // D10.10: a chime and the reward for a right answer, a soft neutral "not quite" for another try.
    const correct = server?.correct ?? submitted.applied.attempt?.correct ?? false;
    sounds.play(correct ? "sfx-correct" : "sfx-not-quite");
    if (correct) window.setTimeout(() => sounds.play("sfx-reward"), 350);
    if (server !== undefined && server.correct !== submitted.applied.attempt?.correct) {
      // Optimistic UI, authoritative server: the cloud save decides what the child sees next.
      console.warn("attempt judged differently by the server; reloading the run", { slotId });
      onResync();
    }
    return { kind: "recorded" };
  }

  if (activity === null) {
    return <UnshowableActivity {...props} status={slot.status} withdrawn={slot.withdrawn} />;
  }

  return (
    <LearningPanel
      key={slotId}
      activity={activity}
      attempts={slot.attempts.map((a) => ({ answer: a.answer, correct: a.correct }))}
      status={slot.status as PanelStatus}
      audio={audio}
      readToMe={readToMe}
      onCheck={check}
      onContinue={props.onContinue}
      onSaveAndExit={props.onSaveAndExit}
    />
  );
}

/**
 * A withdrawn activity (its definition is not in the pack): the child is told, calmly, and still gets the reward (D6.4).
 * Continue sends DISMISS_SLOT (Phase 44, F §4.4): the server and the reducer both turn it into VOID, granting the
 * reward exactly once and leaving the learning summary unchanged. A slot that was already resolved stays as recorded
 * (D-9): Continue just moves on.
 */
function UnshowableActivity(props: ActivityPanelProps & { status: string; withdrawn: boolean }) {
  const { run, tracker, onContinue, onSaveAndExit, onResync, status, withdrawn } = props;
  const [busy, setBusy] = useState(false);
  const resolved = status !== "UNRESOLVED";

  async function acknowledge() {
    if (resolved) {
      onContinue();
      return;
    }
    setBusy(true);
    const submitted = run.dismissSlot();
    const ack = submitted === null ? null : await tracker.waitFor(submitted.opId);
    setBusy(false);
    if (ack?.kind === "applied") onContinue();
    else onResync();
  }

  return (
    <div className="lp-backdrop">
      <section className="lp" role="dialog" aria-modal="true" aria-labelledby="lp-unshowable" onKeyDown={trapTab}>
        <h2 className="lp-heading" id="lp-unshowable" tabIndex={-1}>
          {COPY.run.learning}
        </h2>
        <p role="status">{withdrawn ? PANEL_COPY.voided : COPY.run.failed}</p>
        {withdrawn ? (
          <button type="button" className="lp-btn lp-go" autoFocus disabled={busy} onClick={() => void acknowledge()}>
            {busy ? PANEL_COPY.checking : PANEL_COPY.continue}
          </button>
        ) : null}
        <button type="button" className="lp-btn lp-small" onClick={onSaveAndExit}>
          {PANEL_COPY.saveAndExit}
        </button>
      </section>
    </div>
  );
}
