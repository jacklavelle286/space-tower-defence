// Test helpers for the run screen (excluded from the app build by tsconfig.json). The fake run server applies ops with
// game-core's reducer, so the tests exercise the same rules the real server mirrors.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePlanet, parseRuleset, type Op, type RunState } from "@scd/game-core";
import type { ApiResult } from "@scd/shared";
import { keyFor } from "@scd/shared/audio/testing";
import type { PlayerApi } from "../api/playerApi";
import { FakeRunServer, type FakeActivityEntry, type FakeClip, type FakeReply } from "../dev/fakeRunServer";
import { REPO_ART } from "@scd/shared/manifest";
import type { GameData } from "../game/gameData";

const GAME_DATA = join(import.meta.dirname, "..", "..", "..", "..", "game-data");
const readJson = (path: string): unknown => JSON.parse(readFileSync(join(GAME_DATA, path), "utf8"));

export function testGameData(): GameData {
  const ruleset = parseRuleset(readJson("ruleset/r1.json"));
  return { ruleset, planet: parsePlanet(readJson("campaign/luna-1-c1.json"), ruleset), art: REPO_ART };
}

export const RUN_ID = "4b1e0000-0000-4000-8000-0000000000aa";
export const SESSION_ID = "c0a80000-0000-4000-8000-0000000000bb";
export const CLIP: FakeClip = { clipKey: keyFor("sh-clip"), bytes: Uint8Array.from([5, 4, 3, 2, 1]), contentType: "audio/mpeg" };

export function reply(r: FakeReply): ApiResult<unknown> {
  if (r.status >= 200 && r.status < 300) return { kind: "ok", status: r.status, body: r.body };
  const code = (r.body as { error?: { code?: string } } | null)?.error?.code ?? null;
  return { kind: "error", status: r.status, code, body: r.body };
}

/** The player API over the fake server. Speech is left to the test (FakeSpeech), so its timing can be controlled. */
export function apiFor(server: FakeRunServer): PlayerApi {
  return {
    getMe: async () => ({ kind: "error", status: 404, code: "PROFILE_NOT_FOUND", body: null }),
    putProfile: async () => ({ kind: "error", status: 500, code: "INTERNAL", body: null }),
    getPlanets: async () => ({ kind: "error", status: 500, code: "INTERNAL", body: null }),
    postReset: async () => ({ kind: "error", status: 500, code: "INTERNAL", body: null }),
    getProgress: async () => ({ kind: "error", status: 500, code: "INTERNAL", body: null }),
    getRuns: async () => ({ kind: "error", status: 500, code: "INTERNAL", body: null }),
    createRun: async (body) => reply(await server.createRun({ ...body })),
    getRun: async (runId) => reply(await server.getRun(runId)),
    chooseEndless: async () => ({ kind: "error", status: 500, code: "INTERNAL", body: null }),
    getPack: async (runId) => reply(await server.getPack(runId)),
    putSession: async (body) => reply(await server.session({ ...body })),
    deleteSession: async (body) => reply(await server.release({ ...body })),
    sendOps: async (runId, body) => reply(await server.ops(runId, body as never)) as never,
    postSpeech: async () => ({ kind: "error", status: 500, code: "INTERNAL", body: null }),
  };
}

let opCounter = 0;
function opId(): string {
  opCounter += 1;
  return `0f000000-0000-4000-8000-${String(opCounter).padStart(12, "0")}`;
}

/** A server with one run that has just cleared wave 1, so its activity N-001 is waiting (phase ACTIVITY). */
export async function serverAtActivity(activities?: readonly FakeActivityEntry[]): Promise<{ server: FakeRunServer; generation: number }> {
  const server = new FakeRunServer({
    data: testGameData(),
    clip: CLIP,
    urlFor: () => "https://audio.example.test/x",
    now: () => "2026-11-15T10:00:00Z",
    ...(activities !== undefined ? { activities } : {}),
  });
  const created = await server.createRun({
    runId: RUN_ID,
    planetId: "luna-1",
    waveSetId: "first-contact",
    rulesetVersion: "r1",
    campaignVersion: "luna-1-c1",
    sessionId: SESSION_ID,
    deviceLabel: "Chrome on Linux",
  });
  const generation = (created.body as { session: { generation: number } }).session.generation;
  const state = (): RunState => server.state.runs[0]!.state;
  const send = async (type: Op["type"], payload: Record<string, unknown>) => {
    const result = await server.ops(RUN_ID, {
      sessionId: SESSION_ID,
      generation,
      ops: [{ opId: opId(), expectedRevision: state().revision, type, payload, clientTime: "2026-11-15T10:00:00Z" }],
    });
    const first = (result.body as { results: { result: string }[] }).results[0];
    if (first?.result !== "APPLIED") throw new Error(`setup op ${type} not applied: ${JSON.stringify(result.body)}`);
  };
  const snap = state().snapshot!;
  await send("START_WAVE", { wave: 1, credits: snap.credits, placements: snap.placements });
  await send("COMPLETE_WAVE", { wave: 1, credits: snap.credits + 10, placements: snap.placements, colony: snap.colony, powers: {} });
  return { server, generation };
}
