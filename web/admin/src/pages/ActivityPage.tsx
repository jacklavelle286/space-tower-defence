import "@scd/shared/learning/reading.css";
import { useCallback, useEffect, useState } from "react";
import { describeError, type ActivitySummary, type ActivityView, type AdminApi, type Problem } from "../api";
import { applyForm, canPublish, formOf, isCorrect, PUBLISH_CHECKLIST, type ActivityForm } from "../review";

// A3, A5, A6 for the Milestone 1 subset (D §D8.4, D §D8.6): a seeded MULTIPLE_CHOICE draft is edited with plain fields,
// validated, preview-solved and published with the seven-line review. The full editor, the shared learning panel as
// the preview, retire and withdraw come with the full admin app (Phases 35-40).

const PAGE = "activities";

type Props = { readonly api: AdminApi; readonly initial: string | null };

export function ActivityPage({ api, initial }: Props) {
  const [items, setItems] = useState<ActivitySummary[]>([]);
  const [selected, setSelected] = useState<string | null>(initial);
  const [message, setMessage] = useState<string | null>(null);
  const select = (id: string) => {
    setSelected(id);
    window.history.replaceState(null, "", `#${PAGE}/${id}`);
  };

  const refresh = useCallback(() => {
    api.listActivities().then(
      (page) => setItems(page.items),
      (error: unknown) => setMessage(describeError(error)),
    );
  }, [api]);

  useEffect(() => {
    api.listActivities().then(
      (page) => setItems(page.items),
      (error: unknown) => setMessage(describeError(error)),
    );
  }, [api]);

  return (
    <div className="split">
      <section className="list">
        <h2>Activities</h2>
        {message !== null && <p className="error">{message}</p>}
        {items.length === 0 && <p className="muted">No activities yet. The seed script creates the first drafts.</p>}
        <ul>
          {items.map((item) => (
            <li key={item.activityId}>
              <button type="button" aria-pressed={selected === item.activityId} onClick={() => select(item.activityId)}>
                <span>{item.activityId}</span>
                <small>
                  {item.subject} · ages {item.minAge}–{item.maxAge} · {item.state.toLowerCase()}
                </small>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="detail">
        {selected === null ? (
          <p>Choose an activity.</p>
        ) : (
          <ActivityEditor key={selected} api={api} activityId={selected} onChange={refresh} />
        )}
      </section>
    </div>
  );
}

function ActivityEditor({
  api,
  activityId,
  onChange,
}: {
  readonly api: AdminApi;
  readonly activityId: string;
  readonly onChange: () => void;
}) {
  const [view, setView] = useState<ActivityView | null>(null);
  const [form, setForm] = useState<ActivityForm | null>(null);
  const [validated, setValidated] = useState<{ draftRevision: number; valid: boolean; problems: Problem[] } | null>(null);
  const [solvedRevision, setSolvedRevision] = useState<number | null>(null);
  const [tried, setTried] = useState<string[]>([]);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const adopt = useCallback((next: ActivityView) => {
    setView(next);
    setForm(formOf(next.draft.definition));
    setTried([]);
  }, []);

  useEffect(() => {
    api.getActivity(activityId).then(adopt, (error: unknown) => setMessage(describeError(error)));
  }, [api, activityId, adopt]);

  if (view === null || form === null) return <p>{message ?? "Loading…"}</p>;
  const { header, draft } = view;
  const definition = draft.definition;
  const edited = applyForm(definition, form);
  const dirty = JSON.stringify(edited) !== JSON.stringify(applyForm(definition, formOf(definition)));
  const gate = canPublish({ dirty, draftRevision: draft.draftRevision, validated, solvedRevision, ticks });
  const options = definition.activityPayload?.options ?? [];

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
      adopt(await api.saveActivity(activityId, { draftRevision: draft.draftRevision, definition: edited }));
      setValidated(null);
      setSolvedRevision(null); // any edit clears both ticks (D §D8.4)
      setTicks({});
      onChange();
    });

  const validate = () =>
    run(async () => {
      const result = await api.validate(activityId, draft.draftRevision);
      setValidated(result);
    });

  const publish = () =>
    run(async () => {
      const result = await api.publish(activityId, {
        draftRevision: draft.draftRevision,
        review: { checklist: ticks, previewSolvedDraftRevision: draft.draftRevision },
      });
      setMessage(`Published as v${result.displayNumber} (${result.versionId}).`);
      adopt(await api.getActivity(activityId));
      setTicks({});
      onChange();
    });

  const answer = (optionId: string) => {
    if (dirty) return;
    if (isCorrect(definition, optionId)) setSolvedRevision(draft.draftRevision);
    else setTried([...tried, optionId]);
  };

  const set = (patch: Partial<ActivityForm>) => setForm({ ...form, ...patch });

  return (
    <div>
      <h2>
        {definition.title} <small>{activityId}</small>
      </h2>
      <p className="muted">
        Draft revision {draft.draftRevision} · {header.state.toLowerCase()}
        {header.publishedVersion !== null && ` · published ${header.publishedVersion}`} · {definition.subject} ·{" "}
        {definition.topicId} · {definition.interactionType} · {definition.rewardCategory}
        {header.publishedVersion !== null && " (subject, topic, type and reward are locked after the first publish)"}
      </p>

      <fieldset>
        <legend>Draft</legend>
        <label>
          Title <input className="wide" value={form.title} onChange={(e) => set({ title: e.target.value })} maxLength={80} />
        </label>
        <label>
          Ages{" "}
          <select value={form.minAge} onChange={(e) => set({ minAge: Number(e.target.value) })}>
            {[5, 6, 7].map((age) => (
              <option key={age}>{age}</option>
            ))}
          </select>
          {" to "}
          <select value={form.maxAge} onChange={(e) => set({ maxAge: Number(e.target.value) })}>
            {[5, 6, 7].map((age) => (
              <option key={age}>{age}</option>
            ))}
          </select>
        </label>
        <label>
          Prompt <input className="wide" value={form.promptText} onChange={(e) => set({ promptText: e.target.value })} maxLength={120} />
        </label>
        <div className="options">
          {form.options.map((option, index) => (
            <label key={option.id}>
              <input
                type="radio"
                name="correct"
                checked={form.correct === option.id}
                onChange={() => set({ correct: option.id })}
                aria-label={`Option ${option.id} is correct`}
              />{" "}
              {option.id}{" "}
              <input
                value={option.text}
                maxLength={24}
                onChange={(e) =>
                  set({ options: form.options.map((o, i) => (i === index ? { id: o.id, text: e.target.value } : o)) })
                }
              />
            </label>
          ))}
        </div>
        <label>
          Prompt clip (speech ID) <input value={form.promptSpeechId} onChange={(e) => set({ promptSpeechId: e.target.value })} />
        </label>
        <label>
          Audio{" "}
          <select value={form.audioRequirement} onChange={(e) => set({ audioRequirement: e.target.value })}>
            {["REQUIRED", "OPTIONAL", "NONE"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void save()} disabled={busy || !dirty}>
          Save draft
        </button>
        {dirty && <span className="muted"> Unsaved changes.</span>}
        <details>
          <summary>Draft as JSON (read only)</summary>
          <pre>{JSON.stringify(definition, null, 2)}</pre>
        </details>
      </fieldset>

      <fieldset>
        <legend>Validate</legend>
        <button type="button" onClick={() => void validate()} disabled={busy || dirty}>
          Validate
        </button>
        {validated !== null && validated.draftRevision === draft.draftRevision && (
          <span className={validated.valid ? "ok" : "error"}>
            {" "}
            {validated.valid ? `Valid (revision ${validated.draftRevision}).` : "Problems:"}
          </span>
        )}
        {validated !== null && !validated.valid && (
          <ul className="problems">
            {validated.problems.map((p) => (
              <li key={`${p.field}:${p.rule}`}>
                {p.field}: {p.rule}
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset disabled={dirty}>
        <legend>Preview and solve</legend>
        <p className="muted">Answer it as a child would. Publishing needs a correct answer on this revision.</p>
        {/* The child reads the prompt and options in Andika at these sizes (ADR-0013, D6): the checklist judges this. */}
        <p className="prompt lp-reading">{definition.prompt?.text}</p>
        <div className="choices">
          {options.map((option) => (
            <button
              type="button"
              key={option.id}
              className="choice lp-reading"
              disabled={tried.includes(option.id) || solvedRevision === draft.draftRevision}
              onClick={() => answer(option.id)}
            >
              {option.text}
            </button>
          ))}
        </div>
        {solvedRevision === draft.draftRevision ? (
          <p className="ok">Solved on revision {draft.draftRevision}.</p>
        ) : (
          tried.length > 0 && <p className="error">Not that one. Try again.</p>
        )}
      </fieldset>

      <fieldset>
        <legend>Review and publish</legend>
        {PUBLISH_CHECKLIST.map((item) => (
          <label key={item.key} className="check">
            <input
              type="checkbox"
              checked={ticks[item.key] === true}
              onChange={(e) => setTicks({ ...ticks, [item.key]: e.target.checked })}
            />{" "}
            {item.label}
          </label>
        ))}
        <button type="button" className="primary" onClick={() => void publish()} disabled={busy || !gate.ok}>
          Publish
        </button>
        {!gate.ok && <span className="muted"> {gate.reason}</span>}
      </fieldset>

      {message !== null && <p className={message.startsWith("Published") ? "ok" : "error"}>{message}</p>}

      <h3>Published versions</h3>
      {view.versions.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Version</th>
              <th>ID</th>
              <th>Published</th>
            </tr>
          </thead>
          <tbody>
            {view.versions.map((v) => (
              <tr key={v.versionId}>
                <td>v{v.displayNumber}</td>
                <td>{v.versionId}</td>
                <td>{v.publishedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
