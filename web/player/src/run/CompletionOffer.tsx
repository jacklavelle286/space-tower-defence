// P10 Campaign complete (Phase 54, M4-05; D4 P10, C11, prompt.md:435, 519): "You saved the colony!", the Colony Hero
// badge (already committed by the COMPLETE_WAVE that ended wave 50), "Waves cleared: 50", then Keep going or Finish this
// game. No activity interrupts this screen; it shows again on resume until a choice is made (spine S3.7).
//
// Keep going is CHOOSE_ENDLESS, online only and never queued (G §6): the account's queue is flushed first (so the op's
// expectedRevision is current), then the op goes to R12 stamped with the lease, and the run is read again because the
// server planned the first endless slots. Finish this game is FINISH_RUN, queued like any op.
import { sounds } from "../sound/board";
import { trapTab } from "@scd/shared";
import { useState } from "react";
import { COPY } from "../copy/en-GB";
import { PROTOCOL_VERSION } from "../sync/protocol";
import type { RunServices } from "./RunScreen";
import type { SyncedRun } from "./syncedRun";

/** Resolves once the queue holds nothing unsent (or after `timeoutMs`). */
function flushed(queue: RunServices["queue"], timeoutMs = 15_000): Promise<boolean> {
  return new Promise((resolve) => {
    if (queue.getSnapshot().pending === 0) return resolve(true);
    const timer = setTimeout(() => {
      stop();
      resolve(false);
    }, timeoutMs);
    const stop = queue.subscribe(() => {
      if (queue.getSnapshot().pending === 0) {
        clearTimeout(timer);
        stop();
        resolve(true);
      }
    });
  });
}

export function CompletionOffer({
  run,
  services,
  wavesCleared,
  planetId,
  onEndless,
  onFinish,
  newId = () => crypto.randomUUID(),
}: {
  run: SyncedRun;
  services: Pick<RunServices, "api" | "queue" | "lease">;
  wavesCleared: number;
  planetId: string;
  /** CHOOSE_ENDLESS was applied: read the run again (it now has endless slots). */
  onEndless: () => Promise<void>;
  onFinish: () => void;
  newId?: () => string;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const online = typeof navigator === "undefined" || navigator.onLine;

  async function keepGoing() {
    setBusy(true);
    setProblem(null);
    const held = services.lease.held;
    if (held === null || !(await flushed(services.queue))) {
      setBusy(false);
      setProblem(COPY.complete.needsInternet);
      return;
    }
    const op = { opId: newId(), expectedRevision: run.state.revision, type: "CHOOSE_ENDLESS", payload: {}, clientTime: new Date().toISOString() };
    const result = await services.api.chooseEndless(run.runId, {
      protocolVersion: PROTOCOL_VERSION,
      sessionId: services.lease.sessionId,
      generation: held.generation,
      ops: [op],
    });
    const applied = result.kind === "ok" && result.body.results.some((r) => r.result === "APPLIED" || r.result === "ALREADY_APPLIED");
    if (applied) {
      await onEndless();
      return;
    }
    setBusy(false);
    setProblem(result.kind === "network" ? COPY.complete.needsInternet : COPY.complete.cannot);
  }

  return (
    <div className="lp-backdrop">
      <section className="lp completion" role="dialog" aria-modal="true" aria-labelledby="complete-heading" onKeyDown={trapTab}>
        <h2 className="lp-heading" id="complete-heading">
          {COPY.complete.heading}
        </h2>
        <img src={`/assets/ui/badge-campaign-${planetId}.png`} alt="Colony Hero" width={160} height={160} onLoad={() => sounds.play("sfx-badge")} />
        <p>{COPY.complete.waves(wavesCleared)}</p>
        <div className="meteor-buttons">
          <button type="button" className="lp-btn lp-go" autoFocus disabled={busy || !online} onClick={() => void keepGoing()}>
            {busy ? COPY.complete.starting : COPY.complete.keepGoing}
          </button>
          <button type="button" className="lp-btn lp-small" disabled={busy} onClick={onFinish}>
            {COPY.complete.finish}
          </button>
        </div>
        {!online ? <p className="reason">{COPY.complete.needsInternet}</p> : null}
        {problem !== null ? (
          <p className="notice" role="alert">
            {problem}
          </p>
        ) : null}
      </section>
    </div>
  );
}
