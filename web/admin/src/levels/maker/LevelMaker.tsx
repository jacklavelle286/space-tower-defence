// Levels → New level → Make it all for me (Gate M, LD18; owner 2026-11-18): the choices for makeWholeLevel and its
// progress. Everything has a default, so the one button is enough; the number makes the same level again.
// In the editor (`again`; owner 2026-11-19: "a single button which does everything") the same button remakes the open
// level: a new map with new waves and challenges made for it, since waves and challenges made for the old map no longer
// fit (the route's length sets the waves' difficulty; challenges place astronauts on its pads).
import { MARGIN_PRESETS, MAX_CHALLENGES, type MarginPreset } from "@scd/game-core";
import { useEffect, useId, useRef, useState } from "react";
import type { LevelFile } from "../../api";
import type { CurveWorker } from "../curves/measure";
import type { ChallengeWorker } from "./challenges";
import { makeWholeLevel, type WholeLevelRun } from "./wholeLevel";

type Props = {
  readonly levelId: string;
  readonly name: string;
  /** The name and ID are fine and nothing else is busy. */
  readonly ready: boolean;
  /** The chosen planet has no campaign yet, so this level should carry it. */
  readonly planetNeedsCampaign: boolean;
  readonly onMade: (level: LevelFile, notes: readonly string[]) => Promise<void> | void;
  readonly firstSeed?: number;
  /** Remake the level open in the editor instead of making a new one. */
  readonly again?: boolean;
  /** How many challenges to make at first (the open level's count when remaking). */
  readonly firstChallenges?: number;
  readonly workers?: { readonly curve?: () => CurveWorker; readonly challenge?: () => ChallengeWorker };
};

const SEED_MAX = 999_999;

export function LevelMaker({ levelId, name, ready, planetNeedsCampaign, onMade, firstSeed, workers, again = false, firstChallenges = 3 }: Props) {
  const id = useId();
  const [seed, setSeed] = useState(() => firstSeed ?? 1 + Math.floor(Math.random() * SEED_MAX));
  // Until ticked or unticked, it follows the chosen planet.
  const [campaignChoice, setOwnsCampaign] = useState<boolean | null>(null);
  const ownsCampaign = campaignChoice ?? planetNeedsCampaign;
  const [challenges, setChallenges] = useState(Math.min(MAX_CHALLENGES, firstChallenges));
  const [presetId, setPresetId] = useState(MARGIN_PRESETS[0]?.id ?? "campaign");
  const [tune, setTune] = useState(true);
  const [progress, setProgress] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const run = useRef<WholeLevelRun | null>(null);
  useEffect(() => () => run.current?.cancel(), []);
  const busy = progress !== null;
  const preset = MARGIN_PRESETS.find((p) => p.id === presetId) ?? (MARGIN_PRESETS[0] as MarginPreset);

  const make = async (): Promise<void> => {
    setMessage(null);
    setProgress("Starting…");
    const current = makeWholeLevel({ levelId, name, seed, ownsCampaign, challenges, preset, tune }, setProgress, workers);
    run.current = current;
    try {
      const made = await current.done;
      if (!again) setProgress("Saving the new level…");
      await onMade(made.level, made.notes);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      const none = again ? "the level is as it was" : "no level was made";
      setMessage(text === "cancelled" ? `Stopped: ${none}.` : `The level could not be made: ${text}`);
    } finally {
      run.current = null;
      setProgress(null);
    }
  };

  return (
    <fieldset className="level-maker">
      <legend>{again ? "Make it all again" : "Make it all for me"}</legend>
      {again ? (
        <p className="hint">
          A new map with new waves and challenges made for it, all from one number, in place of this level&apos;s map, waves and challenges. The name and
          backdrop stay. It is not saved until you save; Ctrl+Z puts back what you had.
        </p>
      ) : (
        <p className="hint">
          A map, the waves and the challenges, all from one number: the same number makes the same level. Everything is a sensible default; change anything
          afterwards in the editor.
        </p>
      )}
      <label className="check">
        <input type="checkbox" checked={ownsCampaign} disabled={busy} onChange={(e) => setOwnsCampaign(e.target.checked)} /> The 50 campaign waves
        {again
          ? " (this level's own campaign)"
          : planetNeedsCampaign
            ? " (this planet has no campaign yet)"
            : " (publishing it makes this map the planet's campaign map)"}
      </label>
      <label htmlFor={`${id}-challenges`}>Challenges</label>
      <select id={`${id}-challenges`} value={challenges} disabled={busy} onChange={(e) => setChallenges(Number(e.target.value))}>
        {Array.from({ length: MAX_CHALLENGES + 1 }, (_, n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <label htmlFor={`${id}-preset`}>Difficulty</label>
      <select id={`${id}-preset`} value={presetId} disabled={busy} onChange={(e) => setPresetId(e.target.value)}>
        {MARGIN_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <label className="check">
        <input type="checkbox" checked={tune} disabled={busy} onChange={(e) => setTune(e.target.checked)} /> Tune the waves with the test player (about half a
        minute)
      </label>
      <label htmlFor={`${id}-seed`}>Level number</label>
      <input
        id={`${id}-seed`}
        type="number"
        min={1}
        max={SEED_MAX}
        value={seed}
        disabled={busy}
        onChange={(e) => setSeed(Math.max(1, Math.min(SEED_MAX, Math.round(Number(e.target.value)) || 1)))}
      />
      <p className="row">
        <button type="button" className="primary" disabled={!ready || busy} onClick={() => void make()}>
          {again ? "Make it all again" : "Make the level"}
        </button>
        {busy && (
          <button type="button" onClick={() => run.current?.cancel()}>
            Stop
          </button>
        )}
      </p>
      {!ready && !busy && !again && <p className="muted">Give the level a name (and a free ID) first.</p>}
      {progress !== null && <p role="status">{progress}</p>}
      {message !== null && <p role="alert">{message}</p>}
    </fieldset>
  );
}
