// The admin's API client and the shapes of the routes it uses (plan G §12 R17-R27, R31, R32, R16; pictures R33-R39). Same origin: every call goes
// to /api on admin.aliens.jackgl.com, with the operator's access token (G §1.1).
//
// Rule from G §1.3: branch on the HTTP status first, and read `error.code` only when the body is our envelope. A
// gateway 401 (expired or wrong token) has no envelope.
import type { PictureKindId } from "@scd/shared";

export type Problem = { readonly field: string; readonly rule: string };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: readonly Problem[];
  /** Structured details some codes carry as an object instead of a problem list (G §1.2), for example
   * PICTURE_CAP_REACHED's `{period, resetsAt}`. Empty for every other error. */
  readonly info: Readonly<Record<string, unknown>>;

  constructor(status: number, code: string, details: readonly Problem[] = [], info: Readonly<Record<string, unknown>> = {}) {
    super(`${status} ${code}`);
    this.status = status;
    this.code = code;
    this.details = details;
    this.info = info;
  }
}

export type Request = (
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
) => Promise<unknown>;

function envelope(body: unknown): { code: string; details: Problem[]; info: Record<string, unknown> } | null {
  if (typeof body !== "object" || body === null || !("error" in body))
    return null;
  const error = (body as { error: unknown }).error;
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  const details = (error as { details?: unknown }).details;
  if (typeof code !== "string") return null;
  const problems = Array.isArray(details)
    ? details.filter(
        (d): d is Problem =>
          typeof d === "object" &&
          d !== null &&
          typeof d.field === "string" &&
          typeof d.rule === "string",
      )
    : [];
  const info = typeof details === "object" && details !== null && !Array.isArray(details) ? { ...(details as Record<string, unknown>) } : {};
  return { code, details: problems, info };
}

export function makeRequest(
  apiBase: string,
  accessToken: string | (() => Promise<string>),
  fetchFn: typeof fetch = fetch,
): Request {
  return async (method, path, body) => {
    // A function renews the token when it is near expiry (ADR-0042); it throws ApiError 401 when a sign-in is needed.
    const token = typeof accessToken === "string" ? accessToken : await accessToken();
    const init: RequestInit = {
      method,
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    };
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
    throw error === null
      ? new ApiError(response.status, "GATEWAY")
      : new ApiError(response.status, error.code, error.details, error.info);
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
    case "PAYLOAD_TOO_LARGE":
      return "That picture is too big to send. Try a simpler picture.";
    case "PICTURE_CAP_REACHED":
      return "No more drawing for now: the limit is reached.";
    case "LEVEL_PUBLISHED":
      return "This level has been published, so it can't be deleted. Retire its wave sets instead.";
    case "PUBLISH_REFUSED":
      return `Not published: ${typeof error.info["message"] === "string" ? error.info["message"] : "the publisher refused"}.`;
    case "NETWORK":
      return "No connection. Check the internet and try again.";
    default:
      return `Something went wrong (${error.status} ${error.code}). Try again.`;
  }
}

// --- Speech (R16-R21) -----------------------------------------------------------------------------------------------

export type SpeechKind =
  "WORD" | "PHONEME" | "LETTER_NAME" | "INSTRUCTION" | "DICTATION";
export const SPEECH_KINDS: readonly SpeechKind[] = [
  "PHONEME",
  "LETTER_NAME",
  "WORD",
  "INSTRUCTION",
  "DICTATION",
];

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

export type SpeechView = {
  header: SpeechSummary;
  draft: SpeechDraft;
  versions: SpeechVersion[];
};
export type Preview = {
  clipKey: string;
  url: string;
  expiresInSeconds: number;
};
export type Approval = {
  versionId: string;
  clipKey: string;
  sha256: string;
  renderedAt: string | null;
  take: number;
};
/** R18's body. `text` is the first draft body (a sentence); without it admin-api starts from the bake-off's form. */
export type NewSpeech = {
  speechId: string;
  title: string;
  kind: SpeechKind;
  text?: string;
};

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
  activityPayload?: {
    optionStyle?: string;
    options?: Option[];
    [other: string]: unknown;
  };
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
  versions: {
    versionId: string;
    displayNumber: number;
    publishedAt: string;
    publishedBy: string;
  }[];
};

/** One generated question of a template, as R26 returns it for review (C25.3 rule 3). */
export type TemplateSample = {
  index: number;
  interactionType: string;
  prompt: { text: string };
  activityPayload: unknown;
  answerSpecification: { accepted: string[] };
};
/** R26: `domainSize` is 1 for a FIXED activity and the number of generated questions for a template, which also
 * returns `sample` (the smallest, three middle and the largest question). */
export type Validation = {
  valid: boolean;
  problems: Problem[];
  draftRevision: number;
  domainSize?: number;
  sample?: TemplateSample[];
};
export type Publication = { versionId: string; displayNumber: number };
/** R31's body: what was removed. */
export type Deletion = { activityId: string; deletedVersions: string[] };
/** R32's body: what was removed (the approved version IDs; clips stay in the audio bucket). */
export type SpeechDeletion = { speechId: string; deletedVersions: string[] };

/** The activities R32 named when it refused a delete (`usedBy.<activityId>`, rule `speech_in_use`), else []. */
export function speechUsers(error: unknown): string[] {
  if (!(error instanceof ApiError) || error.code !== "VALIDATION_FAILED") return [];
  const prefix = "usedBy.";
  return error.details
    .filter((p) => p.rule === "speech_in_use" && p.field.startsWith(prefix))
    .map((p) => p.field.slice(prefix.length));
}

/** R30 bank status (Phase 42; shared/selection/eligibility.py). `rewardCategory` is the slot kind: a BOTH activity is
 * counted in both. `mode`: READY (the plan's rules), STARTER (not eligible yet; games use the starter rules), BLOCKED
 * (new games for that age are refused). */
export type BankGroup = {
  subject: string;
  rewardCategory: "NORMAL" | "METEOR";
  count: number;
  threshold: number;
  hardMinimum: number;
  ok: boolean;
  topics: { topicId: string; count: number }[];
};
export type BankNeed =
  | {
      what: "UNITS";
      subject: string;
      rewardCategory: "NORMAL" | "METEOR";
      have: number;
      need: number;
      more: number;
    }
  | {
      what: "TOPICS";
      subject: string;
      have: number;
      need: number;
      more: number;
    }
  | {
      what: "TEMPLATE_INSTANCES";
      subject: string;
      rewardCategory: "NORMAL" | "METEOR";
      have: number;
      need: number;
      more: number;
    }
  | { what: "CAMPAIGN" };
export type BankBand = {
  ageBand: number;
  eligible: boolean;
  mode: "READY" | "STARTER" | "BLOCKED";
  activities: number;
  campaignFillable: boolean;
  starterCampaignFillable: boolean;
  /** Each released wave set, and whether the selector fills all its slots under the rules in force for this age. */
  waveSets: { waveSetId: string; fillable: boolean }[];
  groups: BankGroup[];
  subjects: {
    subject: string;
    topics: number;
    topicsWithEnough: number;
    topicsNeeded: number;
    ok: boolean;
  }[];
  templates: {
    subject: string;
    rewardCategory: "NORMAL" | "METEOR";
    instances: number;
    needed: number;
    ok: boolean;
  }[];
  needs: BankNeed[];
};
export type BankStatus = {
  /** The released wave sets the modes were judged on; null when admin-api could not read the released game data. */
  releasedWaveSets: string[] | null;
  rules: {
    starterUntilEligible: boolean;
    subjectFallback: boolean;
    topicsPerSubject: number;
    unitsPerTopic: number;
    campaignSlots: { NORMAL: number; METEOR: number };
  };
  ageBands: BankBand[];
};

// --- Pictures (R33-R39, Phases 42a and 42b) --------------------------------------------------------------------------

export type PictureState = "DRAFT" | "APPROVED";
export type PictureSource = "UPLOAD" | "GENERATED";

/** One row of R33. `url` (/pictures/v1/<id>.png) is set for approved pictures only: drafts are never served.
 * `kind` (Gate P2) is always sent; read it with pictureKindOf, which turns a missing or unknown kind into
 * "activity-object", as admin-api reads rows saved before kinds. */
export type PictureSummary = {
  id: string;
  name: string;
  state: PictureState;
  source: PictureSource;
  kind?: PictureKindId;
  textFree?: boolean;
  createdAt?: string;
  approvedAt?: string;
  jobId?: string;
  description?: string;
  url?: string;
};

/** The drawing caps and how many drawings were started today (Europe/London) and this month. A cap of 0 switches
 * drawing off. */
export type PictureUsage = { usedToday: number; dailyCap: number; usedMonth: number; monthlyCap: number; drawingOn?: boolean };

/** A drawing job from the last 24 hours that is still QUEUED or READY, so a reload brings its card back. The row
 * shape is admin-api's job summary (api/shared/picture_admin.py `_job_summary`). */
export type OpenPictureJob = {
  jobId: string;
  description: string;
  state: "QUEUED" | "READY";
  startedAt: string;
  /** The kind it is drawn as (pictureKindOf: a job from before kinds is "activity-object"). */
  kind?: PictureKindId;
  previousJobId?: string;
  change?: string;
};

export type PictureList = { pictures: PictureSummary[]; generation: PictureUsage; openJobs: OpenPictureJob[] };

/** The picture header (R34, R35, R36). Picture bytes never change: an edit makes a new picture. */
export type Picture = PictureSummary & {
  sha256?: string;
  bytes?: number;
  width?: number;
  height?: number;
  textFree: boolean;
  jobId?: string;
  description?: string;
  createdBy?: string;
  createdAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  publishRefs?: number;
};

/** R34's body: a 256x256 PNG the browser made (at most 512 KiB), base64 without a data: prefix. */
export type NewPicture = {
  name: string;
  source: PictureSource;
  /** UPLOAD: the kind (admin-api's default is "activity-object"). GENERATED: left out, the picture takes the job's
   * kind (a different kind is 400 `kind_mismatch`). */
  kind?: PictureKindId;
  jobId?: string;
  pngBase64: string;
  approve: boolean;
  textFree: boolean;
};
/** R34's answer: 201 for a new picture; 200 with `duplicate: true` when the same pixels are already stored. */
export type PictureSaved = { picture: Picture; duplicate?: boolean };
/** R35: the header, the activities that use it, and the PNG for a draft (an approved picture is served at `url`). */
export type PictureDetail = { picture: Picture; usedBy: string[]; pngBase64?: string };
/** R37's answer. `invalidated` is set for an approved picture only: false when a CloudFront invalidation failed (the
 * cached copy stays until it expires). */
export type PictureDeletion = { pictureId: string; deleted: true; invalidated?: boolean };

/** R38's body. `jobId` is a UUIDv4 made here: the idempotency key, so a resend never counts twice. `kind` is required
 * (400 `required` or `unknown_kind` before any cap is counted); a redraw must keep the earlier job's kind
 * (`kind_mismatch`). */
/** R38's body. `levelId` (Gate M, LD7): the level the drawing is for, counted on the Levels page. */
export type NewPictureJob = { jobId: string; description: string; kind: PictureKindId; previousJobId?: string; change?: string; levelId?: string };
/** R38's 202 answer. */
export type PictureJobStarted = { jobId: string; state?: string; kind?: PictureKindId } & PictureUsage;

/** Why a drawing failed (R39 FAILED `error`). */
export type PictureJobError = "declined" | "too_long" | "unusable" | "throttled" | "bedrock_error" | "timed_out" | "could_not_start" | "expired" | "bad_request" | "not_set_up";

/** R39: where a drawing job is. READY carries the sanitised SVG (admin-api sanitises it again before answering). */
export type PictureJob =
  | { state: "QUEUED"; elapsedSeconds?: number }
  | { state: "DRAWING"; phase?: "thinking" | "drawing"; elapsedSeconds?: number; outputTokens?: number }
  | { state: "READY"; svg: string; warnings?: string[] }
  | { state: "FAILED"; error: PictureJobError | string; message?: string };

/** The activities R37 named when it refused a delete (`usedBy.<activityId>`, rule `picture_in_use`), else []. */
export function pictureUsers(error: unknown): string[] {
  if (!(error instanceof ApiError) || error.code !== "VALIDATION_FAILED") return [];
  const prefix = "usedBy.";
  return error.details
    .filter((p) => p.rule === "picture_in_use" && p.field.startsWith(prefix))
    .map((p) => p.field.slice(prefix.length));
}

/** A guard against a server that never stops paging: 50 pages of 200 is far beyond the bank's size (plan C19). */
const MAX_PAGES = 50;

export function adminApi(request: Request) {
  const id = (value: string) => encodeURIComponent(value);
  /** Every page of an admin list (R17, R22): pages of 200, followed by nextCursor. */
  const allPages = async <T>(path: string): Promise<{ items: T[] }> => {
    const items: T[] = [];
    let cursor: string | null = null;
    for (let pages = 0; pages < MAX_PAGES; pages += 1) {
      const query: string =
        cursor === null ? "" : `&cursor=${encodeURIComponent(cursor)}`;
      const page = (await request("GET", `${path}?limit=200${query}`)) as {
        items: T[];
        nextCursor?: string | null;
      };
      items.push(...page.items);
      cursor = page.nextCursor ?? null;
      if (cursor === null) return { items };
    }
    throw new ApiError(0, "TOO_MANY_PAGES");
  };
  return {
    /** R17, every page (pages of 200, nextCursor): the list's filters and the new-speech ID need every ID. */
    listSpeech: () => allPages<SpeechSummary>("/admin/speech-definitions"),
    /** R18: 201 for a new definition; 200 with the existing one when the ID is already taken (create is idempotent). */
    createSpeech: (body: NewSpeech) =>
      request("POST", "/admin/speech-definitions", body) as Promise<SpeechView>,
    getSpeech: (speechId: string) =>
      request(
        "GET",
        `/admin/speech-definitions/${id(speechId)}`,
      ) as Promise<SpeechView>,
    saveSpeech: (
      speechId: string,
      body: {
        draftRevision: number;
        text?: string;
        ssml?: string;
        take?: number;
      },
    ) =>
      request(
        "PUT",
        `/admin/speech-definitions/${id(speechId)}`,
        body,
      ) as Promise<SpeechView>,
    preview: (body: {
      kind: SpeechKind;
      speechId: string;
      text?: string;
      ssml?: string;
      take?: number;
    }) => request("POST", "/admin/speech/preview", body) as Promise<Preview>,
    /** R21: `clipKey` is the clip the operator previewed and played; admin-api refuses it unless it is the saved draft's. */
    approve: (
      speechId: string,
      body: { draftRevision: number; clipKey: string; reviewNote?: string },
    ) =>
      request(
        "POST",
        `/admin/speech-definitions/${id(speechId)}/approve`,
        body,
      ) as Promise<Approval>,
    /** R32: removes a speech definition no activity uses (header, draft, every approved version). 400 with
     * `speech_in_use` problems (read them with speechUsers) while an activity draft or version names it; 404 when
     * nothing is left. */
    deleteSpeech: (speechId: string) =>
      request(
        "DELETE",
        `/admin/speech-definitions/${id(speechId)}`,
      ) as Promise<SpeechDeletion>,
    /** R22, every page: the list is cut into pages of 200 (nextCursor), and the new-activity ID needs every ID. */
    listActivities: () => allPages<ActivitySummary>("/admin/activities"),
    /** R23: 201 for a new activity; 200 with the existing one when the ID is already taken (create is idempotent). */
    createActivity: (body: NewActivity) =>
      request("POST", "/admin/activities", body) as Promise<ActivityView>,
    getActivity: (activityId: string) =>
      request(
        "GET",
        `/admin/activities/${id(activityId)}`,
      ) as Promise<ActivityView>,
    saveActivity: (
      activityId: string,
      body: { draftRevision: number; definition: Definition },
    ) =>
      request(
        "PUT",
        `/admin/activities/${id(activityId)}/draft`,
        body,
      ) as Promise<ActivityView>,
    validate: (activityId: string, draftRevision: number) =>
      request("POST", `/admin/activities/${id(activityId)}/validate`, {
        draftRevision,
      }) as Promise<Validation>,
    publish: (
      activityId: string,
      body: {
        draftRevision: number;
        review: {
          checklist: Record<string, boolean>;
          previewSolvedDraftRevision: number;
        };
      },
    ) =>
      request(
        "POST",
        `/admin/activities/${id(activityId)}/publish`,
        body,
      ) as Promise<Publication>,
    /** R30: counts against the thresholds for every age, from the same counting function selection uses. */
    bankStatus: () =>
      request("GET", "/admin/bank-status") as Promise<BankStatus>,
    /** R31: removes the activity for good (header, draft, every version). 404 when there is nothing left. */
    deleteActivity: (activityId: string) =>
      request(
        "DELETE",
        `/admin/activities/${id(activityId)}`,
      ) as Promise<Deletion>,
    /** R33: the picture library (both states unless `state` is given, every kind unless `kind` is), the drawing usage
     * and the open drawing jobs. */
    listPictures: (state?: PictureState, kind?: PictureKindId) => {
      const query = new URLSearchParams();
      if (state !== undefined) query.set("state", state);
      if (kind !== undefined) query.set("kind", kind);
      const qs = query.toString();
      return request("GET", qs === "" ? "/admin/pictures" : `/admin/pictures?${qs}`) as Promise<PictureList>;
    },
    /** R34: stores a browser-made 256x256 PNG; with `approve` (and `textFree`) it is approved in the same call. */
    createPicture: (body: NewPicture) => request("POST", "/admin/pictures", body) as Promise<PictureSaved>,
    /** R35: one picture, the activities that use it, and a draft's PNG. */
    getPicture: (pictureId: string) => request("GET", `/admin/pictures/${id(pictureId)}`) as Promise<PictureDetail>,
    /** R36: approves a draft. Refused unless the operator ticked "no letters, numbers or words". */
    approvePicture: (pictureId: string, body: { textFree: true; name?: string }) =>
      request("POST", `/admin/pictures/${id(pictureId)}/approve`, body) as Promise<PictureSaved>,
    /** R37: deletes a draft, or an approved picture no activity uses (removes the served file too). 400 with
     * `picture_in_use` problems (read them with pictureUsers) while an activity draft or version names it. */
    deletePicture: (pictureId: string) =>
      request("DELETE", `/admin/pictures/${id(pictureId)}`) as Promise<PictureDeletion>,
    /** R38: starts a drawing (counts toward the daily and monthly caps; 429 PICTURE_CAP_REACHED when one is reached). */
    startPictureJob: (body: NewPictureJob) =>
      request("POST", "/admin/picture-jobs", body) as Promise<PictureJobStarted>,
    /** R39: where a drawing job is. */
    getPictureJob: (jobId: string) => request("GET", `/admin/picture-jobs/${id(jobId)}`) as Promise<PictureJob>,
    /** R40, every page: the level drafts (Gate M, LD3). */
    listLevels: () => allPages<LevelSummary>("/admin/levels"),
    /** R41: a new level from a level file body (a template or an uploaded file). An ID in use is refused
     * (`level.levelId` / `exists`). */
    createLevel: (level: LevelFile, planetId?: string) =>
      request("POST", "/admin/levels", planetId === undefined ? { level } : { level, planetId }) as Promise<LevelView>,
    /** R42: the header and the draft. */
    getLevel: (levelId: string) => request("GET", `/admin/levels/${id(levelId)}`) as Promise<LevelView>,
    /** R43: save the draft; 409 DRAFT_CONFLICT when someone saved since `draftRevision`. */
    saveLevel: (levelId: string, body: { draftRevision: number; level: LevelFile }) =>
      request("PUT", `/admin/levels/${id(levelId)}/draft`, body) as Promise<LevelView>,
    /** R45: record that the balance checks ran on `draftRevision`, merged into the live `sourceVersion`; 409
     * DRAFT_CONFLICT when the draft moved on. */
    recordTestplay: (
      levelId: string,
      body: { draftRevision: number; sourceVersion: string; blocking: number; warnings: number },
    ) => request("POST", `/admin/levels/${id(levelId)}/testplay`, body) as Promise<LevelView>,
    /** R44: delete a level that was never published (409 LEVEL_PUBLISHED otherwise). */
    deleteLevel: (levelId: string) =>
      request("DELETE", `/admin/levels/${id(levelId)}`) as Promise<{ levelId: string; deleted: true }>,
    /** R62: move a level that was never published to another planet (LD19); 409 LEVEL_PUBLISHED otherwise. */
    moveLevel: (levelId: string, planetId: string) =>
      request("PUT", `/admin/levels/${id(levelId)}/planet`, { planetId }) as Promise<LevelView>,
    /** R46: the live game data, versions, testers and publish history (Gate M, LD7). */
    getGameData: (planetId?: string) =>
      request("GET", planetId === undefined ? "/admin/game-data" : `/admin/game-data?planet=${id(planetId)}`) as Promise<GameData>,
    /** R47: one published planet document. */
    getVersion: (campaignVersion: string) =>
      request("GET", `/admin/game-data/versions/${id(campaignVersion)}`) as Promise<{ campaignVersion: string; document: unknown }>,
    /** R48: the publisher's checks on a draft revision, without the balance checks. */
    validateLevel: (levelId: string, draftRevision: number) =>
      request("POST", `/admin/levels/${id(levelId)}/validate`, { draftRevision }) as Promise<LevelValidation>,
    /** R49: queue a publish (202); poll getLevel for `publish`. 409 PUBLISH_REFUSED NOT_TEST_PLAYED without a test play. */
    publishLevel: (levelId: string, body: PublishRequest) =>
      request("POST", `/admin/levels/${id(levelId)}/publish`, body) as Promise<{ publish: LevelPublish }>,
    /** R50: Make live, which is also the rollback. */
    makeLive: (campaignVersion: string) =>
      request("POST", "/admin/game-data/live", { campaignVersion }) as Promise<{ campaignVersion: string; live: true; prev?: string }>,
    /** R51: a wave set's state in one version. */
    setWaveSetState: (body: { campaignVersion: string; waveSetId: string; state: "published" | "retired" | "invalid" }) =>
      request("POST", "/admin/game-data/states", body) as Promise<unknown>,
    /** R52: the accounts (tester codes) that may play preview wave sets. */
    setTesters: (testers: string[]) => request("PUT", "/admin/game-data/testers", { testers }) as Promise<unknown>,
    /** R53: every planet, released ones first in unlock order (Gate M, LD10). */
    listPlanets: () => request("GET", "/admin/planets") as Promise<{ planets: PlanetSummary[]; artSets: string[] }>,
    /** R54: add a planet (not released until R56). */
    createPlanet: (body: NewPlanet) => request("POST", "/admin/planets", body) as Promise<{ planet: PlanetSummary }>,
    /** R55: change an unreleased planet. */
    updatePlanet: (planetId: string, body: Omit<NewPlanet, "planetId">) =>
      request("PUT", `/admin/planets/${id(planetId)}`, body) as Promise<{ planet: PlanetSummary }>,
    /** R56: release a planet (appended to the unlock order for good). */
    releasePlanet: (planetId: string) =>
      request("POST", `/admin/planets/${id(planetId)}/release`) as Promise<{ planetId: string; released: true; order?: number }>,
    /** R57: the game's aliens and the made ones (Gate M, AM1). */
    listAliens: () => request("GET", "/admin/aliens") as Promise<AlienList>,
    /** R58: make an alien (a draft; no walk yet). */
    createAlien: (body: NewAlien) => request("POST", "/admin/aliens", body) as Promise<{ alien: MadeAlien }>,
    /** R59: change a draft: its stats and its walk ([] or six approved Alien pictures). */
    updateAlien: (alienId: string, body: AlienStats & { art: string[] }) =>
      request("PUT", `/admin/aliens/${id(alienId)}`, body) as Promise<{ alien: MadeAlien }>,
    /** R60: delete a draft. */
    deleteAlien: (alienId: string) => request("DELETE", `/admin/aliens/${id(alienId)}`) as Promise<{ deleted: string }>,
    /** R61: queue the publish (202); poll listAliens for `publish`. */
    publishAlien: (alienId: string, ticks: AlienTicks) =>
      request("POST", `/admin/aliens/${id(alienId)}/publish`, { ticks }) as Promise<{ alien: MadeAlien }>,
  };
}

// --- Levels (R40-R44; Gate M, LD3) -----------------------------------------------------------------------------------

/** A level file: one map and (from LD4) the challenge waves and wave sets it owns. The same JSON is downloaded,
 * uploaded and stored as the draft (api/shared/levels.py). */
export type LevelFile = {
  kind: "level";
  schema: 1;
  levelId: string;
  name: string;
  map: {
    name: string;
    grid: { cols: number; rows: number };
    route: [number, number][];
    pads: { id: string; x: number; y: number; opensAfterWave: number }[];
    art: { backdrop: string | null; decorations: { art: string; x: number; y: number }[] };
  };
  /** The editor's keyframes and hand-set waves (wave numbers, LD4). Never part of the planet document. */
  design?: { keyframes?: number[]; overrides?: number[] };
  /** The campaign's 50 waves, only in a level that owns the campaign (LD4); absent or [] otherwise. */
  waves?: LevelWave[];
  /** Challenge-only waves by ID ("<levelId>-..."), played only in this level's challenges. */
  challengeWaves: Record<string, LevelWaveBody>;
  /** The wave sets this level owns: "campaign" (with `waves`) and challenges ("<levelId>-..."), all on this map. */
  waveSets: Record<string, LevelWaveSet>;
};

export type LevelGroup = { type: string; count: number; at: number; gap: number; cargo?: { type: string; count: number }[] };
export type LevelWaveBody = { groups: LevelGroup[]; hpMult: number; speedMult: number };
export type LevelWave = LevelWaveBody & { wave: number };
export type LevelWaveSet = {
  mode: "CAMPAIGN" | "CHALLENGE";
  name: string;
  mapId: string;
  waves: (number | string)[];
  meteorAfter: number[];
  startCredits: number;
  colonyHealth: number;
  classes: string[];
  padsOpenAsForWave: number;
  presetPlacements: { padId: string; classId: string; level: number; targeting: "FRONT" | "FAST" | "CROWD" | "STRONG" }[];
};

export type LevelSummary = {
  levelId: string;
  name: string;
  status: "DRAFT" | "PUBLISHED";
  /** The planet the level belongs to (LD10; luna-1 for every older level). */
  planetId?: string;
  updatedAt: string;
  /** Drawing places used for this level this London month (R38 with levelId; a background takes 3). */
  drawingsThisMonth?: number;
};

/** The last balance check run on the draft (R45, LD5): publish (R49, LD7) wants one on the revision it publishes,
 * against the live version it publishes onto. */
export type LevelReview = {
  testPlayedDraftRevision?: number;
  sourceVersion?: string;
  blocking?: number;
  warnings?: number;
  at?: string;
};

/** A publisher refusal (409 PUBLISH_REFUSED details, or a refused publish's `refusal`). */
export type PublishRefusal = { code: string; message: string; details?: unknown };

/** The level's latest publish (its PUB# item, LD6-LD7). */
export type LevelPublish = {
  draftRevision: number;
  state: "QUEUED" | "RUNNING" | "DONE" | "REFUSED";
  updatedAt?: string;
  campaignVersion?: string;
  sourceVersion?: string;
  live?: boolean;
  liveRefused?: string;
  refusal?: PublishRefusal;
};

/** A version this level published (V# item). */
export type LevelVersion = { campaignVersion: string; publishedAt: string; draftRevision: number; sourceVersion: string; by: string };

export type LevelView = {
  header: LevelSummary;
  draft: { level: LevelFile; draftRevision: number; updatedAt: string; review?: LevelReview };
  publish?: LevelPublish | null;
  versions?: LevelVersion[];
};

/** R48's answer: game-core's problems on the merged planet, and picture problems. */
export type LevelValidation = {
  sourceVersion: string;
  draftRevision: number;
  problems: { field: string; rule: string; severity: "hard" | "warn" }[];
  pictures: { pictureId: string; rule: string }[];
};

/** Scope step 12's hand ticks: what only a person can judge before Publish. */
export const HAND_TICKS = [
  ["routeReadsClearly", "The route reads clearly from start to colony."],
  ["backdropHasNoPath", "The backdrop has no painted path that could look like a second route."],
  ["nothingLooksLikeGamePieces", "Nothing in the backdrop or decorations looks like an alien, a pad or a path."],
  ["warningsRead", "I have read every warning and am happy with each."],
] as const;
export type HandTick = (typeof HAND_TICKS)[number][0];

export type PublishRequest = {
  draftRevision: number;
  sourceVersion: string;
  live: boolean;
  ticks: Record<HandTick, boolean>;
};

export type WaveSetState = "published" | "preview" | "retired" | "invalid";

/** A planet (R53, LD10): released ones have `order` and `liveVersion`; unreleased ones their newest version. */
export type PlanetSummary = {
  planetId: string;
  name: string;
  icon?: string | null;
  artSet?: string;
  backdrop?: string | null;
  status: "DRAFT" | "RELEASED";
  order?: number;
  liveVersion?: string;
  latestVersion?: string;
  campaignWaves?: number;
  readyToRelease?: boolean;
};

export type NewPlanet = { planetId: string; name: string; icon: string | null; artSet: string; backdrop: string | null };

// --- Aliens made in the portal (R57-R61; Gate M, AM1, ADR-0041) ----------------------------------------------------

/** A made alien's stats, inside LIMITS.alienMaker. */
export type AlienStats = { name: string; hp: number; speed: number; leak: number; bounty: number };
export type NewAlien = AlienStats & { alienId: string };
/** Where a made alien's publish is: R61 queues it, the publisher runs it (asynchronously) and keeps the outcome. */
export type AlienPublish = {
  state: "QUEUED" | "RUNNING" | "DONE" | "REFUSED";
  updatedAt?: string;
  code?: string;
  details?: { code?: string; message?: string; details?: unknown };
};
export type MadeAlien = NewAlien & {
  /** [] until the walk is made; then six approved Alien pictures. */
  art: string[];
  status: "DRAFT" | "PUBLISHED";
  rulesetVersion?: string;
  assetManifestVersion?: string;
  publishedAt?: string;
  updatedAt?: string;
  publish?: AlienPublish;
};
/** R57: the live ruleset's aliens (read-only; `made` for one published here) and the made ones. */
export type AlienList = {
  rulesetVersion: string;
  game: (NewAlien & { made: boolean })[];
  aliens: MadeAlien[];
  bosses: string[];
};
/** R61's three hand ticks: what only a person can judge before a made alien reaches children. */
export type AlienTicks = { friendly: boolean; walkLooksRight: boolean; statsFitTheName: boolean };

/** R46: what is published, newest version first. */
export type GameData = {
  /** current.json; `planets` (LD9) lists each released planet's live version, planetId null in schema 1. */
  current: { rulesetVersion: string; campaignVersion: string; planets?: { planetId: string | null; campaignVersion: string }[] };
  /** The live ruleset (AM1: made aliens are in it); the editor checks levels against it. */
  ruleset?: unknown;
  /** The document levels of `base.planetId` are merged into (R46 ?planet=, LD10). */
  live: unknown;
  /** Which planet `live` is, and the version a publish names as its source ("<planetId>-new" before any). */
  base?: { planetId: string; sourceVersion: string };
  testers: string[];
  versions: {
    campaignVersion: string;
    planetId: string;
    writtenAt: string;
    live: boolean;
    source: "portal" | "release";
    levelId?: string;
    by?: string;
    waveSets: { waveSetId: string; name: string; mode: "CAMPAIGN" | "CHALLENGE"; state: WaveSetState }[];
  }[];
  history: { at: string; action: "publish" | "make-live"; campaignVersion: string; prev?: string; live?: boolean; levelId?: string; by?: string }[];
};

export type AdminApi = ReturnType<typeof adminApi>;
