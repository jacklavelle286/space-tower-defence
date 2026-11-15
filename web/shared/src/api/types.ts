// Response and request shapes of the player routes the apps call (plan G §1-§5). Field names follow the handlers in
// api/functions/player_api/handler.py; anything not listed here is not read by the apps yet.

/** Our Lambdas' error body (G §1.2). Gateway and CloudFront errors (G §1.3) never have this shape. */
export interface ErrorEnvelope {
  error: {
    code: string;
    message?: string;
    details?: unknown;
    requestId?: string;
  };
}

/**
 * The result of one API request. The client never throws for an HTTP or network problem; callers switch on `kind`.
 * - `ok`: a 2xx response with its parsed JSON body (`null` for an empty body, e.g. 204).
 * - `error`: any other HTTP status. `code` is our envelope's `error.code`, or `null` when the body is not our envelope
 *   (gateway 404/429, CloudFront 5xx): G §1.3 "branch on the HTTP status first".
 * - `network`: no response (offline, DNS, CORS, abort) or no answer within the timeout.
 * - `auth-required`: the gateway refused the token twice (once before and once after one refresh), or there is no
 *   token at all. Nothing more is sent until the child signs in again (F §7, AC-33).
 * - `identity-changed`: the signed-in account is no longer the one this page was loaded for (`ownerSub`, E.7.4).
 *   Nothing was sent, and the client refuses every later request.
 */
export type ApiResult<T> =
  | { kind: "ok"; status: number; body: T }
  | { kind: "error"; status: number; code: string | null; body: unknown }
  | { kind: "network"; reason: "timeout" | "failed" }
  | { kind: "auth-required" }
  | { kind: "identity-changed" };

/** R1 `session`: whether a live lease is held by another browser (only these four fields, never the generation). */
export interface MeSession {
  activeElsewhere: boolean;
  runId: string | null;
  deviceLabel: string | null;
  leaseExpiresAt: string | null;
}

export type RunMode = "CAMPAIGN" | "CHALLENGE";

/** `RunSummary` (G §4.1). */
export interface RunSummary {
  runId: string;
  planetId: string;
  waveSetId: string;
  mode: RunMode;
  status: string;
  stage: string;
  phase?: string;
  wave: number;
  finalWave: number;
  highestCompletedWave: number;
  campaignCompletedAt?: string;
  lastPlayedAt: string;
  createdAt: string;
  revision: number;
  playable: boolean;
  reason?: string;
}

/** R1 `GET /api/me` (also the body of R3 and R4). The date of birth is never returned (spine S2). */
export interface Me {
  nickname: string;
  avatarId: string;
  age: number | null;
  ageBand: number | null;
  planets: Record<string, { bestCompletedWave?: number }>;
  badges: Record<string, string>;
  session: MeSession;
  runs: RunSummary[];
}

/** R3 `PUT /api/me/profile` request: all three fields required; `dob` is `YYYY-MM-DD`. */
export interface ProfileInput {
  nickname: string;
  avatarId: string;
  dob: string;
}

/** R6 `GET /api/planets`. */
export interface WaveSetEntry {
  waveSetId: string;
  mode: RunMode;
  name: string;
  finalWave: number;
  available: boolean;
  reason?: string;
}

export interface PlanetEntry {
  planetId: string;
  name: string;
  unlocked: boolean;
  waveSets: WaveSetEntry[];
}

export interface Planets {
  ageBand: number | null;
  planets: PlanetEntry[];
}

/** One op as sent in an R11 batch (G §5.1). `payload` is validated by the reducer that created it, not here. */
export interface WireOp {
  opId: string;
  expectedRevision: number;
  type: string;
  payload: Record<string, unknown>;
  clientTime: string;
}

/** R11 request envelope. `sessionId` and `generation` are the values stored with the ops when they were queued. */
export interface OpsBatchBody {
  protocolVersion: number;
  sessionId: string;
  generation: number;
  ops: WireOp[];
}

export type OpResultKind = "APPLIED" | "ALREADY_APPLIED" | "REJECTED" | "STALE_SESSION" | "NOT_PROCESSED";

export interface OpResult {
  opId: string;
  result: OpResultKind;
  code?: string;
  appliedRevision?: number;
  outcome?: string;
  details?: unknown;
  attempt?: { n: number; correct: boolean; slotStatus: string; rewardGranted: boolean };
}

/** R11 response (200), and the extra fields a 409 STALE_SESSION or 503 THROTTLED body carries (G §5.5). */
export interface OpsResponse {
  results: OpResult[];
  run: Record<string, unknown> & { runId: string; revision: number };
}
