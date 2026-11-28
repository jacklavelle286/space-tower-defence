// Starting a game: R8 `POST /api/runs` (CREATE_RUN, online only, never queued as an op). The runId is made when the
// child presses New game and kept until a response arrives, so a lost response and a retry make exactly one run
// (G R8 idempotency). The same runId is reused after the takeover question.
import type { CurrentPointers } from "@scd/game-core";
import type { ApiResult } from "@scd/shared";
import type { PlayerApi } from "../api/playerApi";
import type { SyncQueue } from "../sync/queue";
import { claimRefusal, type PlayLease } from "./lease";
import { parseCreateRun } from "./types";

export type CreateOutcome =
  | { kind: "ok"; runId: string }
  | { kind: "takeover-confirm"; runId: string; deviceLabel: string }
  | { kind: "elsewhere"; deviceLabel: string; retryAfterSeconds: number }
  | { kind: "limit" }
  | { kind: "unavailable"; reason: string }
  | { kind: "upgrade" }
  | { kind: "auth-required" }
  /** `retryRunId` is set when the answer was not definite (no response, a timeout, 5xx or THROTTLED): the server may
   *  already have made the run, so the next New game press must send this runId again (G R8 idempotency). */
  | { kind: "failed"; retryRunId?: string };

export interface CreateDeps {
  api: Pick<PlayerApi, "createRun">;
  queue: Pick<SyncQueue, "control">;
  lease: Pick<PlayLease, "sessionId" | "deviceLabel" | "adopt">;
  loadCurrent: () => Promise<CurrentPointers>;
  newId?: () => string;
}

function code(result: ApiResult<unknown>): string | null {
  return result.kind === "error" ? result.code : null;
}

/** No definite answer: the request may have reached the server, so the same runId must be retried. */
function indefinite(result: ApiResult<unknown>): boolean {
  if (result.kind === "network") return true;
  if (result.kind !== "error") return false;
  return result.status >= 500 || result.status === 429 || result.code === "THROTTLED";
}

function reason(result: ApiResult<unknown>): string {
  if (result.kind !== "error" || typeof result.body !== "object" || result.body === null) return "";
  const details = (result.body as { error?: { details?: { reason?: unknown } } }).error?.details;
  return typeof details?.reason === "string" ? details.reason : "";
}

export async function createRun(
  deps: CreateDeps,
  /** `campaignVersion`: a tester's preview version (Gate M, LD7), used instead of current.json's. */
  choice: { planetId: string; waveSetId: string; campaignVersion?: string; difficulty?: "EASY" | "HARD" },
  options: { runId?: string; takeover?: boolean } = {},
): Promise<CreateOutcome> {
  const newId = deps.newId ?? (() => crypto.randomUUID());
  let runId = options.runId ?? newId();
  let current: CurrentPointers;
  try {
    current = await deps.loadCurrent();
  } catch {
    // Nothing was sent; keep a runId the caller is already holding for a retry.
    return options.runId !== undefined ? { kind: "failed", retryRunId: options.runId } : { kind: "failed" };
  }
  // CONTENT_VERSION_UNSUPPORTED: re-read current.json and try once more with a new runId (D7.3).
  for (let round = 0; round < 2; round += 1) {
    // The chosen planet's live version (Gate M, LD9: current.json lists each released planet; schema 1 names one,
    // so its only campaign is the planet's). A preview carries its own version.
    const listed = current.planets.find((p) => p.planetId === choice.planetId);
    const single = current.planets.length === 1 && current.planets[0]?.planetId === null ? current.campaignVersion : undefined;
    const campaignVersion = choice.campaignVersion ?? listed?.campaignVersion ?? single;
    if (campaignVersion === undefined) {
      // The planet is not (or no longer) released: read current.json again once, as for a stale version.
      if (round === 1) return { kind: "upgrade" };
      try {
        current = await deps.loadCurrent();
      } catch {
        return { kind: "failed" };
      }
      continue;
    }
    const result = await deps.queue.control(() =>
      deps.api.createRun({
        runId,
        planetId: choice.planetId,
        waveSetId: choice.waveSetId,
        rulesetVersion: current.rulesetVersion,
        campaignVersion,
        sessionId: deps.lease.sessionId,
        deviceLabel: deps.lease.deviceLabel,
        ...(options.takeover ? { takeover: true } : {}),
        ...(choice.difficulty === "HARD" ? { difficulty: "HARD" as const } : {}),
      }),
    );
    if (result.kind === "ok") {
      try {
        const created = parseCreateRun(result.body);
        deps.lease.adopt(created.run.runId, created.session);
        return { kind: "ok", runId: created.run.runId };
      } catch {
        return { kind: "failed" };
      }
    }
    switch (code(result)) {
      case "CONTENT_VERSION_UNSUPPORTED":
        // A preview the publisher has since made live, retired or closed: current.json cannot help (LD7).
        if (choice.campaignVersion !== undefined) return { kind: "unavailable", reason: "PREVIEW_CLOSED" };
        if (round === 1) return { kind: "upgrade" };
        try {
          current = await deps.loadCurrent();
        } catch {
          return { kind: "failed" };
        }
        runId = newId();
        continue;
      case "RUN_LIMIT_REACHED":
        return { kind: "limit" };
      case "CONTENT_UNAVAILABLE":
        return { kind: "unavailable", reason: reason(result) };
      default: {
        const refusal = claimRefusal(result);
        if (refusal.kind === "takeover-confirm") return { kind: "takeover-confirm", runId, deviceLabel: refusal.deviceLabel };
        if (refusal.kind === "elsewhere") return refusal;
        if (refusal.kind === "auth-required") return { kind: "auth-required" };
        return indefinite(result) ? { kind: "failed", retryRunId: runId } : { kind: "failed" };
      }
    }
  }
  return { kind: "failed" };
}
