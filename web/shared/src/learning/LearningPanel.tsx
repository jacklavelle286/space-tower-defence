// The learning panel (D6; M1-22): one activity, three tries, one reward. Multiple choice only in Milestone 1; the
// other five interaction types join in Phases 37-38 (M3-03). It lives in web/shared with no Phaser, so the admin
// preview-solve can show children's exact panel later (E.5.1).
//
// What the panel decides, and what it does not:
// - It turns the selection into the canonical answer (canonical.ts) and hands it to `onCheck`. Whether it was right,
//   and how many tries are used, come back through the props from the run's saved slot (`attempts`, `status`), so a
//   refresh shows exactly what was recorded (spine S3.7: resume from the saved slot, not from memory).
// - Greyed tries are a client-only guard (D-8): an option already tried is dimmed, labelled "tried" and cannot be
//   chosen again. The server still counts every attempt it receives.
// - Feedback waits for durability (D6.2): while `onCheck` is pending the panel says "Checking…" and shows the
//   attempts as they were when Check was pressed, so the result is never shown before it is saved.
// - Nothing here uses up a try except `onCheck`: Play, a sound that fails, selecting, and Check with nothing chosen
//   never do (D6.2, AC-22).
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { ClipAvailability } from "../audio/useClip";
import type { PlayState } from "../audio/clipPlayer";
import { LIMITS } from "../limits";
import { canonicalise } from "./canonical";
import { PANEL_COPY as COPY } from "./copy";
import "./panel.css";

export interface PanelOption {
  readonly id: string;
  readonly text: string;
}

/** What the panel shows for one slot, built from the pack entry (G R10). Options are already in presentation order. */
export interface PanelActivity {
  readonly slotId: string;
  readonly prompt: string;
  readonly options: readonly PanelOption[];
  /** Accepted option IDs, for "The answer was …" once the activity has ended (never shown before). */
  readonly accepted: readonly string[];
  /** Phonics: the answer area waits for the sound, and Check asks for Play first (D6.2, D6.5). */
  readonly audioRequired: boolean;
  readonly reward: { readonly credits: number; readonly powerName?: string };
}

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

type Note = "none" | "chooseFirst" | "playFirst" | "notSaved" | "afterCheck";

export function LearningPanel({ activity, attempts, status, audio = null, readToMe = null, onCheck, onContinue, onSaveAndExit }: LearningPanelProps) {
  const maxTries = LIMITS.attemptsPerSlot;
  const heading = useRef<HTMLHeadingElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  const optionButtons = useRef(new Map<string, HTMLButtonElement>());
  const [selected, setSelected] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [frozen, setFrozen] = useState<{ attempts: readonly PanelAttempt[]; status: PanelStatus } | null>(null);
  const [note, setNote] = useState<Note>("none");
  // "Has Play ever been pressed on this activity?" A recorded try means it was, before a refresh too.
  const [played, setPlayed] = useState(attempts.length > 0);

  const shownAttempts = frozen?.attempts ?? attempts;
  const shownStatus = frozen?.status ?? status;
  const resolved = shownStatus !== "UNRESOLVED";
  const tried = new Set(shownAttempts.filter((a) => !a.correct).map((a) => a.answer));
  const triesLeft = Math.max(0, maxTries - shownAttempts.length);
  const choosable = activity.options.filter((o) => !tried.has(o.id));
  const soundGate = activity.audioRequired && audio !== null && audio.availability !== "ready";

  // The panel is keyed by slot, so this runs once per activity: focus starts on the heading (D6.1).
  useEffect(() => heading.current?.focus(), []);
  useEffect(() => {
    if (resolved && !checking) continueButton.current?.focus();
  }, [resolved, checking]);

  function choose(id: string) {
    if (checking || resolved || tried.has(id)) return;
    setSelected(id);
    if (note === "chooseFirst" || note === "notSaved") setNote("none");
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
    const answer = canonicalise({ interactionType: "MULTIPLE_CHOICE", optionIds: activity.options.map((o) => o.id) }, selected);
    if (!answer.ok || tried.has(answer.answer)) {
      setNote("chooseFirst");
      return;
    }
    // Latched until the op is durable, so a double-click is one try (D6.2).
    setChecking(true);
    setFrozen({ attempts, status });
    let result: CheckResult;
    try {
      result = await onCheck(answer.answer);
    } catch {
      result = { kind: "not-saved" };
    }
    setFrozen(null);
    setChecking(false);
    setSelected(null);
    setNote(result.kind === "recorded" ? "afterCheck" : "notSaved");
  }

  function onOptionKey(event: KeyboardEvent<HTMLDivElement>) {
    if (checking || resolved) return;
    const digit = Number.parseInt(event.key, 10);
    if (Number.isInteger(digit) && digit >= 1 && digit <= activity.options.length) {
      const option = activity.options[digit - 1];
      if (option !== undefined && !tried.has(option.id)) {
        choose(option.id);
        optionButtons.current.get(option.id)?.focus();
      }
      event.preventDefault();
      return;
    }
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const back = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!forward && !back) return;
    event.preventDefault();
    if (choosable.length === 0) return;
    const at = choosable.findIndex((o) => o.id === selected);
    const next = at === -1 ? (forward ? 0 : choosable.length - 1) : (at + (forward ? 1 : -1) + choosable.length) % choosable.length;
    const option = choosable[next];
    if (option === undefined) return;
    choose(option.id);
    optionButtons.current.get(option.id)?.focus();
  }

  const lastAttempt = shownAttempts.at(-1);
  let line: string | null = null;
  if (checking) line = COPY.checking;
  else if (note === "chooseFirst") line = COPY.chooseFirst;
  else if (note === "playFirst") line = COPY.playFirst;
  else if (note === "notSaved") line = COPY.notSaved;
  else if (shownStatus === "SUCCEEDED") line = COPY.correct;
  else if (shownStatus === "FAILED") line = COPY.failed;
  else if (note === "afterCheck" && lastAttempt !== undefined && !lastAttempt.correct) line = COPY.notQuite;

  const answerText = activity.options.filter((o) => activity.accepted.includes(o.id)).map((o) => o.text).join(", ");
  const rewardLine =
    shownStatus === "SUCCEEDED"
      ? activity.reward.powerName !== undefined
        ? COPY.rewardPower(activity.reward.powerName)
        : COPY.rewardCredits(activity.reward.credits)
      : null;
  const tabStop = selected ?? choosable[0]?.id ?? null;

  return (
    <div className="lp-backdrop">
      <section className="lp" role="dialog" aria-modal="true" aria-labelledby={`lp-heading-${activity.slotId}`}>
        <h2 className="lp-heading lp-reading" id={`lp-heading-${activity.slotId}`} tabIndex={-1} ref={heading}>
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
        ) : (
          <div
            className="lp-options"
            role="radiogroup"
            aria-labelledby={`lp-heading-${activity.slotId}`}
            aria-disabled={checking || resolved ? true : undefined}
            onKeyDown={onOptionKey}
          >
            {activity.options.map((option, index) => {
              const isTried = tried.has(option.id);
              const isAnswer = resolved && activity.accepted.includes(option.id);
              const isSelected = selected === option.id;
              const className = ["lp-option", isSelected ? "is-selected" : "", isTried ? "is-tried" : "", isAnswer ? "is-answer" : ""]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  className={className}
                  aria-checked={isSelected}
                  aria-disabled={isTried || resolved || checking ? true : undefined}
                  aria-label={isTried ? COPY.triedLabel(index + 1, option.text) : COPY.optionLabel(index + 1, option.text)}
                  tabIndex={option.id === tabStop && !resolved ? 0 : -1}
                  ref={(el) => {
                    if (el) optionButtons.current.set(option.id, el);
                    else optionButtons.current.delete(option.id);
                  }}
                  onClick={() => choose(option.id)}
                >
                  <span className="lp-badge" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span className="lp-reading lp-option-text">{option.text}</span>
                  {isSelected ? (
                    <span className="lp-tick" aria-hidden="true">
                      ✓
                    </span>
                  ) : null}
                  {isTried ? <span className="lp-tried">{COPY.tried}</span> : null}
                </button>
              );
            })}
          </div>
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
              aria-disabled={selected === null || checking || soundGate ? true : undefined}
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
