// Waves tab → Copy from another level (Gate M, LD17; owner 2026-11-18): another level's campaign waves and its
// challenges, or the live campaign's waves, into this level as one edit (copyWaves.ts says what moves and how it is
// renamed). The other level's saved draft is what is copied.
import { useId, useState } from "react";
import { describeError, type AdminApi, type LevelFile, type LevelSummary, type LevelWave } from "../api";
import { copyable, copyWavesFrom } from "./copyWaves";
import { campaignCard, liveBase } from "./levelFile";

type Props = {
  readonly api: Pick<AdminApi, "listLevels" | "getLevel">;
  readonly level: LevelFile;
  readonly onEdit: (level: LevelFile) => void;
};

const LIVE = "live campaign";

/** The live planet's campaign as a level the copy can read (its challenges are tied to the live maps: not offered). */
function liveAsLevel(level: LevelFile): LevelFile {
  return { ...level, levelId: LIVE, waves: structuredClone(liveBase().planet.waves as unknown as LevelWave[]), waveSets: { campaign: campaignCard(LIVE) }, challengeWaves: {} };
}

export function CopyWaves({ api, level, onEdit }: Props) {
  const id = useId();
  const [levels, setLevels] = useState<readonly LevelSummary[] | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [source, setSource] = useState<LevelFile | null>(null);
  const [campaign, setCampaign] = useState(true);
  const [challenges, setChallenges] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const loadList = () => {
    if (levels !== null) return;
    api.listLevels().then(
      (page) => setLevels(page.items.filter((l) => l.levelId !== level.levelId)),
      (error: unknown) => setMessage(`The levels could not be listed: ${describeError(error)}`),
    );
  };

  const choose = (next: string) => {
    setSourceId(next);
    setSource(null);
    setMessage(null);
    if (next === "") return;
    if (next === LIVE) {
      setSource(liveAsLevel(level));
      return;
    }
    api.getLevel(next).then(
      (view) => setSource(view.draft.level),
      (error: unknown) => setMessage(`That level could not be loaded: ${describeError(error)}`),
    );
  };

  const has = source === null ? null : copyable(source);
  const copy = () => {
    if (source === null) return;
    const result = copyWavesFrom(level, source, { campaign, challenges });
    if (result.level !== level) onEdit(result.level);
    setMessage(`${result.notes.join(" ")} Ctrl+Z puts back what you had.`);
  };

  return (
    <details className="map-maker copy-waves" onToggle={(e) => (e.currentTarget.open ? loadList() : undefined)}>
      <summary>Copy from another level</summary>
      <p className="hint">Bring in another level's campaign waves or its challenges (its saved draft), then change them here.</p>
      <label htmlFor={`${id}-source`}>Copy from</label>
      <select id={`${id}-source`} value={sourceId} onChange={(e) => choose(e.target.value)}>
        <option value="">Choose a level…</option>
        <option value={LIVE}>The live campaign's waves ({liveBase().version})</option>
        {(levels ?? []).map((l) => (
          <option key={l.levelId} value={l.levelId}>
            {l.name} ({l.levelId}
            {l.planetId === undefined ? "" : `, ${l.planetId}`})
          </option>
        ))}
      </select>
      {has !== null && (
        <>
          <p className="muted">
            It has {has.campaign ? "the 50 campaign waves" : "no campaign waves"}, {has.challenges} challenge{has.challenges === 1 ? "" : "s"} and {has.challengeWaves} challenge wave
            {has.challengeWaves === 1 ? "" : "s"}.
          </p>
          <label className="check">
            <input type="checkbox" checked={campaign && has.campaign} disabled={!has.campaign} onChange={(e) => setCampaign(e.target.checked)} /> Campaign waves and the campaign card
            {level.waves !== undefined && level.waves.length > 0 ? " (replacing this level's)" : ""}
          </label>
          <label className="check">
            <input type="checkbox" checked={challenges && has.challenges + has.challengeWaves > 0} disabled={has.challenges + has.challengeWaves === 0} onChange={(e) => setChallenges(e.target.checked)} />{" "}
            Challenges and challenge waves
          </label>
          <p className="row">
            <button type="button" onClick={copy}>
              Copy
            </button>
          </p>
        </>
      )}
      {message !== null && <p role="status">{message}</p>}
    </details>
  );
}
