import { describe, expect, it } from "vitest";
import type { AdminConfig } from "../config";
import { authorizeUrl, base64url, codeChallenge, isAdmin, logoutUrl, randomToken, readCallback, readClaims, tokenRequestBody } from "./pkce";

const CONFIG: AdminConfig = {
  apiBase: "/api",
  releaseId: "r-1",
  region: "eu-west-2",
  userPoolId: "eu-west-2_Example1",
  clientId: "exampleclientid",
  authDomain: "scd-example-ops.auth.eu-west-2.amazoncognito.com",
  scope: "ops/content",
};
const ORIGIN = "https://admin.aliens.jackgl.com";

function jwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));
  return `${part({ alg: "RS256" })}.${part(claims)}.signature`;
}

describe("PKCE", () => {
  it("computes the RFC 7636 appendix B challenge", async () => {
    expect(await codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("makes 43-character URL-safe verifiers", () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(randomToken()).not.toBe(token);
  });

  it("asks the operator pool for a code with S256, the admin callback and the ops scope", () => {
    const url = new URL(authorizeUrl(CONFIG, ORIGIN, "challenge", "state-1"));
    expect(`${url.origin}${url.pathname}`).toBe("https://scd-example-ops.auth.eu-west-2.amazoncognito.com/oauth2/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "exampleclientid",
      redirect_uri: "https://admin.aliens.jackgl.com/auth/callback",
      scope: "openid ops/content",
      code_challenge: "challenge",
      code_challenge_method: "S256",
      state: "state-1",
    });
  });

  it("sends the verifier and no secret to the token endpoint", () => {
    expect(Object.fromEntries(tokenRequestBody(CONFIG, ORIGIN, "the-code", "the-verifier"))).toEqual({
      grant_type: "authorization_code",
      client_id: "exampleclientid",
      code: "the-code",
      redirect_uri: "https://admin.aliens.jackgl.com/auth/callback",
      code_verifier: "the-verifier",
    });
  });

  it("signs out through Cognito's /logout back to the admin site", () => {
    const url = new URL(logoutUrl(CONFIG, ORIGIN));
    expect(url.pathname).toBe("/logout");
    expect(url.searchParams.get("logout_uri")).toBe("https://admin.aliens.jackgl.com/");
  });
});

describe("callback", () => {
  it("accepts only the state this tab sent", () => {
    expect(readCallback("?code=abc&state=s1", "s1")).toEqual({ ok: true, code: "abc" });
    expect(readCallback("?code=abc&state=s2", "s1")).toEqual({ ok: false, reason: "state" });
    expect(readCallback("?code=abc&state=s1", null)).toEqual({ ok: false, reason: "state" });
    expect(readCallback("?error=access_denied&state=s1", "s1")).toEqual({ ok: false, reason: "denied" });
    expect(readCallback("", "s1")).toEqual({ ok: false, reason: "missing" });
  });
});

describe("claims", () => {
  it("reads who is signed in and matches the admin group exactly", () => {
    const claims = readClaims(
      jwt({ sub: "s", username: "op", exp: 10, token_use: "access", client_id: "c", iss: "i", "cognito:groups": ["admin"] }),
    );
    expect(claims).toEqual({ sub: "s", username: "op", exp: 10, tokenUse: "access", clientId: "c", issuer: "i", groups: ["admin"] });
    expect(claims !== null && isAdmin(claims)).toBe(true);
    for (const groups of [[], ["administrators"], ["admin2"], ["admin-x"]]) {
      const other = readClaims(jwt({ sub: "s", exp: 10, "cognito:groups": groups }));
      expect(other !== null && isAdmin(other)).toBe(false);
    }
  });

  it("returns null for something that is not a token", () => {
    expect(readClaims("not-a-token")).toBeNull();
    expect(readClaims("a.b.c")).toBeNull();
  });
});
