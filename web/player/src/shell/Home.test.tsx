// @vitest-environment jsdom
// P7 run setup on Home (Phase 53, D4 P7): with one wave set, Home keeps its single New game button (the live game
// today); with several, it lists the campaign and then the quick challenges, each with Start.
import type { Me, Planets } from "@scd/shared";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION } from "../sync/protocol";
import { SyncQueue } from "../sync/queue";
import { allChoices, Home } from "./Home";

afterEach(cleanup);

const ME: Me = {
  nickname: "Star",
  avatarId: "avatar-01",
  age: 6,
  ageBand: 6,
  planets: {},
  badges: {},
  session: { activeElsewhere: false, runId: null, deviceLabel: null, leaseExpiresAt: null },
  runs: [],
};

const set = (waveSetId: string, mode: "CAMPAIGN" | "CHALLENGE", name: string, finalWave: number) => ({ waveSetId, mode, name, finalWave, available: true });
const FULL: Planets = {
  ageBand: 6,
  planets: [
    {
      planetId: "luna-1",
      name: "Moonbeam Colony",
      unlocked: true,
      waveSets: [
        set("first-contact", "CHALLENGE", "First Contact", 2),
        set("campaign", "CAMPAIGN", "Big Adventure", 50),
        set("blob-parade", "CHALLENGE", "Blob Parade", 5),
      ],
    },
  ],
};
const ONE: Planets = { ageBand: 6, planets: [{ ...FULL.planets[0]!, waveSets: [set("first-contact", "CHALLENGE", "First Contact", 2)] }] };

function renderHome(planets: Planets) {
  const onNewGame = vi.fn(async () => ({ kind: "ok" as const }));
  const queue = new SyncQueue({ transport: { sendOps: async () => ({ kind: "network", reason: "failed" }) } as never, protocolVersion: PROTOCOL_VERSION });
  render(
    <Home
      me={ME}
      api={{ getPlanets: async () => ({ kind: "ok", status: 200, body: planets }) }}
      queue={queue}
      onSignOut={() => {}}
      onSignInAgain={() => {}}
      onContinue={() => {}}
      onNewGame={onNewGame as never}
    />,
  );
  return onNewGame;
}

describe("Home run setup (Phase 53)", () => {
  it("orders the campaign first, then the challenges", () => {
    expect(allChoices(FULL).map((c) => c.choice.waveSetId)).toEqual(["campaign", "first-contact", "blob-parade"]);
  });

  it("with several wave sets: the campaign and quick challenges, each with Start", async () => {
    const onNewGame = renderHome(FULL);
    expect(await screen.findByRole("heading", { name: "New game: Moonbeam Colony" })).toBeTruthy();
    expect(screen.getByText("Quick challenges")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "New game" })).toBeNull();
    const starts = screen.getAllByRole("button", { name: "Start" });
    expect(starts).toHaveLength(3);
    await act(async () => starts[2]?.click());
    expect(onNewGame).toHaveBeenCalledWith({ planetId: "luna-1", waveSetId: "blob-parade" }, expect.anything());
  });

  it("a tester's preview is marked and starts on its version; the big New game never picks one (Gate M, LD7)", async () => {
    const preview = { ...set("campaign", "CAMPAIGN", "Big Adventure", 50), campaignVersion: "luna-1-a3", preview: true };
    const planets: Planets = { ageBand: 6, planets: [{ ...ONE.planets[0]!, waveSets: [...ONE.planets[0]!.waveSets, preview] }] };
    const onNewGame = renderHome(planets);
    await screen.findByRole("heading", { name: "New game: Moonbeam Colony" });
    expect(screen.getAllByText("Test level").length).toBeGreaterThan(0);
    const starts = screen.getAllByRole("button", { name: "Start" });
    await act(async () => starts[0]?.click()); // the campaign comes first: the preview
    expect(onNewGame).toHaveBeenCalledWith({ planetId: "luna-1", waveSetId: "campaign", campaignVersion: "luna-1-a3" }, expect.anything());
  });

  it("with one wave set (the live game today): the single New game button, as before", async () => {
    renderHome(ONE);
    expect(await screen.findByRole("button", { name: "New game" })).toBeTruthy();
    expect(screen.queryByText("Quick challenges")).toBeNull();
  });
});
