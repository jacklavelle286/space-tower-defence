// The answer area of the three "choose one" interaction types (D6.3): MULTIPLE_CHOICE text buttons, PICTURE_SELECT
// picture cards and the NUMBER_SELECT number track or hundred square. All three are one radio group:
// - mouse: click a choice (thick outline + tick), then Check;
// - keyboard: Tab reaches the group at the selected (or first) choice, arrows move and select (keys.ts), Space or
//   Enter on a choice selects it, digits 1-6 pick by badge on text and picture choices, then Tab to Check.
// A choice already tried is dimmed, dashed, labelled "tried" and skipped by the arrows (D6.2, D-8); state is never
// shown by colour alone (D1 rule 7). Letters, words and numbers the child reads are in Andika (ADR-0013).
// ChoiceStep (below) owns the buttons, the roving tab stop and the keys; the panel shell owns what is selected.
import { useRef, type KeyboardEvent, type ReactNode } from "react";
import type { MultipleChoiceFields, NumberSelectFields, PanelStep, PictureSelectFields } from "./activity";
import { decimal } from "./canonical";
import { PANEL_COPY as COPY } from "./copy";
import { isMoveKey, moveChoice, type ChoiceLayout } from "./keys";

/** A "choose one" step: its options or numbers, and its accepted answers (for the highlight once it has ended). */
export type ChoiceStepFields = (MultipleChoiceFields | PictureSelectFields | NumberSelectFields) & { readonly accepted: readonly string[] };

export function isChoiceFields(step: PanelStep): step is PanelStep & ChoiceStepFields {
  return step.interactionType === "MULTIPLE_CHOICE" || step.interactionType === "PICTURE_SELECT" || step.interactionType === "NUMBER_SELECT";
}

/** Columns of the hundred square. */
const GRID_COLUMNS = 10;

/** Every choice as the raw answer it gives, in screen order: the option ID, or the number in decimal. */
export function choiceValues(activity: ChoiceStepFields): string[] {
  switch (activity.interactionType) {
    case "MULTIPLE_CHOICE":
    case "PICTURE_SELECT":
      return activity.options.map((o) => o.id);
    case "NUMBER_SELECT":
      return activity.numbers.flatMap((n) => {
        const text = decimal(n);
        return text === null ? [] : [text];
      });
  }
}

export function choiceLayout(activity: ChoiceStepFields): ChoiceLayout {
  if (activity.interactionType !== "NUMBER_SELECT") return { kind: "ring" };
  return activity.display === "GRID" ? { kind: "grid", columns: GRID_COLUMNS } : { kind: "line" };
}

export interface ChoiceAreaProps {
  readonly activity: ChoiceStepFields;
  /** The heading's id: the group's accessible name is the question. */
  readonly labelledBy: string;
  readonly selected: string | null;
  readonly tried: ReadonlySet<string>;
  readonly resolved: boolean;
  /** Check is waiting for the try to be saved. */
  readonly busy: boolean;
  /** The one choice reachable with Tab (roving tab stop). */
  readonly tabStop: string | null;
  register(value: string, element: HTMLButtonElement | null): void;
  onChoose(value: string): void;
  onKeyDown(event: KeyboardEvent<HTMLDivElement>): void;
}

interface Item {
  readonly value: string;
  /** The accessible name before "tried" is added: "1: sh", "2: a cat", "8". */
  readonly name: string;
  readonly className: string;
  readonly content: ReactNode;
}

function items(activity: ChoiceStepFields): Item[] {
  switch (activity.interactionType) {
    case "MULTIPLE_CHOICE":
      return activity.options.map((o, i) => ({
        value: o.id,
        name: COPY.optionLabel(i + 1, o.text),
        className: "lp-option",
        content: (
          <>
            <span className="lp-badge" aria-hidden="true">
              {i + 1}
            </span>
            <span className="lp-reading lp-option-text">{o.text}</span>
          </>
        ),
      }));
    case "PICTURE_SELECT":
      return activity.options.map((o, i) => ({
        value: o.id,
        name: COPY.optionLabel(i + 1, o.alt),
        className: "lp-option lp-picture",
        content: (
          <>
            <span className="lp-badge" aria-hidden="true">
              {i + 1}
            </span>
            {/* The button's name already says what the picture shows, so the image itself is not read twice. */}
            <img className="lp-picture-img" src={o.imageUrl} alt="" draggable={false} />
            {o.caption !== undefined ? <span className="lp-reading lp-caption">{o.caption}</span> : null}
          </>
        ),
      }));
    case "NUMBER_SELECT":
      return choiceValues(activity).map((text) => ({
        value: text,
        name: text,
        className: "lp-option lp-number",
        content: <span className="lp-reading lp-number-text">{text}</span>,
      }));
  }
}

function groupClass(activity: ChoiceStepFields): string {
  switch (activity.interactionType) {
    case "MULTIPLE_CHOICE":
      return "lp-options";
    case "PICTURE_SELECT":
      return "lp-options lp-pictures";
    case "NUMBER_SELECT":
      return activity.display === "GRID" ? "lp-options lp-numbers lp-grid" : "lp-options lp-numbers lp-track";
  }
}

export function ChoiceArea({ activity, labelledBy, selected, tried, resolved, busy, tabStop, register, onChoose, onKeyDown }: ChoiceAreaProps) {
  return (
    <div className={groupClass(activity)} role="radiogroup" aria-labelledby={labelledBy} aria-disabled={busy || resolved ? true : undefined} onKeyDown={onKeyDown}>
      {items(activity).map((item) => {
        const isTried = tried.has(item.value);
        const isAnswer = resolved && activity.accepted.includes(item.value);
        const isSelected = selected === item.value;
        const className = [item.className, isSelected ? "is-selected" : "", isTried ? "is-tried" : "", isAnswer ? "is-answer" : ""].filter(Boolean).join(" ");
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            className={className}
            aria-checked={isSelected}
            aria-disabled={isTried || resolved || busy ? true : undefined}
            aria-label={isTried ? COPY.triedName(item.name) : item.name}
            tabIndex={item.value === tabStop && !resolved ? 0 : -1}
            ref={(el) => register(item.value, el)}
            onClick={() => onChoose(item.value)}
          >
            {item.content}
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
  );
}

export interface ChoiceStepProps {
  readonly step: ChoiceStepFields;
  readonly labelledBy: string;
  readonly selected: string | null;
  /** Choices already tried and wrong on this step (dimmed, skipped by the arrows). */
  readonly tried: ReadonlySet<string>;
  readonly resolved: boolean;
  /** Checking, or a right part of a two-step activity locked with a tick. */
  readonly busy: boolean;
  onChoose(value: string): void;
}

/**
 * One "choose one" step with its keys: arrows move and select (keys.ts), digits 1-9 pick by badge on the types with
 * badges, and a click focuses the choice too (Safari does not focus buttons on click), so arrows carry on from it.
 */
export function ChoiceStep({ step, labelledBy, selected, tried, resolved, busy, onChoose }: ChoiceStepProps) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const values = choiceValues(step);
  const choosable = values.filter((v) => !tried.has(v));
  const tabStop = selected ?? choosable[0] ?? null;

  function register(value: string, element: HTMLButtonElement | null) {
    if (element) buttons.current.set(value, element);
    else buttons.current.delete(value);
  }

  function pick(value: string) {
    if (busy || resolved || tried.has(value)) return;
    onChoose(value);
    buttons.current.get(value)?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (busy || resolved) return;
    // Digits pick by badge on the choice types with badges (D6.3); a number board has no badges.
    if (step.interactionType !== "NUMBER_SELECT" && event.key.length === 1 && event.key >= "1" && event.key <= "9") {
      const value = values[event.key.charCodeAt(0) - "1".charCodeAt(0)];
      if (value !== undefined && !tried.has(value)) pick(value);
      event.preventDefault();
      return;
    }
    if (!isMoveKey(event.key)) return;
    event.preventDefault();
    // Arrows move from the focused choice (the radio pattern), which is the selected one once something is chosen.
    const focusedValue = values.find((v) => buttons.current.get(v) === event.target) ?? null;
    const next = moveChoice(event.key, values, tried, focusedValue ?? selected, choiceLayout(step));
    if (next !== null) pick(next);
  }

  return (
    <ChoiceArea
      activity={step}
      labelledBy={labelledBy}
      selected={selected}
      tried={tried}
      resolved={resolved}
      busy={busy}
      tabStop={tabStop}
      register={register}
      onChoose={pick}
      onKeyDown={onKeyDown}
    />
  );
}
