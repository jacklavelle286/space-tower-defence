// P12 My progress (Phase 43, M3-08; D4 P12): three subject cards, each "Activities done: 23 · Stars: 19" and, when
// there are any, "Still practising: 4"; a card opens to list its topics by their child-friendly title (the C19 registry,
// topicById). Below, each planet's best ("Moonbeam Colony: best 34 waves cleared") and any badges earned. Counts only:
// no percentages, grades, ages, school years, streaks or comparisons (prompt.md:155, 527).
// "Stars" are activities got right; "still practising" are the ones that ran out of tries (no penalty, C26).
// The badge shelf (Phase 52, C12): every v1 badge, earned ones in colour, the rest as outlines with their rule in words
// ("Clear wave 10"); never a count of what is missing, never a comparison.
import { topicById, type Planets, type Progress, type TopicSummary } from "@scd/shared";
import { useEffect, useState } from "react";
import type { PlayerApi } from "../api/playerApi";
import { COPY } from "../copy/en-GB";

const SUBJECTS = ["maths", "phonics", "spelling"] as const;

export interface SubjectTotals {
  readonly done: number;
  readonly stars: number;
  readonly practising: number;
}

export function subjectTotals(summaries: readonly TopicSummary[], subject: string): SubjectTotals {
  const mine = summaries.filter((s) => s.subject === subject);
  return {
    done: mine.reduce((n, s) => n + s.completed, 0),
    stars: mine.reduce((n, s) => n + s.succeeded, 0),
    practising: mine.reduce((n, s) => n + s.failed, 0),
  };
}

function topicTitle(topicId: string): string {
  return topicById(topicId)?.title ?? topicId;
}

/**
 * The badge shelf: every C12 badge, then each other released planet's campaign badge (Gate M, LD9: campaign-<planetId>,
 * named after the planet and drawn with the Moon's trophy until it has its own art), then anything else earned.
 */
export function badgeShelf(earned: readonly string[], planets: readonly { planetId: string; name: string }[]): { id: string; name: string; rule: string; art: string }[] {
  const known: { id: string; name: string; rule: string; art: string }[] = COPY.badges.map((b) => ({ ...b, art: b.id }));
  for (const planet of planets) {
    const id = `campaign-${planet.planetId}`;
    if (!known.some((b) => b.id === id)) known.push({ id, name: COPY.progress.planetHero(planet.name), rule: COPY.progress.planetHeroRule(planet.name), art: "campaign-luna-1" });
  }
  const extra = earned.filter((id) => !known.some((b) => b.id === id));
  return [...known, ...extra.map((id) => ({ id, name: id.startsWith("campaign-") ? COPY.progress.planetHero(id.slice("campaign-".length)) : id, rule: "", art: id.startsWith("campaign-") ? "campaign-luna-1" : id }))];
}

export function MyProgress({ api, onBack }: { api: Pick<PlayerApi, "getProgress" | "getPlanets">; onBack: () => void }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [planets, setPlanets] = useState<Planets | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void api.getProgress().then((result) => {
      if (!live) return;
      if (result.kind === "ok") setProgress(result.body);
      else setFailed(true);
    });
    void api.getPlanets().then((result) => live && result.kind === "ok" && setPlanets(result.body));
    return () => {
      live = false;
    };
  }, [api]);

  const summaries = progress?.summaries ?? [];
  const bests = Object.entries(progress?.planets ?? {}).filter(([, p]) => (p.bestCompletedWave ?? 0) > 0);
  const badges = Object.keys(progress?.badges ?? {});
  return (
    <main className="screen progress">
      <header className="games-top">
        <h1>{COPY.progress.heading}</h1>
        <button type="button" className="btn btn-small" onClick={onBack}>
          {COPY.progress.back}
        </button>
      </header>
      {failed ? <p className="notice">{COPY.progress.failed}</p> : null}
      {progress === null && !failed ? <p>{COPY.loading}</p> : null}
      {progress !== null && summaries.length === 0 ? <p>{COPY.progress.nothingYet}</p> : null}
      {progress !== null && summaries.length > 0 ? (
        <section className="progress-subjects">
          {SUBJECTS.map((subject) => {
            const totals = subjectTotals(summaries, subject);
            const topics = summaries.filter((s) => s.subject === subject);
            const expanded = open === subject;
            return (
              <article key={subject} className="panel progress-card" aria-labelledby={`progress-${subject}`}>
                <h2 id={`progress-${subject}`}>{COPY.progress.subjects[subject]}</h2>
                <p>
                  {COPY.progress.done(totals.done)} · {COPY.progress.stars(totals.stars)}
                </p>
                {totals.practising > 0 ? <p>{COPY.progress.practising(totals.practising)}</p> : null}
                {topics.length > 0 ? (
                  <button type="button" className="btn btn-small" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : subject)}>
                    {expanded ? COPY.progress.hideTopics : COPY.progress.showTopics}
                  </button>
                ) : null}
                {expanded ? (
                  <ul className="progress-topics">
                    {topics.map((t) => (
                      <li key={t.topicId}>
                        <strong>{topicTitle(t.topicId)}</strong> {COPY.progress.done(t.completed)} · {COPY.progress.stars(t.succeeded)}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </article>
            );
          })}
        </section>
      ) : null}
      {bests.length > 0 ? (
        <section aria-labelledby="progress-planets">
          <h2 id="progress-planets">{COPY.progress.planetsHeading}</h2>
          <ul className="progress-topics">
            {bests.map(([planetId, p]) => (
              <li key={planetId}>
                {COPY.progress.best(planets?.planets.find((x) => x.planetId === planetId)?.name ?? planetId, p.bestCompletedWave ?? 0)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {progress !== null ? (
        <section aria-labelledby="progress-badges">
          <h2 id="progress-badges">{COPY.progress.badgesHeading}</h2>
          <ul className="badge-shelf">
            {badgeShelf(badges, planets?.planets ?? []).map(
              (badge) => {
                const have = badges.includes(badge.id);
                return (
                  <li key={badge.id} className={have ? "badge badge-earned" : "badge"}>
                    <img src={`/assets/ui/badge-${badge.art}${have ? "" : "-outline"}.png`} alt="" width={88} height={88} />
                    <strong>{badge.name}</strong>
                    <span className="visually-hidden">{have ? COPY.progress.earned : COPY.progress.notYet}</span>
                    {have ? null : <span className="badge-rule">{badge.rule}</span>}
                  </li>
                );
              },
            )}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
