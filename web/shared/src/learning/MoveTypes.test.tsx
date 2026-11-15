// @vitest-environment jsdom
// Phase 38 (M3-03 part 2): OBJECT_MOVE (share, sort), ARRANGE (letters, sequence), TYPED (number, word) and two-step
// activities in the learning panel, each operated mouse-only and keyboard-only (D6.3), with no drag anywhere, the
// "You've tried that one" guard, answers that stay after a wrong try, and resume from the saved slot.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArrangeActivity, DistributeActivity, MultipleChoiceActivity, SortActivity, TypedActivity } from "./activity";
import { PANEL_COPY as COPY } from "./copy";
import { press, tab } from "./keyboardTesting";
import { LearningPanel, type CheckResult, type PanelActivity, type PanelAttempt, type PanelStatus } from "./LearningPanel";

afterEach(cleanup);

const common = { audioRequired: false, reward: { credits: 30 } } as const;

const SHARE: DistributeActivity = {
  ...common,
  interactionType: "OBJECT_MOVE",
  mode: "DISTRIBUTE",
  slotId: "N-004",
  prompt: "Share the stars fairly.",
  object: { imageUrl: "/assets/activity/obj-star.png", alt: "a star" },
  sourceCount: 6,
  zones: [
    { id: "z1", label: "Nova" },
    { id: "z2", label: "Pip" },
  ],
  requireAllPlaced: true,
  accepted: ["z1=3;z2=3"],
};

const COUNT: DistributeActivity = {
  ...SHARE,
  slotId: "N-005",
  prompt: "Put 3 stars in the rocket.",
  sourceCount: 8,
  zones: [{ id: "z1", label: "Rocket" }],
  requireAllPlaced: false,
  accepted: ["z1=3"],
};

const SORT: SortActivity = {
  ...common,
  interactionType: "OBJECT_MOVE",
  mode: "SORT",
  slotId: "N-002",
  prompt: "Sort by the sound of ea.",
  objects: [
    { id: "o1", text: "sea", alt: "sea" },
    { id: "o2", text: "head", alt: "head" },
    { id: "o3", text: "dream", alt: "dream" },
    { id: "o4", text: "bread", alt: "bread" },
  ],
  bins: [
    { id: "ee", label: "like tree" },
    { id: "e", label: "like bed" },
  ],
  accepted: ["o1=ee;o2=e;o3=ee;o4=e"],
};

const LETTERS: ArrangeActivity = {
  ...common,
  interactionType: "ARRANGE",
  mode: "LETTERS",
  slotId: "N-003",
  prompt: "Build the word.",
  tiles: [
    { id: "t1", value: "t", text: "t" },
    { id: "t2", value: "o", text: "o" },
    { id: "t3", value: "c", text: "c" },
    { id: "t4", value: "a", text: "a" },
    { id: "t5", value: "n", text: "n" },
  ],
  slots: 3,
  cue: { imageUrl: "/assets/activity/pic-cat.png", alt: "a cat" },
  accepted: ["cat"],
};

const ORDER: ArrangeActivity = {
  ...common,
  interactionType: "ARRANGE",
  mode: "SEQUENCE",
  slotId: "N-004",
  prompt: "Put the numbers in order.",
  tiles: [
    { id: "a", value: "38", text: "38" },
    { id: "b", value: "83", text: "83" },
    { id: "c", value: "30", text: "30" },
    { id: "d", value: "80", text: "80" },
  ],
  slots: 4,
  orderLabel: "smallest first",
  accepted: ["30,38,80,83"],
};

const NUMERIC: TypedActivity = {
  ...common,
  interactionType: "TYPED",
  mode: "NUMERIC",
  slotId: "N-001",
  prompt: "7 = ? − 9",
  maxLength: 2,
  caseSensitive: false,
  accepted: ["16"],
};

const WORD: TypedActivity = {
  ...common,
  interactionType: "TYPED",
  mode: "WORD",
  slotId: "N-003",
  prompt: "Add the ending.",
  maxLength: 12,
  caseSensitive: false,
  cue: { text: "hop + ing" },
  accepted: ["hopping"],
};

const TWO_STEP: MultipleChoiceActivity = {
  ...common,
  interactionType: "MULTIPLE_CHOICE",
  slotId: "M-009",
  prompt: "Two parts. Do both, then press Check.",
  partPrompt: "Which number is in the 5 times table?",
  options: [
    { id: "a", text: "12" },
    { id: "b", text: "18" },
    { id: "c", text: "25" },
    { id: "d", text: "32" },
  ],
  accepted: ["c|30"],
  reward: { credits: 0, powerName: "Frost Pulse" },
  additionalStep: { interactionType: "TYPED", mode: "NUMERIC", maxLength: 2, caseSensitive: false, prompt: "5 × 6 = ?", accepted: [] },
};

function Harness({ activity, initial = [], onCheckSpy }: { activity: PanelActivity; initial?: PanelAttempt[]; onCheckSpy?: (answer: string) => void }) {
  const [attempts, setAttempts] = useState<PanelAttempt[]>(initial);
  const status: PanelStatus = attempts.some((a) => a.correct) ? "SUCCEEDED" : attempts.length >= 3 ? "FAILED" : "UNRESOLVED";
  return (
    <LearningPanel
      activity={activity}
      attempts={attempts}
      status={status}
      onCheck={async (answer): Promise<CheckResult> => {
        onCheckSpy?.(answer);
        setAttempts((a) => [...a, { answer, correct: activity.accepted.includes(answer) }]);
        return { kind: "recorded" };
      }}
      onContinue={() => undefined}
    />
  );
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const checkButton = () => button(COPY.check);
const focusedName = () => (document.activeElement as HTMLElement | null)?.getAttribute("aria-label") ?? document.activeElement?.textContent;
async function clickCheck() {
  await act(async () => fireEvent.click(checkButton()));
}
/** Tab until the focused element is the one wanted (fails after a full round). */
function tabTo(match: (el: HTMLElement) => boolean): HTMLElement {
  for (let i = 0; i < 60; i += 1) {
    const el = tab();
    if (match(el)) return el;
  }
  throw new Error("not reachable with Tab");
}

describe("OBJECT_MOVE share (DISTRIBUTE)", () => {
  it("mouse only: click a star, then a zone; click a placed star to send it back; Check sends the zone counts", async () => {
    const spy = vi.fn();
    render(<Harness activity={SHARE} onCheckSpy={spy} />);
    expect(screen.getAllByRole("button", { name: COPY.trayObject("a star") })).toHaveLength(6);
    // incomplete: nothing moved
    await clickCheck();
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText(COPY.moveFirst)).toBeTruthy();
    expect(checkButton().getAttribute("aria-disabled")).toBe("true");
    for (let i = 0; i < 3; i += 1) {
      fireEvent.click(screen.getAllByRole("button", { name: COPY.trayObject("a star") })[0]!);
      fireEvent.click(button(/^Nova/));
    }
    for (let i = 0; i < 4; i += 1) fireEvent.click(button(/^Pip/));
    expect(button(/^Pip/).getAttribute("aria-label")).toBe(COPY.zoneName("Pip", 3)); // only six stars
    expect(screen.getByText(COPY.noneLeft)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: COPY.placedObject("a star", "Pip") })[0]!);
    expect(button(/^Pip/).getAttribute("aria-label")).toBe(COPY.zoneName("Pip", 2));
    await clickCheck();
    expect(spy).not.toHaveBeenCalled(); // all six must be placed
    fireEvent.click(button(/^Pip/));
    await clickCheck();
    expect(spy).toHaveBeenLastCalledWith("z1=3;z2=3");
    expect(screen.getByText(COPY.correct)).toBeTruthy();
  });

  it("keyboard only: Tab to a zone, + or Enter puts one in, - or Backspace takes one out; the count is said, not shown", async () => {
    const spy = vi.fn();
    render(<Harness activity={SHARE} onCheckSpy={spy} />);
    tabTo((el) => el.getAttribute("aria-label")?.startsWith("Nova") ?? false);
    press("+");
    press("Enter");
    press("=");
    press("+");
    expect(focusedName()).toBe(COPY.zoneName("Nova", 4));
    press("Backspace");
    expect(focusedName()).toBe(COPY.zoneName("Nova", 3));
    expect(screen.getByText(COPY.movedOut("Nova", 3))).toBeTruthy();
    tab();
    expect(focusedName()).toBe(COPY.zoneName("Pip", 0));
    press("+");
    press("+");
    press("+");
    press("+"); // only six stars
    expect(screen.getByText(COPY.noneLeft)).toBeTruthy();
    press("-");
    press("+");
    // the zone shows stars, never the numeral
    expect(within(button(/^Pip/).closest(".lp-zone") as HTMLElement).queryByText("3")).toBeNull();
    expect(tab().textContent).toMatch(COPY.check);
    await act(async () => press("Enter"));
    expect(spy).toHaveBeenLastCalledWith("z1=3;z2=3");
  });

  it("mouse only: a click in the big box under a zone's name drops there too; a click on a placed star still sends it back", async () => {
    render(<Harness activity={SHARE} />);
    const box = (name: RegExp) => button(name).closest(".lp-zone")!.querySelector(".lp-zone-objects")!;
    fireEvent.click(screen.getAllByRole("button", { name: COPY.trayObject("a star") })[0]!);
    fireEvent.click(box(/^Nova/));
    expect(button(/^Nova/).getAttribute("aria-label")).toBe(COPY.zoneName("Nova", 1));
    fireEvent.click(button(/^Nova/).closest(".lp-zone")!);
    expect(button(/^Nova/).getAttribute("aria-label")).toBe(COPY.zoneName("Nova", 2));
    fireEvent.click(screen.getAllByRole("button", { name: COPY.placedObject("a star", "Nova") })[0]!);
    expect(button(/^Nova/).getAttribute("aria-label")).toBe(COPY.zoneName("Nova", 1)); // not put back in by the box
  });

  it("one zone: a click on a star moves it straight in; a wrong count stays after the try, and the same count is blocked", async () => {
    const spy = vi.fn();
    render(<Harness activity={COUNT} onCheckSpy={spy} />);
    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getAllByRole("button", { name: COPY.trayObject("a star") })[0]!);
    expect(button(/^Rocket/).getAttribute("aria-label")).toBe(COPY.zoneName("Rocket", 4));
    await clickCheck();
    expect(spy).toHaveBeenLastCalledWith("z1=4");
    expect(screen.getByText(COPY.notQuite)).toBeTruthy();
    expect(button(/^Rocket/).getAttribute("aria-label")).toBe(COPY.zoneName("Rocket", 4)); // stays
    await clickCheck();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByText(COPY.triedThat)).toBeTruthy();
  });
});

describe("OBJECT_MOVE sort (SORT)", () => {
  it("mouse only: click a word (it lifts), click a bin (it drops); Back to the start returns it", async () => {
    const spy = vi.fn();
    render(<Harness activity={SORT} onCheckSpy={spy} />);
    const word = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}, `) });
    fireEvent.click(word("sea"));
    expect(word("sea").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(button(COPY.binDrop("like tree")));
    expect(word("sea").getAttribute("aria-label")).toBe("sea, like tree");
    fireEvent.click(word("head"));
    fireEvent.click(button(COPY.binDrop("like tree")));
    fireEvent.click(word("head"));
    fireEvent.click(button(COPY.trayDrop));
    expect(word("head").getAttribute("aria-label")).toBe(`head, ${COPY.notSorted}`);
    await clickCheck();
    expect(screen.getByText(COPY.moveFirst)).toBeTruthy();
    for (const [name, bin] of [["head", "like bed"], ["dream", "like tree"], ["bread", "like bed"]] as const) {
      fireEvent.click(word(name));
      fireEvent.click(button(COPY.binDrop(bin)));
    }
    await clickCheck();
    expect(spy).toHaveBeenLastCalledWith("o1=ee;o2=e;o3=ee;o4=e");
    expect(screen.getByText(COPY.correct)).toBeTruthy();
  });

  it("mouse only: a click in the big box under a bin's name drops the lifted word there", () => {
    render(<Harness activity={SORT} />);
    const word = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}, `) });
    const box = (bin: string) => button(COPY.binDrop(bin)).closest(".lp-bin")!.querySelector(".lp-bin-objects")!;
    fireEvent.click(box("like bed")); // nothing lifted: nothing happens
    expect(word("head").getAttribute("aria-label")).toBe(`head, ${COPY.notSorted}`);
    fireEvent.click(word("head"));
    fireEvent.click(box("like bed"));
    expect(word("head").getAttribute("aria-label")).toBe("head, like bed");
  });

  it("keyboard only: arrows through the words, Enter lifts, arrows choose a bin, Enter drops; digits; 0; Esc cancels", async () => {
    const spy = vi.fn();
    render(<Harness activity={SORT} onCheckSpy={spy} />);
    tabTo((el) => el.getAttribute("aria-label")?.startsWith("sea") ?? false);
    press("Enter"); // lift sea
    expect(focusedName()).toBe(COPY.binDrop("like tree"));
    press("ArrowRight");
    expect(focusedName()).toBe(COPY.binDrop("like bed"));
    press("ArrowLeft");
    press("Enter"); // drop in like tree
    expect(focusedName()).toBe("sea, like tree");
    press("ArrowRight");
    expect(focusedName()).toBe(`head, ${COPY.notSorted}`);
    press("Enter");
    press("Escape"); // cancel: head stays where it was
    expect(focusedName()).toBe(`head, ${COPY.notSorted}`);
    expect(screen.getByText(COPY.dropCancelled)).toBeTruthy();
    press("2"); // like bed
    expect(focusedName()).toBe("head, like bed");
    press("0"); // back to the start
    expect(focusedName()).toBe(`head, ${COPY.notSorted}`);
    press("2");
    press("ArrowRight");
    press("1");
    press("ArrowRight");
    press("2");
    expect(focusedName()).toBe("bread, like bed");
    tabTo((el) => el.textContent?.includes(COPY.check) ?? false);
    await act(async () => press("Enter"));
    expect(spy).toHaveBeenLastCalledWith("o1=ee;o2=e;o3=ee;o4=e");
  });
});

describe("ARRANGE letters", () => {
  it("shows the cue picture and lower-case letter tiles (D-7: tiles, not typing, at age 5)", () => {
    render(<Harness activity={LETTERS} />);
    expect(screen.getByRole("img", { name: "a cat" })).toBeTruthy();
    expect(within(screen.getByRole("group", { name: COPY.tilesLabel })).getAllByRole("button").map((b) => b.textContent)).toEqual(["t", "o", "c", "a", "n"]);
    expect(screen.getAllByRole("button", { name: /^Space \d of 3, empty$/ })).toHaveLength(3);
  });

  it("mouse only: a click fills the next space, a click on a placed tile sends it back; wrong word stays with Tried", async () => {
    const spy = vi.fn();
    render(<Harness activity={LETTERS} onCheckSpy={spy} />);
    fireEvent.click(button("c"));
    fireEvent.click(button("o"));
    await clickCheck();
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText(COPY.fillFirst)).toBeTruthy();
    fireEvent.click(button("t"));
    expect(screen.getByText(COPY.placed("t", 3, 3))).toBeTruthy();
    await clickCheck();
    expect(spy).toHaveBeenLastCalledWith("cot");
    expect(screen.getByText(COPY.notQuite)).toBeTruthy();
    expect(screen.getByText(COPY.triedList(["cot"]))).toBeTruthy();
    expect(button("Space 2 of 3: o")).toBeTruthy(); // the arrangement stays
    await clickCheck();
    expect(screen.getByText(COPY.triedThat)).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(1);
    fireEvent.click(button("Space 2 of 3: o"));
    fireEvent.click(button("Space 3 of 3: t"));
    fireEvent.click(button("a"));
    fireEvent.click(button("t"));
    await clickCheck();
    expect(spy).toHaveBeenLastCalledWith("cat");
    expect(screen.getByText(COPY.correct)).toBeTruthy();
  });

  it("keyboard only: typing a letter places the first free tile; Backspace takes the last back; Enter lifts and moves in the spaces", async () => {
    const spy = vi.fn();
    render(<Harness activity={LETTERS} onCheckSpy={spy} />);
    tabTo((el) => el.getAttribute("aria-label") === "t" && el.className.includes("lp-tile"));
    press("A"); // capitals are the same letter
    press("c");
    press("t");
    expect(screen.getByRole("button", { name: "Space 1 of 3: a" })).toBeTruthy();
    press("Backspace");
    expect(screen.getByRole("button", { name: "Space 3 of 3, empty" })).toBeTruthy();
    press("t");
    // every space is full, so the keyboard is in the spaces row: a, c, t -> lift a, move it right once, put it down
    expect(focusedName()).toBe("Space 3 of 3: t");
    press("Home");
    expect(focusedName()).toBe("Space 1 of 3: a");
    press("Enter");
    expect(screen.getByText(COPY.liftedTile("a"))).toBeTruthy();
    press("ArrowRight");
    press("Enter");
    expect(focusedName()).toBe("Space 2 of 3: a");
    expect(screen.getByRole("button", { name: "Space 1 of 3: c" })).toBeTruthy();
    tabTo((el) => el.textContent?.includes(COPY.check) ?? false);
    await act(async () => press("Enter"));
    expect(spy).toHaveBeenLastCalledWith("cat");
  });

  it("keyboard only, grapheme tiles: typing r, a, i, n builds r + ai + n (no letter is dropped)", async () => {
    const RAIN: ArrangeActivity = {
      ...LETTERS,
      tiles: ["n", "ay", "r", "a", "ai"].map((value, i) => ({ id: `g${i + 1}`, value, text: value })),
      cue: { imageUrl: "/assets/activity/pic-rain.png", alt: "rain" },
      accepted: ["rain"],
    };
    const spy = vi.fn();
    render(<Harness activity={RAIN} onCheckSpy={spy} />);
    tabTo((el) => el.className.includes("lp-tile"));
    for (const key of ["r", "a", "i", "n"]) press(key);
    expect(screen.getByRole("button", { name: "Space 2 of 3: ai" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Space 3 of 3: n" })).toBeTruthy();
    tabTo((el) => el.textContent?.includes(COPY.check) ?? false);
    await act(async () => press("Enter"));
    expect(spy).toHaveBeenLastCalledWith("rain");
  });

  it("keyboard only: arrows and Enter in the tiles; Esc puts a lifted tile back; Delete sends one back", async () => {
    render(<Harness activity={LETTERS} />);
    tabTo((el) => el.className.includes("lp-tile"));
    press("ArrowRight"); // o
    press("ArrowRight"); // c
    press("Enter");
    expect(screen.getByRole("button", { name: "Space 1 of 3: c" })).toBeTruthy();
    expect(focusedName()).toBe("a"); // the next free tile
    press(" ");
    tab(true);
    press("Enter");
    press("ArrowRight");
    press("Escape");
    expect(screen.getByRole("button", { name: "Space 1 of 3: c" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Space 2 of 3: a" })).toBeTruthy();
    press("Delete");
    expect(screen.getByRole("button", { name: "Space 1 of 3, empty" })).toBeTruthy();
  });

  it("resume: the last wrong arrangement is rebuilt from the recorded word", () => {
    render(<Harness activity={LETTERS} initial={[{ answer: "cot", correct: false }]} />);
    expect(screen.getByRole("button", { name: "Space 1 of 3: c" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Space 2 of 3: o" })).toBeTruthy();
    expect(screen.getByText(COPY.triedList(["cot"]))).toBeTruthy();
  });

  it("after three wrong tries the word is shown assembled", () => {
    render(
      <Harness
        activity={LETTERS}
        initial={[
          { answer: "cot", correct: false },
          { answer: "act", correct: false },
          { answer: "tan", correct: false },
        ]}
      />,
    );
    expect(document.querySelector(".lp-answer")?.textContent).toBe("cat");
    // D6.4: the spaces themselves show the word, not the last wrong try
    expect(screen.getByRole("button", { name: "Space 1 of 3: c" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Space 2 of 3: a" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Space 3 of 3: t" })).toBeTruthy();
  });
});

describe("ARRANGE sequence", () => {
  it("keyboard only: arrows and Enter place in order; letter keys do nothing; Check sends values joined by commas", async () => {
    const spy = vi.fn();
    render(<Harness activity={ORDER} onCheckSpy={spy} />);
    expect(screen.getByText("smallest first")).toBeTruthy();
    tabTo((el) => el.className.includes("lp-tile"));
    press("c"); // no letter typing in a sequence
    expect(screen.getAllByRole("button", { name: /empty$/ })).toHaveLength(4);
    press("ArrowRight");
    press("ArrowRight"); // 30
    press("Enter");
    expect(focusedName()).toBe("80"); // the next free tile
    press("ArrowLeft");
    press("ArrowLeft"); // 38
    press("Enter");
    expect(focusedName()).toBe("83");
    press("ArrowRight"); // 80
    press("Enter");
    press("Enter"); // 83, the last one
    tabTo((el) => el.textContent?.includes(COPY.check) ?? false);
    await act(async () => press("Enter"));
    expect(spy).toHaveBeenLastCalledWith("30,38,80,83");
  });

  it("mouse only", async () => {
    const spy = vi.fn();
    render(<Harness activity={ORDER} onCheckSpy={spy} />);
    for (const n of ["83", "80", "38", "30"]) fireEvent.click(button(n));
    await clickCheck();
    expect(spy).toHaveBeenLastCalledWith("83,80,38,30");
    expect(screen.getByText(COPY.triedList(["83,80,38,30"]))).toBeTruthy();
  });
});

describe("TYPED", () => {
  it("the box has spellcheck, autocorrect, autocomplete and autocapitalise off", () => {
    render(<Harness activity={WORD} />);
    const box = screen.getByRole("textbox", { name: WORD.prompt });
    expect(box.getAttribute("spellcheck")).toBe("false");
    expect(box.getAttribute("autocorrect")).toBe("off");
    expect(box.getAttribute("autocomplete")).toBe("off");
    expect(box.getAttribute("autocapitalize")).toBe("off");
    expect(screen.getByText("hop + ing")).toBeTruthy();
  });

  it("number, mouse only: keypad digits, Delete, Check; a leading zero is dropped", async () => {
    const spy = vi.fn();
    render(<Harness activity={NUMERIC} onCheckSpy={spy} />);
    const pad = within(screen.getByRole("group", { name: COPY.keypadLabel }));
    await clickCheck();
    expect(screen.getByText(COPY.typeFirst)).toBeTruthy();
    fireEvent.click(pad.getByRole("button", { name: "0" }));
    fireEvent.click(pad.getByRole("button", { name: "9" }));
    fireEvent.click(pad.getByRole("button", { name: "9" })); // maxLength 2
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("09");
    await clickCheck();
    expect(spy).toHaveBeenLastCalledWith("9");
    expect(screen.getByText(COPY.triedList(["9"]))).toBeTruthy();
    fireEvent.click(pad.getByRole("button", { name: COPY.deleteKey }));
    fireEvent.click(pad.getByRole("button", { name: COPY.deleteKey }));
    fireEvent.click(pad.getByRole("button", { name: "1" }));
    fireEvent.click(pad.getByRole("button", { name: "6" }));
    await clickCheck();
    expect(spy).toHaveBeenLastCalledWith("16");
    expect(screen.getByText(COPY.correct)).toBeTruthy();
  });

  it("number, keyboard only: Tab to the box, type, Enter is Check; letters cannot be typed in", async () => {
    const spy = vi.fn();
    render(<Harness activity={NUMERIC} onCheckSpy={spy} />);
    const box = tab() as HTMLInputElement;
    expect(box).toBe(screen.getByRole("textbox"));
    fireEvent.change(box, { target: { value: "1a6" } });
    expect(box.value).toBe("16");
    await act(async () => press("Enter"));
    expect(spy).toHaveBeenLastCalledWith("16");
  });

  it("word: capitals typed become lower case; the keypad is lower case; the same answer twice is blocked", async () => {
    const spy = vi.fn();
    render(<Harness activity={WORD} onCheckSpy={spy} />);
    const pad = within(screen.getByRole("group", { name: COPY.keypadLabel }));
    expect(pad.getAllByRole("button").slice(0, 3).map((b) => b.textContent)).toEqual(["a", "b", "c"]);
    const box = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "Hoping" } });
    box.focus();
    await act(async () => press("Enter"));
    expect(spy).toHaveBeenLastCalledWith("hoping");
    expect(box.value).toBe("Hoping"); // the answer stays
    fireEvent.change(box, { target: { value: " hoping " } });
    await act(async () => press("Enter"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByText(COPY.triedThat)).toBeTruthy();
    fireEvent.change(box, { target: { value: "Hopping" } });
    await act(async () => press("Enter"));
    expect(spy).toHaveBeenLastCalledWith("hopping");
    expect(screen.getByText(COPY.correct)).toBeTruthy();
  });
});

describe("two-step (C20.3)", () => {
  it("both parts on one panel, one Check; a right part is locked with a tick, a wrong one says try again", async () => {
    const spy = vi.fn();
    render(<Harness activity={TWO_STEP} onCheckSpy={spy} />);
    expect(screen.getByRole("heading", { name: TWO_STEP.partPrompt ?? "" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "5 × 6 = ?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "3: 25" }));
    await clickCheck();
    expect(spy).not.toHaveBeenCalled(); // the second part is not done
    expect(screen.getByText(COPY.typeFirst)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "5 × 6 = ?" }), { target: { value: "35" } });
    await clickCheck();
    expect(spy).toHaveBeenLastCalledWith("c|35");
    expect(screen.getByText(COPY.partRight)).toBeTruthy();
    expect(screen.getByText(COPY.partAgain)).toBeTruthy();
    expect(screen.getByText(COPY.triesLeft(2))).toBeTruthy();
    // part one is locked: still chosen, cannot change
    fireEvent.click(screen.getByRole("radio", { name: "1: 12" }));
    expect(screen.getByRole("radio", { name: "3: 25" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.change(screen.getByRole("textbox", { name: "5 × 6 = ?" }), { target: { value: "30" } });
    await clickCheck();
    expect(spy).toHaveBeenLastCalledWith("c|30");
    expect(screen.getByText(COPY.rewardPower("Frost Pulse"))).toBeTruthy();
  });

  it("a wrong first part is cleared and greyed for that part only; keyboard reaches both parts", async () => {
    const spy = vi.fn();
    render(<Harness activity={TWO_STEP} onCheckSpy={spy} />);
    tab();
    expect(focusedName()).toBe("1: 12");
    press("1");
    const box = tab();
    expect(box).toBe(screen.getByRole("textbox"));
    fireEvent.change(box, { target: { value: "30" } });
    await act(async () => press("Enter"));
    expect(spy).toHaveBeenLastCalledWith("a|30");
    expect(screen.getByRole("radio", { name: "1: 12, tried" })).toBeTruthy();
    expect(screen.getByText(COPY.partAgain)).toBeTruthy();
    expect(screen.getByText(COPY.partRight)).toBeTruthy(); // the typed part was right
  });

  it("resume: the per-part marks and the locked part come back from the recorded answer", () => {
    render(<Harness activity={TWO_STEP} initial={[{ answer: "c|35", correct: false }]} />);
    expect(screen.getByRole("radio", { name: "3: 25" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(COPY.partRight)).toBeTruthy();
    expect(screen.getByText(COPY.partAgain)).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("35");
  });

  it("after three wrong tries the answer names both parts", () => {
    render(
      <Harness
        activity={TWO_STEP}
        initial={[
          { answer: "a|30", correct: false },
          { answer: "b|30", correct: false },
          { answer: "c|35", correct: false },
        ]}
      />,
    );
    expect(document.querySelector(".lp-answer")?.textContent).toBe("25 and 30");
  });
});
