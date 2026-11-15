import { describe, expect, it, vi } from "vitest";
import { createApiClient, tokenSub, type TokenSource } from "./client";
import { unsignedToken } from "./unsignedToken";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function tokens(...subs: (string | null)[]): TokenSource & { calls: boolean[] } {
  const calls: boolean[] = [];
  return {
    calls,
    async accessToken({ forceRefresh }) {
      calls.push(forceRefresh);
      const sub = subs.length > 1 ? subs.shift() : subs[0];
      return sub === null || sub === undefined ? null : unsignedToken({ sub, token_use: "access" });
    },
  };
}

function respond(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

describe("tokenSub", () => {
  it("reads sub from the payload and refuses malformed tokens", () => {
    expect(tokenSub(unsignedToken({ sub: OWNER }))).toBe(OWNER);
    expect(tokenSub("not-a-token")).toBeNull();
    expect(tokenSub("a.!!!.c")).toBeNull();
    expect(tokenSub(unsignedToken({ nosub: 1 }))).toBeNull();
  });
});

describe("createApiClient", () => {
  it("sends the bearer token to the same-origin path and returns the body", async () => {
    const fetchImpl = vi.fn(async () => respond(200, { nickname: "Ace" }));
    const client = createApiClient({ apiBase: "/api", ownerSub: OWNER, tokens: tokens(OWNER), onIdentityChanged: vi.fn(), fetchImpl });
    const result = await client.request("GET", "/me");
    expect(result).toEqual({ kind: "ok", status: 200, body: { nickname: "Ace" } });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/me");
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Bearer /);
  });

  it("checks ownerSub before every request: a different account sends nothing and stops the client", async () => {
    const fetchImpl = vi.fn(async () => respond(200, {}));
    const onIdentityChanged = vi.fn();
    const source = tokens(OWNER, OTHER, OWNER);
    const client = createApiClient({ apiBase: "/api", ownerSub: OWNER, tokens: source, onIdentityChanged, fetchImpl });
    expect((await client.request("GET", "/me")).kind).toBe("ok");
    expect(await client.request("GET", "/me")).toEqual({ kind: "identity-changed" });
    // Even when the original account's token comes back, the page stays stopped: it is about to reload.
    expect(await client.request("GET", "/me")).toEqual({ kind: "identity-changed" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onIdentityChanged).toHaveBeenCalledTimes(1);
    expect(client.stopped).toBe(true);
  });

  it("does not send when the client is stopped while the token is being read", async () => {
    const fetchImpl = vi.fn(async () => respond(200, {}));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const client = createApiClient({
      apiBase: "/api",
      ownerSub: OWNER,
      tokens: { accessToken: async () => (await gate, unsignedToken({ sub: OWNER })) },
      onIdentityChanged: vi.fn(),
      fetchImpl,
    });
    const pending = client.request("GET", "/me");
    client.stop();
    release();
    expect(await pending).toEqual({ kind: "identity-changed" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refreshes once after a 401 and resends the identical request", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(respond(401, { message: "Unauthorized" })).mockResolvedValueOnce(respond(200, { ok: 1 }));
    const source = tokens(OWNER);
    const client = createApiClient({ apiBase: "/api", ownerSub: OWNER, tokens: source, onIdentityChanged: vi.fn(), fetchImpl });
    const result = await client.request("PUT", "/me/profile", { nickname: "Ace" });
    expect(result.kind).toBe("ok");
    expect(source.calls).toEqual([false, true]);
    const bodies = fetchImpl.mock.calls.map((c) => (c[1] as RequestInit).body);
    expect(bodies[0]).toBe(bodies[1]);
  });

  it("a second 401 (or a gateway 403) means auth-required", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(respond(401)).mockResolvedValueOnce(respond(403, { message: "Forbidden" }));
    const client = createApiClient({ apiBase: "/api", ownerSub: OWNER, tokens: tokens(OWNER), onIdentityChanged: vi.fn(), fetchImpl });
    expect(await client.request("GET", "/me")).toEqual({ kind: "auth-required" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("no token at all is auth-required and sends nothing", async () => {
    const fetchImpl = vi.fn();
    const client = createApiClient({ apiBase: "/api", ownerSub: OWNER, tokens: tokens(null), onIdentityChanged: vi.fn(), fetchImpl });
    expect(await client.request("GET", "/me")).toEqual({ kind: "auth-required" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reads error.code only from our envelope", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(respond(404, { error: { code: "PROFILE_NOT_FOUND", message: "x" } }))
      .mockResolvedValueOnce(new Response("<html>bad gateway</html>", { status: 502 }))
      .mockResolvedValueOnce(respond(403, { error: { code: "FORBIDDEN" } }));
    const client = createApiClient({ apiBase: "/api", ownerSub: OWNER, tokens: tokens(OWNER), onIdentityChanged: vi.fn(), fetchImpl });
    expect(await client.request("GET", "/me")).toMatchObject({ kind: "error", status: 404, code: "PROFILE_NOT_FOUND" });
    expect(await client.request("GET", "/me")).toMatchObject({ kind: "error", status: 502, code: null });
    expect(await client.request("GET", "/me")).toMatchObject({ kind: "error", status: 403, code: "FORBIDDEN" });
  });

  it("reports network failures and timeouts without throwing", async () => {
    const failing = createApiClient({
      apiBase: "/api",
      ownerSub: OWNER,
      tokens: tokens(OWNER),
      onIdentityChanged: vi.fn(),
      fetchImpl: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    expect(await failing.request("GET", "/me")).toEqual({ kind: "network", reason: "failed" });

    const slow = createApiClient({
      apiBase: "/api",
      ownerSub: OWNER,
      tokens: tokens(OWNER),
      onIdentityChanged: vi.fn(),
      timeoutMs: 5,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))),
    });
    expect(await slow.request("GET", "/me")).toEqual({ kind: "network", reason: "timeout" });
  });

  it("a refresh that cannot reach Cognito is a network failure, not a sign-out", async () => {
    const client = createApiClient({
      apiBase: "/api",
      ownerSub: OWNER,
      tokens: {
        accessToken: async () => {
          throw new Error("NetworkError");
        },
      },
      onIdentityChanged: vi.fn(),
      fetchImpl: vi.fn(),
    });
    expect(await client.request("GET", "/me")).toEqual({ kind: "network", reason: "failed" });
  });
});
