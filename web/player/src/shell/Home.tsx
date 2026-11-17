import { libraryPictureUrl, type Me, type Planets, trapTab, type WaveSetEntry } from "@scd/shared";
import { useEffect, useRef, useState } from "react";
import { COPY } from "../copy/en-GB";
import type { PlayerApi } from "../api/playerApi";
import type { CreateOutcome } from "../run/newGame";
import type { SyncQueue } from "../sync/queue";
import { SyncChip } from "../sync/SyncChip";
import { useOnline } from "./useOnline";

function reasonLine(reason: string | undefined): string | null {
  if (reason === "AGE_OUT_OF_RANGE") return COPY.home.ageOutOfRange;
  if (reason === "BANK_NOT_READY") return COPY.home.bankNotReady;
  return null;
}

/** A planet's picture: its library Planet picture (LD10), the repo icon for luna-1, or the silhouette for another. */
export function planetIcon(planet: { planetId: string; icon?: string }): string {
  const own = planet.icon === undefined ? null : libraryPictureUrl(planet.icon);
  if (own !== null) return own;
  return planet.planetId === "luna-1" ? "/assets/ui/planet-luna-1.png" : "/assets/ui/planet-silhouette.png";
}

/** What New game starts (Milestone 1 has one planet and one wave set; the planet screens P6/P7 come later). */
export interface GameChoice {
  planetId: string;
  waveSetId: string;
  /** A tester's preview version (Gate M, LD7); absent for the version current.json names. */
  campaignVersion?: string;
}

/** A choice's key: the same wave set can be offered live and as a preview of a newer version. */
export function choiceKey(c: GameChoice): string {
  return `${c.planetId}/${c.waveSetId}${c.campaignVersion !== undefined ? `@${c.campaignVersion}` : ""}`;
}

function firstChoice(planets: Planets | null): GameChoice | null {
  for (const planet of planets?.planets ?? []) {
    if (!planet.unlocked) continue;
    const ws = planet.waveSets.find((w) => w.available && w.preview !== true);
    if (ws) return { planetId: planet.planetId, waveSetId: ws.waveSetId };
  }
  return null;
}

/** Every wave set a new game could use now, planet by planet (P7, Phase 53): the campaign first, then challenges. */
export function allChoices(planets: Planets | null): { planetName: string; choice: GameChoice; set: WaveSetEntry }[] {
  const out: { planetName: string; choice: GameChoice; set: WaveSetEntry }[] = [];
  for (const planet of planets?.planets ?? []) {
    if (!planet.unlocked) continue;
    const sets = [...planet.waveSets].sort((a, b) => (a.mode === b.mode ? 0 : a.mode === "CAMPAIGN" ? -1 : 1));
    for (const set of sets) {
      const choice: GameChoice = { planetId: planet.planetId, waveSetId: set.waveSetId };
      if (set.campaignVersion !== undefined) choice.campaignVersion = set.campaignVersion;
      out.push({ planetName: planet.name, choice, set });
    }
  }
  return out;
}

/** The line Home shows when New game did not start a game (D7.3). */
function problemLine(outcome: CreateOutcome): string {
  switch (outcome.kind) {
    case "elsewhere":
      return COPY.run.elsewhere(outcome.deviceLabel || "another computer", Math.max(1, Math.ceil(outcome.retryAfterSeconds / 60)));
    case "limit":
      return COPY.run.limit;
    case "unavailable":
      return outcome.reason === "PLANET_LOCKED"
        ? COPY.run.planetLocked
        : outcome.reason === "PREVIEW_CLOSED"
          ? COPY.run.previewClosed
          : outcome.reason === "BANK_NOT_READY"
          ? COPY.home.bankNotReady
          : COPY.home.ageOutOfRange;
    case "upgrade":
      return COPY.run.upgrade;
    default:
      return COPY.startFailed;
  }
}

/**
 * P4 Home (D4): avatar and name, the sync chip, the Continue card (or a big New game), the planet list from
 * `GET /api/planets`, and Sign out. Continue opens the saved run; New game creates one (R8) and opens it.
 */
export function Home({
  me,
  api,
  queue,
  onSignOut,
  onSignInAgain,
  onContinue,
  onSavedGames,
  onMyProgress,
  onSettings,
  onNewGame,
  practice = false,
}: {
  me: Me;
  api: Pick<PlayerApi, "getPlanets">;
  queue: SyncQueue;
  onSignOut: () => void;
  onSignInAgain: () => void;
  onContinue: (runId: string) => void;
  /** Opens P5 Saved games (Phase 32). Optional so older callers keep working. */
  onSavedGames?: () => void;
  /** Opens P12 My progress (Phase 43). */
  onMyProgress?: () => void;
  /** Opens P13 Settings (Phase 55). */
  onSettings?: () => void;
  /** Creates the run; on `ok` the caller has already moved to the run screen. */
  onNewGame: (choice: GameChoice, options: { runId?: string; takeover?: boolean }) => Promise<CreateOutcome>;
  practice?: boolean;
}) {
  const online = useOnline();
  const [planets, setPlanets] = useState<Planets | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [takeover, setTakeover] = useState<{ runId: string; deviceLabel: string; choice: GameChoice } | null>(null);
  // G R8: a runId whose create got no definite answer is sent again on the next press for the same choice.
  const pending = useRef<{ runId: string; key: string } | null>(null);

  useEffect(() => {
    let live = true;
    void api.getPlanets().then((result) => {
      if (live && result.kind === "ok") setPlanets(result.body);
    });
    return () => {
      live = false;
    };
  }, [api]);

  const continueRun = me.runs.find((run) => run.playable && run.status === "IN_PROGRESS");
  const choice = firstChoice(planets);

  async function start(chosen: GameChoice, options: { runId?: string; takeover?: boolean } = {}) {
    setBusy(true);
    setProblem(null);
    setTakeover(null);
    const key = choiceKey(chosen);
    const runId = options.runId ?? (pending.current?.key === key ? pending.current.runId : undefined);
    const outcome = await onNewGame(chosen, runId !== undefined ? { ...options, runId } : options);
    pending.current = outcome.kind === "failed" && outcome.retryRunId !== undefined ? { runId: outcome.retryRunId, key } : null;
    setBusy(false);
    if (outcome.kind === "ok") return;
    if (outcome.kind === "takeover-confirm") setTakeover({ runId: outcome.runId, deviceLabel: outcome.deviceLabel, choice: chosen });
    else if (outcome.kind === "auth-required") onSignInAgain();
    else setProblem(problemLine(outcome));
  }

  return (
    <main className="screen home">
      <header className="home-top">
        <img className="home-avatar" src={`/assets/ui/${me.avatarId}.png`} alt={COPY.avatars[me.avatarId] ?? ""} width={72} height={72} />
        <h1 className="home-greeting">{COPY.home.greeting(me.nickname)}</h1>
        <SyncChip queue={queue} onSignIn={onSignInAgain} />
      </header>

      {me.session.activeElsewhere && me.session.deviceLabel ? (
        <p className="notice">{COPY.home.activeElsewhere(me.session.deviceLabel)}</p>
      ) : null}

      {continueRun ? (
        <section className="panel continue-card" aria-labelledby="continue-heading">
          <h2 id="continue-heading">{COPY.home.continueHeading}</h2>
          <p>{COPY.home.wave(continueRun.wave)}</p>
          <button
            type="button"
            className="btn btn-big btn-go"
            disabled={!online || busy}
            onClick={() => onContinue(continueRun.runId)}
          >
            {COPY.home.continueButton}
          </button>
        </section>
      ) : null}

      {allChoices(planets).length > 1
        ? (planets?.planets ?? [])
            .filter((planet) => planet.unlocked)
            .map((planet) => {
              const choices = allChoices({ ageBand: planets?.ageBand ?? null, planets: [planet] });
              if (choices.length === 0) return null;
              // One section per planet (Gate M, LD9): the campaign first, then its quick challenges.
              const headingId = `setup-heading-${planet.planetId}`;
              return (
                <section key={planet.planetId} className="panel run-setup" aria-labelledby={headingId}>
                  <h2 id={headingId}>{COPY.runSetup.heading(planet.name)}</h2>
                  <ul>
                    {choices.map(({ choice: c, set }, i, list) => (
                      <li key={choiceKey(c)}>
                        {set.mode === "CHALLENGE" && list[i - 1]?.set.mode !== "CHALLENGE" ? <h3>{COPY.runSetup.challenges}</h3> : null}
                        <div className="setup-row">
                          <span className="setup-name">
                            <strong>{set.name}</strong>{" "}
                            {set.preview === true ? <span className="preview-tag">{COPY.home.preview}</span> : null}{" "}
                            {set.mode === "CAMPAIGN" ? COPY.runSetup.campaignLength(set.finalWave) : COPY.runSetup.waves(set.finalWave)}
                            {COPY.runSetup.about[c.waveSetId] !== undefined ? <span className="setup-about">{COPY.runSetup.about[c.waveSetId]}</span> : null}
                          </span>
                          {set.available ? (
                            <button type="button" className="btn btn-small btn-go" disabled={!online || busy} onClick={() => void start(c)}>
                              {COPY.runSetup.start}
                            </button>
                          ) : (
                            <span className="reason">{set.reason === "AGE_OUT_OF_RANGE" ? COPY.home.ageOutOfRange : COPY.home.comingLater}</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
        : null}

      <section className="home-actions">
        {allChoices(planets).length > 1 ? null : (
        <button
          type="button"
          className="btn btn-big btn-go"
          disabled={!online || busy || choice === null}
          onClick={() => choice && void start(choice)}
        >
          {busy ? COPY.home.starting : COPY.home.newGame}
        </button>
        )}
        {onSavedGames !== undefined ? (
          <button type="button" className="btn btn-small" onClick={onSavedGames}>
            {COPY.home.savedGames}
          </button>
        ) : null}
        {onMyProgress !== undefined ? (
          <button type="button" className="btn btn-small" onClick={onMyProgress}>
            {COPY.home.myProgress}
          </button>
        ) : null}
        {onSettings !== undefined ? (
          <button type="button" className="btn btn-small" onClick={onSettings}>
            {COPY.home.settings}
          </button>
        ) : null}
        {!online ? <p className="reason">{COPY.offline}</p> : null}
        {online && planets !== null && choice === null ? <p className="reason">{COPY.home.noWaveSet}</p> : null}
        {problem !== null ? (
          <p className="notice" role="alert">
            {problem}
          </p>
        ) : null}
      </section>

      {takeover !== null ? (
        <div className="dialog-backdrop">
          <div className="panel dialog" role="alertdialog" aria-modal="true" aria-labelledby="takeover-question" onKeyDown={trapTab}>
            <p id="takeover-question">{COPY.run.takeover(takeover.deviceLabel || "another computer")}</p>
            <p className="reason">{COPY.run.takeoverGrownUp}</p>
            <div className="dialog-buttons">
              {/* Focus starts on the safe choice (D5.4). */}
              <button type="button" className="btn btn-big" autoFocus onClick={() => setTakeover(null)}>
                {COPY.run.notNow}
              </button>
              <button
                type="button"
                className="btn btn-small"
                onClick={() => void start(takeover.choice, { runId: takeover.runId, takeover: true })}
              >
                {COPY.run.playHere}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {planets ? (
        <section className="panel planets" aria-labelledby="planets-heading">
          <h2 id="planets-heading">{COPY.home.planetsHeading}</h2>
          <ul className="planet-list">
            {planets.planets.map((planet) => (
              <li key={planet.planetId} className="planet">
                <img src={planetIcon(planet)} alt="" width={96} height={96} />
                <div>
                  <h3>{planet.name}</h3>
                  {planet.unlocked ? null : (
                    <p className="reason">{COPY.home.planetLocked(planets.planets[planets.planets.indexOf(planet) - 1]?.name ?? "")}</p>
                  )}
                  <ul className="wave-sets">
                    {planet.waveSets.map((ws) => (
                      <li key={`${ws.waveSetId}@${ws.campaignVersion ?? ""}`}>
                        {ws.name}
                        {ws.preview === true ? <span className="preview-tag"> {COPY.home.preview}</span> : null}
                        {ws.available ? null : <span className="reason"> {reasonLine(ws.reason)}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
            <li className="planet planet-later">
              <img src="/assets/ui/planet-silhouette.png" alt="" width={96} height={96} />
              <h3>{COPY.home.comingLater}</h3>
            </li>
          </ul>
        </section>
      ) : null}

      <footer className="home-bottom">
        {practice ? (
          <a className="dev-link" href="/play/local">
            {COPY.home.practice}
          </a>
        ) : null}
        <button type="button" className="btn btn-small" disabled={!online} onClick={onSignOut}>
          {COPY.home.signOut}
        </button>
        {online ? null : <span className="reason">{COPY.signOut.offline}</span>}
      </footer>
    </main>
  );
}
