// The admin's API client and the shapes of the routes it uses (plan G §12 R17-R27, R16). Same origin: every call goes
// to /api on admin.aliens.jackgl.com, with the operator's access token (G §1.1).
//
// Rule from G §1.3: branch on the HTTP status first, and read `error.code` only when the body is our envelope. A
// gateway 401 (expired or wrong token) has no envelope.

export type Problem = { readonly field: string; readonly rule: string };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: readonly Problem[];

  constructor(status: number, code: string, details: readonly Problem[] = []) {
    super(`${status} ${code}`);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type Request = (method: "GET" | "POST" | "PUT", path: string, body?: unknown) => Promise<unknown>;

function envelope(body: unknown): { code: string; details: Problem[] } | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  const error = (body as { error: unknown }).error;
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  const details = (error as { details?: unknown }).details;
  if (typeof code !== "string") return null;
  const problems = Array.isArray(details)
    ? details.filter(
        (d): d is Problem => typeof d === "object" && d !== null && typeof d.field === "string" && typeof d.rule === "string",
      )
    : [];
  return { code, details: problems };
}

export function makeRequest(apiBase: string, accessToken: string, fetchFn: typeof fetch = fetch): Request {
  return async (method, path, body) => {
    const init: RequestInit = { method, headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" };
    if (body !== undefined) {
      init.headers = { ...init.headers, "Content-Type": "application/json" };
      init.body = JSON.stringify(body);
    }
    let response: Response;
    try {
      response = await fetchFn(`${apiBase}${path}`, init);
    } catch {
      throw new ApiError(0, "NETWORK");
    }
    const parsed: unknown = await response.json().catch(() => null);
    if (response.ok) return parsed;
    if (response.status === 401) throw new ApiError(401, "AUTH_REQUIRED"); // gateway: no envelope (G §1.3)
    const error = envelope(parsed);
    throw error === null ? new ApiError(response.status, "GATEWAY") : new ApiError(response.status, error.code, error.details);
  };
}

/** What the operator reads for an error (D §D8 copy). Never shows values: problems are field + rule only. */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) return "Something went wrong. Try again.";
  switch (error.code) {
    case "AUTH_REQUIRED":
      return "Your sign-in has expired. Sign in again.";
    case "FORBIDDEN":
      return "This account can't use the content admin.";
    case "DRAFT_CONFLICT":
      return "Someone saved this draft after you opened it. Reload to see their changes.";
    case "NOT_FOUND":
      return "Not found.";
    case "VALIDATION_FAILED":
      return `Not accepted: ${error.details.map((p) => `${p.field} (${p.rule})`).join(", ") || "invalid request"}.`;
    case "SPEECH_SYNTHESIS_FAILED":
      return "The voice service could not make this clip. Try again.";
    case "THROTTLED":
      return "Busy. Wait a moment and try again.";
    case "NETWORK":
      return "No connection. Check the internet and try again.";
    default:
      return `Something went wrong (${error.status} ${error.code}). Try again.`;
  }
}

// --- Speech (R16-R21) -----------------------------------------------------------------------------------------------

export type SpeechKind = "WORD" | "PHONEME" | "LETTER_NAME" | "INSTRUCTION" | "DICTATION";
export const SPEECH_KINDS: readonly SpeechKind[] = ["PHONEME", "LETTER_NAME", "WORD", "INSTRUCTION", "DICTATION"];

export type SpeechSummary = {
  speechId: string;
  title: string;
  kind: SpeechKind;
  state: "DRAFT" | "APPROVED";
  approvedVersion: string | null;
  updatedAt: string;
};

export type SpeechDraft = {
  kind: SpeechKind;
  provider: string;
  engine: string;
  voiceId: string;
  draftRevision: number;
  /** Which render of this text the clip key names (1..LIMITS.speechTake.max); "Try another take" increments it. */
  take: number;
  updatedAt: string;
  clipKey: string | null;
  text?: string;
  ssml?: string;
};

export type SpeechVersion = {
  versionId: string;
  clipKey: string;
  sha256: string;
  renderedAt: string | null;
  approvedAt: string;
  engine: string;
  voiceId: string;
  take: number;
};

export type SpeechView = { header: SpeechSummary; draft: SpeechDraft; versions: SpeechVersion[] };
export type Preview = { clipKey: string; url: string; expiresInSeconds: number };
export type Approval = { versionId: string; clipKey: string; sha256: string; take: number };

// --- Activities (R22-R27) -------------------------------------------------------------------------------------------

export type Option = { id: string; text: string };
/** An activity draft (C22.1). The payload's shape depends on the interaction type: editor/model.ts holds each type's
 * shape, as admin-api checks it (api/shared/activity_types.py). */
export type Definition = {
  activityId: string;
  title: string;
  subject: string;
  topicId: string;
  minAge: number;
  maxAge: number;
  interactionType: string;
  authoringMode: string;
  rewardCategory: string;
  audioRequirement?: string;
  prompt?: { text: string };
  activityPayload?: { optionStyle?: string; options?: Option[]; [other: string]: unknown };
  answerSpecification?: { accepted?: string[] };
  speechDefinitionReferences?: Record<string, { speechId: string }>;
  [other: string]: unknown;
};

/** R23's body: the identity fields, every one required (api/shared/content.py CREATE_FIELDS). */
export type NewActivity = {
  activityId: string;
  title: string;
  subject: string;
  topicId: string;
  rewardCategory: string;
  interactionType: string;
  authoringMode: string;
  minAge: number;
  maxAge: number;
};

export type ActivityState = "DRAFT" | "PUBLISHED" | "RETIRED";

/** One row of R22 (G §12): the activity header, no definition body. */
export type ActivitySummary = {
  activityId: string;
  title: string;
  subject: string;
  topicId: string;
  rewardCategory: string;
  interactionType: string;
  authoringMode: string;
  state: ActivityState;
  publishedVersion: string | null;
  minAge: number;
  maxAge: number;
  updatedAt: string;
};

export type ActivityView = {
  header: ActivitySummary & { fromDraftRevision: number | null };
  draft: { definition: Definition; draftRevision: number; updatedAt: string };
  versions: { versionId: string; displayNumber: number; publishedAt: string; publishedBy: string }[];
};

export type Validation = { valid: boolean; problems: Problem[]; draftRevision: number };
export type Publication = { versionId: string; displayNumber: number };

export function adminApi(request: Request) {
  const id = (value: string) => encodeURIComponent(value);
  return {
    listSpeech: () => request("GET", "/admin/speech-definitions?limit=200") as Promise<{ items: SpeechSummary[] }>,
    createSpeech: (body: { speechId: string; title: string; kind: SpeechKind }) =>
      request("POST", "/admin/speech-definitions", body) as Promise<SpeechView>,
    getSpeech: (speechId: string) => request("GET", `/admin/speech-definitions/${id(speechId)}`) as Promise<SpeechView>,
    saveSpeech: (speechId: string, body: { draftRevision: number; text?: string; ssml?: string; take?: number }) =>
      request("PUT", `/admin/speech-definitions/${id(speechId)}`, body) as Promise<SpeechView>,
    preview: (body: { kind: SpeechKind; speechId: string; text?: string; ssml?: string; take?: number }) =>
      request("POST", "/admin/speech/preview", body) as Promise<Preview>,
    approve: (speechId: string, body: { draftRevision: number; reviewNote?: string }) =>
      request("POST", `/admin/speech-definitions/${id(speechId)}/approve`, body) as Promise<Approval>,
    listActivities: () => request("GET", "/admin/activities?limit=200") as Promise<{ items: ActivitySummary[] }>,
    /** R23: 201 for a new activity; 200 with the existing one when the ID is already taken (create is idempotent). */
    createActivity: (body: NewActivity) => request("POST", "/admin/activities", body) as Promise<ActivityView>,
    getActivity: (activityId: string) => request("GET", `/admin/activities/${id(activityId)}`) as Promise<ActivityView>,
    saveActivity: (activityId: string, body: { draftRevision: number; definition: Definition }) =>
      request("PUT", `/admin/activities/${id(activityId)}/draft`, body) as Promise<ActivityView>,
    validate: (activityId: string, draftRevision: number) =>
      request("POST", `/admin/activities/${id(activityId)}/validate`, { draftRevision }) as Promise<Validation>,
    publish: (
      activityId: string,
      body: { draftRevision: number; review: { checklist: Record<string, boolean>; previewSolvedDraftRevision: number } },
    ) => request("POST", `/admin/activities/${id(activityId)}/publish`, body) as Promise<Publication>,
  };
}

export type AdminApi = ReturnType<typeof adminApi>;
