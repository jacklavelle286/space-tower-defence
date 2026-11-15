// What a selected pad offers: place Nova on an open empty pad, or upgrade / sell the astronaut on it. The prices
// come from the bridge (game-core's numbers); the simulation still checks every command (AC-09).
import type { GameBridge } from "../game/GameBridge";
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
      {tower === null && selection.placeCost !== null && (
        <button
          type="button"
          className="bf-card-button"
          disabled={credits < selection.placeCost}
          onClick={() => {
            bridge.place(padId, "nova");
          }}
        >
          <img src="/assets/ui/nova-card.png" alt="" />
          <span>
            Nova <img className="bf-coin" src="/assets/ui/icon-credits.svg" alt="credits" /> {selection.placeCost}
          </span>
        </button>
      )}
      {tower !== null && (
        <>
          <p>
            Nova, level {tower.level}
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
