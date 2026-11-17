// What a selected pad offers: a card for each class the wave set lists, on an open empty pad, or upgrade / sell for
// the astronaut on it. Prices and refusals come from the bridge, which asks game-core (checkCommand); the simulation
// still checks every command when it applies (AC-09). With ruleset r1 the wave set lists only Nova, so the live game
// shows the single Nova card it always did. The full shop (D4: role, explanation, "Need 15 more", cap tokens, Aim) is
// the Phase 31 HUD; this is the Phase 24 minimum to place the new classes on the local battlefield. Each card shows
// a summary of the class (classSummary.ts) on hover and on keyboard focus, read out as the button's description.
import type { GameBridge } from "../game/GameBridge";
import { classSummary } from "./classSummary";
import { useSelection } from "./useBridge";

export function PadPanel({ bridge, credits }: { bridge: GameBridge; credits: number }) {
  const selection = useSelection(bridge);
  if (selection === null) {
    return null;
  }
  const { padId, tower } = selection;
  return (
    <div className="bf-panel" role="dialog" aria-label="Pad">
      {tower === null && !selection.open && <p>This pad opens later in the game.</p>}
      {selection.offers.map((offer) => {
        // A locked class shows its silhouette card and when it unlocks (D4, C5.9).
        const locked = offer.refusal === "CLASS_LOCKED";
        const cls = bridge.config.classes[offer.classId];
        const summary = cls === undefined ? null : classSummary(cls);
        const tipId = `bf-tip-${offer.classId}`;
        return (
          <div key={offer.classId} className="bf-offer">
            <button
              type="button"
              className="bf-card-button"
              disabled={offer.refusal !== null}
              aria-describedby={summary === null ? undefined : tipId}
              onClick={() => {
                bridge.place(padId, offer.classId);
              }}
            >
              <img src={`/assets/ui/${offer.classId}-card${locked ? "-locked" : ""}.png`} alt="" />
              <span>
                {offer.name} <img className="bf-coin" src="/assets/ui/icon-credits.svg" alt="credits" /> {offer.cost}
              </span>
              {locked && <span className="bf-card-note">Unlocks after wave {offer.unlockAfterWave}</span>}
            </button>
            {summary !== null && (
              <div className="bf-tip" id={tipId} role="tooltip">
                <strong>{summary.title}</strong>
                <p>{summary.line}</p>
                <ul>
                  {summary.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <ul className="bf-tip-upgrades">
                  {summary.upgrades.map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
                {summary.quote !== null && <p className="bf-tip-quote">"{summary.quote}"</p>}
              </div>
            )}
          </div>
        );
      })}
      {tower !== null && (
        <>
          <p>
            {tower.name}, level {tower.level}
          </p>
          {selection.upgradeCost !== null && (
            <button type="button" className="bf-big" disabled={credits < selection.upgradeCost} onClick={() => bridge.upgrade(padId)}>
              Upgrade <img className="bf-coin" src="/assets/ui/icon-credits.svg" alt="credits" /> {selection.upgradeCost}
            </button>
          )}
          {selection.sellRefund !== null && (
            <button type="button" className="bf-small" onClick={() => bridge.sell(padId)}>
              Sell (+{selection.sellRefund})
            </button>
          )}
        </>
      )}
      <button type="button" className="bf-small" onClick={() => bridge.selectPad(null)}>
        Close
      </button>
    </div>
  );
}
