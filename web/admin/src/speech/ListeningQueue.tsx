import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminApi, Preview, SpeechDraft, SpeechSummary, SpeechView } from "../api";
import { CheckAll } from "../CheckAll";
import { canApprove, LISTENING_CHECKLIST, nextTake, previewBody, tickAll } from "../review";
import { KIND_INFO } from "./ids";
import { speechError } from "./messages";
import "./queue.css";

// Listening queue (owner's request, 2026-11-16: approve the drafts with fewer clicks). It walks the draft speech
// definitions in list order. For each one it saves nothing: it previews the saved draft (the same request as the
// Preview button), plays the clip, and offers Approve (A), Try another take (R), Skip (S), Replay (P), Stop (Escape).
//
// The rules of the editor page still hold (review.ts canApprove): Approve stays off until the previewed clip of the
// saved draft revision has played to its end, and the request names that clip key (R21). The six listening checks are
// shown once before the queue starts, with one tick; pressing Approve on a clip stands for that tick for that clip.
// The server contract is unchanged: the same approve body the editor sends (draftRevision, clipKey).
//
// Autoplay: browsers allow sound after a user gesture. The queue starts from a button press and each next clip
// follows a button or key press, so it usually plays; if the browser refuses (NotAllowedError), a Play button shows.
//
// Errors (a failed load, preview, take or approval) are shown plainly, recorded in the summary, and the queue moves
// on to the next item. Nothing that failed is approved; run the queue again to retry it.

type Heard = Preview & { draftRevision: number; take: number; played: boolean };
type Stage = "intro" | "run" | "done";
type Outcome = { speechId: string; result: "approved" | "skipped" | "failed"; detail: string };

type Props = {
  readonly api: AdminApi;
  /** The drafts to walk, in list order (a snapshot taken when the queue opens). */
  readonly items: readonly SpeechSummary[];
  /** Something was saved or approved: the page refreshes its list. */
  readonly onChange: () => void;
  readonly onClose: () => void;
};

/** Keys from a text field never drive the queue. */
function typing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

export function ListeningQueue({ api, items, onChange, onClose }: Props) {
  const [stage, setStage] = useState<Stage>("intro");
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<SpeechView | null>(null);
  const [heard, setHeard] = useState<Heard | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const audio = useRef<HTMLAudioElement>(null);
  // Every load, stop and unmount moves this on, so an answer that arrives late for an earlier item is dropped.
  const run = useRef(0);

  useEffect(
    () => () => {
      run.current += 1;
    },
    [],
  );

  const ready = Object.keys(confirmed).length > 0 && LISTENING_CHECKLIST.every((item) => confirmed[item.key] === true);
  const current = stage === "run" ? items[index] : undefined;

  const record = (outcome: Outcome) => setOutcomes((list) => [...list, outcome]);

  const hear = async (speechId: string, draft: SpeechDraft, token: number) => {
    const result = await api.preview({ kind: draft.kind, speechId, ...previewBody(draft) });
    if (token !== run.current) return;
    setBlocked(false);
    setHeard({ ...result, draftRevision: draft.draftRevision, take: draft.take, played: false });
  };

  const load = async (at: number): Promise<void> => {
    run.current += 1;
    const token = run.current;
    setIndex(at);
    setView(null);
    setHeard(null);
    setBlocked(false);
    const item = items[at];
    if (item === undefined) {
      setBusy(false);
      setStage("done");
      return;
    }
    setBusy(true);
    let reason: string | null = null;
    try {
      const loaded = await api.getSpeech(item.speechId);
      if (token !== run.current) return;
      setView(loaded);
      if (loaded.draft.clipKey === null) reason = "The draft has no text yet, so there is nothing to hear.";
      else await hear(item.speechId, loaded.draft, token);
    } catch (error) {
      reason = speechError(error);
    }
    if (token !== run.current) return;
    if (reason === null) {
      setBusy(false);
      return;
    }
    record({ speechId: item.speechId, result: "failed", detail: reason });
    setMessage(`${item.speechId}: ${reason}`);
    void load(at + 1);
  };

  const start = () => {
    if (!ready || items.length === 0) return;
    setStage("run");
    setOutcomes([]);
    setMessage(null);
    void load(0);
  };

  const stop = () => {
    run.current += 1;
    setBusy(false);
    setStage("done");
  };

  /** One press on the current item. "next" moves on; a thrown error is recorded and the queue moves on too. */
  const act = async (action: (speechId: string, token: number) => Promise<"next" | "stay">) => {
    if (busy || current === undefined) return;
    const token = run.current;
    const speechId = current.speechId;
    setBusy(true);
    setMessage(null);
    let next: boolean;
    try {
      next = (await action(speechId, token)) === "next";
    } catch (error) {
      if (token !== run.current) return;
      const reason = speechError(error);
      record({ speechId, result: "failed", detail: reason });
      setMessage(`${speechId}: ${reason}`);
      next = true;
    }
    if (token !== run.current) return;
    setBusy(false);
    if (next) void load(index + 1);
  };

  const gate =
    view === null
      ? ({ ok: false, reason: "Loading…" } as const)
      : canApprove({
          dirty: false,
          draftRevision: view.draft.draftRevision,
          draftClipKey: view.draft.clipKey,
          preview: heard === null ? null : { draftRevision: heard.draftRevision, clipKey: heard.clipKey },
          played: heard?.played ?? false,
          ticks: tickAll(LISTENING_CHECKLIST, ready),
        });
  const take = view === null ? null : nextTake(view.draft.take);

  const approve = () =>
    act(async (speechId) => {
      // Checked again here, not only by the button: never approve without a completed play of this exact clip.
      if (view === null || heard === null || !gate.ok) return "stay";
      const result = await api.approve(speechId, { draftRevision: view.draft.draftRevision, clipKey: heard.clipKey });
      record({ speechId, result: "approved", detail: `version ${result.versionId}, take ${heard.take}` });
      onChange();
      return "next";
    });

  const anotherTake = () =>
    act(async (speechId, token) => {
      if (view === null || take === null) return "stay";
      const updated = await api.saveSpeech(speechId, { draftRevision: view.draft.draftRevision, ...previewBody(view.draft), take });
      if (token !== run.current) return "stay";
      setView(updated);
      setHeard(null);
      onChange();
      await hear(speechId, updated.draft, token);
      return "stay";
    });

  const skip = () =>
    act(async (speechId) => {
      record({ speechId, result: "skipped", detail: "" });
      return "next";
    });

  /** Plays `element` from the start; a refusal by the browser's autoplay rule shows the Play button instead. */
  const playOn = useCallback((element: HTMLAudioElement) => {
    element.currentTime = 0;
    let played: Promise<void> | undefined;
    try {
      played = element.play() as Promise<void> | undefined;
    } catch (error) {
      setMessage(`The clip could not play: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    played?.then(
      () => setBlocked(false),
      (error: unknown) => {
        if (error instanceof DOMException && error.name === "NotAllowedError") setBlocked(true);
        else if (!(error instanceof DOMException && error.name === "AbortError"))
          setMessage(`The clip could not play: ${error instanceof Error ? error.message : String(error)}`);
      },
    );
  }, []);

  const play = () => {
    if (audio.current !== null) playOn(audio.current);
  };

  // A new clip plays as soon as its element appears (one element per clip key; the press that asked for it is the
  // gesture the browser's autoplay rule looks for).
  const attach = useCallback(
    (element: HTMLAudioElement | null) => {
      audio.current = element;
      if (element !== null) playOn(element);
    },
    [playOn],
  );

  const ended = (key: string) => setHeard((h) => (h !== null && h.clipKey === key ? { ...h, played: true } : h));

  // Keys: A approve, R another take, S skip, P replay, Escape stop (or close before the start and after the end).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || typing(event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (stage === "run") {
          if (!busy) stop();
        } else onClose();
        return;
      }
      if (stage !== "run") return;
      const key = event.key.toLowerCase();
      if (key === "a" && gate.ok && !busy) void approve();
      else if (key === "r" && take !== null && view?.draft.clipKey !== null && !busy) void anotherTake();
      else if (key === "s" && !busy) void skip();
      else if (key === "p" && heard !== null) play();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (stage === "intro") {
    return (
      <section className="queue" aria-label="Listening queue">
        <h2>Listening queue</h2>
        <p>
          {items.length === 1 ? "1 draft" : `${items.length} drafts`} from the list, in list order. Each clip is previewed and played; nothing is
          saved unless you press Try another take or Approve.
        </p>
        <p className="muted">
          Speech that was approved and then edited shows as approved in the list, so it is not in the queue: open it on its own.
        </p>
        <CheckAll items={LISTENING_CHECKLIST} ticks={confirmed} onChange={setConfirmed} label="I'll check every clip against these" />
        <div className="queue-minor">
          <button type="button" className="primary" onClick={start} disabled={!ready || items.length === 0}>
            Start the queue
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
        {!ready && <p className="muted">Tick the box to start.</p>}
      </section>
    );
  }

  if (stage === "done") {
    const of = (result: Outcome["result"]) => outcomes.filter((o) => o.result === result);
    const failed = of("failed");
    const skipped = of("skipped");
    const notReached = items.length - outcomes.length;
    return (
      <section className="queue" aria-label="Listening queue">
        <h2>Listening queue: summary</h2>
        <p role="status">
          Approved {of("approved").length} · skipped {skipped.length} · failed {failed.length}
          {notReached > 0 ? ` · not reached ${notReached}` : ""} (of {items.length}).
        </p>
        {failed.length > 0 && (
          <>
            <h3>Failed</h3>
            <ul>
              {failed.map((o) => (
                <li key={o.speechId}>
                  <span className="mono">{o.speechId}</span>: {o.detail}
                </li>
              ))}
            </ul>
          </>
        )}
        {skipped.length > 0 && (
          <>
            <h3>Skipped</h3>
            <ul>
              {skipped.map((o) => (
                <li key={o.speechId} className="mono">
                  {o.speechId}
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="queue-minor">
          <button type="button" className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </section>
    );
  }

  const item = items[index];
  const draft = view?.draft;
  return (
    <section className="queue" aria-label="Listening queue">
      <h2>Listening queue</h2>
      <p aria-live="polite">
        <strong>
          {Math.min(index + 1, items.length)} of {items.length}
        </strong>
      </p>
      {message !== null && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      {item !== undefined && (
        <div>
          <h3>
            {item.title} <small className="mono">{item.speechId}</small>
          </h3>
          <p className="kind">{KIND_INFO[item.kind].label}</p>
          {draft === undefined ? (
            <p>Loading…</p>
          ) : (
            <>
              {draft.ssml !== undefined ? (
                <p className="queue-said mono" aria-label="SSML">
                  {draft.ssml}
                </p>
              ) : (
                <p className="queue-said" aria-label="Text">
                  {draft.text ?? ""}
                </p>
              )}
              <p className="muted">
                Voice {draft.voiceId} · draft revision {draft.draftRevision} · take {draft.take}
              </p>
            </>
          )}
        </div>
      )}
      {heard === null ? (
        <p className="muted">{busy ? "Making the preview…" : "No clip."}</p>
      ) : (
        <div className="player">
          <p>
            <strong>Take {heard.take}</strong>
            {heard.played ? " · played" : ""}
          </p>
          <audio
            key={heard.clipKey}
            ref={attach}
            src={heard.url}
            controls
            preload="auto"
            aria-label="Queue clip"
            onEnded={() => ended(heard.clipKey)}
          />
        </div>
      )}
      {blocked && (
        <p className="muted" role="status">
          The browser did not let the clip play on its own. Press Play to listen.
        </p>
      )}
      <div className="queue-actions">
        <button type="button" className="primary" onClick={() => void approve()} disabled={busy || !gate.ok} aria-keyshortcuts="A">
          Approve<kbd aria-hidden="true">A</kbd>
        </button>
        <button
          type="button"
          onClick={() => void anotherTake()}
          disabled={busy || take === null || draft?.clipKey == null}
          aria-keyshortcuts="R"
          title="Save the same text as the next take and preview it: a fresh render from Polly"
        >
          Try another take<kbd aria-hidden="true">R</kbd>
        </button>
        <button type="button" onClick={() => void skip()} disabled={busy} aria-keyshortcuts="S">
          Skip<kbd aria-hidden="true">S</kbd>
        </button>
      </div>
      {!gate.ok && view !== null && <p className="muted">{gate.reason}</p>}
      {take === null && view !== null && <p className="muted">No takes left (the limit is {view.draft.take}).</p>}
      <div className="queue-minor">
        <button type="button" onClick={play} disabled={heard === null} aria-keyshortcuts="P">
          {blocked ? "Play" : "Replay"}
          <kbd aria-hidden="true">P</kbd>
        </button>
        <button type="button" onClick={stop} disabled={busy} aria-keyshortcuts="Escape">
          Stop queue<kbd aria-hidden="true">Esc</kbd>
        </button>
      </div>
    </section>
  );
}
