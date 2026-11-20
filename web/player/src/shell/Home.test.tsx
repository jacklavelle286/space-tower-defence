// @vitest-environment jsdom
// Home's maps (Gate M, LD23; owner 2026-11-20: "just have a list of maps - really simple"): one card per map with a
// drawing of the map, Play for its 50-wave adventure and its challenges as small buttons; every map open (ADR-0043).
import type { Me, Planets } from "@scd/shared";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION } from "../sync/protocol";
import { SyncQueue } from "../sync/queue";
import { allChoices, Home, mapCards } from "./Home";
import { sketchOf } from "./mapSketch";

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

describe("Home maps (LD23)", () => {
  it("orders the campaign first, then the challenges; a card's Play is the live adventure, before a tester's preview", () => {
    expect(allChoices(FULL).map((c) => c.choice.waveSetId)).toEqual(["campaign", "first-contact", "blob-parade"]);
    const preview = { ...set("campaign", "CAMPAIGN", "Big Adventure", 50), campaignVersion: "luna-1-a3", preview: true };
    const [card] = mapCards({ ageBand: 6, planets: [{ ...FULL.planets[0]!, campaignVersion: "luna-1-a2", waveSets: [preview, ...FULL.planets[0]!.waveSets] }] });
    expect(card?.play?.choice).toEqual({ planetId: "luna-1", waveSetId: "campaign" });
    expect(card?.version).toBe("luna-1-a2");
    expect(card?.more.map((c) => c.choice.campaignVersion ?? c.choice.waveSetId)).toEqual(["luna-1-a3", "first-contact", "blob-parade"]);
  });

  it("one card per map: its name, Play for the adventure, its challenges as small buttons", async () => {
    const fire = { planetId: "fire-planet-2", name: "Fire Planet", unlocked: true, waveSets: [set("campaign", "CAMPAIGN", "Big Trek", 50), set("fire-clank", "CHALLENGE", "Captain Clank", 4)] };
    const onNewGame = renderHome({ ageBand: 6, planets: [FULL.planets[0]!, fire] });
    expect(await screen.findByRole("heading", { name: "Maps" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Moonbeam Colony" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Fire Planet" })).toBeTruthy();
    expect(screen.queryByText(/New game/u)).toBeNull();
    const moonChallenges = screen.getByRole("group", { name: "Challenges on Moonbeam Colony" });
    expect([...moonChallenges.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["First Contact", "Blob Parade"]);
    await act(async () => screen.getByRole("button", { name: "Play Fire Planet" }).click());
    expect(onNewGame).toHaveBeenCalledWith({ planetId: "fire-planet-2", waveSetId: "campaign" }, expect.anything());
    await act(async () => screen.getByRole("button", { name: "Blob Parade" }).click());
    expect(onNewGame).toHaveBeenCalledWith({ planetId: "luna-1", waveSetId: "blob-parade" }, expect.anything());
  });

  it("a map with only challenges has no Play; a tester's preview is marked and starts on its version", async () => {
    const preview = { ...set("campaign", "CAMPAIGN", "Big Adventure", 50), campaignVersion: "luna-1-a3", preview: true };
    const planets: Planets = { ageBand: 6, planets: [{ ...ONE.planets[0]!, waveSets: [...ONE.planets[0]!.waveSets, preview] }] };
    const onNewGame = renderHome(planets);
    const play = await screen.findByRole("button", { name: "Play Moonbeam Colony" });
    expect(play.textContent).toMatch(/Test level/u);
    await act(async () => play.click());
    expect(onNewGame).toHaveBeenCalledWith({ planetId: "luna-1", waveSetId: "campaign", campaignVersion: "luna-1-a3" }, expect.anything());
    cleanup();
    renderHome(ONE);
    expect(await screen.findByRole("button", { name: "First Contact" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Play/u })).toBeNull();
  });
});

describe("map pictures (LD23)", () => {
  it("reads the campaign map's route, pads and backdrop; anything unexpected is no sketch", () => {
    const doc = {
      waveSets: { campaign: { mapId: "fire" } },
      maps: { fire: { route: [[0, 5], [19, 5]], pads: [{ x: 3, y: 4 }, { x: 40, y: 1 }], art: { backdrop: null } } },
    };
    expect(sketchOf(doc)).toEqual({ route: [[0, 5], [19, 5]], pads: [[3, 4]], ground: expect.stringMatching(/luna-backdrop/u) });
    expect(sketchOf({ ...doc, maps: { fire: { ...doc.maps.fire, route: [[0, 99]] } } })).toBeNull();
    expect(sketchOf({ waveSets: {}, maps: {} })).toBeNull();
    expect(sketchOf("nope")).toBeNull();
  });
});
