import { describe, expect, it } from "vitest";
import { readClaims } from "./auth/pkce";
import { checkAccess, issuerOf } from "./guard";
import { CONFIG, jwt, OPERATOR_ISSUER, operatorToken, playerToken } from "./testing/tokens";

// Phase 35 exit criteria, client side: a player account sees "not authorised", and so does an operator outside the
// exact `admin` group. (The server's own checks are tested in api/tests: gateway 401, admin-api 403.)
const access = (token: string) => {
  const claims = readClaims(token);
  if (claims === null) throw new Error("test token did not parse");
  return checkAccess(claims, CONFIG);
};

describe("route guard", () => {
  it("lets an operator-pool admin in", () => {
    expect(access(operatorToken())).toEqual({ allowed: true });
    expect(issuerOf(CONFIG)).toBe(OPERATOR_ISSUER);
  });

  it("refuses a player account's token as not an operator token", () => {
    expect(access(playerToken())).toEqual({ allowed: false, reason: "wrong-pool" });
  });

  it("refuses a player-pool token even if it claims the admin group", () => {
    const forged = jwt({ sub: "s", exp: 4102444800, token_use: "access", client_id: "playerclientid", "cognito:groups": ["admin"] });
    expect(access(forged)).toEqual({ allowed: false, reason: "wrong-pool" });
  });

  it("refuses an ID token, another client and another issuer", () => {
    expect(access(operatorToken(["admin"], { token_use: "id" }))).toMatchObject({ reason: "wrong-pool" });
    expect(access(operatorToken(["admin"], { client_id: "otherclient" }))).toMatchObject({ reason: "wrong-pool" });
    expect(access(operatorToken(["admin"], { iss: `${OPERATOR_ISSUER}x` }))).toMatchObject({ reason: "wrong-pool" });
  });

  it.each([[[]], [["Admin"]], [["admins"]], [["administrator"]], [["content-admin"]]])(
    "refuses an operator outside the exact admin group (%j)",
    (groups) => {
      expect(access(operatorToken(groups))).toEqual({ allowed: false, reason: "not-admin" });
    },
  );
});
