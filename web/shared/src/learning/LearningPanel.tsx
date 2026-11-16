// The learning panel (D6; M1-22, M3-03): one activity, three tries, one reward. The shell (heading, Play, tries,
// Check, feedback) is the same for every interaction type; only the answer area changes, chosen by each step's
// interactionType: MULTIPLE_CHOICE (Milestone 1), PICTURE_SELECT and NUMBER_SELECT (Phase 37), OBJECT_MOVE, ARRANGE
// and TYPED (Phase 38). A two-step activity (C20.3) shows both parts on the panel with one Check. It lives in
// web/shared with no Phaser, so the admin preview-solve can show children's exact panel (E.5.1).
//
// What the panel decides, and what it does not:
// - It turns the steps' raw answers into the one canonical answer (canonical.ts; two steps joined by "|") and hands it
//   to `onCheck`. Whether it was right, and how many tries are used, come back through the props from the run's saved
//   slot (`attempts`, `status`), so a refresh shows exactly what was recorded (spine S3.7: resume from the saved slot).
// - Client-only guards (D6.2, D-8): on the choice types an option already tried is dimmed, labelled "tried" and
//   cannot be chosen again; on the other types Check with exactly an earlier answer says "You've tried that one".
//   The server still counts every attempt it receives.
// - After a wrong try (D6.3): a wrong choice is cleared; an arrangement, a sort, a share and a typed answer stay as
//   they were. In a two-step activity a right part is locked with a tick and a wrong one says "Try this part again";
//   the per-part marks come from the recorded answer and the pack's accepted answers, so a refresh shows them too.
// - Feedback waits for durability (D6.2): while `onCheck` is pending the panel says "Checking…" and shows the
//   attempts as they were when Check was pressed, so the result is never shown before it is saved.
// - Nothing here uses up a try except `onCheck`: Play, a sound that fails, choosing, moving, typing, and Check on an
//   incomplete answer never do (D6.2, AC-22).
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipAvailability } from "../audio/useClip";
import type { PlayState } from "../audio/clipPlayer";
import { LIMITS } from "../limits";
import { answerSpecOf, answerWords, emptyAnswer, isChoiceStep, panelSteps, restoreAnswer, type PanelActivity, type PanelCue, type PanelStep } from "./activity";
import { ArrangeArea } from "./ArrangeArea";
import { canonicalise, canonicaliseSteps, splitSteps, type RawAnswer } from "./canonical";
import { ChoiceStep } from "./ChoiceArea";
import { PANEL_COPY as COPY } from "./copy";
import { DistributeArea, SortArea } from "./ObjectMoveArea";
import { TypedArea } from "./TypedArea";
import "./panel.css";

export type { PanelActivity, PanelOption, PanelPicture, PanelStimulus } from "./activity";

export interface PanelAttempt {
  readonly answer: string;
  readonly correct: boolean;
}

export type PanelStatus = "UNRESOLVED" | "SUCCEEDED" | "FAILED" | "VOIDED" | "DECLINED";

/** `recorded`: the try is durable and the props will show it. `not-saved`: nothing was counted; Check may be pressed again. */
export type CheckResult = { readonly kind: "recorded" } | { readonly kind: "not-saved" };

/** One Play button (from useClip). */
export interface PanelAudio {
  readonly state: PlayState;
  readonly availability: ClipAvailability;
  press(): void;
  retry(): void;
}

export interface LearningPanelProps {
  readonly activity: PanelActivity;
  /** The saved slot's attempts, oldest first. */
  readonly attempts: readonly PanelAttempt[];
  readonly status: PanelStatus;
  /** The prompt clip ("Play"), or null when the activity has none. */
  readonly audio?: PanelAudio | null;
  /** The instruction clip ("Read it to me"), or null. */
  readonly readToMe?: PanelAudio | null;
  onCheck(answer: string): Promise<CheckResult>;
  onContinue(): void;
  onSaveAndExit?: () => void;
}

type Note = "none" | "incomplete" | "playFirst" | "notSaved" | "afterCheck" | "triedThat";

/** What one step's answer area shows after the last try: nothing yet, a locked right part, or "try this part again". */
type StepMark = "none" | "right" | "again";

/** The step answers of an attempt, one per step, or null when the recorded answer has another number of parts. */
function partsOf(answer: string, steps: readonly PanelStep[]): string[] | null {
  return steps.length === 1 ? [answer] : splitSteps(answer, steps.length);
}

/**
 * Where each step starts when the panel opens (also after a refresh): a locked right part shows its recorded answer;
 * an arrangement, sort, share or typed answer shows the last try (it "stays", D6.3); a choice starts empty.
 */
function startingAnswers(steps: readonly PanelStep[], attempts: readonly PanelAttempt[]): RawAnswer[] {
  const last = attempts.at(-1);
  const parts = last === undefined || last.correct ? null : partsOf(last.answer, steps);
  return steps.map((step, i) => {
    const part = parts?.[i];
    if (part === undefined) return emptyAnswer(step);
    const right = steps.length > 1 && step.accepted.includes(part);
    if (isChoiceStep(step) && !right) return emptyAnswer(step);
    return restoreAnswer(step, part) ?? emptyAnswer(step);
  });
}

/** D6.4: the nudge for Check on an incomplete answer depends on what the child still has to do. */
function incompleteLine(step: PanelStep | undefined): string {
  switch (step?.interactionType) {
    case "ARRANGE":
      return COPY.fillFirst;
    case "OBJECT_MOVE":
      return COPY.moveFirst;
    case "TYPED":
      return COPY.typeFirst;
    default:
      return COPY.chooseFirst;
  }
}

export function LearningPanel({ activity, attempts, status, audio = null, readToMe = null, onCheck, onContinue, onSaveAndExit }: LearningPanelProps) {
  const maxTries = LIMITS.attemptsPerSlot;
  const heading = useRef<HTMLHeadingElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const steps = useMemo(() => panelSteps(activity), [activity]);
  const specs = useMemo(() => steps.map(answerSpecOf), [steps]);
  const [answers, setAnswers] = useState<RawAnswer[]>(() => startingAnswers(steps, attempts));
  const [checking, setChecking] = useState(false);
  const [frozen, setFrozen] = useState<{ attempts: readonly PanelAttempt[]; status: PanelStatus } | null>(null);
  const [note, setNote] = useState<Note>("none");
  // "Has Play ever been pressed on this activity?" A recorded try means it was, before a refresh too.
  const [played, setPlayed] = useState(attempts.length > 0);

  const shownAttempts = frozen?.attempts ?? attempts;
  const shownStatus = frozen?.status ?? status;
  const resolved = shownStatus !== "UNRESOLVED";
  const triesLeft = Math.max(0, maxTries - shownAttempts.length);
  const soundGate = activity.audioRequired && audio !== null && audio.availability !== "ready";
  const twoStep = steps.length > 1;

  // Per step: the parts tried and wrong (greyed on choice steps, listed as "Tried: …" on arrange and typed steps), and
  // the mark from the last wrong try (two-step only).
  const wrongTries = shownAttempts.filter((a) => !a.correct).map((a) => partsOf(a.answer, steps));
  const tried = steps.map((step, i) => new Set(wrongTries.flatMap((parts) => (parts?.[i] !== undefined && !step.accepted.includes(parts[i]) ? [parts[i]] : []))));
  const lastAttempt = shownAttempts.at(-1);
  const lastParts = lastAttempt !== undefined && !lastAttempt.correct ? partsOf(lastAttempt.answer, steps) : null;
  const marks: StepMark[] = steps.map((step, i) => {
    const part = lastParts?.[i];
    if (!twoStep || resolved || part === undefined) return "none";
    return step.accepted.includes(part) ? "right" : "again";
  });
  const current = canonicaliseSteps(specs, answers);
  const firstIncomplete = steps.find((step, i) => {
    const result = canonicalise(specs[i] ?? answerSpecOf(step), answers[i] ?? null);
    return !result.ok && result.reason === "INCOMPLETE";
  });

  // The panel is keyed by slot, so this runs once per activity: focus starts on the heading (D6.1).
  useEffect(() => heading.current?.focus(), []);
  useEffect(() => {
    if (resolved && !checking) continueButton.current?.focus();
  }, [resolved, checking]);

  function change(index: number, value: RawAnswer) {
    if (checking || resolved || marks[index] === "right") return;
    setAnswers((list) => list.map((v, i) => (i === index ? value : v)));
    if (note === "incomplete" || note === "notSaved" || note === "triedThat") setNote("none");
  }

  function pressPlay(control: PanelAudio) {
    setPlayed(true);
    if (note === "playFirst") setNote("none");
    control.press(); // synchronously inside the click handler (the audio module primes the element first)
  }

  async function check() {
    if (checking || resolved) return;
    if (activity.audioRequired && audio !== null && !played) {
      setNote("playFirst");
      return;
    }
    if (!current.ok) {
      setNote("incomplete");
      return;
    }
    if (shownAttempts.some((a) => a.answer === current.answer)) {
      setNote("triedThat");
      return;
    }
    // Latched until the op is durable, so a double-click is one try (D6.2).
    setChecking(true);
    setFrozen({ attempts, status });
    let result: CheckResult;
    try {
      result = await onCheck(current.answer);
    } catch {
      result = { kind: "not-saved" };
    }
    setFrozen(null);
    setChecking(false);
    if (result.kind === "recorded") {
      // A wrong choice is cleared so a new one can be made; everything else stays as it was (D6.3).
      const parts = partsOf(current.answer, steps);
      setAnswers((list) => list.map((v, i) => {
        const step = steps[i];
        return step !== undefined && isChoiceStep(step) && !step.accepted.includes(parts?.[i] ?? "") ? emptyAnswer(step) : v;
      }));
    }
    setNote(result.kind === "recorded" ? "afterCheck" : "notSaved");
  }

  let line: string | null = null;
  if (checking) line = COPY.checking;
  else if (note === "incomplete") line = incompleteLine(firstIncomplete);
  else if (note === "playFirst") line = COPY.playFirst;
  else if (note === "notSaved") line = COPY.notSaved;
  else if (note === "triedThat") line = COPY.triedThat;
  else if (shownStatus === "SUCCEEDED") line = COPY.correct;
  else if (shownStatus === "FAILED") line = COPY.failed;
  else if (note === "afterCheck" && lastAttempt !== undefined && !lastAttempt.correct) line = COPY.notQuite;

  const answerText = answerWords(activity);
  // D6.4 reward line: the power when the slot charges one, else the credits; no line at all for a reward of nothing
  // (never "+0 space credits", which reads as a mistake to a child and to the operator previewing a draft).
  const rewardLine =
    shownStatus !== "SUCCEEDED"
      ? null
      : activity.reward.powerName !== undefined
        ? COPY.rewardPower(activity.reward.powerName)
        : activity.reward.credits > 0
          ? COPY.rewardCredits(activity.reward.credits)
          : null;
  const headingId = `lp-heading-${activity.slotId}`;
  const wide = steps.some((s) => (s.interactionType === "NUMBER_SELECT" && s.display === "GRID") || s.interactionType === "OBJECT_MOVE") || twoStep;

  // D6.4 (D-4): after the last wrong try, an arrangement, sort, share or typed answer is shown completed, read-only, in
  // the answer area itself (not only as words a 5-year-old may not read yet). Choice steps mark the right card instead.
  const shownAnswer = shownStatus === "FAILED" && activity.accepted[0] !== undefined ? partsOf(activity.accepted[0], steps) : null;

  function area(step: PanelStep, index: number, labelledBy: string) {
    const part = isChoiceStep(step) ? undefined : shownAnswer?.[index];
    const value = (part !== undefined ? restoreAnswer(step, part) : null) ?? answers[index] ?? null;
    const locked = checking || resolved || marks[index] === "right";
    const onChange = (v: RawAnswer) => change(index, v);
    switch (step.interactionType) {
      case "MULTIPLE_CHOICE":
      case "PICTURE_SELECT":
      case "NUMBER_SELECT":
        return (
          <ChoiceStep
            step={step}
            labelledBy={labelledBy}
            selected={typeof value === "string" ? value : null}
            tried={tried[index] ?? new Set()}
            resolved={resolved}
            busy={checking || marks[index] === "right"}
            onChoose={onChange}
          />
        );
      case "OBJECT_MOVE":
        return step.mode === "DISTRIBUTE" ? (
          <DistributeArea step={step} labelledBy={labelledBy} value={value} disabled={locked} onChange={onChange} />
        ) : (
          <SortArea step={step} labelledBy={labelledBy} value={value} disabled={locked} onChange={onChange} />
        );
      case "ARRANGE":
        return <ArrangeArea step={step} labelledBy={labelledBy} value={value} disabled={locked} onChange={onChange} />;
      case "TYPED":
        return <TypedArea step={step} labelledBy={labelledBy} value={value} disabled={locked} onChange={onChange} onSubmit={() => void check()} />;
    }
  }

  function stepBody(step: PanelStep, index: number, labelledBy: string) {
    const cue = step.interactionType === "ARRANGE" || step.interactionType === "TYPED" ? step.cue : undefined;
    const triedHere = [...(tried[index] ?? [])];
    const listTried = !resolved && triedHere.length > 0 && (step.interactionType === "ARRANGE" || step.interactionType === "TYPED");
    return (
      <>
        {step.stimulus !== undefined ? <img className="lp-stimulus" src={step.stimulus.imageUrl} alt={step.stimulus.alt} /> : null}
        {cue !== undefined ? <Cue cue={cue} /> : null}
        {area(step, index, labelledBy)}
        {listTried ? <p className="lp-tried-list lp-reading">{COPY.triedList(triedHere)}</p> : null}
      </>
    );
  }

  return (
    <div className="lp-backdrop">
      <section className={wide ? "lp lp-wide" : "lp"} role="dialog" aria-modal="true" aria-labelledby={headingId}>
        <h2 className="lp-heading lp-reading" id={headingId} tabIndex={-1} ref={heading}>
          {activity.prompt}
        </h2>

        {audio !== null || readToMe !== null ? (
          <div className="lp-sound">
            {audio !== null ? <PlayButton control={audio} onPress={() => pressPlay(audio)} /> : null}
            {readToMe !== null ? <PlayButton control={readToMe} label={COPY.readToMe} onPress={() => pressPlay(readToMe)} /> : null}
          </div>
        ) : null}

        {soundGate ? (
          <div className="lp-wait" role="status">
            {audio?.availability === "failed" ? (
              <>
                <p>{COPY.soundFailed}</p>
                <button type="button" className="lp-btn" onClick={() => audio.retry()}>
                  {COPY.tryAgain}
                </button>
              </>
            ) : (
              <p>{COPY.loading}</p>
            )}
          </div>
        ) : twoStep ? (
          steps.map((step, index) => {
            const partId = `${headingId}-part-${index + 1}`;
            const mark = marks[index] ?? "none";
            return (
              <section key={index} className={mark === "right" ? "lp-step is-right" : "lp-step"} aria-labelledby={partId}>
                <h3 className="lp-part lp-reading" id={partId}>
                  {step.prompt ?? COPY.partLabel(index + 1)}
                </h3>
                {mark !== "none" ? (
                  <p className={mark === "right" ? "lp-mark is-right" : "lp-mark"}>
                    {mark === "right" ? (
                      <>
                        <span aria-hidden="true">✓ </span>
                        {COPY.partRight}
                      </>
                    ) : (
                      COPY.partAgain
                    )}
                  </p>
                ) : null}
                {stepBody(step, index, partId)}
              </section>
            );
          })
        ) : (
          steps[0] !== undefined && stepBody(steps[0], 0, headingId)
        )}

        <div className="lp-footer">
          <p className="lp-tries">
            <span aria-hidden="true" className="lp-tries-icons">
              {"●".repeat(triesLeft)}
              {"○".repeat(maxTries - triesLeft)}
            </span>{" "}
            {COPY.triesLeft(triesLeft)}
          </p>
          <div className="lp-message" role="status" aria-live="polite">
            {line !== null ? <p>{line}</p> : null}
            {rewardLine !== null ? <p className="lp-reward">{rewardLine}</p> : null}
            {shownStatus === "FAILED" && answerText !== "" ? (
              <p>
                {COPY.answerWas} <span className="lp-reading lp-answer">{answerText}</span>.
              </p>
            ) : null}
          </div>
          {resolved && !checking ? (
            <button type="button" className="lp-btn lp-go" ref={continueButton} onClick={onContinue}>
              {COPY.continue} <span aria-hidden="true">➜</span>
            </button>
          ) : (
            <button
              type="button"
              className="lp-btn lp-go"
              aria-disabled={!current.ok || checking || soundGate ? true : undefined}
              onClick={() => void check()}
            >
              {checking ? COPY.checking : COPY.check}
              {checking ? null : <span aria-hidden="true"> ✓</span>}
            </button>
          )}
        </div>

        {onSaveAndExit ? (
          <button type="button" className="lp-btn lp-small" onClick={onSaveAndExit} disabled={checking}>
            {COPY.saveAndExit}
          </button>
        ) : null}
      </section>
    </div>
  );
}

/** ARRANGE LETTERS and TYPED WORD: the picture and/or rule text that says which word ("hop + ing"). */
function Cue({ cue }: { cue: PanelCue }) {
  return (
    <div className="lp-cue">
      {cue.imageUrl !== undefined ? <img className="lp-stimulus" src={cue.imageUrl} alt={cue.alt ?? ""} /> : null}
      {cue.text !== undefined ? <p className="lp-reading lp-cue-text">{cue.text}</p> : null}
    </div>
  );
}

// D6.1: every main action pairs its word with a symbol, for children who do not read yet (Check ✓, Continue ➜, and
// the Play button's icons below). The symbols are hidden from screen readers, so the buttons' names stay the words.
const PLAY_ICONS: Record<PlayState, string> = { idle: "▶", loading: "…", playing: "■", played: "↻", failed: "▶" };

function PlayButton({ control, label, onPress }: { control: PanelAudio; label?: string; onPress: () => void }) {
  const text =
    control.state === "loading"
      ? COPY.loading
      : control.state === "playing"
        ? COPY.stop
        : control.state === "played"
          ? (label ?? COPY.playAgain)
          : control.state === "failed"
            ? COPY.tryAgain
            : (label ?? COPY.play);
  return (
    <span className="lp-play-wrap">
      <button type="button" className="lp-btn lp-play" aria-busy={control.state === "loading" ? true : undefined} onClick={onPress}>
        <span aria-hidden="true">{PLAY_ICONS[control.state]}</span> {text}
      </button>
      {control.state === "failed" ? <span className="lp-play-failed">{COPY.soundFailed}</span> : null}
    </span>
  );
}
