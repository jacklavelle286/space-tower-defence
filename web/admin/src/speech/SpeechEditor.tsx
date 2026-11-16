import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminApi, Preview, SpeechView } from "../api";
import { CheckAll } from "../CheckAll";
import { canApprove, LISTENING_CHECKLIST, nextTake, previewBody } from "../review";
import { KIND_INFO } from "./ids";
import { speechError } from "./messages";

// A9 (D §D9.3): edit the draft, Preview (the only Polly path), play it to the end, tick the listening checks, Approve.
// Voice, engine and provider are shown, never chosen: the server picks them for the kind (E §E.4.1a). Approve is
// enabled only for the saved draft whose exact clip was previewed and played in this session, and the request names
// that clip key: admin-api refuses it unless it is the key of the saved draft (R21, "binding approval to bytes").
//
// Try another take ([PROPOSAL] 2026-11-15, ADR-0025): Polly's generative engine can render the same text differently
// each time, and a stored clip is never replaced. When a preview sounds wrong, the button saves the same text with the
// next take (a new draft revision, so a new clip key) and previews that. The take shown by the player is the one
// Approve records.

type Field = "text" | "ssml";
type Heard = Preview & { draftRevision: number; take: number; played: boolean };

/** What an empty draft's box starts with: a sound gets the SSML shape to fill in (the ph value is X-SAMPA). */
function blankBody(view: SpeechView): string {
  if (view.draft.kind !== "PHONEME") return "";
  const sound = view.header.speechId.replace(/^phoneme-/u, "");
  return `<phoneme alphabet="x-sampa" ph="">${sound}</phoneme>.`;
}

type Props = { readonly api: AdminApi; readonly speechId: string; readonly onChange: () => void };

export function SpeechEditor({ api, speechId, onChange }: Props) {
  const [view, setView] = useState<SpeechView | null>(null);
  const [field, setField] = useState<Field>("text");
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState<Heard | null>(null);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null);

  const adopt = useCallback((next: SpeechView) => {
    setView(next);
    const empty = next.draft.ssml === undefined && next.draft.text === undefined;
    setField(next.draft.ssml !== undefined ? "ssml" : next.draft.text !== undefined ? "text" : KIND_INFO[next.draft.kind].field);
    setValue(next.draft.ssml ?? next.draft.text ?? (empty ? blankBody(next) : ""));
  }, []);

  useEffect(() => {
    api.getSpeech(speechId).then(adopt, (error: unknown) => setMessage(speechError(error)));
  }, [api, speechId, adopt]);

  if (view === null) return <p>{message ?? "Loading…"}</p>;
  const { header, draft } = view;
  const saved = draft.ssml ?? draft.text ?? "";
  const savedField: Field = draft.ssml !== undefined ? "ssml" : "text";
  const dirty = value !== saved || (saved !== "" && field !== savedField);
  const gate = canApprove({
    dirty,
    draftRevision: draft.draftRevision,
    draftClipKey: draft.clipKey,
    preview: preview === null ? null : { draftRevision: preview.draftRevision, clipKey: preview.clipKey },
    played: preview?.played ?? false,
    ticks,
  });

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    setDone(null);
    try {
      await action();
    } catch (error) {
      setMessage(speechError(error));
    } finally {
      setBusy(false);
    }
  };

  const forget = () => {
    setPreview(null);
    setTicks({});
  };

  const save = () =>
    run(async () => {
      adopt(await api.saveSpeech(speechId, { draftRevision: draft.draftRevision, [field]: value }));
      forget();
      onChange();
    });

  const previewSaved = async (stored: SpeechView["draft"]) => {
    const result = await api.preview({ kind: stored.kind, speechId, ...previewBody(stored) });
    setPreview({ ...result, draftRevision: stored.draftRevision, take: stored.take, played: false });
    setTicks({});
  };

  const makePreview = () => run(() => previewSaved(draft));

  const next = nextTake(draft.take);
  const anotherTake = () =>
    run(async () => {
      if (next === null) return;
      const updated = await api.saveSpeech(speechId, { draftRevision: draft.draftRevision, ...previewBody(draft), take: next });
      adopt(updated);
      forget();
      onChange();
      await previewSaved(updated.draft);
    });

  const approve = () =>
    run(async () => {
      if (preview === null) return;
      const result = await api.approve(speechId, {
        draftRevision: draft.draftRevision,
        clipKey: preview.clipKey,
        ...(note.trim() === "" ? {} : { reviewNote: note.trim() }),
      });
      adopt(await api.getSpeech(speechId));
      forget();
      setNote("");
      onChange();
      setDone(`Approved as version ${result.versionId}${result.renderedAt === null ? "" : ` (rendered ${result.renderedAt})`}.`);
    });

  const playTwice = () => {
    const element = audio.current;
    if (element === null) return;
    element.currentTime = 0;
    element.onended = () => {
      element.onended = null;
      element.currentTime = 0;
      void element.play();
    };
    void element.play();
  };

  const heard = (clipKey: string) => setPreview((p) => (p !== null && p.clipKey === clipKey ? { ...p, played: true } : p));

  return (
    <div>
      <h2>
        {header.title} <small className="mono">{header.speechId}</small>
      </h2>
      <p className="kind">{KIND_INFO[draft.kind].label}</p>
      <p className="muted">
        Voice {draft.voiceId} · engine {draft.engine} · provider {draft.provider} (set by the server for this kind) · draft revision{" "}
        {draft.draftRevision} · take {draft.take} · {header.state === "APPROVED" ? `approved version ${header.approvedVersion}` : "not approved yet"}
      </p>

      <fieldset>
        <legend>Draft</legend>
        <label>
          <input type="radio" name="speech-body" value="text" checked={field === "text"} onChange={() => setField("text")} /> Plain text
        </label>{" "}
        <label>
          <input type="radio" name="speech-body" value="ssml" checked={field === "ssml"} onChange={() => setField("ssml")} /> SSML body (inside the speak element)
        </label>
        {draft.kind === "PHONEME" && field === "text" && (
          <p className="muted">A sound in plain text is usually read as letter names: use SSML with a phoneme tag.</p>
        )}
        <textarea aria-label="Draft" value={value} onChange={(e) => setValue(e.target.value)} rows={3} maxLength={300} spellCheck={false} />
        <button type="button" onClick={() => void save()} disabled={busy || !dirty || value.trim() === ""}>
          Save draft
        </button>
        {dirty && <span className="muted"> Unsaved changes.</span>}
      </fieldset>

      <fieldset>
        <legend>Preview and listen</legend>
        <button type="button" onClick={() => void makePreview()} disabled={busy || dirty || draft.clipKey === null}>
          Preview
        </button>{" "}
        <button
          type="button"
          onClick={() => void anotherTake()}
          disabled={busy || dirty || draft.clipKey === null || next === null}
          title="Save the same text as the next take and preview it: a fresh render from Polly"
        >
          Try another take
        </button>
        {next === null && <span className="muted"> No takes left (the limit is {draft.take}).</span>}
        {preview !== null && (
          <div className="player">
            <p>
              <strong>Take {preview.take}</strong>
              {preview.played ? " · played" : ""}
            </p>
            <audio
              key={preview.clipKey}
              ref={audio}
              src={preview.url}
              controls
              preload="auto"
              aria-label="Preview clip"
              onEnded={() => heard(preview.clipKey)}
            />
            <button type="button" onClick={() => void audio.current?.play()}>
              Play
            </button>
            <button type="button" onClick={playTwice}>
              Play twice
            </button>
            <p className="muted mono">clip {preview.clipKey}</p>
          </div>
        )}
      </fieldset>

      <fieldset disabled={preview === null || !preview.played}>
        <legend>Listening checks (D9.4)</legend>
        <CheckAll items={LISTENING_CHECKLIST} ticks={ticks} onChange={setTicks} label="I have listened and the clip passes every check above" />
        <label>
          Review note (optional) <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </label>
        <button type="button" className="primary" onClick={() => void approve()} disabled={busy || !gate.ok}>
          Approve
        </button>
        {!gate.ok && <span className="muted"> {gate.reason}</span>}
      </fieldset>

      {done !== null && (
        <p className="ok" role="status">
          {done}
        </p>
      )}
      {message !== null && (
        <p className="error" role="alert">
          {message}
        </p>
      )}

      <h3>Approved versions</h3>
      {view.versions.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Version</th>
              <th>Approved</th>
              <th>Rendered</th>
              <th>Voice / engine</th>
              <th>Take</th>
              <th>Clip key</th>
              <th>SHA-256</th>
            </tr>
          </thead>
          <tbody>
            {view.versions.map((v) => (
              <tr key={v.versionId}>
                <td>{v.versionId}</td>
                <td>{v.approvedAt}</td>
                <td>{v.renderedAt ?? "?"}</td>
                <td>
                  {v.voiceId} / {v.engine}
                </td>
                <td>{v.take}</td>
                <td className="mono">{v.clipKey.slice(0, 12)}…</td>
                <td className="mono">{v.sha256.slice(0, 12)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
