// @vitest-environment jsdom
// The learning panel's states (D6): greyed tries, feedback only once a try is saved, resume from the saved slot,
// and the things that never use up a try.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PANEL_COPY as COPY } from "./copy";
import { LearningPanel, type CheckResult, type PanelActivity, type PanelAttempt, type PanelAudio, type PanelStatus } from "./LearningPanel";

const ACTIVITY: PanelActivity = {
  slotId: "N-001",
  prompt: "Listen. Which letters make this sound?",
  // presentation order from the slot, not the authored order
  options: [
    { id: "c", text: "ch" },
    { id: "a", text: "s" },
    { id: "d", text: "th" },
    { id: "b", text: "sh" },
  ],
  accepted: ["b"],
  audioRequired: true,
  reward: { credits: 30 },
};

function audio(overrides: Partial<PanelAudio> = {}): PanelAudio {
  return { state: "idle", availability: "ready", press: vi.fn(), retry: vi.fn(), ...overrides };
}

/** Holds the "saved slot" the way the run screen does: onCheck records the attempt, then resolves when told to. */
function Harness({
  initial = [],
  playAudio = audio(),
  gate,
  onCheckSpy,
}: {
  initial?: PanelAttempt[];
  playAudio?: PanelAudio | null;
  gate?: { wait: () => Promise<CheckResult> };
  onCheckSpy?: (answer: string) => void;
}) {
  const [attempts, setAttempts] = useState<PanelAttempt[]>(initial);
  const status: PanelStatus = attempts.some((a) => a.correct) ? "SUCCEEDED" : attempts.length >= 3 ? "FAILED" : "UNRESOLVED";
  return (
    <LearningPanel
      activity={ACTIVITY}
      attempts={attempts}
      status={status}
      audio={playAudio}
      onCheck={async (answer) => {
        onCheckSpy?.(answer);
        const result = gate ? await gate.wait() : { kind: "recorded" as const };
        if (result.kind === "recorded") setAttempts((a) => [...a, { answer, correct: ACTIVITY.accepted.includes(answer) }]);
        return result;
      }}
      onContinue={() => undefined}
    />
  );
}

const option = (text: string) => screen.getByRole("radio", { name: new RegExp(`: ${text}(, tried)?$`) });
const check = () => fireEvent.click(screen.getByRole("button", { name: COPY.check }));

afterEach(cleanup);

describe("LearningPanel", () => {
  it("shows the options in the slot's order, numbered, in the reading font, with the heading focused", () => {
    render(<Harness />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.textContent)).toEqual(["1ch", "2s", "3th", "4sh"]);
    expect(radios[0]?.querySelector(".lp-reading")).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: ACTIVITY.prompt }));
    expect(screen.getByText(COPY.triesLeft(3))).toBeTruthy();
  });

  it("Check with nothing chosen, or before Play, uses no try", () => {
    const spy = vi.fn();
    render(<Harness onCheckSpy={spy} />);
    fireEvent.click(option("sh"));
    check();
    expect(screen.getByText(COPY.playFirst)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Play/ }));
    fireEvent.click(option("sh")); // still selected; click keeps it
    expect(spy).not.toHaveBeenCalled();
  });

  it("Check with nothing chosen says so and sends nothing", () => {
    const spy = vi.fn();
    render(<Harness onCheckSpy={spy} initial={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /Play/ }));
    check();
    expect(screen.getByText(COPY.chooseFirst)).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });

  it("feedback waits for the save: 'Checking…' first, then the tried option is greyed and 'Not quite'", async () => {
    let release: (r: CheckResult) => void = () => undefined;
    const gate = { wait: () => new Promise<CheckResult>((resolve) => (release = resolve)) };
    render(<Harness gate={gate} />);
    fireEvent.click(screen.getByRole("button", { name: /Play/ }));
    fireEvent.click(option("s"));
    check();
    expect(screen.getAllByText(COPY.checking).length).toBeGreaterThan(0);
    expect(option("s").getAttribute("aria-label")).not.toMatch(/tried/); // not shown before it is saved
    await act(async () => release({ kind: "recorded" }));
    expect(screen.getByText(COPY.notQuite)).toBeTruthy();
    expect(option("s").getAttribute("aria-label")).toBe("2: s, tried");
    expect(option("s").getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(COPY.triesLeft(2))).toBeTruthy();
  });

  it("a double-click on Check is one try", async () => {
    const spy = vi.fn();
    let release: (r: CheckResult) => void = () => undefined;
    const gate = { wait: () => new Promise<CheckResult>((resolve) => (release = resolve)) };
    render(<Harness gate={gate} onCheckSpy={spy} />);
    fireEvent.click(screen.getByRole("button", { name: /Play/ }));
    fireEvent.click(option("s"));
    check();
    fireEvent.click(screen.getAllByRole("button", { name: COPY.checking })[0] as HTMLElement);
    await act(async () => release({ kind: "recorded" }));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("a tried option cannot be chosen again (client-only guard, D-8)", async () => {
    render(<Harness initial={[{ answer: "a", correct: false }]} />);
    fireEvent.click(option("s"));
    expect(option("s").getAttribute("aria-checked")).toBe("false");
  });

  it("resume: two saved wrong tries show two greyed options and one try left; the third try resolves", async () => {
    render(
      <Harness
        initial={[
          { answer: "a", correct: false },
          { answer: "c", correct: false },
        ]}
      />,
    );
    expect(screen.getAllByText(COPY.tried)).toHaveLength(2);
    expect(option("s").getAttribute("aria-disabled")).toBe("true");
    expect(option("ch").getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByText(COPY.triesLeft(1))).toBeTruthy();
    // a saved try means Play was pressed before the refresh: Check is not blocked again
    fireEvent.click(option("th"));
    await act(async () => check());
    expect(screen.getByText(COPY.failed)).toBeTruthy();
    expect(document.querySelector(".lp-answer")?.closest("p")?.textContent).toBe(`${COPY.answerWas} sh.`);
    expect(option("sh").className).toContain("is-answer");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: COPY.continue }));
  });

  it("a right answer: 'You got it!' and the reward line, once", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Play/ }));
    fireEvent.click(option("sh"));
    await act(async () => check());
    expect(screen.getByText(COPY.correct)).toBeTruthy();
    expect(screen.getByText(COPY.rewardCredits(30))).toBeTruthy();
    expect(screen.queryByRole("button", { name: COPY.check })).toBeNull();
  });

  it("Check and Continue pair the word with a symbol (D6.1), hidden from screen readers", async () => {
    render(<Harness />);
    const checkButton = screen.getByRole("button", { name: COPY.check });
    expect(checkButton.querySelector("[aria-hidden='true']")?.textContent?.trim()).toBe("✓");
    fireEvent.click(screen.getByRole("button", { name: /Play/ }));
    fireEvent.click(option("sh"));
    await act(async () => check());
    const continueButton = screen.getByRole("button", { name: COPY.continue });
    expect(continueButton.querySelector("[aria-hidden='true']")?.textContent).toBe("➜");
  });

  it("not saved: says so, uses no try, and Check can be pressed again", async () => {
    const gate = { wait: async (): Promise<CheckResult> => ({ kind: "not-saved" }) };
    render(<Harness gate={gate} />);
    fireEvent.click(screen.getByRole("button", { name: /Play/ }));
    fireEvent.click(option("s"));
    await act(async () => check());
    expect(screen.getByText(COPY.notSaved)).toBeTruthy();
    expect(screen.getByText(COPY.triesLeft(3))).toBeTruthy();
  });

  it("required sound not here yet: the answer area waits; a failure offers Try again (never a try)", () => {
    const loading = audio({ availability: "checking" });
    const { rerender } = render(<Harness playAudio={loading} />);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getAllByText(COPY.loading).length).toBeGreaterThan(0);
    const failed = audio({ availability: "failed" });
    rerender(<Harness playAudio={failed} />);
    fireEvent.click(screen.getAllByRole("button", { name: COPY.tryAgain })[0] as HTMLElement);
    expect(failed.retry).toHaveBeenCalledTimes(1);
    expect(screen.getByText(COPY.triesLeft(3))).toBeTruthy();
  });

  it("the Play button follows the clip: Loading, Stop, Play again, and the failure line", () => {
    const states: PanelAudio["state"][] = ["loading", "playing", "played", "failed"];
    const labels = [COPY.loading, COPY.stop, COPY.playAgain, COPY.tryAgain];
    states.forEach((state, i) => {
      const { unmount } = render(<Harness playAudio={audio({ state })} />);
      expect(screen.getAllByRole("button", { name: new RegExp(labels[i] ?? "") }).length).toBeGreaterThan(0);
      if (state === "failed") expect(screen.getByText(COPY.soundFailed)).toBeTruthy();
      unmount();
    });
  });

  it("keyboard: digits pick by badge, arrows skip tried options", () => {
    render(<Harness initial={[{ answer: "a", correct: false }]} />);
    const group = screen.getByRole("radiogroup");
    fireEvent.keyDown(group, { key: "1" });
    expect(option("ch").getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(group, { key: "ArrowRight" }); // skips "s" (tried)
    expect(option("th").getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(group, { key: "2" }); // "s" is tried: nothing changes
    expect(option("th").getAttribute("aria-checked")).toBe("true");
  });
});
