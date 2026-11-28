// "Draft questions with AI" (YG3; owner 2026-11-28, ADR-0056). The owner picks a school year, a topic from the
// registry for that year, a question type (multiple choice or typed) and how many; admin-api queues a drafting job for
// picture-gen (R63), and this page asks where it is every few seconds (R64). When it is ready, each draft is shown as a
// child would read it, with the correct answer marked. "Save as a draft" gives it the subject's next free ID and saves
// it through the ordinary routes (R23, then R25), so it opens in the editor like any other draft: nothing reaches a
// child until the owner publishes it with the review checklist. Drafts the model wrote that failed a check are listed
// with their problem names, never saved.
import { bandName, LIMITS, TOPICS, type Topic } from "@scd/shared";
import { useEffect, useRef, useState } from "react";
import { describeError, type AdminApi, type Definition, type DraftJob, type RejectedDraft } from "../api";
import { nextActivityId, subjectName } from "../editor/identity";
import { hrefOf } from "../routes";

/** How often the page asks R64 while a job runs. */
export const POLL_MS = 3000;
export const MAX_DRAFTS = 5;
const TYPES = [
  { value: "MULTIPLE_CHOICE", label: "Multiple choice (four options)" },
  { value: "TYPED", label: "Typed answer (a number or a word)" },
] as const;
type DraftType = (typeof TYPES)[number]["value"];

/** The topics of one band, in registry order. */
export function topicsFor(band: number): Topic[] {
  return TOPICS.filter((t) => t.ages.includes(band));
}

type Saved = { readonly activityId: string } | { readonly error: string };

type Props = { readonly api: AdminApi; readonly newJobId?: () => string; readonly pollMs?: number };

export function DraftPage({ api, newJobId = () => crypto.randomUUID(), pollMs = POLL_MS }: Props) {
  const bands = LIMITS.ageBands.filter((band) => topicsFor(band).length > 0);
  const [band, setBand] = useState<number>(bands.includes(8) ? 8 : (bands[0] ?? 5));
  const topics = topicsFor(band);
  const [topicId, setTopicId] = useState<string>("");
  const [type, setType] = useState<DraftType>("MULTIPLE_CHOICE");
  const [count, setCount] = useState(3);
  const [notes, setNotes] = useState("");
  const [job, setJob] = useState<DraftJob | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [taken, setTaken] = useState<string[] | null>(null);
  const [saved, setSaved] = useState<Record<number, Saved>>({});
  const [dropped, setDropped] = useState<Set<number>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.listActivities().then(
      (list) => setTaken(list.items.map((item) => item.activityId)),
      (error: unknown) => setMessage(`The activity list did not load, so drafts cannot be saved yet. ${describeError(error)}`),
    );
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [api]);

  const topic = topics.find((t) => t.topicId === topicId) ?? null;
  const running = job !== null && (job.state === "QUEUED" || job.state === "DRAFTING");

  const follow = (jobId: string) => {
    timer.current = setTimeout(() => {
      api.getDraftJob(jobId).then(
        (next) => {
          setJob(next);
          if (next.state === "QUEUED" || next.state === "DRAFTING") follow(jobId);
        },
        () => follow(jobId), // a failed poll is asked again; the job itself carries on
      );
    }, pollMs);
  };

  const start = async () => {
    if (topic === null) return;
    setMessage(null);
    setSaved({});
    setDropped(new Set());
    try {
      const started = await api.startDraftJob({
        jobId: newJobId(),
        topicId: topic.topicId,
        band,
        interactionType: type,
        count,
        ...(notes.trim() !== "" ? { notes: notes.trim() } : {}),
      });
      setJob(started);
      follow(started.jobId);
    } catch (error) {
      setMessage(describeError(error));
    }
  };

  const save = async (index: number, draft: Definition) => {
    if (taken === null) return;
    const subject = String(draft.subject);
    const activityId = nextActivityId(subject, taken);
    try {
      const view = await api.createActivity({
        activityId,
        title: String(draft.title),
        subject,
        topicId: String(draft.topicId),
        rewardCategory: String(draft.rewardCategory),
        interactionType: String(draft.interactionType),
        authoringMode: "FIXED",
        minAge: Number(draft.minAge),
        maxAge: Number(draft.maxAge),
      });
      await api.saveActivity(activityId, { draftRevision: view.draft.draftRevision, definition: { ...draft, activityId } });
      setTaken([...taken, activityId]);
      setSaved((s) => ({ ...s, [index]: { activityId } }));
    } catch (error) {
      setSaved((s) => ({ ...s, [index]: { error: describeError(error) } }));
    }
  };

  return (
    <div className="detail">
      <p>
        <a href={hrefOf({ page: "activities" })}>← All activities</a>
      </p>
      <h2>Draft questions with AI</h2>
      <p className="muted">
        Choose a school year and a topic; the AI writes questions in the year&apos;s curriculum. Read each one: save the good ones as drafts, then open
        them in the editor to check and publish. Each job takes one place in the daily drawing limit.
      </p>
      <fieldset disabled={running}>
        <legend>What to draft</legend>
        <div className="grid">
          <span className="field">
            <label htmlFor="draft-band">School year</label>
            <select
              id="draft-band"
              value={band}
              onChange={(e) => {
                setBand(Number(e.target.value));
                setTopicId("");
              }}
            >
              {bands.map((b) => (
                <option key={b} value={b}>
                  {bandName(b)}
                </option>
              ))}
            </select>
          </span>
          <span className="field">
            <label htmlFor="draft-topic">Topic</label>
            <select id="draft-topic" value={topicId} aria-describedby="draft-topic-hint" onChange={(e) => setTopicId(e.target.value)}>
              <option value="">Choose a topic…</option>
              {[...new Set(topics.map((t) => t.subject))].map((subject) => (
                <optgroup key={subject} label={subjectName(subject)}>
                  {topics
                    .filter((t) => t.subject === subject)
                    .map((t) => (
                      <option key={t.topicId} value={t.topicId}>
                        {t.title}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
            <small className="muted" id="draft-topic-hint">
              {topic === null ? "Topics for the year, by subject." : `${topic.description} (${topic.curriculum.join("; ")})`}
            </small>
          </span>
        </div>
        <div className="grid">
          <span className="field">
            <label htmlFor="draft-type">Question type</label>
            <select id="draft-type" value={type} onChange={(e) => setType(e.target.value as DraftType)}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </span>
          <span className="field">
            <label htmlFor="draft-count">How many</label>
            <select id="draft-count" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {Array.from({ length: MAX_DRAFTS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </span>
        </div>
        <span className="field wide">
          <label htmlFor="draft-notes">Notes for the AI (optional)</label>
          <textarea id="draft-notes" value={notes} maxLength={300} rows={2} onChange={(e) => setNotes(e.target.value)} />
        </span>
        <p>
          <button type="button" className="primary" disabled={topic === null} onClick={() => void start()}>
            Draft {count} question{count === 1 ? "" : "s"}
          </button>
        </p>
      </fieldset>

      {message !== null && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      {job !== null && <JobState job={job} />}
      {job?.state === "READY" && (
        <section aria-labelledby="drafts-heading">
          <h3 id="drafts-heading">Drafts</h3>
          {job.drafts.length === 0 && <p>None of the drafts passed the checks. Try again, or add a note for the AI.</p>}
          <ol className="drafts">
            {job.drafts.map((draft, index) =>
              dropped.has(index) ? null : (
                <li key={index} className="draft-card">
                  <DraftView draft={draft} />
                  <DraftActions
                    saved={saved[index]}
                    canSave={taken !== null}
                    onSave={() => void save(index, draft)}
                    onDiscard={() => setDropped(new Set([...dropped, index]))}
                  />
                </li>
              ),
            )}
          </ol>
          {job.rejected.length > 0 && <Rejected items={job.rejected} />}
        </section>
      )}
    </div>
  );
}

function JobState({ job }: { job: DraftJob }) {
  switch (job.state) {
    case "QUEUED":
      return <p role="status">Waiting in the queue…</p>;
    case "DRAFTING":
      return <p role="status">Writing questions… {job.elapsedSeconds ?? 0} s (this can take a few minutes)</p>;
    case "FAILED":
      return (
        <p className="error" role="alert">
          The drafting did not finish ({job.error}). {job.message ?? ""}
        </p>
      );
    default:
      return null;
  }
}

/** A draft as the child would read it, with the correct answer marked. */
export function DraftView({ draft }: { draft: Definition }) {
  const prompt = (draft.prompt as { text?: string } | undefined)?.text ?? "";
  const payload = (draft.activityPayload ?? {}) as { options?: { id: string; text: string }[]; mode?: string; cue?: { text?: string } };
  const accepted = ((draft.answerSpecification ?? {}) as { accepted?: string[] }).accepted ?? [];
  return (
    <div>
      <p>
        <strong>{String(draft.title)}</strong> <span className="muted">· {bandName(Number(draft.minAge))}</span>
      </p>
      <p className="draft-question">{prompt}</p>
      {payload.options !== undefined ? (
        <ul className="draft-options">
          {payload.options.map((o) => (
            <li key={o.id}>
              {o.text}
              {accepted.includes(o.id) ? <strong> ✓ correct</strong> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          {payload.cue?.text !== undefined ? <span className="muted">Clue: {payload.cue.text} · </span> : null}
          Answer ({payload.mode === "WORD" ? "a word" : "a number"}): <strong>{accepted.join(" or ")}</strong>
        </p>
      )}
    </div>
  );
}

function DraftActions({ saved, canSave, onSave, onDiscard }: { saved: Saved | undefined; canSave: boolean; onSave: () => void; onDiscard: () => void }) {
  if (saved !== undefined && "activityId" in saved) {
    return (
      <p role="status">
        Saved as <a href={hrefOf({ page: "activity", id: saved.activityId })}>{saved.activityId}</a>: open it to check and publish.
      </p>
    );
  }
  return (
    <p>
      <button type="button" disabled={!canSave} onClick={onSave}>
        Save as a draft
      </button>{" "}
      <button type="button" onClick={onDiscard}>
        Discard
      </button>
      {saved !== undefined && "error" in saved ? (
        <span className="error" role="alert">
          {" "}
          Not saved: {saved.error}
        </span>
      ) : null}
    </p>
  );
}

function Rejected({ items }: { items: readonly RejectedDraft[] }) {
  return (
    <details>
      <summary>
        {items.length} draft{items.length === 1 ? "" : "s"} did not pass the checks
      </summary>
      <ul>
        {items.map((item, i) => (
          <li key={i}>
            {item.title || `Draft ${(item.index ?? i) + 1}`}: {item.problems.join(", ") || "unreadable"}
          </li>
        ))}
      </ul>
    </details>
  );
}
