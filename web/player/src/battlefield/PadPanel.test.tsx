// @vitest-environment jsdom
// The pad panel's Aim buttons (C5.3): each one is explained by a short sentence shown on hover and keyboard focus,
// which a screen reader reads as the button's description.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { bridgeWith } from "../hud/testing";
import { AIM_TIPS, PadPanel } from "./PadPanel";

afterEach(cleanup);

describe("PadPanel aim choices", () => {
  it("describes Front and Fastest on Nova's aim buttons", () => {
    const bridge = bridgeWith(500);
    act(() => {
      bridge.place("p01", "nova");
      bridge.selectPad("p01");
    });
    render(<PadPanel bridge={bridge} credits={500} onSendHome={() => {}} />);
    const front = screen.getByRole("button", { name: "Front" });
    const fastest = screen.getByRole("button", { name: "Fastest" });
    expect(document.getElementById(front.getAttribute("aria-describedby") ?? "")?.textContent).toBe(AIM_TIPS.FRONT);
    expect(document.getElementById(fastest.getAttribute("aria-describedby") ?? "")?.textContent).toBe(AIM_TIPS.FAST);
    expect(screen.getAllByRole("tooltip", { hidden: true }).map((t) => t.textContent)).toEqual([AIM_TIPS.FRONT, AIM_TIPS.FAST]);
  });
});
