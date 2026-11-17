// @vitest-environment jsdom
// Levels → Planets (Gate M, LD10): the released planets in unlock order, Add planet, and Release only once the newest
// version has the full campaign, after a question that says the order is for good.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeAdminApi } from "../../testing/fakeApi";
import { PlanetsPage } from "./PlanetsPage";

let fake: FakeAdminApi;
beforeEach(() => {
  fake = new FakeAdminApi();
});
afterEach(cleanup);

const rowOf = (name: string) => screen.getByRole("rowheader", { name: new RegExp(name, "u") }).closest("tr")!;

describe("PlanetsPage", () => {
  it("lists luna-1 as released first and adds a planet with its ID from the name", async () => {
    render(<PlanetsPage api={fake.api} />);
    await screen.findByRole("rowheader", { name: /luna-1/u });
    expect(within(rowOf("luna-1")).getByText("Released, number 1")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Name/u), { target: { value: "Red Dust" } });
    expect((screen.getByLabelText(/^ID/u) as HTMLInputElement).value).toBe("red-dust");
    await act(async () => screen.getByRole("button", { name: "Add planet" }).click());
    expect(fake.callsNamed("createPlanet")[0]?.args[0]).toEqual({ planetId: "red-dust", name: "Red Dust", icon: null, artSet: "moon", backdrop: null });
    expect(await screen.findByText("Planet Red Dust added. Make its levels next.")).toBeTruthy();
    expect(within(rowOf("Red Dust")).getByText("Nothing published yet")).toBeTruthy();
  });

  it("Release stays off until the campaign is complete, then asks first", async () => {
    fake.planets.set("mars-1", { planetId: "mars-1", name: "Red Dust", status: "DRAFT", latestVersion: "mars-1-a2", campaignWaves: 30, readyToRelease: false });
    render(<PlanetsPage api={fake.api} />);
    await screen.findByRole("rowheader", { name: /Red Dust/u });
    expect(within(rowOf("Red Dust")).getByText("mars-1-a2 (campaign: 30 of 50 waves)")).toBeTruthy();
    expect((within(rowOf("Red Dust")).getByRole("button", { name: "Release" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    fake.planets.set("mars-1", { ...fake.planets.get("mars-1")!, campaignWaves: 50, readyToRelease: true });
    render(<PlanetsPage api={fake.api} />);
    await screen.findByRole("rowheader", { name: /Red Dust/u });
    act(() => within(rowOf("Red Dust")).getByRole("button", { name: "Release" }).click());
    expect(screen.getByRole("heading", { name: "Release Red Dust?" })).toBeTruthy();
    expect(screen.getByText(/planet number 2, after Moonbeam Colony.*cannot be undone/su)).toBeTruthy();
    await act(async () => screen.getAllByRole("button", { name: "Release" }).at(-1)!.click());
    await waitFor(() => expect(fake.callsNamed("releasePlanet")[0]?.args).toEqual(["mars-1"]));
    expect(await screen.findByText("Red Dust is released.")).toBeTruthy();
  });
});
