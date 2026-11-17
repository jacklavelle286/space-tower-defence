// @vitest-environment jsdom
// Admin → Levels → Aliens (Gate M, AM1; ADR-0041): make an alien inside the limits, draw it, make and save its walk as
// six approved Alien pictures, and publish it with the three hand ticks.
import { LIMITS } from "@scd/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeAdminApi } from "../../testing/fakeApi";
import { AliensPage, statusText } from "./AliensPage";
import type { WalkTools } from "./walk";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><g id="alien"><g id="leg-front"><path d="M150 220 L150 250"/></g><circle cx="128" cy="170" r="70"/></g></svg>';

/** Renders each frame as a PNG whose bytes are its SVG, so each frame is its own picture. */
const tools: WalkTools = {
  outline: async () => [58, 100, 198, 250],
  render: async (svg) => new Blob([svg], { type: "image/png" }),
};

let fake: FakeAdminApi;
let ids = 0;
beforeEach(() => {
  fake = new FakeAdminApi();
  ids = 0;
});
afterEach(cleanup);

const page = () =>
  render(<AliensPage api={fake.api} walkTools={tools} delay={() => 0} newJobId={() => `00000000-0000-4000-8000-00000000000${(ids += 1)}`} preview={() => "blob:frame"} />);

describe("AliensPage", () => {
  it("lists the game's aliens and makes a new one inside the limits", async () => {
    page();
    expect(await screen.findByText("Moon Blob")).toBeTruthy();
    const hp = screen.getAllByLabelText("Health")[0] as HTMLInputElement;
    expect([Number(hp.min), Number(hp.max)]).toEqual([LIMITS.alienMaker.hp.min, LIMITS.alienMaker.hp.max]);
    fireEvent.change(screen.getByLabelText(/^Name/u), { target: { value: "Zorp" } });
    expect((screen.getByLabelText(/^ID/u) as HTMLInputElement).value).toBe("zorp");
    fireEvent.change(hp, { target: { value: "40" } });
    fireEvent.click(screen.getByRole("button", { name: "Make alien" }));
    await screen.findByText(/Zorp made/u);
    expect(fake.aliens.get("zorp")).toMatchObject({ name: "Zorp", hp: 40, status: "DRAFT", art: [] });
    expect(await screen.findAllByText(/Draft: needs its walk/u)).toHaveLength(2); // the list and the open editor
  });

  it("refuses an ID the game already has", async () => {
    page();
    await screen.findByText("Moon Blob");
    fireEvent.change(screen.getByLabelText(/^Name/u), { target: { value: "Blob" } });
    expect(screen.getByText(/already has an alien or boss with this ID/u)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Make alien" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("draws the alien, makes the six walk frames and saves them as approved Alien pictures", async () => {
    await fake.api.createAlien({ alienId: "zorp", name: "Zorp", hp: 30, speed: 1.1, leak: 1, bounty: 4 });
    fake.nextJobScripts.push([{ state: "DRAWING", phase: "drawing" }, { state: "READY", svg: SVG }]);
    page();
    fireEvent.click(await screen.findByRole("button", { name: "Open" }));
    fireEvent.change(screen.getByLabelText(/Describe the alien/u), { target: { value: "a round green alien with one leg" } });
    fireEvent.click(screen.getByRole("button", { name: "Draw it" }));
    await screen.findByText(/these parts move on their own: leg front/u);
    expect(fake.calls.find((c) => c.name === "startPictureJob")?.args[0]).toMatchObject({ kind: "alien" });
    const use = screen.getByRole("button", { name: "Use this walk" }) as HTMLButtonElement;
    expect(use.disabled).toBe(true); // the Alien checklist first
    fireEvent.click(screen.getByLabelText(/No letters, numbers or words/u));
    fireEvent.click(screen.getByLabelText(/Friendly, never scary/u));
    fireEvent.click(screen.getByLabelText(/Nothing is cut off/u));
    fireEvent.click(use);
    await screen.findByText(/The walk is saved/u);
    const saves = fake.calls.filter((c) => c.name === "createPicture").map((c) => c.args[0] as Record<string, unknown>);
    expect(saves).toHaveLength(6);
    expect(saves[0]).toMatchObject({ source: "GENERATED", jobId: "00000000-0000-4000-8000-000000000001", approve: true, textFree: true, name: "Zorp walk 1" });
    expect(saves.slice(1).every((s) => s["source"] === "UPLOAD" && s["kind"] === "alien" && s["approve"] === true)).toBe(true);
    const art = fake.aliens.get("zorp")?.art ?? [];
    expect(new Set(art).size).toBe(6);
    expect(art.every((id) => fake.pictures.get(id)?.state === "APPROVED" && fake.pictures.get(id)?.kind === "alien")).toBe(true);
  });

  it("publishes a finished draft after the three ticks", async () => {
    await fake.api.createAlien({ alienId: "zorp", name: "Zorp", hp: 30, speed: 1.1, leak: 1, bounty: 4 });
    const frames = Array.from({ length: 6 }, (_, i) => fake.seedPicture(`Zorp walk ${i + 1}`, "APPROVED", "UPLOAD", "alien").id);
    await fake.api.updateAlien("zorp", { name: "Zorp", hp: 30, speed: 1.1, leak: 1, bounty: 4, art: frames });
    page();
    expect(await screen.findByText(/Draft, ready to publish/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const publish = screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement;
    expect(publish.disabled).toBe(true);
    for (const label of [/Silly and friendly/u, /The walk looks right/u, /The stats suit/u]) fireEvent.click(screen.getByLabelText(label));
    fireEvent.click(publish);
    await waitFor(() => expect(fake.calls.some((c) => c.name === "publishAlien")).toBe(true));
    expect(fake.calls.find((c) => c.name === "publishAlien")?.args[1]).toEqual({ friendly: true, walkLooksRight: true, statsFitTheName: true });
    expect(await screen.findAllByText("Publishing…")).not.toHaveLength(0);
  });

  it("says why a publish was refused, and where a published alien is", () => {
    const base = { alienId: "zorp", name: "Zorp", hp: 30, speed: 1.1, leak: 1, bounty: 4, art: [] as string[] };
    expect(statusText({ ...base, status: "DRAFT", publish: { state: "REFUSED", details: { code: "LIVE_MOVED" } } })).toMatch(/Publish again/u);
    expect(statusText({ ...base, status: "PUBLISHED", rulesetVersion: "r4-a1" })).toBe("In the game (rules r4-a1)");
  });
});
