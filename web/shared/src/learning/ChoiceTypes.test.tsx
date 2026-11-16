// @vitest-environment jsdom
// Phase 37 (M3-03 part 1): PICTURE_SELECT and NUMBER_SELECT in the learning panel, each operated mouse-only and
// keyboard-only (D6.3), with greyed tries, resume from the saved slot and "The answer was …" after the third try.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MultipleChoiceActivity, NumberSelectActivity, PictureSelectActivity } from "./activity";
import { PANEL_COPY as COPY } from "./copy";
import { press, tab } from "./keyboardTesting";
import { LearningPanel, type CheckResult, type PanelActivity, type PanelAttempt, type PanelAudio, type PanelStatus } from "./LearningPanel";
import { wordEm, widestWordEm } from "./wordWidth";

afterEach(cleanup);

const PICTURES: PictureSelectActivity = {
  interactionType: "PICTURE_SELECT",
  slotId: "N-002",
  prompt: "Which one starts with c?",
  // presentation order from the slot
  options: [
    { id: "c", imageUrl: "/assets/activity/pic-dog.png", alt: "a dog" },
    { id: "a", imageUrl: "/assets/activity/pic-cat.png", alt: "a cat", caption: "cat" },
    { id: "d", imageUrl: "/assets/activity/pic-sun.png", alt: "the sun" },
    { id: "b", imageUrl: "/assets/activity/pic-pig.png", alt: "a pig" },
  ],
  accepted: ["a"],
  audioRequired: false,
  reward: { credits: 30 },
};

const TRACK: NumberSelectActivity = {
  interactionType: "NUMBER_SELECT",
  slotId: "N-003",
  prompt: "How many dots?",
  numbers: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  display: "TRACK",
  stimulus: { imageUrl: "/assets/activity/dice-6.svg", alt: "a dice showing six dots" },
  accepted: ["6"],
  audioRequired: false,
  reward: { credits: 30, powerName: "Frost Pulse" },
};

const GRID: NumberSelectActivity = {
  interactionType: "NUMBER_SELECT",
  slotId: "N-004",
  prompt: "Which number comes after 47?",
  numbers: Array.from({ length: 100 }, (_, i) => i + 1),
  display: "GRID",
  accepted: ["48"],
  audioRequired: false,
  reward: { credits: 30 },
};

function audio(overrides: Partial<PanelAudio> = {}): PanelAudio {
  return { state: "idle", availability: "ready", press: vi.fn(), retry: vi.fn(), ...overrides };
}

/** Holds the "saved slot" the way the run screen does: onCheck records the attempt at once. */
function Harness({ activity, initial = [], playAudio = null, onCheckSpy }: { activity: PanelActivity; initial?: PanelAttempt[]; playAudio?: PanelAudio | null; onCheckSpy?: (answer: string) => void }) {
  const [attempts, setAttempts] = useState<PanelAttempt[]>(initial);
  const status: PanelStatus = attempts.some((a) => a.correct) ? "SUCCEEDED" : attempts.length >= 3 ? "FAILED" : "UNRESOLVED";
  return (
    <LearningPanel
      activity={activity}
      attempts={attempts}
      status={status}
      audio={playAudio}
      onCheck={async (answer): Promise<CheckResult> => {
        onCheckSpy?.(answer);
        setAttempts((a) => [...a, { answer, correct: activity.accepted.includes(answer) }]);
        return { kind: "recorded" };
      }}
      onContinue={() => undefined}
    />
  );
}

const radio = (name: string) => screen.getByRole("radio", { name: new RegExp(`^${name}(, tried)?$`) });
const checked = () => screen.getAllByRole("radio").filter((r) => r.getAttribute("aria-checked") === "true").map((r) => r.getAttribute("aria-label"));
const focused = () => (document.activeElement as HTMLElement | null)?.getAttribute("aria-label") ?? document.activeElement?.textContent;

describe("PICTURE_SELECT", () => {
  it("shows picture cards in the slot's order, each with a badge and an accessible name from its alt text", () => {
    render(<Harness activity={PICTURES} />);
    const cards = screen.getAllByRole("radio");
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual(["1: a dog", "2: a cat", "3: the sun", "4: a pig"]);
    expect(cards.map((c) => c.querySelector(".lp-badge")?.textContent)).toEqual(["1", "2", "3", "4"]);
    const img = cards[1]?.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/assets/activity/pic-cat.png");
    expect(img?.getAttribute("alt")).toBe(""); // the card's name already says it; not read twice
    expect(cards[1]?.querySelector(".lp-caption.lp-reading")?.textContent).toBe("cat"); // words in Andika
    expect(screen.getByRole("radiogroup", { name: PICTURES.prompt })).toBeTruthy();
  });

  it("mouse only: click a card, Check; a wrong card is greyed and cannot be chosen again; the right one resolves", async () => {
    const spy = vi.fn();
    render(<Harness activity={PICTURES} onCheckSpy={spy} />);
    fireEvent.click(radio("1: a dog"));
    expect(radio("1: a dog").querySelector(".lp-tick")).not.toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: COPY.check })));
    expect(spy).toHaveBeenLastCalledWith("c");
    expect(screen.getByText(COPY.notQuite)).toBeTruthy();
    expect(radio("1: a dog").getAttribute("aria-label")).toBe("1: a dog, tried");
    expect(radio("1: a dog").getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(radio("1: a dog"));
    expect(checked()).toEqual([]);
    fireEvent.click(radio("2: a cat"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: COPY.check })));
    expect(spy).toHaveBeenLastCalledWith("a");
    expect(screen.getByText(COPY.correct)).toBeTruthy();
    expect(screen.getByText(COPY.rewardCredits(30))).toBeTruthy();
    expect(radio("2: a cat").className).toContain("is-answer");
  });

  it("keyboard only: Tab to Play and the cards, arrows and digits select, Tab to Check, Enter checks", async () => {
    const spy = vi.fn();
    const sound = audio();
    render(<Harness activity={{ ...PICTURES, audioRequired: true }} playAudio={sound} onCheckSpy={spy} />);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: PICTURES.prompt }));
    expect(tab().textContent).toMatch(/Play/);
    press("Enter");
    expect(sound.press).toHaveBeenCalledTimes(1);
    tab();
    expect(focused()).toBe("1: a dog"); // the group's one tab stop
    press("ArrowRight");
    expect(checked()).toEqual(["2: a cat"]);
    expect(focused()).toBe("2: a cat");
    press("4");
    expect(checked()).toEqual(["4: a pig"]);
    press("ArrowRight"); // wraps round
    expect(checked()).toEqual(["1: a dog"]);
    press("ArrowLeft");
    expect(checked()).toEqual(["4: a pig"]);
    expect(tab().textContent).toMatch(COPY.check);
    await act(async () => press("Enter"));
    expect(spy).toHaveBeenLastCalledWith("b");
    expect(screen.getByText(COPY.notQuite)).toBeTruthy();
    // after a wrong try the arrows skip the tried card, and digit 4 does nothing
    tab(true);
    expect(focused()).toBe("1: a dog");
    press("ArrowLeft");
    expect(checked()).toEqual(["3: the sun"]);
    press("4");
    expect(checked()).toEqual(["3: the sun"]);
    press("2");
    press(" ");
    expect(checked()).toEqual(["2: a cat"]);
    tab();
    await act(async () => press("Enter"));
    expect(spy).toHaveBeenLastCalledWith("a");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: COPY.continue }));
  });

  it("resume after three wrong tries: three cards greyed, the right one shown with its alt text", () => {
    render(
      <Harness
        activity={PICTURES}
        initial={[
          { answer: "c", correct: false },
          { answer: "d", correct: false },
          { answer: "b", correct: false },
        ]}
      />,
    );
    expect(screen.getAllByText(COPY.tried)).toHaveLength(3);
    expect(screen.getByText(COPY.failed)).toBeTruthy();
    expect(document.querySelector(".lp-answer")?.closest("p")?.textContent).toBe(`${COPY.answerWas} a cat.`);
    expect(radio("2: a cat").className).toContain("is-answer");
  });

  it("six cards: digits 5 and 6 pick by badge", () => {
    const six: PictureSelectActivity = {
      ...PICTURES,
      options: [
        ...PICTURES.options,
        { id: "e", imageUrl: "/assets/activity/pic-hat.png", alt: "a hat" },
        { id: "f", imageUrl: "/assets/activity/pic-cup.png", alt: "a cup" },
      ],
    };
    render(<Harness activity={six} />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "6" });
    expect(checked()).toEqual(["6: a cup"]);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "5" });
    expect(checked()).toEqual(["5: a hat"]);
  });
});

describe("NUMBER_SELECT", () => {
  it("track: shows the numbers in Andika with no badges, the question's picture, and plain-number names", () => {
    render(<Harness activity={TRACK} />);
    const cells = screen.getAllByRole("radio");
    expect(cells.map((c) => c.getAttribute("aria-label"))).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    expect(cells[0]?.querySelector(".lp-badge")).toBeNull();
    expect(cells[8]?.querySelector(".lp-reading")?.textContent).toBe("8");
    expect(screen.getByRole("img", { name: "a dice showing six dots" }).getAttribute("src")).toBe("/assets/activity/dice-6.svg");
    expect(document.querySelector(".lp-track")).not.toBeNull();
    expect(document.querySelector("section.lp")?.className).toBe("lp");
  });

  it("mouse only: click a number, Check; the tried number is greyed; the third wrong try shows the answer", async () => {
    const spy = vi.fn();
    render(<Harness activity={TRACK} onCheckSpy={spy} />);
    for (const n of ["5", "7", "4"]) {
      fireEvent.click(radio(n));
      await act(async () => fireEvent.click(screen.getByRole("button", { name: COPY.check })));
      expect(spy).toHaveBeenLastCalledWith(n);
      expect(radio(n).getAttribute("aria-label")).toBe(`${n}, tried`);
    }
    expect(screen.getByText(COPY.failed)).toBeTruthy();
    expect(document.querySelector(".lp-answer")?.textContent).toBe("6");
    expect(radio("6").className).toContain("is-answer");
  });

  it("keyboard only on a track: Left/Right one step, Up/Down too, Home/End the ends, tried numbers skipped", async () => {
    const spy = vi.fn();
    render(<Harness activity={TRACK} initial={[{ answer: "9", correct: false }]} onCheckSpy={spy} />);
    tab();
    expect(focused()).toBe("0");
    press("End");
    expect(checked()).toEqual(["10"]);
    press("ArrowLeft"); // skips 9 (tried)
    expect(checked()).toEqual(["8"]);
    press("ArrowUp");
    expect(checked()).toEqual(["7"]);
    press("ArrowDown");
    press("ArrowRight");
    expect(checked()).toEqual(["10"]);
    press("ArrowRight"); // the end of the track: stays
    expect(checked()).toEqual(["10"]);
    press("Home");
    expect(checked()).toEqual(["0"]);
    press("ArrowLeft");
    expect(checked()).toEqual(["0"]);
    press("3"); // digits do not pick on a number board
    expect(checked()).toEqual(["0"]);
    for (let i = 0; i < 6; i += 1) press("ArrowRight");
    expect(checked()).toEqual(["6"]);
    expect(tab().textContent).toMatch(COPY.check);
    await act(async () => press("Enter"));
    expect(spy).toHaveBeenLastCalledWith("6");
    expect(screen.getByText(COPY.rewardPower("Frost Pulse"))).toBeTruthy();
  });

  it("keyboard only on a hundred square: Up/Down one row of ten, Left/Right across rows, tried rows skipped", async () => {
    const spy = vi.fn();
    render(<Harness activity={GRID} initial={[{ answer: "38", correct: false }]} onCheckSpy={spy} />);
    expect(document.querySelector("section.lp")?.className).toBe("lp lp-wide");
    expect(document.querySelector(".lp-grid")).not.toBeNull();
    tab();
    expect(focused()).toBe("1");
    press("ArrowUp"); // from the focused 1, in the top row: nothing to move to
    expect(checked()).toEqual([]);
    press(" "); // Space selects the focused number
    expect(checked()).toEqual(["1"]);
    press("ArrowDown");
    expect(checked()).toEqual(["11"]);
    for (let i = 0; i < 10; i += 1) press("ArrowRight"); // 11 ... 20, then across to the next row
    expect(checked()).toEqual(["21"]);
    press("ArrowDown");
    press("ArrowDown");
    expect(checked()).toEqual(["41"]);
    for (let i = 0; i < 6; i += 1) press("ArrowDown"); // 51 ... 91, then the bottom row: stays
    expect(checked()).toEqual(["91"]);
    press("End");
    expect(checked()).toEqual(["100"]);
    // 38 is tried: from 28, Down jumps to 48
    fireEvent.click(radio("28"));
    press("ArrowDown");
    expect(checked()).toEqual(["48"]);
    tab();
    await act(async () => press("Enter"));
    expect(spy).toHaveBeenLastCalledWith("48");
    expect(screen.getByText(COPY.correct)).toBeTruthy();
  });

  it("Check with no number chosen says so and uses no try", () => {
    const spy = vi.fn();
    render(<Harness activity={TRACK} onCheckSpy={spy} />);
    fireEvent.click(screen.getByRole("button", { name: COPY.check }));
    expect(screen.getByText(COPY.chooseFirst)).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText(COPY.triesLeft(3))).toBeTruthy();
  });
});

// Owner report 2026-11-16: long words overflowed their tiles. The CSS scales text to the tile from --lp-em (the
// widest word in the group, from measured Andika widths) and takes the columns ChoiceArea worked out for each panel
// width band (--lp-cols-xl/-l/-m/-s: above 520 px, above 400, above 300, below). jsdom has no layout, so these check
// the values the CSS reads; the layout itself was checked in Chrome at 320-1440 px.
describe("tiles fit their text", () => {
  const words = (texts: string[]): MultipleChoiceActivity => ({
    interactionType: "MULTIPLE_CHOICE",
    slotId: "N-005",
    prompt: "Which word means full of care?",
    options: texts.map((text, i) => ({ id: "abcdef"[i] ?? "x", text })),
    accepted: ["a"],
    audioRequired: false,
    reward: { credits: 30 },
  });
  const group = () => screen.getByRole("radiogroup");
  const cols = () => ["xl", "l", "m", "s"].map((band) => group().style.getPropertyValue(`--lp-cols-${band}`)).join(",");
  const em = () => group().style.getPropertyValue("--lp-em");

  it("gives short graphemes a row of 4 at full size, 2 a row only in the narrowest panel", () => {
    render(<Harness activity={words(["s", "sh", "ch", "th"])} />);
    expect(group().className.split(" ")).toEqual(["lp-options", "lp-cols-4"]);
    expect(em()).toBe("1.13");
    expect(cols()).toBe("4,4,4,2");
  });

  it("sizes a row by its widest word, and keeps 4 a row only while that word fits at 24 px", () => {
    render(<Harness activity={words(["careful", "careless", "caring", "cared"])} />);
    expect(group()).toHaveProperty("className", "lp-options lp-cols-4");
    expect(em()).toBe("3.98"); // "careless", 3.78 em, plus 5%
    expect(cols()).toBe("4,2,2,1"); // 2 x 2, never 3 + 1
  });

  it("measures letters, not counts them: a row of wide words drops to 2 x 2 where narrow ones keep 4", () => {
    render(<Harness activity={words(["swimming", "mummy", "window", "woman"])} />);
    expect(em()).toBe("4.79"); // "swimming", 0.57 em a letter
    expect(cols()).toBe("2,2,2,1");
  });

  it("sizes a phrase by its widest word, and gives a very long word a row of its own on a phone", () => {
    render(<Harness activity={words(["unhappiness", "happy", "like tree", "kind"])} />);
    expect(em()).toBe("6.06");
    expect(cols()).toBe("2,2,1,1");
  });

  it("lays 5 or 6 options out in 3 columns, 2 on a phone-width panel, 1 in the narrowest", () => {
    render(<Harness activity={words(["knight", "night", "kite", "knot", "nest", "knee"])} />);
    expect(group()).toHaveProperty("className", "lp-options lp-cols-3");
    expect(cols()).toBe("3,3,2,1");
  });

  it("sizes picture captions the same way, and leaves the number board to its own layout", () => {
    render(<Harness activity={PICTURES} />);
    expect(group()).toHaveProperty("className", "lp-options lp-pictures lp-cols-4");
    expect(cols()).toBe("4,2,2,1");
    cleanup();
    render(<Harness activity={GRID} />);
    expect(group()).toHaveProperty("className", "lp-options lp-numbers lp-grid");
    expect(group().style.getPropertyValue("--lp-chars")).toBe("3");
    expect(group().style.getPropertyValue("--lp-cols-xl")).toBe("");
  });

  it("brings the focused number into view when the arrows move it", () => {
    const scrolled = vi.fn();
    const original = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrolled;
    try {
      render(<Harness activity={GRID} />);
      const first = screen.getAllByRole("radio")[0] as HTMLElement;
      first.focus();
      fireEvent.keyDown(first, { key: "ArrowRight" });
      expect(scrolled).toHaveBeenLastCalledWith({ block: "nearest", inline: "nearest" });
    } finally {
      HTMLElement.prototype.scrollIntoView = original;
    }
  });
});

describe("word widths in Andika", () => {
  it("adds the measured widths of the letters", () => {
    expect(wordEm("careless")).toBeCloseTo(3.783, 3);
    expect(wordEm("mummy") / 5).toBeGreaterThan(0.7);
    expect(widestWordEm("like tree")).toBeCloseTo(wordEm("tree"), 3);
    expect(widestWordEm("")).toBe(0);
  });

  it("counts a letter it does not know as wide as W", () => {
    expect(wordEm("é")).toBe(wordEm("W"));
  });
});
