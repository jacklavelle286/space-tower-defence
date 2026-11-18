// @vitest-environment jsdom
// Staying signed in (ADR-0042): where the refresh token is kept for a trusted and an untrusted sign-in, renewal at
// /oauth2/token with rotation, and what a refused or unreachable renewal does.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG, operatorToken } from "../testing/tokens";
import { completeSignIn, currentSession, freshSession, signOut, trustsThisBrowser } from "./session";

const TOKEN_URL = `https://${CONFIG.authDomain}/oauth2/token`;
const EXPIRED = operatorToken(["admin"], { exp: 1_000 });

type Call = { url: string; body: URLSearchParams; keepalive: boolean };
let calls: Call[] = [];

function fakeFetch(...answers: (Response | Error)[]): typeof fetch {
  return vi.fn((url: string, init: RequestInit) => {
    calls.push({ url, body: init.body as URLSearchParams, keepalive: init.keepalive === true });
    const answer = answers.shift() ?? new Error("no answer left");
    return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
  }) as unknown as typeof fetch;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function returnFromCognito(trust: boolean) {
  window.sessionStorage.setItem("scd-admin-pkce", JSON.stringify({ verifier: "v".repeat(43), state: "s1", trust }));
  window.history.replaceState(null, "", "/auth/callback?code=c1&state=s1");
}

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("sign-in", () => {
  it("keeps the refresh token in this browser when it is trusted", async () => {
    returnFromCognito(true);
    await completeSignIn(CONFIG, fakeFetch(json({ access_token: operatorToken(), refresh_token: "r1" })));
    expect(window.localStorage.getItem("scd-admin-refresh")).toBe("r1");
    expect(window.sessionStorage.getItem("scd-admin-refresh")).toBeNull();
    expect(trustsThisBrowser()).toBe(true);
  });

  it("keeps it in this tab only when it is not, and leaves nothing behind in the browser", async () => {
    window.localStorage.setItem("scd-admin-refresh", "old");
    window.localStorage.setItem("scd-admin-trusted", "1");
    returnFromCognito(false);
    await completeSignIn(CONFIG, fakeFetch(json({ access_token: operatorToken(), refresh_token: "r1" })));
    expect(window.sessionStorage.getItem("scd-admin-refresh")).toBe("r1");
    expect(window.localStorage.getItem("scd-admin-refresh")).toBeNull();
    expect(trustsThisBrowser()).toBe(false);
  });
});

describe("renewal", () => {
  it("uses the stored access token while it lasts, with no request", async () => {
    window.sessionStorage.setItem("scd-admin-token", operatorToken());
    expect(await freshSession(CONFIG, fakeFetch())).not.toBeNull();
    expect(calls).toEqual([]);
  });

  it("renews an expired token with this browser's refresh token and keeps the rotated one", async () => {
    window.sessionStorage.setItem("scd-admin-token", EXPIRED);
    window.localStorage.setItem("scd-admin-refresh", "r1");
    const fresh = operatorToken();
    const session = await freshSession(CONFIG, fakeFetch(json({ access_token: fresh, refresh_token: "r2" })));
    expect(session?.accessToken).toBe(fresh);
    expect(calls[0]?.url).toBe(TOKEN_URL);
    expect(Object.fromEntries(calls[0]?.body ?? [])).toEqual({ grant_type: "refresh_token", client_id: CONFIG.clientId, refresh_token: "r1" });
    expect(window.localStorage.getItem("scd-admin-refresh")).toBe("r2");
    expect(currentSession()?.accessToken).toBe(fresh);
  });

  it("asks for a sign-in when Cognito refuses the refresh token, and forgets it", async () => {
    window.localStorage.setItem("scd-admin-refresh", "r1");
    expect(await freshSession(CONFIG, fakeFetch(json({ error: "invalid_grant" }, 400)))).toBeNull();
    expect(window.localStorage.getItem("scd-admin-refresh")).toBeNull();
  });

  it("keeps the refresh token when Cognito cannot be reached", async () => {
    window.localStorage.setItem("scd-admin-refresh", "r1");
    await expect(freshSession(CONFIG, fakeFetch(new TypeError("offline")))).rejects.toThrow(/could not be reached/u);
    expect(window.localStorage.getItem("scd-admin-refresh")).toBe("r1");
  });

  it("asks for a sign-in when there is nothing to renew with", async () => {
    expect(await freshSession(CONFIG, fakeFetch())).toBeNull();
    expect(calls).toEqual([]);
  });
});

describe("sign out", () => {
  it("revokes the refresh token, clears both stores and stops trusting the browser", () => {
    window.sessionStorage.setItem("scd-admin-token", operatorToken());
    window.localStorage.setItem("scd-admin-refresh", "r1");
    window.localStorage.setItem("scd-admin-trusted", "1");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined); // jsdom cannot navigate to /logout
    signOut(CONFIG, fakeFetch(json({})));
    quiet.mockRestore();
    expect(calls[0]?.url).toBe(`https://${CONFIG.authDomain}/oauth2/revoke`);
    expect(Object.fromEntries(calls[0]?.body ?? [])).toEqual({ token: "r1", client_id: CONFIG.clientId });
    expect(calls[0]?.keepalive).toBe(true);
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.getItem("scd-admin-token")).toBeNull();
  });
});
