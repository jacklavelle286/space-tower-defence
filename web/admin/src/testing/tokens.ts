// Test helpers: a config and unsigned access tokens shaped like Cognito's. The guard reads claims only (the signature
// is the gateway's job), so a fake signature is enough. Example identifiers only.
import { base64url } from "../auth/pkce";
import type { AdminConfig } from "../config";

export const CONFIG: AdminConfig = {
  apiBase: "/api",
  releaseId: "r-1",
  region: "eu-west-2",
  userPoolId: "eu-west-2_Example1",
  clientId: "exampleclientid",
  authDomain: "scd-example-ops.auth.eu-west-2.amazoncognito.com",
  scope: "ops/content",
};

export const OPERATOR_ISSUER = "https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_Example1";
export const PLAYER_ISSUER = "https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_Players1";

export function jwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) => base64url(new TextEncoder().encode(JSON.stringify(value)));
  return `${part({ alg: "RS256" })}.${part(claims)}.signature`;
}

const FAR_FUTURE = 4102444800; // 2100-01-01

/** An operator-pool access token for the admin client; `groups` defaults to ["admin"]. */
export function operatorToken(groups: readonly string[] = ["admin"], extra: Record<string, unknown> = {}): string {
  return jwt({
    sub: "00000000-0000-4000-8000-000000000001",
    username: "operator",
    exp: FAR_FUTURE,
    token_use: "access",
    client_id: CONFIG.clientId,
    iss: OPERATOR_ISSUER,
    "cognito:groups": groups,
    ...extra,
  });
}

/** A player-pool access token: another pool, another client, no groups. */
export function playerToken(): string {
  return jwt({
    sub: "00000000-0000-4000-8000-000000000002",
    username: "player",
    exp: FAR_FUTURE,
    token_use: "access",
    client_id: "playerclientid",
    iss: PLAYER_ISSUER,
  });
}
