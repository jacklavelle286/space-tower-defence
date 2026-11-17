// The shop (Phase 31, D4 "Shop"): one card per class of the wave set, always on screen while the board is. Each card
// shows the portrait, name and role, cost and the one-line explanation; the full summary on hover and focus. A locked
// card shows the silhouette and "Unlocks after wave N"; one the child cannot afford is dimmed with "Need N more"; one
// at its deploy cap says so. Choosing a card arms it: every open empty pad glows, and the next pad chosen takes it
// (GameBridge.selectPad). Choosing it again, or Esc, puts it down. Keys N, P, J, O, M, S choose by initial (D5.2).
import type { GameBridge, HudState } from "../game/GameBridge";
import { classSummary } from "../battlefield/classSummary";
import { ClassTip } from "./ClassTip";

export function Shop({ bridge, hud, onKeys }: { bridge: GameBridge; hud: HudState; onKeys: () => void }) {
  return (
    <div className="bf-shop" role="group" aria-label="Astronauts">
      {hud.shop.map((card, index) => {
        const cls = bridge.config.classes[card.classId];
        if (cls === undefined) return null;
        const summary = classSummary(cls, bridge.config.classes);
        const locked = card.state === "locked";
        const armed = hud.armed === card.classId;
        const tipId = `bf-shop-tip-${card.classId}`;
        const note =
          card.state === "locked"
            ? `Unlocks after wave ${card.unlockAfterWave}`
            : card.state === "credits"
              ? `Need ${card.cost - hud.credits} more`
              : card.state === "cap"
                ? `All ${cls.deployCap ?? ""} are out`
                : summary.line;
        return (
          <div key={card.classId} className="bf-offer">
            <button
              type="button"
              className={`bf-shop-card${card.state === "ok" ? "" : " bf-shop-dim"}${armed ? " bf-shop-armed" : ""}`}
              aria-pressed={armed}
              aria-describedby={tipId}
              disabled={card.state !== "ok"}
              onClick={() => bridge.arm(armed ? null : card.classId)}
            >
              <img src={`/assets/ui/${card.classId}-card${locked ? "-locked" : ""}.png`} alt="" />
              <span className="bf-shop-text">
                <span className="bf-shop-name">
                  {cls.name} <img className="bf-coin" src="/assets/ui/icon-credits.svg" alt="credits" /> {card.cost}
                </span>
                <span className="bf-shop-role">{cls.role}</span>
                <span className="bf-shop-note">{note}</span>
              </span>
            </button>
            <ClassTip id={tipId} summary={summary} align={index < hud.shop.length / 2 ? "start" : "end"} />
          </div>
        );
      })}
      <span className="bf-spacer" />
      <button type="button" className="bf-icon bf-keys-button" aria-keyshortcuts="?" title="Keys" aria-label="Keys" onClick={onKeys}>
        ?
      </button>
    </div>
  );
}
