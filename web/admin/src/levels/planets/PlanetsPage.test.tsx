// @vitest-environment jsdom
// Levels → Planets (Gate M, LD10): the released planets in unlock order, Add planet, and Release only once the newest
// version has the full campaign, after a question that says the order is for good.
import { makeChallenge, parseRuleset } from "@scd/game-core";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearFlash, peekFlash } from "../../flash";
import { FakeAdminApi } from "../../testing/fakeApi";
import { FakeImages } from "../../testing/images";
import { mergedLevel, resetLiveBase } from "../levelFile";
import type { ChallengeReply, ChallengeRequest, ChallengeWorker } from "../maker/challenges";
import { PlanetsPage } from "./PlanetsPage";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><circle cx="128" cy="128" r="60" fill="#f28c28"/></svg>';

/** challenges.worker.ts, run in this thread. */
function challengeWorker(): ChallengeWorker {
  const worker: ChallengeWorker = {
    onmessage: null,
    terminate: vi.fn(),
    postMessage: (r: ChallengeRequest) => {
      const made = makeChallenge(parseRuleset(r.ruleset), mergedLevel(r.level, r.base), r.plan, { seed: r.seed, levelId: r.level.levelId, ownsCampaign: r.ownsCampaign, index: r.index });
      queueMicrotask(() => worker.onmessage?.({ data: { type: "done", made } } as MessageEvent<ChallengeReply>));
    },
  };
  return worker;
}

let fake: FakeAdminApi;
let images: FakeImages;
let jobs = 0;
beforeEach(() => {
  fake = new FakeAdminApi();
  images = new FakeImages();
  jobs = 0;
  clearFlash();
});
afterEach(() => {
  cleanup();
  resetLiveBase();
});

const draw = () => ({ tools: images.tools, wait: async () => undefined, newJobId: () => `00000000-0000-4000-8000-${String((jobs += 1)).padStart(12, "0")}` });

const rowOf = (name: string) => screen.getByRole("rowheader", { name: new RegExp(name, "u") }).closest("tr")!;

describe("PlanetsPage", () => {
  it("lists luna-1 as released first and adds a planet with its ID from the name", async () => {
    render(<PlanetsPage api={fake.api} />);
    await screen.findByRole("rowheader", { name: /luna-1/u });
    expect(within(rowOf("luna-1")).getByText("Released, number 1")).toBeTruthy();
    const byHand = within(screen.getByRole("form", { name: "Add a planet by hand" }));
    fireEvent.change(byHand.getByLabelText(/^Name/u), { target: { value: "Red Dust" } });
    expect((byHand.getByLabelText(/^ID/u) as HTMLInputElement).value).toBe("red-dust");
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

  it("makes a planet from a theme: draws the icon and backdrop for approval, adds the planet and its campaign level (LD20)", { timeout: 60_000 }, async () => {
    fake.nextJobScripts.push([{ state: "DRAWING", phase: "drawing", elapsedSeconds: 5 }, { state: "READY", svg: SVG }], [{ state: "READY", svg: SVG }]);
    const navigate = vi.fn();
    render(<PlanetsPage api={fake.api} navigate={navigate} maker={{ draw: draw(), workers: { challenge: challengeWorker }, seed: 4 }} />);
    await screen.findByRole("rowheader", { name: /luna-1/u });
    const maker = within(screen.getByRole("group", { name: "Make a planet for me" }));
    const make = maker.getByRole("button", { name: "Make the planet and its level" }) as HTMLButtonElement;
    fireEvent.change(maker.getByLabelText(/^Theme/u), { target: { value: "fire" } });
    expect((maker.getByLabelText(/^Name/u) as HTMLInputElement).value).toBe("Fire Planet");
    expect(maker.getByText("ID fire-planet")).toBeTruthy();

    fireEvent.click(maker.getByRole("button", { name: "Draw the icon" }));
    expect(await maker.findByRole("img", { name: "The drawn icon" })).toBeTruthy();
    expect(fake.callsNamed("startPictureJob")[0]?.args[0]).toMatchObject({ kind: "planet", description: expect.stringContaining("fire planet") });
    const approve = maker.getByRole("button", { name: "Approve and use it" }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true); // the "no letters, numbers or words" tick first
    fireEvent.click(maker.getByLabelText(/No letters, numbers or words/u));
    fireEvent.click(approve);
    expect(await maker.findByText("Approved and kept in the library.")).toBeTruthy();
    expect(make.disabled).toBe(true); // the backdrop is not ready yet

    fireEvent.click(maker.getByRole("button", { name: "Draw the backdrop" }));
    expect(await maker.findByRole("img", { name: "The drawn backdrop" })).toBeTruthy();
    expect(fake.callsNamed("startPictureJob")[1]?.args[0]).toMatchObject({ kind: "background" });
    fireEvent.click(maker.getByLabelText(/No letters, numbers or words/u));
    fireEvent.click(maker.getByRole("button", { name: "Approve and use it" }));
    await waitFor(() => expect(maker.getAllByText("Approved and kept in the library.")).toHaveLength(2));
    const kept = fake.callsNamed("createPicture").map((c) => c.args[0] as { approve: boolean; textFree: boolean; source: string });
    expect(kept.map((k) => [k.source, k.approve, k.textFree])).toEqual([["GENERATED", true, true], ["GENERATED", true, true]]);

    fireEvent.click(maker.getByLabelText(/Tune the waves/u));
    fireEvent.change(maker.getByLabelText(/^Challenges/u), { target: { value: "1" } });
    fireEvent.click(make);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("#levels/fire-planet-map"), { timeout: 40_000 });
    const planet = fake.planets.get("fire-planet");
    expect(planet?.name).toBe("Fire Planet");
    expect(planet?.icon).toMatch(/^lib-/u);
    expect(planet?.backdrop).toMatch(/^lib-/u);
    const level = fake.levels.get("fire-planet-map");
    expect(level?.planetId).toBe("fire-planet");
    expect(level?.level.waves).toHaveLength(50);
    expect(level?.level.map.art.backdrop).toBe(planet?.backdrop);
    expect(Object.keys(level?.level.waveSets ?? {}).length).toBeGreaterThanOrEqual(1);
    expect(peekFlash()).toMatch(/^Fire Planet is added \(not released\)\. Its campaign level: Map \d+: /u);
  });

  it("says why a drawing could not start, and can use approved pictures instead", async () => {
    fake.usage = { ...fake.usage, usedToday: fake.usage.dailyCap };
    render(<PlanetsPage api={fake.api} navigate={vi.fn()} maker={{ draw: draw() }} />);
    await screen.findByRole("rowheader", { name: /luna-1/u });
    const maker = within(screen.getByRole("group", { name: "Make a planet for me" }));
    fireEvent.change(maker.getByLabelText(/^Theme/u), { target: { value: "ice" } });
    fireEvent.click(maker.getByRole("button", { name: "Draw the icon" }));
    expect((await maker.findByRole("alert")).textContent).toMatch(/You've drawn/u);
    expect(maker.getByRole("button", { name: "Try again" })).toBeTruthy();
    fireEvent.change(maker.getByLabelText(/^Backdrop/u), { target: { value: "" } }); // none: the Moon ground
    expect((maker.getByRole("button", { name: "Make the planet and its level" }) as HTMLButtonElement).disabled).toBe(true); // the icon is not ready
  });
});
