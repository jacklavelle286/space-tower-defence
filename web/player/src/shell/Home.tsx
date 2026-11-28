import { bandName, type Difficulty, type Me, type Planets, trapTab, type WaveSetEntry, yearName } from "@scd/shared";
import { useEffect, useRef, useState } from "react";
import { COPY } from "../copy/en-GB";
import type { PlayerApi } from "../api/playerApi";
import type { CreateOutcome } from "../run/newGame";
import type { SyncQueue } from "../sync/queue";
import { SyncChip } from "../sync/SyncChip";
import { MapPicture } from "./mapSketch";
import { SchoolYearPicker } from "./SchoolYearPicker";
import { useOnline } from "./useOnline";

function reasonLine(reason: string | undefined): string | null {
  if (reason === "AGE_OUT_OF_RANGE") return COPY.home.ageOutOfRange;
  if (reason === "BANK_NOT_READY") return COPY.home.bankNotReady;
  return null;
}

/** What New game starts (Milestone 1 has one planet and one wave set; the planet screens P6/P7 come later). */
export interface GameChoice {
  planetId: string;
  waveSetId: string;
  /** A tester's preview version (Gate M, LD7); absent for the version current.json names. */
  campaignVersion?: string;
  /** YG1: Hard plays the year above; absent is Easy. */
  difficulty?: Difficulty;
}

/** A choice's key: the same wave set can be offered live and as a preview of a newer version. */
export function choiceKey(c: GameChoice): string {
  return `${c.planetId}/${c.waveSetId}${c.campaignVersion !== undefined ? `@${c.campaignVersion}` : ""}${c.difficulty === "HARD" ? "#hard" : ""}`;
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

type Choice = { planetName: string; choice: GameChoice; set: WaveSetEntry };

/** One map card (Gate M, LD23): the map's 50-wave adventure behind Play (the live one before a tester's preview), its
 *  other wave sets (challenges, previews) as small buttons, and the version its picture is drawn from. */
export interface MapCard {
  readonly planetId: string;
  readonly name: string;
  readonly version: string | undefined;
  readonly play: Choice | null;
  readonly more: readonly Choice[];
}

export function mapCards(planets: Planets | null): MapCard[] {
  return (planets?.planets ?? [])
    .filter((planet) => planet.unlocked)
    .map((planet) => {
      const choices = allChoices({ ageBand: planets?.ageBand ?? null, planets: [planet] });
      const campaigns = choices.filter((c) => c.set.mode === "CAMPAIGN");
      const play = campaigns.find((c) => c.set.preview !== true) ?? campaigns[0] ?? null;
      return {
        planetId: planet.planetId,
        name: planet.name,
        version: play?.set.campaignVersion ?? planet.campaignVersion,
        play,
        more: choices.filter((c) => c !== play),
      };
    })
    .filter((card) => card.play !== null || card.more.length > 0);
}

/** The line Home shows when a game did not start (D7.3). */
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
 * P4 Home (D4): avatar and name, the sync chip, the Continue card, the maps (Gate M, LD23; owner 2026-11-20: "just have
 * a list of maps - really simple") from `GET /api/planets` (a map is a planet underneath, ADR-0043), and Sign out. Each
 * map card has a drawing of the map, its name, Play (its 50-wave adventure) and its challenges as small buttons.
 * Continue opens the saved run; Play or a challenge creates one (R8) and opens it.
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
  onSchoolYear,
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
  /** YG1: saves the school year (R4); true when saved. Without it Home shows the year but cannot change it. */
  onSchoolYear?: (year: number) => Promise<boolean>;
  practice?: boolean;
}) {
  const online = useOnline();
  const [planets, setPlanets] = useState<Planets | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [takeover, setTakeover] = useState<{ runId: string; deviceLabel: string; choice: GameChoice } | null>(null);
  // YG1: the game waiting for Easy or Hard, and the school-year dialog (its draft year, and a failed save).
  const [asking, setAsking] = useState<GameChoice | null>(null);
  const [yearDraft, setYearDraft] = useState<number | null | undefined>(undefined);
  const [yearFailed, setYearFailed] = useState(false);
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
  const cards = mapCards(planets);
  const easyBand = planets?.ageBand ?? null;
  const hardBand = planets?.hardAgeBand ?? null;
  const yearLabel = me.schoolYear != null ? yearName(me.schoolYear) : null;

  /** Play or a challenge: ask Easy or Hard when there is a year above to play (YG1), else start straight away. */
  function press(chosen: GameChoice) {
    if (easyBand !== null && hardBand !== null) setAsking(chosen);
    else void start(chosen);
  }

  async function saveYear() {
    if (yearDraft == null || onSchoolYear === undefined) return;
    setBusy(true);
    setYearFailed(false);
    const ok = await onSchoolYear(yearDraft);
    if (ok) {
      // A new school year changes the bands Play offers: read the maps again.
      const result = await api.getPlanets();
      if (result.kind === "ok") setPlanets(result.body);
      setYearDraft(undefined);
    } else setYearFailed(true);
    setBusy(false);
  }

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

      <p className="home-year">
        {yearLabel !== null ? COPY.home.schoolYear(yearLabel) : COPY.home.schoolYearUnset}{" "}
        {onSchoolYear !== undefined ? (
          <button type="button" className="btn btn-small" disabled={!online || busy} onClick={() => setYearDraft(me.schoolYear ?? null)}>
            {COPY.home.changeYear}
          </button>
        ) : null}
      </p>

      {me.session.activeElsewhere && me.session.deviceLabel ? (
        <p className="notice">{COPY.home.activeElsewhere(me.session.deviceLabel)}</p>
      ) : null}

      {continueRun ? (
        <section className="panel continue-card" aria-labelledby="continue-heading">
          <h2 id="continue-heading">{COPY.home.continueHeading}</h2>
          <p>
            {COPY.home.wave(continueRun.wave)}
            {continueRun.difficulty === "HARD" ? <span className="hard-tag"> {COPY.home.hardTag}</span> : null}
          </p>
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

      {cards.length > 0 ? (
        <section className="panel maps" aria-labelledby="maps-heading">
          <h2 id="maps-heading">{COPY.home.planetsHeading}</h2>
          <ul className="map-cards">
            {cards.map((card) => {
              const headingId = `map-${card.planetId}`;
              return (
                <li key={card.planetId} className="map-card" aria-labelledby={headingId}>
                  <MapPicture {...(card.version === undefined ? {} : { version: card.version })} />
                  <div className="map-card-body">
                    <h3 id={headingId}>{card.name}</h3>
                    {card.play !== null ? (
                      card.play.set.available ? (
                        <button
                          type="button"
                          className="btn btn-big btn-go"
                          aria-label={COPY.home.playMap(card.name)}
                          disabled={!online || busy}
                          onClick={() => card.play && press(card.play.choice)}
                        >
                          {busy ? COPY.home.starting : COPY.home.play}
                          {card.play.set.preview === true ? <span className="preview-tag"> {COPY.home.preview}</span> : null}
                        </button>
                      ) : (
                        <p className="reason">{reasonLine(card.play.set.reason) ?? COPY.home.comingLater}</p>
                      )
                    ) : null}
                    {card.more.some((c) => c.set.available) ? (
                      <div className="map-challenges" role="group" aria-label={COPY.home.challengesOn(card.name)}>
                        {card.more
                          .filter((c) => c.set.available)
                          .map((c) => (
                            <button key={choiceKey(c.choice)} type="button" className="btn btn-small" disabled={!online || busy} onClick={() => press(c.choice)}>
                              {c.set.name}
                              {c.set.preview === true ? <span className="preview-tag"> {COPY.home.preview}</span> : null}
                            </button>
                          ))}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="home-actions">
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
        {online && planets !== null && cards.every((c) => !(c.play?.set.available ?? false) && !c.more.some((m) => m.set.available)) ? (
          <p className="reason">{COPY.home.noWaveSet}</p>
        ) : null}
        {problem !== null ? (
          <p className="notice" role="alert">
            {problem}
          </p>
        ) : null}
      </section>

      {asking !== null && easyBand !== null && hardBand !== null ? (
        <div className="dialog-backdrop">
          <div className="panel dialog" role="dialog" aria-modal="true" aria-labelledby="how-hard" onKeyDown={trapTab}>
            <h2 id="how-hard">{COPY.home.howHard}</h2>
            <div className="dialog-buttons difficulty-buttons">
              <button
                type="button"
                className="btn btn-big btn-go"
                autoFocus
                onClick={() => {
                  setAsking(null);
                  void start({ ...asking, difficulty: "EASY" });
                }}
              >
                {COPY.home.easy}
                <span className="difficulty-line">{COPY.home.easyLine(bandName(easyBand))}</span>
              </button>
              <button
                type="button"
                className="btn btn-big btn-hard"
                onClick={() => {
                  setAsking(null);
                  void start({ ...asking, difficulty: "HARD" });
                }}
              >
                {COPY.home.hard}
                <span className="difficulty-line">{COPY.home.hardLine(bandName(hardBand))}</span>
              </button>
            </div>
            <button type="button" className="btn btn-small" onClick={() => setAsking(null)}>
              {COPY.home.cancel}
            </button>
          </div>
        </div>
      ) : null}

      {yearDraft !== undefined ? (
        <div className="dialog-backdrop">
          <div className="panel dialog" role="dialog" aria-modal="true" aria-labelledby="choose-year" onKeyDown={trapTab}>
            <h2 id="choose-year">{COPY.home.chooseYearHeading}</h2>
            <SchoolYearPicker name="home-year" value={yearDraft} onChange={setYearDraft} />
            {yearFailed ? (
              <p className="notice" role="alert">
                {COPY.home.yearFailed}
              </p>
            ) : null}
            <div className="dialog-buttons">
              <button type="button" className="btn btn-big" onClick={() => setYearDraft(undefined)}>
                {COPY.home.cancel}
              </button>
              <button type="button" className="btn btn-big btn-go" disabled={yearDraft === null || busy || !online} onClick={() => void saveYear()}>
                {COPY.home.saveYear}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
