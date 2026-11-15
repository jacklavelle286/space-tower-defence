// Completion (P10 for a challenge) and defeat (P11) overlays, with the screen art (D3 J6, J7).
import type { HudState } from "../game/GameBridge";

export function EndScreen({ hud, onNewGame }: { hud: HudState; onNewGame: () => void }) {
  const won = hud.runStatus === "COMPLETED";
  return (
    <div className="bf-overlay">
      <div className="bf-card bf-end" role="dialog" aria-label={won ? "Challenge complete" : "Defeat"}>
        <img src={won ? "/assets/ui/complete-illustration.png" : "/assets/ui/defeat-illustration.png"} alt="" width={256} height={256} />
        <h2>{won ? "Challenge complete!" : "The aliens got through this time."}</h2>
        <p>Waves cleared: {hud.highestCompletedWave}</p>
        <button type="button" className="bf-big" onClick={onNewGame} autoFocus>
          New game
        </button>
      </div>
    </div>
  );
}
