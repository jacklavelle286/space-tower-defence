// Test tab → "See it in the game" (Gate M, LD12): watch the competent test player, or play it yourself, from any wave,
// at 1x, 2x or 4x, in the real battlefield in a new tab. Nothing is saved or sent to the server.
import type { PreviewMode, PreviewSpeed } from "@scd/shared/preview";
import { useId, useState } from "react";
import type { LevelFile } from "../../api";
import { ownedWaveSets } from "../checkRun";
import { openPreview, previewDraft, type PreviewPorts } from "./openPreview";

export function PreviewPanel({ level, blocked, ports }: { readonly level: LevelFile; readonly blocked: boolean; readonly ports?: PreviewPorts }) {
  const sets = ownedWaveSets(level);
  const [waveSetId, setWaveSetId] = useState(sets[0] ?? "");
  const [wave, setWave] = useState(1);
  const [speed, setSpeed] = useState<PreviewSpeed>(1);
  const [error, setError] = useState<string | null>(null);
  const ids = { set: useId(), wave: useId(), speed: useId() };
  const set = sets.includes(waveSetId) ? waveSetId : (sets[0] ?? "");
  const waves = level.waveSets[set]?.waves.length ?? 1;
  if (sets.length === 0) return null;

  const open = (mode: PreviewMode) => {
    setError(null);
    try {
      openPreview(previewDraft(level, set, Math.min(wave, waves), mode, speed), ports);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="preview-panel" aria-labelledby={`${ids.set}-h`}>
      <h3 id={`${ids.set}-h`}>See it in the game</h3>
      <p className="muted">The real battlefield in a new tab, with this editor's level as it is now. Nothing is saved.</p>
      <p className="row">
        <label htmlFor={ids.set}>Wave set</label>
        <select id={ids.set} value={set} onChange={(e) => setWaveSetId(e.target.value)}>
          {sets.map((id) => (
            <option key={id} value={id}>
              {level.waveSets[id]?.name ?? id}
            </option>
          ))}
        </select>
        <label htmlFor={ids.wave}>From wave</label>
        <input id={ids.wave} type="number" min={1} max={waves} value={Math.min(wave, waves)} onChange={(e) => setWave(Math.max(1, Math.min(waves, Math.round(Number(e.target.value)) || 1)))} />
        <label htmlFor={ids.speed}>Speed</label>
        <select id={ids.speed} value={speed} onChange={(e) => setSpeed(Number(e.target.value) as PreviewSpeed)}>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={4}>4x</option>
        </select>
      </p>
      <p className="row">
        <button type="button" disabled={blocked} onClick={() => open("watch")}>
          Watch wave {Math.min(wave, waves)}
        </button>
        <button type="button" disabled={blocked} onClick={() => open("play")}>
          Play it yourself
        </button>
        {blocked && <span className="muted"> Fix the problems that block publishing first.</span>}
      </p>
      {error !== null && <p className="error">{error}</p>}
    </section>
  );
}
