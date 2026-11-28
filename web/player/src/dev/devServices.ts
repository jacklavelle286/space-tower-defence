// DEVELOPMENT ONLY (`npm run dev`). main.tsx imports this behind `import.meta.env.DEV`, so production builds never
// contain it (checked after `npm run build` by searching dist/ for "scd-dev"). It never calls AWS.
//
// - Fake sign-in: "Sign in" / "I'm new" ask for a made-up username and come back through /auth/callback?devUser=<name>,
//   like managed login would. The fake token is an unsigned JWT whose `sub` is derived from the name; it is kept in
//   localStorage under a key shaped like the real library's, so two tabs with different names exercise the real
//   cross-tab "one page load = one account" path.
// - Fake API: GET /api/me, PUT and PATCH /api/me/profile, GET /api/planets, and the run routes (create, read, pack, ops,
//   session, speech) through FakeRunServer, in localStorage per fake account. The date of birth is used to work out
//   the age and then thrown away, as the real server keeps it private. The speech clip is a short made-up tone.
import { LIMITS, unsignedToken, type Me } from "@scd/shared";
import type { AuthPort } from "../auth/types";
import type { PlayerConfig } from "../config";
import { loadGameData } from "../game/gameData";
import type { Services } from "../shell/services";
import { DEV_ACTIVITIES, FakeRunServer, PHASE38_ACTIVITIES, type FakeClip, type FakeServerState } from "./fakeRunServer";

const PREFIX = "CognitoIdentityServiceProvider.scd-dev-client.";
const TOKEN_KEY = `${PREFIX}accessToken`;
const API_PREFIX = "scd-dev-api.";

const DEV_CONFIG: PlayerConfig = {
  apiBase: "/api",
  region: "eu-west-2",
  userPoolId: "eu-west-2_devpool",
  clientId: "scddevclient0000000000",
  authDomain: "scd-dev.auth.eu-west-2.amazoncognito.com",
  scope: "game/play",
  releaseId: "local-dev",
};

function subFor(name: string): string {
  let h = 0;
  for (const c of name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `dev-${h.toString(16).padStart(8, "0")}`;
}

function devAuth(): AuthPort {
  const url = new URL(window.location.href);
  const devUser = url.searchParams.get("devUser");
  if (url.pathname === "/auth/callback" && devUser) {
    const name = devUser.trim().toLowerCase().slice(0, 40);
    const exp = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem(TOKEN_KEY, unsignedToken({ sub: subFor(name), username: name, token_use: "access", exp }));
    window.history.replaceState(null, "", "/auth/callback");
  }
  return {
    async accessToken() {
      return localStorage.getItem(TOKEN_KEY);
    },
    async signIn() {
      const name = window.prompt("Development sign-in: type any username (no password, nothing leaves this laptop)");
      if (name) window.location.assign(`/auth/callback?devUser=${encodeURIComponent(name)}`);
    },
    async signOut() {
      localStorage.removeItem(TOKEN_KEY);
      window.location.assign("/");
    },
    isTokenStorageKey: (key) => key === null || key.startsWith(PREFIX),
  };
}

interface StoredProfile {
  nickname: string;
  avatarId: string;
  /** YG1: 0 Reception ... 5 Year 5. */
  schoolYear: number;
}

/** YG1: the band a school year plays (Hard: the year above), or null past the last band. */
function bandOf(schoolYear: number, hard = false): number | null {
  const band = schoolYear + LIMITS.schoolYears.firstBand + (hard ? 1 : 0);
  return (LIMITS.ageBands as readonly number[]).includes(band) ? band : null;
}

function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function meView(p: StoredProfile): Me {
  return {
    nickname: p.nickname,
    avatarId: p.avatarId,
    age: null,
    schoolYear: p.schoolYear,
    ageBand: bandOf(p.schoolYear),
    hardAgeBand: bandOf(p.schoolYear, true),
    planets: {},
    badges: {},
    session: { activeElsewhere: false, runId: null, deviceLabel: null, leaseExpiresAt: null },
    runs: [],
  };
}

/** A 0.6 s two-note tone as a WAV file: the development stand-in for a speech clip. */
function toneWav(): Uint8Array {
  const rate = 8000;
  const samples = Math.round(rate * 0.6);
  const out = new DataView(new ArrayBuffer(44 + samples));
  const text = (at: number, value: string) => [...value].forEach((c, i) => out.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  out.setUint32(4, 36 + samples, true);
  text(8, "WAVEfmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 1, true);
  out.setUint32(24, rate, true);
  out.setUint32(28, rate, true);
  out.setUint16(32, 1, true);
  out.setUint16(34, 8, true);
  text(36, "data");
  out.setUint32(40, samples, true);
  for (let i = 0; i < samples; i += 1) {
    const f = i < samples / 2 ? 440 : 660;
    out.setUint8(44 + i, 128 + Math.round(60 * Math.sin((2 * Math.PI * f * i) / rate)));
  }
  return new Uint8Array(out.buffer);
}

const DEV_CLIP: FakeClip = { clipKey: "de".repeat(32), bytes: toneWav(), contentType: "audio/wav" };
const servers = new Map<string, Promise<FakeRunServer>>();

/**
 * Which activities the fake server puts in the slots. `?devActivities=phase37` on any page switches to the Phase 37
 * rotation (picture select, number track, hundred square, then the seed); `?devActivities=phase38` to the Phase 38
 * rotation (share, sort, letters, order, typed number and word, two-step); `?devActivities=seed` switches back. The
 * choice is remembered in localStorage. Start a new game after switching: a run keeps the answers it was created with.
 */
function devActivities() {
  const key = `${API_PREFIX}activities`;
  const asked = new URL(window.location.href).searchParams.get("devActivities");
  if (asked === "phase37" || asked === "phase38" || asked === "seed") localStorage.setItem(key, asked);
  const chosen = localStorage.getItem(key);
  return chosen === "phase37" ? { activities: DEV_ACTIVITIES } : chosen === "phase38" ? { activities: PHASE38_ACTIVITIES } : {};
}

/** One fake run server per fake account, kept in localStorage so a reload keeps the run (as the cloud would). */
function runServer(sub: string): Promise<FakeRunServer> {
  const key = `${API_PREFIX}runs.${sub}`;
  let server = servers.get(sub);
  if (server === undefined) {
    server = loadGameData().then((data) => {
      const saved = localStorage.getItem(key);
      return new FakeRunServer({
        data,
        clip: DEV_CLIP,
        urlFor: (clip) => URL.createObjectURL(new Blob([clip.bytes.slice()], { type: clip.contentType })),
        ...(saved ? { initial: JSON.parse(saved) as FakeServerState } : {}),
        onChange: (state) => localStorage.setItem(key, JSON.stringify(state)),
        ...devActivities(),
      });
    });
    servers.set(sub, server);
  }
  return server;
}

function devFetch(): typeof fetch {
  const real = window.fetch.bind(window);
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    if (!url.pathname.startsWith("/api/")) return real(input, init);
    await new Promise((r) => setTimeout(r, 150)); // a little latency, so "Saving…" is visible
    const auth = new Headers(init?.headers).get("Authorization") ?? "";
    const token = auth.replace(/^Bearer /, "");
    if (token === "" || token !== localStorage.getItem(TOKEN_KEY)) return json(401, { message: "Unauthorized" });
    const payload = JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { sub: string };
    const key = `${API_PREFIX}${payload.sub}`;
    const stored = localStorage.getItem(key);
    const profile = stored ? (JSON.parse(stored) as StoredProfile) : null;
    const route = `${init?.method ?? "GET"} ${url.pathname}`;

    if (route === "GET /api/me") {
      if (!profile) return json(404, { error: { code: "PROFILE_NOT_FOUND", message: "No profile" } });
      return json(200, { ...meView(profile), runs: (await runServer(payload.sub)).runs() });
    }
    if (route === "PUT /api/me/profile") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { nickname?: string; avatarId?: string; schoolYear?: number };
      if (!body.nickname || !body.avatarId || !Number.isInteger(body.schoolYear)) {
        return json(400, { error: { code: "VALIDATION_FAILED", message: "Request body failed validation" } });
      }
      const next: StoredProfile = { nickname: body.nickname, avatarId: body.avatarId, schoolYear: body.schoolYear as number };
      localStorage.setItem(key, JSON.stringify(next));
      return json(200, meView(next));
    }
    if (route === "PATCH /api/me/profile") {
      if (!profile) return json(404, { error: { code: "PROFILE_NOT_FOUND", message: "No profile" } });
      const body = JSON.parse(String(init?.body ?? "{}")) as { schoolYear?: number };
      const next: StoredProfile = { ...profile, ...(Number.isInteger(body.schoolYear) ? { schoolYear: body.schoolYear as number } : {}) };
      localStorage.setItem(key, JSON.stringify(next));
      return json(200, { ...meView(next), runs: (await runServer(payload.sub)).runs() });
    }
    if (route === "GET /api/planets") {
      if (!profile) return json(404, { error: { code: "PROFILE_NOT_FOUND", message: "No profile" } });
      const band = meView(profile).ageBand;
      return json(200, {
        ageBand: band,
        hardAgeBand: bandOf(profile.schoolYear, true),
        schoolYear: profile.schoolYear,
        planets: [
          {
            planetId: "luna-1",
            name: "Moonbeam Colony",
            unlocked: true,
            waveSets: [
              {
                waveSetId: "first-contact",
                mode: "CHALLENGE",
                name: "First Contact",
                finalWave: 2,
                available: band !== null,
                ...(band === null ? { reason: "AGE_OUT_OF_RANGE" } : {}),
              },
            ],
          },
        ],
      });
    }
    if (/^\/api\/(runs|session|speech)/.test(url.pathname)) {
      const server = await runServer(payload.sub);
      const body = (init?.body ? JSON.parse(String(init.body)) : {}) as Record<string, unknown>;
      const parts = url.pathname.split("/"); // ["", "api", "runs", runId, "pack" | "ops"]
      const runId = parts[3] ?? "";
      let reply;
      if (route === "POST /api/runs") reply = await server.createRun(body);
      else if (route === "PUT /api/session") reply = await server.session(body);
      else if (route === "DELETE /api/session") reply = await server.release(body);
      else if (route === "POST /api/speech") reply = await server.speech(body);
      else if (route === `GET /api/runs/${runId}`) reply = await server.getRun(runId);
      else if (route === `GET /api/runs/${runId}/pack`) reply = await server.getPack(runId);
      else if (route === `POST /api/runs/${runId}/ops`) reply = await server.ops(runId, body as never);
      if (reply) return reply.status === 204 ? new Response(null, { status: 204 }) : json(reply.status, reply.body);
    }
    return json(404, { error: { code: "NOT_FOUND", message: "Not in the development backend" } });
  };
}

export function createDevServices(): Services {
  return {
    config: DEV_CONFIG,
    auth: devAuth(),
    fetchImpl: devFetch(),
    reload: () => window.location.reload(),
    localPractice: true,
  };
}
