// The activity editor (Phase 39, M3-04; D §D8.4 screens A3-A6): edit a draft with structured fields for its type,
// save it, validate it on the server, preview and solve it in the child's own panel, and publish it with the
// seven-line review. The server is the authority at every step: Save is refused on a stale revision
// (DRAFT_CONFLICT), Validate is admin-api's full check (R26), and Publish (R27) checks the revision, the checklist and
// the preview-solve revision again. The buttons here only stop the operator doing things in the wrong order.
import "@scd/shared/learning/reading.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, describeError, type ActivityView, type AdminApi, type Problem, type SpeechSummary } from "../api";
import { topicById } from "@scd/shared";
import { CheckAll } from "../CheckAll";
import { canPublish, PUBLISH_CHECKLIST } from "../review";
import { SelectField, TextField } from "./fields";
import { agesText, subjectName, topicGroups, topicLabel, topicSuits } from "./identity";
import { AUDIO_OPTIONS, blankStep, fromDefinition, KINDS, legacyFields, REWARD_OPTIONS, rewardHint, sameDefinition, speechVariants, toDefinition, type EditorState, type StepKind } from "./model";
import { PreviewSolve, type PlayUrl } from "./PreviewSolve";
import { describeProblem, fieldId, focusTarget, LEGACY_NOTICE_ID } from "./problems";
import { StepEditor } from "./StepEditor";
import { forgetUnsaved, keepUnsaved, unsavedFor } from "./unsaved";

type Props = { readonly api: AdminApi; readonly activityId: string; readonly play?: PlayUrl };

type Validated = { readonly draftRevision: number; readonly valid: boolean; readonly problems: readonly Problem[] };

export function ActivityEditor({ api, activityId, play }: Props) {
  const [view, setView] = useState<ActivityView | null>(null);
  const [state, setState] = useState<EditorState | null>(null);
  const [restored, setRestored] = useState(false);
  const [speech, setSpeech] = useState<SpeechSummary[] | null>(null);
  const [validated, setValidated] = useState<Validated | null>(null);
  const [solvedRevision, setSolvedRevision] = useState<number | null>(null);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean; problems?: readonly Problem[] } | null>(null);

  const adopt = useCallback((next: ActivityView, restore: boolean) => {
    setView(next);
    const kept = restore ? unsavedFor(activityId, next.draft.draftRevision) : null;
    setState(kept ?? fromDefinition(next.draft.definition));
    setRestored(kept !== null);
  }, [activityId]);

  useEffect(() => {
    api.getActivity(activityId).then(
      (next) => adopt(next, true),
      (error: unknown) => setMessage({ text: describeError(error), ok: false }),
    );
    api.listSpeech().then(
      (list) => setSpeech(list.items),
      () => setSpeech([]),
    );
  }, [api, activityId, adopt]);

  const base = view?.draft.definition;
  const edited = useMemo(() => (base === undefined || state === null ? null : toDefinition(base, state)), [base, state]);
  const dirty = useMemo(
    () => base !== undefined && edited !== null && !sameDefinition(edited, toDefinition(base, fromDefinition(base))),
    [base, edited],
  );
  // Fields from the old editor (curriculum codes, note, source) that the stored draft still holds. They are not
  // shown, and only a save removes them, so Save stays available while any remain even with no other change.
  const legacy = useMemo(() => (base === undefined ? [] : legacyFields(base)), [base]);

  // Unsaved edits outlive navigation within the tab, and closing the tab asks first.
  useEffect(() => {
    if (view === null || state === null) return;
    if (dirty) keepUnsaved(activityId, view.draft.draftRevision, state);
    else forgetUnsaved(activityId);
  }, [activityId, view, state, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (view === null || state === null || edited === null) return <p>{message?.text ?? "Loading…"}</p>;
  const { header, draft } = view;
  const revision = draft.draftRevision;
  const locked = header.publishedVersion !== null;
  const gate = canPublish({ dirty, draftRevision: revision, validated, solvedRevision, ticks });

  const set = (patch: Partial<EditorState>) => setState({ ...state, ...patch });

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage({ text: describeError(error), ok: false, problems: error instanceof ApiError ? error.details : [] });
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const next = await api.saveActivity(activityId, { draftRevision: revision, definition: edited });
      forgetUnsaved(activityId);
      adopt(next, false);
      setValidated(null); // a new revision clears both ticks (D §D8.4)
      setSolvedRevision(null);
      setTicks({});
      setMessage({ text: `Saved as revision ${next.draft.draftRevision}.`, ok: true });
    });

  const discard = () => {
    forgetUnsaved(activityId);
    setState(fromDefinition(draft.definition));
    setRestored(false);
  };

  const validate = () =>
    run(async () => {
      setValidated(await api.validate(activityId, revision));
    });

  const publish = () =>
    run(async () => {
      const result = await api.publish(activityId, {
        draftRevision: revision,
        review: { checklist: ticks, previewSolvedDraftRevision: revision },
      });
      adopt(await api.getActivity(activityId), false);
      setTicks({});
      setMessage({ text: `Published as v${result.displayNumber} (${result.versionId}).`, ok: true });
    });

  const changeKind = (kind: StepKind) => set({ step: blankStep(kind) });
  const kinds = locked ? KINDS.filter((k) => k.interactionType === header.interactionType) : KINDS;

  return (
    <div className="editor">
      <h2>
        {state.title || activityId} <small>{activityId}</small>
      </h2>
      <p className="muted">
        Draft revision {revision} · {header.state.toLowerCase()}
        {header.publishedVersion !== null && ` · published ${header.publishedVersion}`}
        {locked && " · subject, topic, type and reward are locked after the first publish"}
      </p>
      {restored && (
        <p className="notice" role="status">
          Your unsaved changes from earlier are back.{" "}
          <button type="button" onClick={discard}>
            Discard them
          </button>
        </p>
      )}

      <fieldset>
        <legend>About this activity</legend>
        <div className="grid">
          <TextField path="title" label="Title (for the admin list)" value={state.title} maxLength={80} wide onChange={(title) => set({ title })} />
          <TextField path="subject" label="Subject" value={subjectName(state.subject)} readOnly hint="Set by the activity ID and topic." onChange={() => undefined} />
          <TopicSelect state={state} locked={locked} onChange={(topicId) => set({ topicId })} />
          <SelectField
            path="rewardCategory"
            label="Reward"
            value={state.rewardCategory}
            options={REWARD_OPTIONS}
            disabled={locked}
            hint={rewardHint(state.rewardCategory)}
            onChange={(rewardCategory) => set({ rewardCategory })}
          />
          <SelectField path="minAge" label="Youngest age" value={String(state.minAge)} options={["5", "6", "7"]} onChange={(v) => set({ minAge: Number.parseInt(v, 10) })} />
          <SelectField path="maxAge" label="Oldest age" value={String(state.maxAge)} options={["5", "6", "7"]} onChange={(v) => set({ maxAge: Number.parseInt(v, 10) })} />
          <SelectField path="audioRequirement" label="Audio" value={state.audioRequirement} options={AUDIO_OPTIONS} hint={'With "Child must press Play first", Check waits until the child has heard the sound.'} onChange={(audioRequirement) => set({ audioRequirement })} />
        </div>
      </fieldset>

      <fieldset>
        <legend>The question</legend>
        <TextField path="prompt.text" label="Question" value={state.prompt} maxLength={120} wide hint="3 to 120 characters; at most 8 words at age 5, 14 at age 7." onChange={(prompt) => set({ prompt })} />
        <SelectField
          path="interactionType"
          label="Interaction type"
          value={state.step.kind}
          options={kinds.map((k) => ({ value: k.kind, label: k.label }))}
          onChange={(kind) => changeKind(kind as StepKind)}
        />
        {state.second !== null && (
          <TextField path="activityPayload.partPrompt" label="First part's question" value={state.partPrompt} maxLength={120} wide onChange={(partPrompt) => set({ partPrompt })} />
        )}
        <StepEditor step={state.step} onChange={(step) => set({ step })} payloadPath="activityPayload" answerPath="answerSpecification.accepted" prefix="" />
      </fieldset>

      <fieldset>
        <legend>Second part (optional: the child answers both parts, then presses Check once)</legend>
        {state.second === null ? (
          <button type="button" onClick={() => set({ second: { prompt: "", step: blankStep("NUMERIC") } })}>
            Add a second part
          </button>
        ) : (
          <>
            <p className="muted">One Check covers both parts; the child must get both right.</p>
            <TextField path="additionalSteps.0.prompt.text" label="Part 2 question" value={state.second.prompt} maxLength={120} wide onChange={(prompt) => set({ second: { ...state.second!, prompt } })} />
            <SelectField
              path="additionalSteps.0.interactionType"
              label="Part 2 interaction type"
              value={state.second.step.kind}
              options={KINDS.map((k) => ({ value: k.kind, label: k.label }))}
              onChange={(kind) => set({ second: { ...state.second!, step: blankStep(kind as StepKind) } })}
            />
            <StepEditor
              step={state.second.step}
              onChange={(step) => set({ second: { ...state.second!, step } })}
              payloadPath="additionalSteps.0.activityPayload"
              answerPath="additionalSteps.0.answerSpecification.accepted"
              prefix="Part 2 "
            />
            <button type="button" onClick={() => set({ second: null, partPrompt: "" })}>
              Remove the second part
            </button>
          </>
        )}
      </fieldset>

      <SpeechClips state={state} speech={speech} onChange={(refs) => set({ speech: refs })} />

      <fieldset>
        <legend>Review note</legend>
        <label className="field">
          <span>Review note (needed when more than one answer is accepted)</span>
          <textarea id={fieldId("reviewNote")} value={state.reviewNote} maxLength={200} rows={2} onChange={(e) => set({ reviewNote: e.target.value })} />
        </label>
      </fieldset>

      <div className="actions">
        <button type="button" className="primary" onClick={() => void save()} disabled={busy || (!dirty && legacy.length === 0)}>
          Save draft
        </button>
        {dirty && <span className="muted"> Unsaved changes.</span>}

        {message !== null && (
          <span className={message.ok ? "ok" : "error"} role="status">
            {" "}
            {message.text}
          </span>
        )}
      </div>
      {legacy.length > 0 && (
        <p className="notice" id={LEGACY_NOTICE_ID} tabIndex={-1}>
          This draft still has fields the editor no longer uses ({legacy.map(legacyName).join(", ")}). Publishing takes the curriculum from the topic list. Save the draft to remove them.
        </p>
      )}
      {message?.problems !== undefined && message.problems.length > 0 && <ProblemList problems={message.problems} />}
      <details>
        <summary>Draft as JSON (read only)</summary>
        <pre>{JSON.stringify(edited, null, 2)}</pre>
      </details>

      <fieldset>
        <legend>Validate</legend>
        <span>
          <button type="button" onClick={() => void validate()} disabled={busy || dirty}>
            Validate
          </button>
          {dirty && <span className="muted"> Save first.</span>}
          {validated !== null && validated.draftRevision === revision && (
            <span className={validated.valid ? "ok" : "error"}>
              {" "}
              {validated.valid ? `Valid (revision ${revision}).` : `${validated.problems.length} problem(s) on revision ${revision}:`}
            </span>
          )}
        </span>
        {validated !== null && validated.draftRevision === revision && !validated.valid && <ProblemList problems={validated.problems} />}
      </fieldset>

      <fieldset>
        <legend>Preview and solve</legend>
        {dirty ? (
          <p className="muted">Save the draft to preview it.</p>
        ) : (
          <PreviewSolve
            api={api}
            definition={draft.definition}
            draftRevision={revision}
            solved={solvedRevision === revision}
            onSolved={setSolvedRevision}
            {...(play !== undefined ? { play } : {})}
          />
        )}
      </fieldset>

      <fieldset>
        <legend>Review and publish</legend>
        <p className="muted">
          Validated: {validated?.valid === true && validated.draftRevision === revision ? `yes, revision ${revision}` : "not yet"} · Preview solved:{" "}
          {solvedRevision === revision ? `yes, revision ${revision}` : "not yet"}
        </p>
        <CheckAll items={PUBLISH_CHECKLIST} ticks={ticks} onChange={setTicks} label="I have checked this activity" />
        <span>
          <button type="button" className="primary" onClick={() => void publish()} disabled={busy || !gate.ok}>
            Publish
          </button>
          {!gate.ok && <span className="muted"> {gate.reason}</span>}
        </span>
      </fieldset>

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

/**
 * The topic, from the registry (plan C19), within the activity's subject (its ID's prefix follows the subject). A
 * stored topic that is not in the registry (typed by hand before the registry existed) stays, marked as such.
 */
function TopicSelect({ state, locked, onChange }: { state: EditorState; locked: boolean; onChange: (topicId: string) => void }) {
  const kind = state.step.kind;
  const known = topicById(state.topicId);
  const groups = topicGroups(kind, "", state.topicId, [state.subject]);
  const id = fieldId("topicId");
  const hint =
    known === undefined
      ? "This topic is not in the topic list. Choose one from the list."
      : `${known.description.replace(/\.$/u, "")}. For age ${agesText(known.ages)}.`;
  return (
    <span className="field">
      <label htmlFor={id}>Topic</label>
      <select id={id} value={state.topicId} disabled={locked} aria-describedby={`${id}-hint`} onChange={(e) => onChange(e.target.value)}>
        {known === undefined && <option value={state.topicId}>{state.topicId === "" ? "Choose a topic…" : `${state.topicId} (not in the topic list)`}</option>}
        {groups.flatMap((group) =>
          group.topics.map((t) => (
            <option key={t.topicId} value={t.topicId}>
              {topicLabel(t)}
              {topicSuits(t, kind) ? "" : " · usually another type"}
            </option>
          )),
        )}
      </select>
      <small className="muted" id={`${id}-hint`}>
        {hint}
      </small>
    </span>
  );
}

/** The legacy fields' names, as the operator saw them in the old editor. */
function legacyName(field: string): string {
  return field === "curriculumReference" ? "curriculum codes" : field === "curriculumNote" ? "curriculum note" : "source";
}

/** Problems in words; each moves the cursor to its field. */
function ProblemList({ problems }: { readonly problems: readonly Problem[] }) {
  const go = (field: string) => {
    const id = focusTarget(field, (candidate) => document.getElementById(candidate) !== null);
    if (id !== null) document.getElementById(id)?.focus();
  };
  return (
    <ul className="problems">
      {problems.map((p) => (
        <li key={`${p.field}:${p.rule}`}>
          <button type="button" className="link" onClick={() => go(p.field)}>
            {describeProblem(p)}
          </button>{" "}
          <small className="muted mono">
            {p.field}: {p.rule}
          </small>
        </li>
      ))}
    </ul>
  );
}

/** The clips this activity plays, picked by speech definition name; only approved definitions can be picked (D §D8.4). */
function SpeechClips({ state, speech, onChange }: { state: EditorState; speech: SpeechSummary[] | null; onChange: (refs: EditorState["speech"]) => void }) {
  const variants = speechVariants(state);
  const refs = state.speech;
  const free = variants.filter((v) => !refs.some((r) => r.variant === v));
  const byId = new Map((speech ?? []).map((s) => [s.speechId, s]));
  const options = (current: string) => [
    { value: "", label: "Choose a clip…" },
    ...(current !== "" && !byId.has(current) ? [{ value: current, label: `${current} (not found)` }] : []),
    ...(speech ?? [])
      .filter((s) => s.approvedVersion !== null || s.speechId === current)
      .map((s) => ({
        value: s.speechId,
        label: `${s.title} · ${s.kind.toLowerCase().replace("_", " ")}${s.approvedVersion === null ? " · not approved" : ""}`,
      })),
  ];
  const replaceRef = (index: number, ref: { variant: string; speechId: string }) => onChange(refs.map((r, i) => (i === index ? ref : r)));
  return (
    <fieldset id={fieldId("speechDefinitionReferences")} tabIndex={-1}>
      <legend>Clips</legend>
      <p className="muted">
        Pick approved speech by name. A prompt clip is the sound or word the question is about; an instruction clip reads the question aloud.
        {speech === null && " Loading the speech list…"}
      </p>
      {refs.map((ref, i) => (
        <div key={i} className="row" role="group" aria-label={`Clip ${i + 1}`}>
          <SelectField
            path={`speechDefinitionReferences.${ref.variant}.variant`}
            label={`Clip ${i + 1} plays as`}
            value={ref.variant}
            options={[...(variants.includes(ref.variant) ? [] : [ref.variant]), ...variants.filter((v) => v === ref.variant || free.includes(v))]}
            onChange={(variant) => replaceRef(i, { ...ref, variant })}
          />
          <SelectField
            path={`speechDefinitionReferences.${ref.variant}`}
            label={`Clip ${i + 1} speech`}
            value={ref.speechId}
            options={options(ref.speechId)}
            onChange={(speechId) => replaceRef(i, { ...ref, speechId })}
          />
          <button type="button" onClick={() => onChange(refs.filter((_, j) => j !== i))}>
            Remove clip {i + 1}
          </button>
        </div>
      ))}
      {free.length > 0 && (
        <button type="button" onClick={() => onChange([...refs, { variant: free[0] ?? "prompt", speechId: "" }])}>
          Add a clip
        </button>
      )}
      <small className="muted">
        Speech not listed? Approve it on the <a href="#speech">Speech page</a> first.
      </small>
    </fieldset>
  );
}

