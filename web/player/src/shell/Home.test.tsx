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

describe("Home school year and Easy or Hard (YG1)", () => {
  const YEAR2: Me = { ...ME, schoolYear: 2, ageBand: 7, hardAgeBand: 8 };
  const BANDS: Planets = { ...FULL, ageBand: 7, hardAgeBand: 8, schoolYear: 2 };

  function renderYear(me: Me, planets: Planets, onSchoolYear?: (year: number) => Promise<boolean>) {
    const onNewGame = vi.fn(async () => ({ kind: "ok" as const }));
    const getPlanets = vi.fn(async () => ({ kind: "ok" as const, status: 200, body: planets }));
    const queue = new SyncQueue({ transport: { sendOps: async () => ({ kind: "network", reason: "failed" }) } as never, protocolVersion: PROTOCOL_VERSION });
    render(
      <Home
        me={me}
        api={{ getPlanets }}
        queue={queue}
        onSignOut={() => {}}
        onSignInAgain={() => {}}
        onContinue={() => {}}
        onNewGame={onNewGame as never}
        {...(onSchoolYear ? { onSchoolYear } : {})}
      />,
    );
    return { onNewGame, getPlanets };
  }

  it("Play asks how hard: Easy is the school year, Hard the year above", async () => {
    const { onNewGame } = renderYear(YEAR2, BANDS);
    expect(await screen.findByText("School year: Year 2")).toBeTruthy();
    await act(async () => screen.getByRole("button", { name: "Play Moonbeam Colony" }).click());
    const dialog = screen.getByRole("dialog", { name: "How hard?" });
    expect(dialog.textContent).toContain("Year 2 questions");
    expect(dialog.textContent).toContain("Year 3 questions");
    expect(onNewGame).not.toHaveBeenCalled();
    await act(async () => screen.getByRole("button", { name: /^Hard/ }).click());
    expect(onNewGame).toHaveBeenCalledWith({ planetId: "luna-1", waveSetId: "campaign", difficulty: "HARD" }, expect.anything());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a challenge asks too; Easy sends EASY; Back starts nothing", async () => {
    const { onNewGame } = renderYear(YEAR2, BANDS);
    const parade = await screen.findByRole("button", { name: "Blob Parade" });
    await act(async () => parade.click());
    await act(async () => screen.getByRole("button", { name: "Back" }).click());
    expect(onNewGame).not.toHaveBeenCalled();
    await act(async () => screen.getByRole("button", { name: "Blob Parade" }).click());
    await act(async () => screen.getByRole("button", { name: /^Easy/ }).click());
    expect(onNewGame).toHaveBeenCalledWith({ planetId: "luna-1", waveSetId: "blob-parade", difficulty: "EASY" }, expect.anything());
  });

  it("with no year above (an older server, or none), Play starts straight away", async () => {
    const { onNewGame } = renderYear(ME, FULL);
    const play = await screen.findByRole("button", { name: "Play Moonbeam Colony" });
    await act(async () => play.click());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onNewGame).toHaveBeenCalledWith({ planetId: "luna-1", waveSetId: "campaign" }, expect.anything());
  });

  it("Change saves a new school year and reads the maps again", async () => {
    const onSchoolYear = vi.fn(async () => true);
    const { getPlanets } = renderYear({ ...ME, schoolYear: null }, BANDS, onSchoolYear);
    expect(await screen.findByText(/Which school year are you in\?/)).toBeTruthy();
    await act(async () => screen.getByRole("button", { name: "Change" }).click());
    const dialog = screen.getByRole("dialog", { name: "Your school year" });
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => (dialog.querySelector('input[value="4"]') as HTMLInputElement).click());
    await act(async () => screen.getByRole("button", { name: "Save" }).click());
    expect(onSchoolYear).toHaveBeenCalledWith(4);
    expect(getPlanets).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a failed save keeps the dialog open and says so", async () => {
    renderYear(YEAR2, BANDS, vi.fn(async () => false));
    const change = await screen.findByRole("button", { name: "Change" });
    await act(async () => change.click());
    await act(async () => screen.getByRole("button", { name: "Save" }).click());
    expect(screen.getByRole("alert").textContent).toBe("We couldn't save that. Please try again.");
    expect(screen.getByRole("dialog", { name: "Your school year" })).toBeTruthy();
  });

  it("Continue marks a game on Hard", async () => {
    const run = { runId: "r1", planetId: "luna-1", waveSetId: "campaign", mode: "CAMPAIGN" as const, status: "IN_PROGRESS", stage: "AUTHORED", wave: 3, finalWave: 50, highestCompletedWave: 2, lastPlayedAt: "", createdAt: "", revision: 1, difficulty: "HARD" as const, playable: true };
    renderYear({ ...YEAR2, runs: [run] }, BANDS);
    expect((await screen.findByText("Wave 3")).textContent).toContain("Hard");
  });
});
