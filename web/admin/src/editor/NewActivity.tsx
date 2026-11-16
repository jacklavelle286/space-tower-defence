// "New activity" (D §D8.3: a draft starts from its identity fields). The operator picks the interaction type and a
// topic from the registry (plan C19); everything else fills itself in: the subject and the ages from the topic, a
// title from the topic's name, the reward as "either slot", and the activity ID as the subject's next free number.
// R23 creates the draft from the identity fields only; the editor then saves the blank step of the chosen type
// straight away, so the type's mode (share or sort, letters or order, number or word) is in the draft from the start.
//
// Create is idempotent on the activity ID: when the ID is already taken (someone created one since the list was
// read), admin-api answers 200 with the existing activity. This page then tries the next number, up to five times,
// instead of writing over it.
import { topicById, type Topic } from "@scd/shared";
import { useEffect, useState } from "react";
import { describeError, type AdminApi, type NewActivity } from "../api";
import { hrefOf } from "../routes";
import { SelectField, TextField } from "./fields";
import { agesText, defaultAges, nextActivityId, oldestChoices, subjectName, topicGroups, topicLabel, topicSuits } from "./identity";
import { blankStep, fromDefinition, KINDS, kindInfo, REWARD_OPTIONS, rewardHint, toDefinition, type StepKind } from "./model";
import { fieldId } from "./problems";

/** How many IDs Create tries when the proposed one turns out to be taken. */
export const ID_TRIES = 5;

type Props = { readonly api: AdminApi; readonly navigate?: (hash: string) => void };

export function NewActivityPage({ api, navigate = (hash) => window.location.assign(hash) }: Props) {
  const [kind, setKind] = useState<StepKind>("MULTIPLE_CHOICE");
  const [filter, setFilter] = useState("");
  const [topic, setTopic] = useState<Topic | null>(null);
  const [title, setTitle] = useState("");
  const [rewardCategory, setReward] = useState("BOTH");
  const [minAge, setMinAge] = useState(5);
  const [maxAge, setMaxAge] = useState(5);
  const [taken, setTaken] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.listActivities().then(
      (list) => setTaken(list.items.map((item) => item.activityId)),
      (error: unknown) => setMessage(`The activity list did not load, so the next ID is not known. ${describeError(error)}`),
    );
  }, [api]);

  const chooseTopic = (topicId: string) => {
    const next = topicById(topicId) ?? null;
    if (next !== null) {
      const ages = defaultAges(next);
      setMinAge(ages.minAge);
      setMaxAge(ages.maxAge);
      // The title follows the topic until the operator writes their own.
      if (title.trim() === "" || title === topic?.title) setTitle(next.title);
    }
    setTopic(next);
  };

  const chooseMinAge = (value: string) => {
    const age = Number.parseInt(value, 10);
    setMinAge(age);
    if (topic !== null) {
      const oldest = oldestChoices(topic, age);
      if (!oldest.includes(maxAge)) setMaxAge(oldest[oldest.length - 1] ?? age);
    }
  };

  const activityId = topic !== null && taken !== null ? nextActivityId(topic.subject, taken) : null;
  const ready = topic !== null && activityId !== null && title.trim() !== "";

  const create = async () => {
    if (topic === null || taken === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const tried: string[] = [];
      for (let attempt = 0; attempt < ID_TRIES; attempt += 1) {
        const id = nextActivityId(topic.subject, [...taken, ...tried]);
        const body: NewActivity = {
          activityId: id,
          title: title.trim(),
          subject: topic.subject,
          topicId: topic.topicId,
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
          tried.push(id); // taken since the list was read: try the next number
          continue;
        }
        const state = { ...fromDefinition(definition, kind), step: blankStep(kind) };
        await api.saveActivity(id, { draftRevision: 0, definition: toDefinition(definition, state) });
        navigate(hrefOf({ page: "activity", id }));
        return;
      }
      setTaken([...taken, ...tried]);
      setMessage(`${tried.join(", ")} were already taken. Reload the page and try again.`);
    } catch (error) {
      setMessage(describeError(error));
    } finally {
      setBusy(false);
    }
  };

  const groups = topicGroups(kind, filter, topic?.topicId ?? "");
  const youngest = topic?.ages ?? [5, 6, 7];
  const oldest = topic !== null ? oldestChoices(topic, minAge) : [minAge];

  return (
    <div className="detail">
      <p>
        <a href={hrefOf({ page: "activities" })}>← All activities</a>
      </p>
      <h2>New activity</h2>
      <p className="muted">
        Pick the type and the topic; the rest fills itself in. Topic, type and reward are locked once the activity is first published; the ID can
        never change.
      </p>
      <fieldset>
        <legend>What it is</legend>
        <div className="grid">
          <SelectField path="interactionType" label="Interaction type" value={kind} options={KINDS.map((k) => ({ value: k.kind, label: k.label }))} onChange={(v) => setKind(v as StepKind)} />
        </div>
        <div className="grid">
          <TextField path="topicFilter" label="Find a topic" value={filter} maxLength={60} hint="Type part of a topic's name to shorten the list." onChange={setFilter} />
          <span className="field">
            <label htmlFor={fieldId("topicId")}>Topic</label>
            <select id={fieldId("topicId")} value={topic?.topicId ?? ""} aria-describedby={`${fieldId("topicId")}-hint`} onChange={(e) => chooseTopic(e.target.value)}>
              <option value="">Choose a topic…</option>
              {groups.map((group) => (
                <optgroup key={group.subject} label={group.label}>
                  {group.topics.map((t) => (
                    <option key={t.topicId} value={t.topicId}>
                      {topicLabel(t)}
                      {topicSuits(t, kind) ? "" : " · usually another type"}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <small className="muted" id={`${fieldId("topicId")}-hint`}>
              {topic === null ? "Topics suited to the type come first in each subject." : topic.description}
            </small>
          </span>
        </div>
      </fieldset>

      <fieldset disabled={topic === null}>
        <legend>Filled in from the topic</legend>
        <div className="grid">
          <TextField path="subject" label="Subject" value={topic === null ? "" : subjectName(topic.subject)} readOnly onChange={() => undefined} />
          <TextField
            path="activityId"
            label="Activity ID"
            value={activityId ?? ""}
            readOnly
            hint={taken === null ? "Loading the activity list…" : "The next free number for the subject."}
            onChange={() => undefined}
          />
          <TextField path="title" label="Title (for the admin list)" value={title} maxLength={80} wide onChange={setTitle} />
          <SelectField
            path="minAge"
            label="Youngest age"
            value={String(minAge)}
            options={youngest.map(String)}
            hint={topic === null ? "Set by the topic." : `The topic is for age ${agesText(topic.ages)}.`}
            onChange={chooseMinAge}
          />
          <SelectField path="maxAge" label="Oldest age" value={String(maxAge)} options={oldest.map(String)} onChange={(v) => setMaxAge(Number.parseInt(v, 10))} />
          <SelectField
            path="rewardCategory"
            label="Reward"
            value={rewardCategory}
            options={REWARD_OPTIONS}
            hint={rewardHint(rewardCategory)}
            onChange={setReward}
          />
        </div>
        <button type="button" className="primary" disabled={busy || !ready} onClick={() => void create()}>
          Create draft
        </button>
      </fieldset>
      {message !== null && (
        <p className="error" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
