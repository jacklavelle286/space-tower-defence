// Draw with Claude (Phase 42b): the operator describes a picture, R38 starts a drawing job (it counts toward the daily
// and monthly caps), and a card follows it by asking R39 every 3 s (every 5 s after the first minute): "Waiting to
// start", "Claude is thinking… 0:42", "Drawing… 1:20". When the job is READY the card turns Claude's SVG (sanitised by
// the worker and again by admin-api) into a 256x256 PNG through an <img> and a canvas, never by putting the SVG into
// the page, and shows it. From there: Approve (needs the "no letters, numbers or words" tick; one click sends R34
// with approve), Save as draft, Try again, Try again with a change ("What should change?"), or Discard.
//
// Cards survive switching tabs (the page keeps every tab mounted), and a reload brings back the jobs of the last 24 h
// that are still waiting or ready (R33 openJobs), except drawings already saved (admin-api stops listing them) and
// drawings discarded in this browser (dismissed.ts).
//
// Screen readers: each card's live region announces only changes of step ("Waiting to start", "Claude is thinking…",
// "Drawing…", the outcome); the running clock sits outside it, so it is not read out every few seconds. Focus moves
// to what replaced a control that went away: the saved message, the next card, or the description box.
import { LIMITS } from "@scd/shared";
import { useEffect, useId, useRef, useState } from "react";
import { ApiError, describeError, type AdminApi, type NewPictureJob, type OpenPictureJob, type PictureJobStarted, type PictureUsage } from "../api";
import { discardedJobs, rememberDiscarded } from "./dismissed";
import { capMessage, capPeriod, capReached, capsFromError, clock, descriptionOk, drawingOff, jobFailureMessage, pictureError, pollDelay, tidyText, usageText } from "./messages";
import { blobToBase64, browserTools, nameFromDescription, nameOk, NAME_MAX, PictureError, pictureProblemMessage, renderSvg, type ImageTools } from "./normalise";
import { TextFreeTick } from "./TextFreeTick";

export const DESCRIPTION_MIN = LIMITS.picture.descriptionMinLength;
export const DESCRIPTION_MAX = LIMITS.picture.descriptionMaxLength;
export const CHANGE_MAX = LIMITS.picture.changeMaxLength;

/** One drawing job a card follows. `start` is false for a job restored from R33 (already started). */
type Spec = {
  readonly key: string;
  readonly jobId: string;
  readonly description: string;
  readonly previousJobId?: string;
  readonly change?: string;
  readonly start: boolean;
  /** When the job started (ms since the epoch): the card's clock counts from here. */
  readonly startedAt: number;
};

type Props = {
  readonly api: AdminApi;
  readonly usage: PictureUsage | null;
  /** R33's open jobs when the page loaded: each gets its card back. */
  readonly openJobs: readonly OpenPictureJob[];
  readonly onUsage: (usage: PictureUsage) => void;
  /** After a picture is stored, or a cap answer: the page reads the library and the usage again. */
  readonly onChanged: () => void;
  readonly tools?: ImageTools;
  /** How long to wait before asking about a job again (tests make it 0). */
  readonly delay?: (elapsedMs: number) => number;
  /** A UUIDv4 for each new job (R38's idempotency key). */
  readonly newJobId?: () => string;
};

let cardCount = 0;
const nextKey = () => {
  cardCount += 1;
  return `card-${cardCount}`;
};

function restored(job: OpenPictureJob): Spec {
  const started = Date.parse(job.startedAt);
  return { key: nextKey(), jobId: job.jobId, description: job.description, start: false, startedAt: Number.isNaN(started) ? Date.now() : started };
}

export function DrawPicture({ api, usage, openJobs, onUsage, onChanged, tools = browserTools, delay = pollDelay, newJobId = () => crypto.randomUUID() }: Props) {
  const [cards, setCards] = useState<Spec[]>(() => {
    const discarded = discardedJobs();
    return openJobs.filter((job) => !discarded.has(job.jobId)).map(restored);
  });
  const [description, setDescription] = useState("");
  const descriptionId = useId();
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const headings = useRef(new Map<string, HTMLHeadingElement>());
  // Where focus goes once the cards have re-rendered: a card's heading, or the description box.
  const focusTo = useRef<string | null>(null);

  // After every render: carry out a focus move asked for by Discard, Close or Try again (their button is gone now).
  useEffect(() => {
    const key = focusTo.current;
    if (key === null) return;
    focusTo.current = null;
    (key === "description" ? descriptionRef.current : headings.current.get(key))?.focus();
  });

  const off = drawingOff(usage);
  const reached = capReached(usage);
  const tidy = tidyText(description);
  const good = descriptionOk(tidy, DESCRIPTION_MIN, DESCRIPTION_MAX);

  const start = (text: string, previous?: { jobId: string; change?: string }): Spec => ({
    key: nextKey(),
    jobId: newJobId(),
    description: text,
    ...(previous !== undefined ? { previousJobId: previous.jobId } : {}),
    ...(previous?.change !== undefined ? { change: previous.change } : {}),
    start: true,
    startedAt: Date.now(),
  });

  function draw() {
    if (!good || off || reached !== null) return;
    setCards((all) => [start(tidy), ...all]);
    setDescription("");
  }

  const replace = (old: Spec, next: Spec) => {
    setCards((all) => all.map((c) => (c.key === old.key ? next : c)));
    focusTo.current = next.key; // the new card, where the old card's buttons were
  };
  const discard = (old: Spec) => {
    rememberDiscarded(old.jobId);
    const at = cards.findIndex((c) => c.key === old.key);
    const next = cards[at + 1] ?? cards[at - 1];
    setCards((all) => all.filter((c) => c.key !== old.key));
    focusTo.current = next !== undefined ? next.key : "description";
  };

  return (
    <section className="pictures-draw" aria-label="Draw with Claude">
      <p className="muted">
        Describe one thing to draw, for example "a smiling orange fox sitting down". Claude draws it in the game's
        style. Every drawing counts, including Try again.
      </p>
      {usage !== null && <p className="usage">{usageText(usage)}</p>}
      {(off || reached !== null) && <p className="notice">{capMessage(reached, usage)}</p>}
      <p className="field">
        <label htmlFor={descriptionId}>What should Claude draw?</label>
        <textarea
          id={descriptionId}
          ref={descriptionRef}
          rows={2}
          maxLength={DESCRIPTION_MAX}
          value={description}
          aria-describedby={`${descriptionId}-hint`}
          onChange={(e) => setDescription(e.target.value)}
        />
        <small id={`${descriptionId}-hint`} className="muted">
          {DESCRIPTION_MIN} to {DESCRIPTION_MAX} characters, no &lt; or &gt;. Extra spaces and new lines are tidied
          away.
        </small>
      </p>
      <p className="actions">
        <button type="button" className="primary" disabled={!good || off || reached !== null} onClick={draw}>
          Draw it
        </button>
      </p>
      <div className="job-cards">
        {cards.map((spec) => (
          <JobCard
            key={spec.key}
            api={api}
            spec={spec}
            tools={tools}
            delay={delay}
            onUsage={onUsage}
            onChanged={onChanged}
            headingRef={(el) => {
              if (el === null) headings.current.delete(spec.key);
              else headings.current.set(spec.key, el);
            }}
            onDiscard={() => discard(spec)}
            onRetry={(change) => replace(spec, start(spec.description, change === undefined ? undefined : { jobId: spec.jobId, change }))}
          />
        ))}
      </div>
    </section>
  );
}

type Status =
  | { readonly step: "starting" }
  | { readonly step: "waiting" }
  | { readonly step: "drawing"; readonly phase: "thinking" | "drawing" }
  | { readonly step: "rendering" }
  | { readonly step: "ready"; readonly png: Blob; readonly url: string; readonly warnings: readonly string[] }
  | { readonly step: "failed"; readonly message: string; readonly canRetry: boolean }
  | { readonly step: "saved"; readonly message: string };

type CardProps = {
  readonly api: AdminApi;
  readonly spec: Spec;
  readonly tools: ImageTools;
  readonly delay: (elapsedMs: number) => number;
  readonly onUsage: (usage: PictureUsage) => void;
  readonly onChanged: () => void;
  readonly onDiscard: () => void;
  /** Try again: with a change note, the new job starts from this drawing; without, it starts afresh. */
  readonly onRetry: (change?: string) => void;
  /** The card's heading, so the page can move focus to it. */
  readonly headingRef: (el: HTMLHeadingElement | null) => void;
};

function jobBody(spec: Spec): NewPictureJob {
  return {
    jobId: spec.jobId,
    description: spec.description,
    ...(spec.previousJobId !== undefined ? { previousJobId: spec.previousJobId } : {}),
    ...(spec.change !== undefined ? { change: spec.change } : {}),
  };
}

/** Failed polls in a row before the card gives up (a network blip should not end a paid drawing's card). */
const MISSES = 5;

function JobCard({ api, spec, tools, delay, onUsage, onChanged, onDiscard, onRetry, headingRef }: CardProps) {
  const [status, setStatus] = useState<Status>(spec.start ? { step: "starting" } : { step: "waiting" });
  const [now, setNow] = useState(() => Date.now());
  const [name, setName] = useState(() => nameFromDescription(spec.description));
  const [textFree, setTextFree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [change, setChange] = useState("");
  const starting = useRef<Promise<PictureJobStarted> | null>(null);
  const savedRef = useRef<HTMLParagraphElement>(null);
  const ids = useId();

  // Start the job (once, even when React runs this effect twice), then follow it until it is READY or FAILED.
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let misses = 0;
    const set = (next: Status) => {
      if (live) setStatus(next);
    };
    // A poll that finds the same step and phase changes nothing, so the live region stays quiet between steps.
    const setIfChanged = (next: Extract<Status, { step: "waiting" | "drawing" }>) => {
      if (!live) return;
      setStatus((current) =>
        current.step === next.step && (next.step !== "drawing" || (current.step === "drawing" && current.phase === next.phase)) ? current : next,
      );
    };

    const poll = async () => {
      if (!live) return;
      let job;
      try {
        job = await api.getPictureJob(spec.jobId);
        misses = 0;
      } catch (error) {
        if (!live) return;
        misses += 1;
        if ((error instanceof ApiError && error.code === "NOT_FOUND") || misses >= MISSES) {
          set({ step: "failed", message: error instanceof ApiError && error.code === "NOT_FOUND" ? "That drawing can't be found. Press Try again." : describeError(error), canRetry: true });
          return;
        }
        timer = setTimeout(() => void poll(), delay(Date.now() - spec.startedAt));
        return;
      }
      if (!live) return;
      switch (job.state) {
        case "QUEUED":
          setIfChanged({ step: "waiting" });
          break;
        case "DRAWING":
          setIfChanged({ step: "drawing", phase: job.phase === "drawing" ? "drawing" : "thinking" });
          break;
        case "READY": {
          set({ step: "rendering" });
          try {
            const png = await renderSvg(job.svg, tools);
            if (!live) return;
            set({ step: "ready", png, url: tools.preview(png), warnings: job.warnings ?? [] });
          } catch (problem) {
            set({ step: "failed", message: pictureProblemMessage(problem instanceof PictureError ? problem.problem : "unreadable", true), canRetry: true });
          }
          return;
        }
        case "FAILED":
          set({ step: "failed", message: jobFailureMessage(job.error), canRetry: true });
          return;
      }
      timer = setTimeout(() => void poll(), delay(Date.now() - spec.startedAt));
    };

    void (async () => {
      if (spec.start) {
        starting.current ??= api.startPictureJob(jobBody(spec));
        try {
          const started = await starting.current;
          if (!live) return;
          onUsage({
            usedToday: started.usedToday,
            dailyCap: started.dailyCap,
            usedMonth: started.usedMonth,
            monthlyCap: started.monthlyCap,
            ...(started.drawingOn !== undefined ? { drawingOn: started.drawingOn } : {}),
          });
          set({ step: "waiting" });
        } catch (error) {
          if (!live) return;
          const period = capPeriod(error);
          if (period !== null) {
            set({ step: "failed", message: capMessage(period, capsFromError(error)), canRetry: false });
            onChanged(); // the page reads the usage again and words the cap with its numbers
          } else {
            set({ step: "failed", message: describeError(error), canRetry: true });
          }
          return;
        }
      }
      timer = setTimeout(() => void poll(), delay(Date.now() - spec.startedAt));
    })();

    return () => {
      live = false;
      if (timer !== undefined) clearTimeout(timer);
    };
    // The card follows one job for its whole life: spec never changes (Try again makes a new card), and the page's
    // callbacks are stable, so this runs once (twice under StrictMode, which `starting` makes harmless).
  }, [api, spec, tools, delay, onUsage, onChanged]);

  // The clock while the job waits or draws.
  const ticking = status.step === "starting" || status.step === "waiting" || status.step === "drawing";
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ticking]);

  // The save replaced the buttons with a message: put focus on it, so keyboard and screen-reader users keep their place.
  const saved = status.step === "saved";
  useEffect(() => {
    if (saved) savedRef.current?.focus();
  }, [saved]);

  // Free the preview's blob: URL.
  const readyUrl = status.step === "ready" ? status.url : null;
  useEffect(() => {
    if (readyUrl === null) return;
    return () => tools.release(readyUrl);
  }, [readyUrl, tools]);

  async function save(approve: boolean) {
    if (status.step !== "ready") return;
    setBusy(true);
    setSaveError(null);
    try {
      const pngBase64 = await blobToBase64(status.png);
      const stored = await api.createPicture({ name, source: "GENERATED", jobId: spec.jobId, pngBase64, approve, textFree });
      const state = stored.picture.state === "APPROVED" ? "approved and in My pictures" : "saved as a draft";
      setStatus({
        step: "saved",
        message: stored.duplicate === true ? `This picture is already in the library as "${stored.picture.name}".` : `"${stored.picture.name}" is ${state}.`,
      });
      onChanged();
    } catch (error) {
      setSaveError(pictureError(error));
    } finally {
      setBusy(false);
    }
  }

  const line = (() => {
    switch (status.step) {
      case "starting":
        return "Starting…";
      case "waiting":
        return "Waiting to start";
      case "drawing":
        return status.phase === "drawing" ? "Drawing…" : "Claude is thinking…";
      case "rendering":
        return "Nearly ready…";
      default:
        return null;
    }
  })();
  // The running clock, from this browser's own second tick (not the poll), outside the live region.
  const timer = status.step === "waiting" || status.step === "drawing" ? clock((now - spec.startedAt) / 1000) : null;

  const tidyChange = tidyText(change);
  const changeGood = descriptionOk(tidyChange, 1, CHANGE_MAX);
  const nameGood = nameOk(name);

  return (
    <article className="job-card" aria-label={`Drawing: ${spec.description}`}>
      <h3 ref={headingRef} tabIndex={-1}>
        “{spec.description}”
      </h3>
      {spec.change !== undefined && <p className="muted">Change: {spec.change}</p>}
      <div role="status">
        {line !== null && <p className="job-progress">{line}</p>}
        {status.step === "failed" && <p className="error">{status.message}</p>}
        {status.step === "saved" && (
          <p className="ok" ref={savedRef} tabIndex={-1}>
            {status.message}
          </p>
        )}
        {saveError !== null && <p className="error">{saveError}</p>}
      </div>
      {timer !== null && (
        <p className="job-clock muted">
          <span className="visually-hidden">Time so far: </span>
          {timer}
        </p>
      )}
      {status.step === "ready" && (
        <div className="picture-review">
          <img className="picture-preview" src={status.url} alt={`Claude's drawing of ${spec.description}`} width={256} height={256} />
          <div className="picture-review-form">
            {status.warnings.length > 0 && <p className="muted">Notes: {status.warnings.join("; ")}</p>}
            <p className="field">
              <label htmlFor={`${ids}-name`}>Name (for the admin only)</label>
              <input id={`${ids}-name`} type="text" value={name} maxLength={NAME_MAX} onChange={(e) => setName(e.target.value)} />
              {!nameGood && <small className="error">1 to {NAME_MAX} characters, no spaces at the ends, no &lt; or &gt;.</small>}
            </p>
            <TextFreeTick checked={textFree} onChange={setTextFree} />
            <p className="actions">
              <button type="button" className="primary" disabled={busy || !textFree || !nameGood} onClick={() => void save(true)}>
                Approve
              </button>
              <button type="button" disabled={busy} onClick={() => onRetry()}>
                Try again
              </button>
              <button type="button" disabled={busy} aria-expanded={changing} onClick={() => setChanging((c) => !c)}>
                Try again with a change
              </button>
              <button type="button" disabled={busy} onClick={onDiscard}>
                Discard
              </button>
              <button type="button" disabled={busy || !nameGood} onClick={() => void save(false)}>
                Save as draft
              </button>
            </p>
            {changing && (
              <p className="field">
                <label htmlFor={`${ids}-change`}>What should change?</label>
                <textarea
                  id={`${ids}-change`}
                  rows={2}
                  maxLength={CHANGE_MAX}
                  value={change}
                  aria-describedby={`${ids}-change-hint`}
                  onChange={(e) => setChange(e.target.value)}
                />
                <small id={`${ids}-change-hint`} className="muted">
                  1 to {CHANGE_MAX} characters, no &lt; or &gt;. Extra spaces and new lines are tidied away.
                </small>
                <button type="button" className="primary" disabled={busy || !changeGood} onClick={() => onRetry(tidyChange)}>
                  Draw it again with this change
                </button>
              </p>
            )}
          </div>
        </div>
      )}
      {status.step === "failed" && (
        <p className="actions">
          {status.canRetry && (
            <button type="button" onClick={() => onRetry()}>
              Try again
            </button>
          )}
          <button type="button" onClick={onDiscard}>
            Discard
          </button>
        </p>
      )}
      {status.step === "saved" && (
        <p className="actions">
          <button type="button" onClick={onDiscard}>
            Close
          </button>
        </p>
      )}
    </article>
  );
}
