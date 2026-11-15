// "New activity" (D §D8.3: a draft starts from its identity fields). R23 creates the draft from the identity fields
// only; the editor then saves the blank step of the chosen type straight away, so the type's mode (share or sort,
// letters or order, number or word) is in the draft from the start. Create is idempotent on the activity ID: when the
// ID is already taken, admin-api answers 200 with the existing activity, and this page says so instead of writing
// over it.
import { useState } from "react";
import { describeError, type AdminApi, type NewActivity } from "../api";
import { hrefOf } from "../routes";
import { SelectField, TextField } from "./fields";
import { blankStep, fromDefinition, KINDS, kindInfo, REWARD_OPTIONS, SUBJECTS, toDefinition, type StepKind } from "./model";

const ID = /^[a-z0-9-]{1,40}$/u;
const PREFIX: Record<string, string> = { maths: "ma-", phonics: "ph-", spelling: "sp-" };

type Props = { readonly api: AdminApi; readonly navigate?: (hash: string) => void };

export function NewActivityPage({ api, navigate = (hash) => window.location.assign(hash) }: Props) {
  const [subject, setSubject] = useState("maths");
  const [activityId, setActivityId] = useState("ma-");
  const [title, setTitle] = useState("");
  const [topicId, setTopicId] = useState("maths-");
  const [rewardCategory, setReward] = useState("NORMAL");
  const [kind, setKind] = useState<StepKind>("MULTIPLE_CHOICE");
  const [minAge, setMinAge] = useState(5);
  const [maxAge, setMaxAge] = useState(5);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const changeSubject = (next: string) => {
    if (activityId === PREFIX[subject]) setActivityId(PREFIX[next] ?? "");
    if (topicId === `${subject}-`) setTopicId(`${next}-`);
    setSubject(next);
  };

  const ready = ID.test(activityId) && title.trim() !== "" && topicId.startsWith(`${subject}-`) && topicId.length > subject.length + 1;

  const create = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const body: NewActivity = {
        activityId,
        title: title.trim(),
        subject,
        topicId: topicId.trim(),
        rewardCategory,
        interactionType: kindInfo(kind).interactionType,
        authoringMode: "FIXED",
        minAge,
        maxAge,
      };
      const created = await api.createActivity(body);
      const definition = created.draft.definition;
      const fresh = created.draft.draftRevision === 0 && definition.activityPayload === undefined && definition.title === body.title;
      if (!fresh) {
        setMessage(`${activityId} already exists. Open it from the list, or choose another ID.`);
        return;
      }
      const state = { ...fromDefinition(definition, kind), step: blankStep(kind), source: "HANDWRITTEN" };
      await api.saveActivity(activityId, { draftRevision: 0, definition: toDefinition(definition, state) });
      navigate(hrefOf({ page: "activity", id: activityId }));
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="detail">
      <p>
        <a href={hrefOf({ page: "activities" })}>← All activities</a>
      </p>
      <h2>New activity</h2>
      <p className="muted">
        These fields say what the activity is. Subject, topic, type and reward are locked once it is first published; the ID can never change.
      </p>
      <fieldset>
        <legend>Identity</legend>
        <div className="grid">
          <SelectField path="subject" label="Subject" value={subject} options={SUBJECTS} onChange={changeSubject} />
          <TextField path="activityId" label="Activity ID" value={activityId} maxLength={40} hint="Lower-case letters, digits and hyphens, for example ma-0101." onChange={setActivityId} />
          <TextField path="title" label="Title (for the admin list)" value={title} maxLength={80} wide onChange={setTitle} />
          <TextField path="topicId" label="Topic" value={topicId} maxLength={40} hint="Starts with the subject." onChange={setTopicId} />
          <SelectField path="interactionType" label="Interaction type" value={kind} options={KINDS.map((k) => ({ value: k.kind, label: k.label }))} onChange={(v) => setKind(v as StepKind)} />
          <SelectField path="rewardCategory" label="Reward" value={rewardCategory} options={REWARD_OPTIONS} onChange={setReward} />
          <SelectField path="minAge" label="Youngest age" value={String(minAge)} options={["5", "6", "7"]} onChange={(v) => setMinAge(Number.parseInt(v, 10))} />
          <SelectField path="maxAge" label="Oldest age" value={String(maxAge)} options={["5", "6", "7"]} onChange={(v) => setMaxAge(Number.parseInt(v, 10))} />
        </div>
        <button type="button" className="primary" disabled={busy || !ready} onClick={() => void create()}>
          Create draft
        </button>
        {message !== null && (
          <p className="error" role="status">
            {message}
          </p>
        )}
      </fieldset>
    </div>
  );
}
