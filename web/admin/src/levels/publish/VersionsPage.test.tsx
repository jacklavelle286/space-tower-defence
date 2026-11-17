// @vitest-environment jsdom
// The Versions page (Gate M, LD7): which version is live, Make live (the rollback) after a question, Retire and Mark
// invalid per wave set, the testers list, and a comparison of two versions.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeAdminApi } from "../../testing/fakeApi";
import { REPO_BASE } from "../levelFile";
import { VersionsPage } from "./VersionsPage";

let fake: FakeAdminApi;
const TESTER = "0f0e0d0c-0b0a-4908-8706-050403020100";

beforeEach(() => {
  fake = new FakeAdminApi();
  // A newer version made in the portal, a preview of the campaign, not live.
  const newer = structuredClone(REPO_BASE.raw) as Record<string, unknown>;
  newer["version"] = "luna-1-a1";
  newer["name"] = "Moonbeam Colony Two";
  fake.documents.set("luna-1-a1", newer);
  const live = fake.gameData.versions[0]!;
  fake.gameData.versions.unshift({
    ...structuredClone(live),
    campaignVersion: "luna-1-a1",
    live: false,
    source: "portal",
    levelId: "zigzag",
    by: "a6c2b2b4-7051-70ef-b1e8-739ac38dd0cb",
    waveSets: live.waveSets.map((w) => ({ ...w, state: w.waveSetId === "campaign" ? ("preview" as const) : w.state })),
  });
});
afterEach(cleanup);

async function open() {
  render(<VersionsPage api={fake.api} />);
  return screen.findByRole("heading", { name: "Versions" });
}

const rowOf = (version: string) => screen.getByRole("rowheader", { name: new RegExp(`^${version}`, "u") }).closest("tr")!;

describe("VersionsPage", () => {
  it("lists versions newest first with the live one marked and where each came from", async () => {
    await open();
    expect(rowOf(REPO_BASE.version).textContent).toMatch(/live/u);
    expect(rowOf("luna-1-a1").textContent).toMatch(/level zigzag, operator a6c2b2b4/u);
    expect(rowOf("luna-1-a1").textContent).toMatch(/Testers only/u);
  });

  it("Make live asks first, then moves the live version", async () => {
    await open();
    act(() => within(rowOf("luna-1-a1")).getByRole("button", { name: "Make live" }).click());
    expect(screen.getByRole("heading", { name: "Make luna-1-a1 live?" })).toBeTruthy();
    await act(async () => screen.getAllByRole("button", { name: "Make live" }).at(-1)!.click());
    expect(fake.callsNamed("makeLive")[0]?.args).toEqual(["luna-1-a1"]);
    expect(await screen.findByText("luna-1-a1 is live for new games.")).toBeTruthy();
  });

  it("an older version's Make live says it is a rollback", async () => {
    fake.gameData.versions[0]!.live = true;
    fake.gameData.versions[1]!.live = false;
    await open();
    act(() => within(rowOf(REPO_BASE.version)).getByRole("button", { name: "Make live" }).click());
    expect(screen.getByRole("heading", { name: `Make ${REPO_BASE.version} live (roll back)?` })).toBeTruthy();
  });

  it("Mark invalid explains that started games end as given up, then sets the state", async () => {
    await open();
    const row = rowOf("luna-1-a1");
    act(() => within(row).getAllByRole("button", { name: "Mark invalid" })[0]!.click());
    expect(screen.getByText(/recorded as given up, never as a loss/u)).toBeTruthy();
    await act(async () => screen.getAllByRole("button", { name: "Mark invalid" }).at(-1)!.click());
    expect(fake.callsNamed("setWaveSetState")[0]?.args[0]).toMatchObject({ campaignVersion: "luna-1-a1", state: "invalid" });
  });

  it("adds a tester by code and saves the list", async () => {
    await open();
    expect((screen.getByRole("button", { name: "Save testers" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Tester code" }), { target: { value: "someone@example.com" } });
    expect((screen.getByRole("button", { name: "Add" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Tester code" }), { target: { value: TESTER } });
    act(() => screen.getByRole("button", { name: "Add" }).click());
    await act(async () => screen.getByRole("button", { name: "Save testers" }).click());
    expect(fake.callsNamed("setTesters")[0]?.args).toEqual([[TESTER]]);
  });

  it("compares two versions", async () => {
    await open();
    await act(async () => screen.getByRole("button", { name: "Compare" }).click());
    expect(await screen.findByText("Changed planet Moonbeam Colony Two: name")).toBeTruthy();
  });
});
