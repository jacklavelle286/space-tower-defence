// The HUD bar: credits, colony health and shield, wave, aliens left, Ready, speed and pause. It renders only when
// the bridge sends a `hud` event (at most 10 per second).
//
// The speed toggle shows only during a wave (the only time speed matters), so the sole button beside Ready! is
// Ready! itself; a pre-reader could otherwise take its chevron for "go". It carries a "1x"/"2x" badge so it does not
// read as a second play arrow next to pause. The chosen speed is kept between waves by the bridge.
import type { GameBridge, HudState } from "../game/GameBridge";

export function Hud({ bridge, hud }: { bridge: GameBridge; hud: HudState }) {
  const preparing = hud.battle === "PREP" && hud.runPhase === "BUILD";
  const fighting = hud.battle === "IN_WAVE";
  return (
    <div className="bf-hud" role="status" aria-live="off">
      <span className="bf-stat" title="Credits">
        <img src="/assets/ui/icon-credits.svg" alt="Credits" /> {hud.credits}
      </span>
      <span className="bf-stat" title="Colony health">
        <img src="/assets/ui/icon-health.svg" alt="Colony health" /> {hud.health}/{hud.maxHealth}
      </span>
      {hud.shield > 0 && (
        <span className="bf-stat" title="Shield">
          <img src="/assets/ui/icon-shield.svg" alt="Shield" /> {hud.shield}
        </span>
      )}
      <span className="bf-stat" title="Wave">
        <img src="/assets/ui/icon-wave.svg" alt="" /> Wave {hud.wave} of {hud.finalWave}
      </span>
      {fighting && <span className="bf-stat">Aliens left: {hud.aliensLeft}</span>}
      <span className="bf-spacer" />
      {preparing && (
        <button type="button" className="bf-big bf-ready" onClick={() => bridge.startWave()}>
          Ready!
        </button>
      )}
      {fighting && (
        <button
          type="button"
          className="bf-icon bf-speed"
          aria-pressed={hud.speed === 2}
          title={hud.speed === 2 ? "Speed 2x (press for 1x)" : "Speed 1x (press for 2x)"}
          onClick={() => bridge.setSpeed(hud.speed === 2 ? 1 : 2)}
        >
          <img src={hud.speed === 2 ? "/assets/ui/icon-speed-2.svg" : "/assets/ui/icon-speed-1.svg"} alt="" />
          <span className="bf-speed-badge">{hud.speed}x</span>
        </button>
      )}
      {fighting && (
        <button
          type="button"
          className="bf-icon"
          title={hud.paused ? "Resume" : "Pause"}
          onClick={() => (hud.paused ? bridge.resume() : bridge.pause())}
        >
          <img src={hud.paused ? "/assets/ui/icon-play.svg" : "/assets/ui/icon-pause.svg"} alt={hud.paused ? "Resume" : "Pause"} />
        </button>
      )}
    </div>
  );
}
