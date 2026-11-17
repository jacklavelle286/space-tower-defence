// The panel for a selected pad (D4 "Selected astronaut panel"). On an open empty pad: a card for each class the wave
// set lists (choosing a pad first is the other way to place; the shop is the main one, Phase 31). On an astronaut:
// its level, Upgrade with its cost and a short benefit line ("faster shots"), Send home with the refund (confirmed
// in a dialog, D5.2), and Aim: the targeting choices the class has at its level (C5.3). Prices and refusals come from
// the bridge, which asks game-core (checkCommand); the simulation still checks every command when it applies (AC-09).
import type { GameBridge } from "../game/GameBridge";
import { ClassTip } from "../hud/ClassTip";
import { aimChoices } from "../hud/padNav";
import { classSummary, upgradeGain } from "./classSummary";
import { useSelection } from "./useBridge";

const AIM_NAMES = { FRONT: "Front", FAST: "Fastest", CROWD: "Biggest group", STRONG: "Strongest" } as const;

export function PadPanel({ bridge, credits, onSendHome }: { bridge: GameBridge; credits: number; onSendHome: () => void }) {
  const selection = useSelection(bridge);
  if (selection === null) {
    return null;
  }
  const { padId, tower } = selection;
  const cls = tower === null ? undefined : bridge.config.classes[tower.classId];
  const gain = tower !== null && cls !== undefined ? upgradeGain(cls, tower.level) : null;
  const choices = tower === null ? [] : aimChoices(bridge.config, tower.classId, tower.level);
  return (
    <div className="bf-panel" role="dialog" aria-label="Pad">
      {tower === null && !selection.open && <p>This pad opens later in the game.</p>}
      {selection.offers.map((offer) => {
        // A locked class shows its silhouette card and when it unlocks (D4, C5.9).
        const locked = offer.refusal === "CLASS_LOCKED";
        const offered = bridge.config.classes[offer.classId];
        const tipId = `bf-tip-${offer.classId}`;
        return (
          <div key={offer.classId} className="bf-offer">
            <button
              type="button"
              className="bf-card-button"
              disabled={offer.refusal !== null}
              aria-describedby={offered === undefined ? undefined : tipId}
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
            {offered !== undefined && <ClassTip id={tipId} summary={classSummary(offered, bridge.config.classes)} />}
          </div>
        );
      })}
      {tower !== null && (
        <>
          <p>
            {tower.name}, level {tower.level}
          </p>
          {selection.upgradeCost !== null && (
            <button
              type="button"
              className="bf-big"
              disabled={credits < selection.upgradeCost}
              aria-keyshortcuts="U"
              onClick={() => bridge.upgrade(padId)}
            >
              Upgrade <img className="bf-coin" src="/assets/ui/icon-credits.svg" alt="credits" /> {selection.upgradeCost}
              {gain !== null && <span className="bf-gain">{gain}</span>}
            </button>
          )}
          {choices.length > 1 && (
            <span className="bf-aim" role="group" aria-label="Aim">
              Aim:
              {choices.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className="bf-small"
                  aria-pressed={tower.targeting === mode}
                  aria-keyshortcuts="T"
                  onClick={() => bridge.setTargeting(padId, mode)}
                >
                  {AIM_NAMES[mode]}
                </button>
              ))}
            </span>
          )}
          {selection.sellRefund !== null && (
            <button type="button" className="bf-small" aria-keyshortcuts="X" onClick={onSendHome}>
              Send home (+{selection.sellRefund})
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
