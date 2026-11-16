import { useCallback, useEffect, useRef, useState } from "react";
import {
  describeError,
  SPEECH_KINDS,
  type AdminApi,
  type Preview,
  type SpeechKind,
  type SpeechSummary,
  type SpeechView,
} from "../api";
import { CheckAll } from "../CheckAll";
import { canApprove, LISTENING_CHECKLIST, nextTake, previewBody } from "../review";

// A9 (D §D9.3): pick a definition, edit its draft, Preview (the only Polly path), Play, tick the listening checks,
// Approve. Voice and engine are shown, never chosen. Approve is enabled only for the saved draft whose exact clip was
// previewed in this session; admin-api checks the clip object again.
//
// Try another take ([PROPOSAL] 2026-11-15, ADR-0025): Polly's generative engine can render the same text differently
// each time, and a stored clip is never replaced. When a preview sounds wrong, the button saves the same text with the
// next take (a new draft revision, so a new clip key) and previews that. The take shown by the player is the one
// Approve records.

const PAGE = "speech";

type Props = { readonly api: AdminApi; readonly initial: string | null };

export function SpeechPage({ api, initial }: Props) {
  const [items, setItems] = useState<SpeechSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(initial);
  const [message, setMessage] = useState<string | null>(null);
  const select = (id: string) => {
    setSelected(id);
    window.history.replaceState(null, "", `#${PAGE}/${id}`);
  };

  const refresh = useCallback(() => {
    api.listSpeech().then(
      (page) => setItems(page.items),
      (error: unknown) => setMessage(describeError(error)),
    );
  }, [api]);

  useEffect(() => {
    api.listSpeech().then(
      (page) => setItems(page.items),
      (error: unknown) => setMessage(describeError(error)),
    );
  }, [api]);

  return (
    <div className="split">
      <section className="list">
        <h2>Speech</h2>
        {message !== null && <p className="error">{message}</p>}
        <ul>
          {items.map((item) => (
            <li key={item.speechId}>
              <button type="button" aria-pressed={selected === item.speechId} onClick={() => select(item.speechId)}>
                <span>{item.speechId}</span>
                <small>
                  {item.kind} · {item.state === "APPROVED" ? "approved" : "draft"}
                </small>
              </button>
            </li>
          ))}
        </ul>
        <NewSpeech
          api={api}
          onCreated={(id) => {
            refresh();
            select(id);
          }}
        />
      </section>
      <section className="detail">
        {selected === null ? <p>Choose a speech definition.</p> : <SpeechEditor key={selected} api={api} speechId={selected} onChange={refresh} />}
      </section>
    </div>
  );
}

function NewSpeech({ api, onCreated }: { readonly api: AdminApi; readonly onCreated: (id: string) => void }) {
  const [speechId, setSpeechId] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<SpeechKind>("WORD");
  const [message, setMessage] = useState<string | null>(null);
  return (
    <form
      className="new"
      onSubmit={(event) => {
        event.preventDefault();
        api.createSpeech({ speechId, title, kind }).then(
          (view) => {
            setMessage(null);
            onCreated(view.header.speechId);
          },
          (error: unknown) => setMessage(describeError(error)),
        );
      }}
    >
      <h3>New speech definition</h3>
      <label>
        ID <input value={speechId} onChange={(e) => setSpeechId(e.target.value)} placeholder="word-ship" pattern="[a-z0-9-]{1,40}" required />
      </label>
      <label>
        Title <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required />
      </label>
      <label>
        Kind{" "}
        <select value={kind} onChange={(e) => setKind(e.target.value as SpeechKind)}>
          {SPEECH_KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </label>
      <button type="submit">Create</button>
      {message !== null && <p className="error">{message}</p>}
    </form>
  );
}

type Field = "text" | "ssml";

function SpeechEditor({ api, speechId, onChange }: { readonly api: AdminApi; readonly speechId: string; readonly onChange: () => void }) {
  const [view, setView] = useState<SpeechView | null>(null);
  const [field, setField] = useState<Field>("text");
  const [value, setValue] = useState("");
  const [preview, setPreview] = useState<(Preview & { draftRevision: number; take: number }) | null>(null);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null);

  const adopt = useCallback((next: SpeechView) => {
    setView(next);
    setField(next.draft.ssml !== undefined ? "ssml" : "text");
    setValue(next.draft.ssml ?? next.draft.text ?? "");
  }, []);

  useEffect(() => {
    api.getSpeech(speechId).then(adopt, (error: unknown) => setMessage(describeError(error)));
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
    ticks,
  });

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      adopt(await api.saveSpeech(speechId, { draftRevision: draft.draftRevision, [field]: value }));
      setPreview(null);
      setTicks({});
      onChange();
    });

  const previewSaved = async (stored: SpeechView["draft"]) => {
    const result = await api.preview({ kind: stored.kind, speechId, ...previewBody(stored) });
    setPreview({ ...result, draftRevision: stored.draftRevision, take: stored.take });
    setTicks({});
  };

  const makePreview = () => run(() => previewSaved(draft));

  const next = nextTake(draft.take);
  const anotherTake = () =>
    run(async () => {
      if (next === null) return;
      const updated = await api.saveSpeech(speechId, { draftRevision: draft.draftRevision, ...previewBody(draft), take: next });
      adopt(updated);
      setPreview(null);
      setTicks({});
      onChange();
      await previewSaved(updated.draft);
    });

  const approve = () =>
    run(async () => {
      const result = await api.approve(speechId, {
        draftRevision: draft.draftRevision,
        ...(note.trim() === "" ? {} : { reviewNote: note.trim() }),
      });
      setMessage(`Approved as version ${result.versionId}.`);
      adopt(await api.getSpeech(speechId));
      setPreview(null);
      setTicks({});
      setNote("");
      onChange();
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

  return (
    <div>
      <h2>
        {header.title} <small>{header.speechId}</small>
      </h2>
      <p className="kind">{draft.kind.replace("_", " ")}</p>
      <p className="muted">
        Voice {draft.voiceId} · engine {draft.engine} · provider {draft.provider} (set by the server for this kind) · draft revision{" "}
        {draft.draftRevision} · take {draft.take} · {header.state === "APPROVED" ? `approved version ${header.approvedVersion}` : "not approved yet"}
      </p>

      <fieldset>
        <legend>Draft</legend>
        <label>
          <input type="radio" checked={field === "text"} onChange={() => setField("text")} /> Plain text
        </label>{" "}
        <label>
          <input type="radio" checked={field === "ssml"} onChange={() => setField("ssml")} /> SSML body (inside the speak element)
        </label>
        <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={3} maxLength={300} spellCheck={false} />
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
            </p>
            <audio key={preview.clipKey} ref={audio} src={preview.url} controls preload="auto" />
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

      <fieldset disabled={preview === null}>
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

      {message !== null && <p className={message.startsWith("Approved") ? "ok" : "error"}>{message}</p>}

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
