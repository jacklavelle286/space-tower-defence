// P5 Saved games (Phase 32, M2-12; D4 P5): two tabs, Playing (open runs) and Finished (the last 50 kept, spine S8.1).
// Each row shows the planet and mode, the progress and when it was last played. A playing game has Continue and
// Give up… (or Finish… once its campaign is complete); a game that cannot be opened (its pinned game data is not
// loadable) says so. D7 also gives it Give up / Finish, but those go through the run screen, which cannot open such a
// game: that path arrives with the rollback work (Phase 71) [KNOWN GAP]. Give up opens the game with its confirmation already showing
// (/play/:runId?end=1), so ending a game always goes through the run screen's lease and op queue, never a second path.
// Pages come from GET /api/runs with its opaque cursor ("Show more").
import type { Planets, RunSummary } from "@scd/shared";
import { useEffect, useState } from "react";
import type { PlayerApi } from "../api/playerApi";
import { COPY } from "../copy/en-GB";
import { useOnline } from "./useOnline";

type Tab = "open" | "done";

/** "Today", "Yesterday", or "3 Nov", in the child's own time zone. */
export function playedLabel(iso: string, now: Date): string {
  const day = new Date(iso);
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(day)) / 86_400_000);
  if (days === 0) return COPY.games.today;
  if (days === 1) return COPY.games.yesterday;
  return day.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** The progress words D4 P5 gives each row. */
export function progressLabel(run: RunSummary): string {
  if (run.status === "IN_PROGRESS") return run.stage === "ENDLESS" ? COPY.games.endlessWave(run.wave) : COPY.games.wave(run.wave);
  if (run.status === "COMPLETED") return COPY.games.completed;
  if (run.status === "ABANDONED") return COPY.games.gaveUp(run.highestCompletedWave);
  return COPY.games.cleared(run.highestCompletedWave);
}

function placeLabel(run: RunSummary, planets: Planets | null): string {
  const planet = planets?.planets.find((p) => p.planetId === run.planetId);
  const set = planet?.waveSets.find((w) => w.waveSetId === run.waveSetId);
  return `${planet?.name ?? run.planetId} · ${set?.name ?? run.waveSetId}`;
}

export function SavedGames({
  api,
  onContinue,
  onEnd,
  onBack,
  now = () => new Date(),
}: {
  api: PlayerApi;
  onContinue: (runId: string) => void;
  /** Open the game with its Give up / Finish confirmation showing. */
  onEnd: (runId: string) => void;
  onBack: () => void;
  now?: () => Date;
}) {
  const online = useOnline();
  const [tab, setTab] = useState<Tab>("open");
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [planets, setPlanets] = useState<Planets | null>(null);

  useEffect(() => {
    let live = true;
    void api.getPlanets().then((result) => live && result.kind === "ok" && setPlanets(result.body));
    return () => {
      live = false;
    };
  }, [api]);

  useEffect(() => {
    let live = true;
    void api.getRuns(tab).then((result) => {
      if (!live) return;
      if (result.kind !== "ok") return setFailed(true);
      setRuns(result.body.items);
      setCursor(result.body.nextCursor);
    });
    return () => {
      live = false;
    };
  }, [api, tab]);

  const more = async () => {
    if (cursor === null) return;
    const result = await api.getRuns(tab, cursor);
    if (result.kind !== "ok") return setFailed(true);
    setRuns((old) => [...(old ?? []), ...result.body.items]);
    setCursor(result.body.nextCursor);
  };

  const today = now();
  return (
    <main className="screen games">
      <header className="games-top">
        <h1>{COPY.games.heading}</h1>
        <button type="button" className="btn btn-small" onClick={onBack}>
          {COPY.games.back}
        </button>
      </header>
      <div className="games-tabs" role="tablist">
        {(["open", "done"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className="btn btn-small" onClick={() => {
              if (t === tab) return;
              setRuns(null);
              setFailed(false);
              setTab(t);
            }}>
            {t === "open" ? COPY.games.playing : COPY.games.finished}
          </button>
        ))}
      </div>
      {failed ? <p className="notice">{COPY.games.failed}</p> : null}
      {runs === null && !failed ? <p>{COPY.loading}</p> : null}
      {runs !== null && runs.length === 0 ? <p>{tab === "open" ? COPY.games.noneOpen : COPY.games.noneFinished}</p> : null}
      <ul className="games-list" role="tabpanel">
        {(runs ?? []).map((run) => {
          const finishing = run.campaignCompletedAt !== undefined;
          return (
            <li key={run.runId} className="panel games-row">
              <span className="games-place">{placeLabel(run, planets)}</span>
              <span className="games-progress">{progressLabel(run)}</span>
              <span className="games-played">{playedLabel(run.lastPlayedAt, today)}</span>
              {tab === "open" ? (
                <span className="games-actions">
                  {run.playable ? (
                    <>
                      <button type="button" className="btn btn-small btn-go" disabled={!online} onClick={() => onContinue(run.runId)}>
                        {COPY.home.continueButton}
                      </button>
                      <button type="button" className="btn btn-small" disabled={!online} onClick={() => onEnd(run.runId)}>
                        {finishing ? COPY.run.finish : COPY.run.giveUp}
                      </button>
                    </>
                  ) : (
                    <span className="reason">{COPY.games.cannotOpen}</span>
                  )}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {cursor !== null ? (
        <button type="button" className="btn btn-small" onClick={() => void more()}>
          {COPY.games.more}
        </button>
      ) : null}
      {!online ? <p className="reason">{COPY.offline}</p> : null}
    </main>
  );
}
