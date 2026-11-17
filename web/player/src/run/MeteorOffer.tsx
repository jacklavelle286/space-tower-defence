// The meteor offer (Phase 51, M4-02; D4 P9, C10, owner decision D-11): before the first attempt at a meteor slot the
// child is asked, "Meteor challenge! Win a power for the boss.", with the power's picture and name. Have a go opens the
// activity (the normal learning panel); No thanks sends DISMISS_SLOT (DECLINED: no reward, never counted) and returns to
// preparation with "That's fine — you can still beat the boss!". Once an attempt exists there is no offer and no No
// thanks: the reducer refuses DISMISS_SLOT after an attempt anyway. When the power is already full (endless, P8) the
// offer says so; a success then counts but adds no charge. The server grants the charge; the browser only asks.
import { trapTab } from "@scd/shared";
import { useEffect, useRef, useState } from "react";
import { COPY } from "../copy/en-GB";
import type { AckTracker } from "./ackTracker";
import type { SyncedRun } from "./syncedRun";

export function MeteorOffer({
  run,
  powerId,
  powerName,
  held,
  cap,
  tracker,
  onHaveAGo,
  onDone,
  onResync,
}: {
  run: SyncedRun;
  powerId: string;
  powerName: string;
  /** Charges of this power the run holds now, and the cap (C10: 2). */
  held: number;
  cap: number;
  tracker: AckTracker;
  onHaveAGo: () => void;
  /** Back to preparation after No thanks. */
  onDone: () => void;
  onResync: () => void;
}) {
  const [declined, setDeclined] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = useRef<HTMLButtonElement>(null);
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => (declined ? ok.current : go.current)?.focus(), [declined]);

  async function noThanks() {
    setBusy(true);
    const dismissed = run.dismissSlot();
    const ack = dismissed === null ? null : await tracker.waitFor(dismissed.opId);
    setBusy(false);
    if (ack?.kind === "applied") setDeclined(true);
    else onResync();
  }

  return (
    <div className="lp-backdrop">
      <section className="lp meteor-offer" role="dialog" aria-modal="true" aria-labelledby="meteor-heading" onKeyDown={trapTab}>
        <h2 className="lp-heading" id="meteor-heading">
          {COPY.meteor.heading}
        </h2>
        {declined ? (
          <>
            <p role="status">{COPY.meteor.declined}</p>
            <button ref={ok} type="button" className="lp-btn lp-go" onClick={onDone}>
              {COPY.meteor.ok}
            </button>
          </>
        ) : (
          <>
            <p>{COPY.meteor.pitch}</p>
            <p className="meteor-power">
              <img src={`/assets/common/power-${powerId}-icon.png`} alt="" width={96} height={96} />
              <strong>{powerName}</strong>
            </p>
            {held >= cap ? <p>{COPY.meteor.full(powerName, cap)}</p> : null}
            <div className="meteor-buttons">
              <button ref={go} type="button" className="lp-btn lp-go" disabled={busy} onClick={onHaveAGo}>
                {COPY.meteor.haveAGo}
              </button>
              <button type="button" className="lp-btn lp-small" disabled={busy} onClick={() => void noThanks()}>
                {COPY.meteor.noThanks}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
