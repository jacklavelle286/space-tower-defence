import type { ApiResult, ErrorEnvelope } from "./types";

/**
 * Where the client gets the access token. `forceRefresh: true` asks the auth library to use the refresh token now
 * (after a gateway 401). Returns `null` when nobody is signed in or the refresh token was refused. Throws only for a
 * transient problem (the refresh call itself could not reach Cognito), which the client reports as `network`.
 */
export interface TokenSource {
  accessToken(options: { forceRefresh: boolean }): Promise<string | null>;
}

export interface ApiClientOptions {
  /** Same-origin base path from config.json, always "/api" (ADR-0001). */
  apiBase: string;
  /** The account this page load belongs to: the access token's `sub` when the page started (E.7.4 point 1). */
  ownerSub: string;
  tokens: TokenSource;
  /** Called once, the first time a token for a different account (or none at all) is seen. The page reloads. */
  onIdentityChanged: () => void;
  fetchImpl?: typeof fetch;
  /** No answer after this long counts as a network failure. player-api times out at 25 s (H §H.4.4). */
  timeoutMs?: number;
}

export interface ApiClient {
  request<T>(method: "GET" | "PUT" | "PATCH" | "POST" | "DELETE", path: string, body?: unknown): Promise<ApiResult<T>>;
  /** Refuse every later request (identity changed, or the page is about to sign out or reload). */
  stop(): void;
  readonly stopped: boolean;
}

/**
 * Reads `sub` from a JWT without checking its signature. That is enough here: the gateway verifies every token
 * (E.7.3); the page only needs to know *whose* token it holds before sending anything. Returns null if malformed.
 */
export function tokenSub(token: string): string | null {
  const parts = token.split(".");
  const payload = parts[1];
  if (parts.length !== 3 || payload === undefined || payload === "") return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof claims !== "object" || claims === null) return null;
    const sub = (claims as Record<string, unknown>).sub;
    return typeof sub === "string" && sub !== "" ? sub : null;
  } catch {
    return null;
  }
}

function isEnvelope(body: unknown): body is ErrorEnvelope {
  if (typeof body !== "object" || body === null) return false;
  const error = (body as Record<string, unknown>).error;
  return typeof error === "object" && error !== null && typeof (error as Record<string, unknown>).code === "string";
}

/**
 * A gateway refusal of the token: 401 (missing, expired, wrong pool) or 403 without our envelope (a token without the
 * route scope, e.g. an ID token; ADR-0012 checks 8-9). A 403 *with* our envelope is a Lambda `FORBIDDEN`, which is an
 * ordinary error, not a sign-in problem.
 */
function isGatewayAuthRefusal(status: number, body: unknown): boolean {
  return status === 401 || (status === 403 && !isEnvelope(body));
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * The one way the apps call `/api`. Before every request it reads the current token and compares its `sub` with
 * `ownerSub` (one page load = one account, E.7.4 point 2): on a mismatch nothing is sent, the client stops for good
 * and `onIdentityChanged` runs. A gateway 401 gets exactly one refresh and one identical resend (spine S7.2).
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let stopped = false;

  function identityChanged(): ApiResult<never> {
    if (!stopped) {
      stopped = true;
      options.onIdentityChanged();
    }
    return { kind: "identity-changed" };
  }

  /** Token for the next send, or the result to return instead of sending. */
  async function checkedToken(forceRefresh: boolean): Promise<{ token: string } | { result: ApiResult<never> }> {
    let token: string | null;
    try {
      token = await options.tokens.accessToken({ forceRefresh });
    } catch {
      return { result: { kind: "network", reason: "failed" } };
    }
    if (stopped) return { result: { kind: "identity-changed" } };
    if (token === null) return { result: { kind: "auth-required" } };
    const sub = tokenSub(token);
    if (sub === null) return { result: { kind: "auth-required" } };
    if (sub !== options.ownerSub) return { result: identityChanged() };
    return { token };
  }

  async function send(
    method: string,
    path: string,
    body: string | undefined,
    token: string,
  ): Promise<{ status: number; body: unknown } | { network: "timeout" | "failed" }> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const init: RequestInit = { method, headers, signal: controller.signal, cache: "no-store" };
      if (body !== undefined) init.body = body;
      const response = await fetchImpl(`${options.apiBase}${path}`, init);
      const text = await response.text();
      let parsed: unknown = null;
      if (text !== "") {
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text; // gateway or CloudFront bodies may be HTML or plain text; never read for meaning
        }
      }
      return { status: response.status, body: parsed };
    } catch {
      return { network: timedOut ? "timeout" : "failed" };
    } finally {
      clearTimeout(timer);
    }
  }

  async function request<T>(
    method: "GET" | "PUT" | "PATCH" | "POST" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<ApiResult<T>> {
    if (stopped) return { kind: "identity-changed" };
    // Serialised once, so a resend after a refresh is byte-for-byte the same request.
    const json = body === undefined ? undefined : JSON.stringify(body);

    let response: Awaited<ReturnType<typeof send>> | undefined;
    for (const forceRefresh of [false, true]) {
      const checked = await checkedToken(forceRefresh);
      if ("result" in checked) return checked.result;
      response = await send(method, path, json, checked.token);
      if ("network" in response) return { kind: "network", reason: response.network };
      if (!isGatewayAuthRefusal(response.status, response.body)) break;
      if (forceRefresh) return { kind: "auth-required" };
    }
    if (response === undefined || "network" in response) return { kind: "network", reason: "failed" };
    if (response.status >= 200 && response.status < 300) {
      return { kind: "ok", status: response.status, body: response.body as T };
    }
    const code = isEnvelope(response.body) ? response.body.error.code : null;
    return { kind: "error", status: response.status, code, body: response.body };
  }

  return {
    request,
    stop() {
      stopped = true;
    },
    get stopped() {
      return stopped;
    },
  };
}
