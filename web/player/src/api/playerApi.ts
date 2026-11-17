import type { ApiClient, ApiResult, Me, OpsBatchBody, OpsResponse, Planets, ProfileInput, Progress, RunList } from "@scd/shared";
import type { SpeechRequest, SpeechResponse } from "@scd/shared/audio";
import type { CreateRunBody, SessionBody } from "../run/types";
import type { SyncTransport } from "../sync/queue";

/**
 * The player routes the app uses (G R1, R3, R6, R8-R11, R13-R15). Every call goes through the ownerSub-checking
 * client. Run bodies come back unparsed (`unknown`): the run screen checks their shape (run/types.ts).
 */
export type ResetType = "CAMPAIGN_PROGRESS" | "LEARNING_HISTORY" | "WHOLE_PROFILE";

export interface PlayerApi extends SyncTransport {
  getMe(): Promise<ApiResult<Me>>;
  putProfile(input: ProfileInput): Promise<ApiResult<Me>>;
  getPlanets(): Promise<ApiResult<Planets>>;
  /** R5: one of the three account resets; `confirm` must equal `type` (Phase 55). */
  postReset(body: { type: ResetType; confirm: ResetType }): Promise<ApiResult<{ type: ResetType; completedAt: string }>>;
  /** R2: learning summaries, planets and badges (Phase 43). */
  getProgress(): Promise<ApiResult<Progress>>;
  /** R7: one page of the open or finished runs (Phase 32); pass the previous page's nextCursor for the next. */
  getRuns(state: "open" | "done", cursor?: string): Promise<ApiResult<RunList>>;
  createRun(body: CreateRunBody): Promise<ApiResult<unknown>>;
  getRun(runId: string): Promise<ApiResult<unknown>>;
  /** R12 CHOOSE_ENDLESS (online only, never queued; Phase 54): exactly one op in the R11 envelope. */
  chooseEndless(runId: string, body: OpsBatchBody): Promise<ApiResult<OpsResponse>>;
  getPack(runId: string): Promise<ApiResult<unknown>>;
  putSession(body: SessionBody): Promise<ApiResult<unknown>>;
  deleteSession(body: { sessionId: string; generation: number }): Promise<ApiResult<unknown>>;
  postSpeech(request: SpeechRequest): Promise<ApiResult<SpeechResponse>>;
}

export function createPlayerApi(client: ApiClient): PlayerApi {
  const run = (runId: string) => `/runs/${encodeURIComponent(runId)}`;
  return {
    getMe: () => client.request<Me>("GET", "/me"),
    putProfile: (input) => client.request<Me>("PUT", "/me/profile", input),
    getPlanets: () => client.request<Planets>("GET", "/planets"),
    postReset: (body) => client.request<{ type: ResetType; completedAt: string }>("POST", "/me/resets", body),
    getProgress: () => client.request<Progress>("GET", "/me/progress"),
    getRuns: (state, cursor) =>
      client.request<RunList>("GET", `/runs?state=${state}${cursor === undefined ? "" : `&cursor=${encodeURIComponent(cursor)}`}`),
    sendOps: (runId: string, body: OpsBatchBody) => client.request<OpsResponse>("POST", `${run(runId)}/ops`, body),
    createRun: (body) => client.request<unknown>("POST", "/runs", body),
    getRun: (runId) => client.request<unknown>("GET", run(runId)),
    chooseEndless: (runId, body) => client.request<OpsResponse>("POST", `${run(runId)}/endless`, body),
    getPack: (runId) => client.request<unknown>("GET", `${run(runId)}/pack`),
    putSession: (body) => client.request<unknown>("PUT", "/session", body),
    deleteSession: (body) => client.request<unknown>("DELETE", "/session", body),
    // Identifiers only (AC-20): never text, SSML, voice or engine.
    postSpeech: (request) =>
      client.request<SpeechResponse>("POST", "/speech", { runId: request.runId, slotId: request.slotId, variant: request.variant }),
  };
}
