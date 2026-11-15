/**
 * An unsigned, JWT-shaped string with the given claims, for tests and the local development backend only. The gateway
 * would refuse it (no valid signature); the browser library and `tokenSub` only base64-decode the payload (ADR-0012
 * check 15), which is all a test of the `ownerSub` check needs.
 */
export function unsignedToken(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(claims)}.unsigned`;
}
