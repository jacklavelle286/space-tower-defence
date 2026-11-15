// The review rules the admin pages enforce before they let the operator press Approve or Publish (D §D9.3-D9.4,
// D §D8.4, C22.3). The server checks again: approval needs the previewed clip object (admin-api R21), publication
// needs the checklist and the preview-solve revision (R27). These functions only decide what the buttons allow.

import type { Definition } from "./api";

export type ChecklistItem = { readonly key: string; readonly label: string };

/** D §D9.4, one line per group, all ticked before Approve. */
export const LISTENING_CHECKLIST: readonly ChecklistItem[] = [
  { key: "identity", label: "Identity: the intended sound or word, not its confusable pair; no letter name for a sound" },
  { key: "purity", label: "Purity: no added vowel (at most a small one for b, d, g, j); held long enough" },
  { key: "accent", label: "Accent: British, same voice quality and loudness as neighbouring clips" },
  { key: "mechanics", label: "Mechanics: start not clipped, end not cut, falling tone, no breaths or clicks" },
  { key: "teaching", label: "Teaching fit: does not give the answer away; a second listener names it unprompted" },
  { key: "records", label: "Records: only curriculum content in the text; defaults used or the change noted" },
];

/** C22.3 / D §D8.4: the seven publish lines. Keys match admin-api's CHECKLIST (api/shared/content.py). */
export const PUBLISH_CHECKLIST: readonly ChecklistItem[] = [
  { key: "workedAnswer", label: "I worked the answer out myself and it matches the answer key" },
  { key: "oneRightAnswer", label: "Exactly one right answer: nothing else on screen could be accepted" },
  { key: "wordingSuitsAge", label: "Wording suits the youngest age, British spelling" },
  { key: "picturesClear", label: "Pictures are clear at the size shown (or there are none)" },
  { key: "listenedToClips", label: "I listened to every clip and each says the intended sound or word" },
  { key: "noTraps", label: "No homophone, heteronym or accent trap" },
  { key: "nothingPersonal", label: "Nothing personal, branded or frightening" },
];

export function allTicked(items: readonly ChecklistItem[], ticks: Readonly<Record<string, boolean>>): boolean {
  return items.every((item) => ticks[item.key] === true);
}

export type Gate = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export type ApproveState = {
  readonly dirty: boolean;
  readonly draftRevision: number;
  readonly draftClipKey: string | null;
  readonly preview: { readonly draftRevision: number; readonly clipKey: string } | null;
  readonly ticks: Readonly<Record<string, boolean>>;
};

/** Approve only what was previewed and heard: the saved draft, this revision, this clip key (D §D9.3). */
export function canApprove(state: ApproveState): Gate {
  if (state.dirty) return { ok: false, reason: "Save the draft first." };
  if (state.draftClipKey === null) return { ok: false, reason: "The draft has no text yet." };
  if (state.preview === null || state.preview.draftRevision !== state.draftRevision) {
    return { ok: false, reason: "Preview and listen to this version of the draft first." };
  }
  if (state.preview.clipKey !== state.draftClipKey) {
    return { ok: false, reason: "The preview made a different clip from the one approval checks. Ask the owner to check the speech settings." };
  }
  if (!allTicked(LISTENING_CHECKLIST, state.ticks)) return { ok: false, reason: "Tick every listening check." };
  return { ok: true };
}

export type PublishState = {
  readonly dirty: boolean;
  readonly draftRevision: number;
  readonly validated: { readonly draftRevision: number; readonly valid: boolean } | null;
  readonly solvedRevision: number | null;
  readonly ticks: Readonly<Record<string, boolean>>;
};

/** D §D8.4: Publish only when validate and preview-solve are ticked for this revision and the checklist is complete. */
export function canPublish(state: PublishState): Gate {
  if (state.dirty) return { ok: false, reason: "Save the draft first." };
  if (state.validated === null || state.validated.draftRevision !== state.draftRevision || !state.validated.valid) {
    return { ok: false, reason: "Validate this revision without problems first." };
  }
  if (state.solvedRevision !== state.draftRevision) return { ok: false, reason: "Solve the preview of this revision first." };
  if (!allTicked(PUBLISH_CHECKLIST, state.ticks)) return { ok: false, reason: "Tick every review line." };
  return { ok: true };
}

/** Preview-solve for MULTIPLE_CHOICE: the answer is the option ID (C20.1). */
export function isCorrect(definition: Definition, optionId: string): boolean {
  const accepted = definition.answerSpecification?.accepted;
  return Array.isArray(accepted) && accepted.length === 1 && accepted[0] === optionId;
}

/** The fields the minimal activity editor changes (D §D8.4: structured fields, not raw JSON). */
export type ActivityForm = {
  readonly title: string;
  readonly minAge: number;
  readonly maxAge: number;
  readonly promptText: string;
  readonly options: readonly { readonly id: string; readonly text: string }[];
  readonly correct: string;
  readonly promptSpeechId: string;
  readonly audioRequirement: string;
};

export function formOf(definition: Definition): ActivityForm {
  return {
    title: definition.title ?? "",
    minAge: definition.minAge,
    maxAge: definition.maxAge,
    promptText: definition.prompt?.text ?? "",
    options: definition.activityPayload?.options ?? [],
    correct: definition.answerSpecification?.accepted?.[0] ?? "",
    promptSpeechId: definition.speechDefinitionReferences?.["prompt"]?.speechId ?? "",
    audioRequirement: definition.audioRequirement ?? "REQUIRED",
  };
}

/** The draft with the form's edits applied; every other field is kept exactly as it was. */
export function applyForm(definition: Definition, form: ActivityForm): Definition {
  const refs = { ...definition.speechDefinitionReferences };
  if (form.promptSpeechId.trim() === "") delete refs["prompt"];
  else refs["prompt"] = { speechId: form.promptSpeechId.trim() };
  return {
    ...definition,
    title: form.title.trim(),
    minAge: form.minAge,
    maxAge: form.maxAge,
    audioRequirement: form.audioRequirement,
    prompt: { text: form.promptText.trim() },
    activityPayload: {
      ...definition.activityPayload,
      options: form.options.map((option) => ({ id: option.id, text: option.text.trim() })),
    },
    answerSpecification: { accepted: form.correct === "" ? [] : [form.correct] },
    speechDefinitionReferences: refs,
  };
}
