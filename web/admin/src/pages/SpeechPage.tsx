import { useCallback, useEffect, useMemo, useState } from "react";
import { describeError, SPEECH_KINDS, type AdminApi, type SpeechKind, type SpeechSummary } from "../api";
import { KIND_INFO } from "../speech/ids";
import { filterSpeech, NO_SPEECH_FILTER, type SpeechFilter } from "../speech/list";
import { NewSpeech } from "../speech/NewSpeech";
import { SpeechEditor } from "../speech/SpeechEditor";

// A9 (D §D9.3; Phase 40, M3-05): the speech list (search, kind, state) and "New speech" on the left; the chosen
// definition's editor, preview, listening checks and Approve on the right (speech/SpeechEditor.tsx).

const PAGE = "speech";

type Props = { readonly api: AdminApi; readonly initial: string | null };

export function SpeechPage({ api, initial }: Props) {
  const [items, setItems] = useState<SpeechSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string | null>(initial);
  const [notice, setNotice] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<SpeechFilter>(NO_SPEECH_FILTER);
  const select = (id: string, note: string | null = null) => {
    setSelected(id);
    setNotice(note);
    window.history.replaceState(null, "", `#${PAGE}/${id}`);
  };

  const refresh = useCallback(() => {
    api.listSpeech().then(
      (page) => {
        setItems(page.items);
        setLoaded(true);
        setMessage(null);
      },
      (error: unknown) => setMessage(describeError(error)),
    );
  }, [api]);

  useEffect(refresh, [refresh]);

  const shown = useMemo(() => filterSpeech(items, filter), [items, filter]);
  // null until the list has loaded once: New speech cannot see a taken ID without it.
  const taken = useMemo(() => (loaded ? new Map(items.map((item) => [item.speechId, item.title])) : null), [items, loaded]);
  const set = (patch: Partial<SpeechFilter>) => setFilter({ ...filter, ...patch });

  return (
    <div className="split">
      <section className="list">
        <h2>Speech</h2>
        {message !== null && (
          <p className="error" role="alert">
            {message}
          </p>
        )}
        <NewSpeech
          api={api}
          taken={taken}
          onOpen={(id, created) => {
            refresh();
            select(id, created ? `Created ${id}.` : `${id} exists already, so it is opened here.`);
          }}
        />
        <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
          <label>
            Search <input type="search" value={filter.search} placeholder="ID or title" onChange={(e) => set({ search: e.target.value })} />
          </label>
          <label>
            Kind{" "}
            <select value={filter.kind} onChange={(e) => set({ kind: e.target.value as SpeechKind | "" })}>
              <option value="">any</option>
              {SPEECH_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_INFO[k].label}
                </option>
              ))}
            </select>
          </label>
          <label>
            State{" "}
            <select value={filter.state} onChange={(e) => set({ state: e.target.value as SpeechFilter["state"] })}>
              <option value="">any</option>
              <option value="DRAFT">draft</option>
              <option value="APPROVED">approved</option>
            </select>
          </label>
        </form>
        <p className="muted" aria-live="polite">
          Showing {shown.length} of {items.length}.
        </p>
        <ul>
          {shown.map((item) => (
            <li key={item.speechId}>
              <button type="button" aria-pressed={selected === item.speechId} onClick={() => select(item.speechId)}>
                <span>{item.speechId}</span>
                <small>
                  {KIND_INFO[item.kind].label} · {item.state === "APPROVED" ? "approved" : "draft"}
                </small>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="detail">
        {selected === null ? (
          <p>Choose a speech definition, or make a new one.</p>
        ) : (
          <>
            {notice !== null && (
              <p className="ok" role="status">
                {notice}
              </p>
            )}
            <SpeechEditor key={selected} api={api} speechId={selected} onChange={refresh} />
          </>
        )}
      </section>
    </div>
  );
}
