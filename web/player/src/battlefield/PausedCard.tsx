// The Paused card: a hidden page or a dialog pauses the battle, and only Resume restarts it (D1 rule 11, spine S10).
import type { GameBridge } from "../game/GameBridge";

export function PausedCard({ bridge }: { bridge: GameBridge }) {
  return (
    <div className="bf-overlay">
      <div className="bf-card">
        <h2>Paused</h2>
        <button type="button" className="bf-big" onClick={() => bridge.resume()} autoFocus>
          Resume
        </button>
      </div>
    </div>
  );
}
