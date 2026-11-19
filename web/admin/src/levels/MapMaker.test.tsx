// @vitest-environment jsdom
// Map tab → Make a map for me (Gate M, LD14): the choices reach the generator, the map number is its seed, and a map
// that cannot be made says why.
import { mapProblems, type GeneratedMap } from "@scd/game-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { newLevel } from "./levelFile";
import { MapMaker } from "./MapMaker";

afterEach(cleanup);

type Made = Pick<GeneratedMap, "route" | "pads" | "decorations">;
const asMap = (m: Made) => ({ name: "", grid: { cols: 20, rows: 11 }, route: m.route, pads: m.pads, art: { backdrop: null, decorations: m.decorations } });

function open(level = newLevel("lvl", "Level", "blank")) {
  const onMake = vi.fn<(map: Made) => void>();
  render(<MapMaker level={level} libraryDecorations={[]} onMake={onMake} firstSeed={5} />);
  fireEvent.click(screen.getByText("Make only a new map"));
  return onMake;
}

describe("MapMaker", () => {
  it("makes a map that meets the rules, and the same one again from the same map number", () => {
    const onMake = open();
    fireEvent.click(screen.getByRole("button", { name: "Make a map" }));
    const first = onMake.mock.calls[0]?.[0] as Made;
    expect(first.pads).toHaveLength(14);
    expect(mapProblems(asMap(first)).filter((p) => p.severity !== "warn")).toEqual([]);
    expect(screen.getByRole("status").textContent).toMatch(/^Map 5 is in\. .* Ctrl\+Z puts back the map you had\.$/u);
    fireEvent.click(screen.getByRole("button", { name: "Make a map" }));
    expect(onMake.mock.calls[1]?.[0]).toEqual(first);
  });

  it("Another one moves to the next map number", () => {
    const onMake = open();
    fireEvent.click(screen.getByRole("button", { name: "Another one" }));
    expect((screen.getByLabelText("Map number") as HTMLInputElement).value).toBe("6");
    expect(onMake).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toMatch(/^Map 6 is in\./u);
  });

  it("passes the choices on: pads, decorations, and the colony's edge", () => {
    const onMake = open();
    fireEvent.change(screen.getByLabelText("Pads"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Decorations"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Colony on"), { target: { value: "bottom" } });
    fireEvent.click(screen.getByRole("button", { name: "Make a map" }));
    const map = onMake.mock.calls[0]?.[0] as Made;
    expect(map.pads).toHaveLength(12);
    expect(map.decorations).toEqual([]);
    expect(map.route[map.route.length - 1]?.[1]).toBe(10);
  });

  it("keeps the designer's route when asked, and says why when that route cannot be used", () => {
    const level = newLevel("lvl", "Level", "moonbeam-campaign");
    const onMake = open(level);
    fireEvent.click(screen.getByLabelText(/Keep my route/u));
    fireEvent.click(screen.getByRole("button", { name: "Make a map" }));
    expect(onMake.mock.calls[0]?.[0].route).toEqual(level.map.route);
    cleanup();

    const broken = newLevel("lvl", "Level", "blank");
    broken.map.route = [[0, 5], [10, 5]];
    const never = open(broken);
    fireEvent.click(screen.getByLabelText(/Keep my route/u));
    fireEvent.click(screen.getByRole("button", { name: "Make a map" }));
    expect(never).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Your route has a problem to fix first, so pads cannot be placed around it.");
  });

  it("offers Keep my route only when there is a route, and My decorations only when there are some", () => {
    open();
    expect((screen.getByLabelText(/Keep my route/u) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("option", { name: "My decorations" }) as HTMLOptionElement).disabled).toBe(true);
  });
});
