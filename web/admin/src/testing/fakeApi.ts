// A fake AdminApi for the editor tests: activities and speech in memory, with the server's ordering rules (stale
// draftRevision -> 409 DRAFT_CONFLICT; publish needs every checklist line and the preview-solve of this revision).
// Validation answers with `problems`, which a test sets: the real checks are admin-api's, and the shared fixtures
// (contracts/fixtures/activities/) prove the editor's drafts pass them. Every call is recorded. Example IDs only.
import { isPictureKind, pictureKindOf, pictureKindSpec, type PictureKindId } from "@scd/shared";
import {
  type LevelFile,
  type LevelView,
  ApiError,
  type ActivitySummary,
  type ActivityView,
  type AdminApi,
  type BankStatus,
  type Definition,
  type NewActivity,
  type OpenPictureJob,
  type Picture,
  type PictureJob,
  type PictureUsage,
  type Problem,
  type SpeechSummary,
  type SpeechView,
} from "../api";
import { PUBLISH_CHECKLIST } from "../review";
import { BANK } from "./bank";

export type Call = { readonly name: string; readonly args: readonly unknown[] };

export const SPEECH: readonly SpeechSummary[] = [
  { speechId: "phoneme-sh", title: "sh sound", kind: "PHONEME", state: "APPROVED", approvedVersion: "20261115T100000Z", updatedAt: "2026-11-15T10:00:00Z" },
  {
    speechId: "instruction-sort-by-sound",
    title: "Sort by sound",
    kind: "INSTRUCTION",
    state: "APPROVED",
    approvedVersion: "20261115T100100Z",
    updatedAt: "2026-11-15T10:01:00Z",
  },
  { speechId: "word-draft-only", title: "Not approved yet", kind: "WORD", state: "DRAFT", approvedVersion: null, updatedAt: "2026-11-15T10:02:00Z" },
];

/** A fake library ID from the PNG's base64 (the real one is the sha256 of the canonical PNG). */
export function fakePictureId(pngBase64: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < pngBase64.length; i += 1) {
    a = Math.imul(a ^ pngBase64.charCodeAt(i), 0x01000193) >>> 0;
    b = Math.imul(b + pngBase64.charCodeAt(i), 0x5bd1e995) >>> 0;
  }
  const hex = (n: number) => n.toString(16).padStart(8, "0");
  return `lib-${hex(a)}${hex(b)}${hex((a ^ b) >>> 0)}${hex((a + b) >>> 0)}`;
}

type StoredPicture = Picture & { pngBase64: string };

type Stored = { header: ActivityView["header"]; definition: Definition; draftRevision: number; versions: ActivityView["versions"] };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class FakeAdminApi {
  readonly calls: Call[] = [];
  readonly activities = new Map<string, Stored>();
  /** What R30 answers (a test may replace it). */
  bank: BankStatus = clone(BANK);
  /** What the next validate returns as problems (empty: valid). */
  problems: Problem[] = [];
  /** The activities R32 names when it refuses to delete a speech definition (a test sets them). */
  speechUsers: Record<string, string[]> = {};
  readonly deletedSpeech = new Set<string>();
  /** The picture library (R33-R37). */
  readonly pictures = new Map<string, StoredPicture>();
  /** The activities R37 names when it refuses to delete a picture (a test sets them). */
  pictureUsers: Record<string, string[]> = {};
  /** R33's drawing usage; R38 counts against it and refuses at a cap, as admin-api does. */
  usage: PictureUsage = { usedToday: 0, dailyCap: 100, usedMonth: 0, monthlyCap: 150 };
  openJobs: OpenPictureJob[] = [];
  /** What R39 answers for each job, in order; the last answer repeats. A job with no script stays QUEUED. */
  readonly jobScripts = new Map<string, PictureJob[]>();
  /** R39 answers for jobs a test did not script (by start order): the first started job gets the first script. */
  readonly nextJobScripts: PictureJob[][] = [];
  readonly startedJobs = new Set<string>();
  /** The kind each started job is drawn as (R38), which a GENERATED picture takes (R34). */
  readonly jobKinds = new Map<string, PictureKindId>();
  private clock = 0;

  private record(name: string, ...args: unknown[]) {
    this.calls.push({ name, args: clone(args) });
  }

  private view(id: string): ActivityView {
    const stored = this.activities.get(id);
    if (stored === undefined) throw new ApiError(404, "NOT_FOUND");
    return clone({
      header: stored.header,
      draft: { definition: stored.definition, draftRevision: stored.draftRevision, updatedAt: "2026-11-15T10:00:00Z" },
      versions: stored.versions,
    });
  }

  /** Puts an existing activity in the store (for tests that start from a saved draft). */
  seed(definition: Definition, draftRevision = 1, publishedVersion: string | null = null): void {
    const summary: ActivitySummary = {
      activityId: definition.activityId,
      title: definition.title,
      subject: definition.subject,
      topicId: definition.topicId,
      rewardCategory: definition.rewardCategory,
      interactionType: definition.interactionType,
      authoringMode: definition.authoringMode,
      state: publishedVersion === null ? "DRAFT" : "PUBLISHED",
      publishedVersion,
      minAge: definition.minAge,
      maxAge: definition.maxAge,
      updatedAt: "2026-11-15T10:00:00Z",
    };
    this.activities.set(definition.activityId, {
      header: { ...summary, fromDraftRevision: publishedVersion === null ? null : draftRevision },
      definition: clone(definition),
      draftRevision,
      versions: publishedVersion === null ? [] : [{ versionId: publishedVersion, displayNumber: 1, publishedAt: "2026-11-15T10:00:00Z", publishedBy: "operator" }],
    });
  }

  /** Puts a picture in the library. Without `kind` it is a row saved before kinds (it reads as activity-object). */
  seedPicture(name: string, state: Picture["state"] = "APPROVED", source: Picture["source"] = "UPLOAD", kind?: PictureKindId): Picture {
    const pngBase64 = btoa(`png-${name}`);
    const id = fakePictureId(pngBase64);
    const picture: StoredPicture = {
      id,
      name,
      state,
      source,
      ...(kind !== undefined ? { kind } : {}),
      textFree: state === "APPROVED",
      pngBase64,
      ...(state === "APPROVED" ? { url: `/pictures/v1/${id}.png` } : {}),
    };
    this.pictures.set(id, picture);
    return this.publicPicture(picture);
  }

  private publicPicture(stored: StoredPicture): Picture {
    const { pngBase64: _png, ...picture } = stored;
    return clone(picture);
  }

  readonly api: AdminApi = {
    listSpeech: async () => {
      this.record("listSpeech");
      return { items: clone(SPEECH.filter((s) => !this.deletedSpeech.has(s.speechId))) };
    },
    deleteSpeech: async (speechId: string) => {
      this.record("deleteSpeech", speechId);
      const users = this.speechUsers[speechId] ?? [];
      if (users.length > 0) {
        throw new ApiError(400, "VALIDATION_FAILED", users.map((id) => ({ field: `usedBy.${id}`, rule: "speech_in_use" })));
      }
      const summary = SPEECH.find((s) => s.speechId === speechId);
      if (summary === undefined || this.deletedSpeech.has(speechId)) throw new ApiError(404, "NOT_FOUND");
      this.deletedSpeech.add(speechId);
      return { speechId, deletedVersions: summary.approvedVersion === null ? [] : [summary.approvedVersion] };
    },
    createSpeech: async () => {
      throw new ApiError(501, "NOT_IMPLEMENTED");
    },
    getSpeech: async (speechId: string) => {
      this.record("getSpeech", speechId);
      const summary = SPEECH.find((s) => s.speechId === speechId);
      if (summary === undefined || this.deletedSpeech.has(speechId)) throw new ApiError(404, "NOT_FOUND");
      const view: SpeechView = {
        header: summary,
        draft: { kind: summary.kind, provider: "polly", engine: "neural", voiceId: "Amy", draftRevision: 1, take: 1, updatedAt: summary.updatedAt, clipKey: "k", text: "sh" },
        versions: [],
      };
      return view;
    },
    saveSpeech: async () => {
      throw new ApiError(501, "NOT_IMPLEMENTED");
    },
    preview: async (body) => {
      this.record("preview", body);
      return { clipKey: "k", url: `https://clips.example/${body.speechId}.mp3`, expiresInSeconds: 300 };
    },
    approve: async () => {
      throw new ApiError(501, "NOT_IMPLEMENTED");
    },
    listActivities: async () => {
      this.record("listActivities");
      return { items: [...this.activities.values()].map((s) => clone(s.header)) };
    },
    createActivity: async (body: NewActivity) => {
      this.record("createActivity", body);
      if (!this.activities.has(body.activityId)) {
        this.seed({ schemaVersion: 1, ...body }, 0);
      }
      return this.view(body.activityId);
    },
    getActivity: async (id: string) => {
      this.record("getActivity", id);
      return this.view(id);
    },
    saveActivity: async (id: string, body: { draftRevision: number; definition: Definition }) => {
      this.record("saveActivity", id, body);
      const stored = this.activities.get(id);
      if (stored === undefined) throw new ApiError(404, "NOT_FOUND");
      if (stored.draftRevision !== body.draftRevision) throw new ApiError(409, "DRAFT_CONFLICT");
      stored.definition = clone(body.definition);
      stored.draftRevision += 1;
      if (stored.header.publishedVersion === null) stored.header.title = body.definition.title;
      return this.view(id);
    },
    validate: async (id: string, draftRevision: number) => {
      this.record("validate", id, draftRevision);
      const stored = this.activities.get(id);
      if (stored === undefined) throw new ApiError(404, "NOT_FOUND");
      if (stored.draftRevision !== draftRevision) throw new ApiError(409, "DRAFT_CONFLICT");
      return { valid: this.problems.length === 0, problems: clone(this.problems), draftRevision };
    },
    publish: async (id, body) => {
      this.record("publish", id, body);
      const stored = this.activities.get(id);
      if (stored === undefined) throw new ApiError(404, "NOT_FOUND");
      if (stored.draftRevision !== body.draftRevision) throw new ApiError(409, "DRAFT_CONFLICT");
      const problems: Problem[] = [];
      if (!PUBLISH_CHECKLIST.every((item) => body.review.checklist[item.key] === true)) {
        problems.push({ field: "review.checklist", rule: "checklist_incomplete" });
      }
      if (body.review.previewSolvedDraftRevision !== body.draftRevision) {
        problems.push({ field: "review.previewSolvedDraftRevision", rule: "preview_solve_stale" });
      }
      if (problems.length > 0) throw new ApiError(400, "VALIDATION_FAILED", problems);
      this.clock += 1;
      const versionId = `20261115T1200${this.clock < 10 ? "0" : ""}${this.clock}Z`;
      stored.versions.push({ versionId, displayNumber: stored.versions.length + 1, publishedAt: "2026-11-15T12:00:00Z", publishedBy: "operator" });
      stored.header = { ...stored.header, state: "PUBLISHED", publishedVersion: versionId, fromDraftRevision: body.draftRevision };
      return { versionId, displayNumber: stored.versions.length };
    },
    deleteActivity: async (id: string) => {
      this.record("deleteActivity", id);
      const stored = this.activities.get(id);
      if (stored === undefined) throw new ApiError(404, "NOT_FOUND");
      this.activities.delete(id);
      return { activityId: id, deletedVersions: stored.versions.map((v) => v.versionId) };
    },
    bankStatus: async () => {
      this.record("bankStatus");
      return clone(this.bank);
    },
    listPictures: async (state, kind) => {
      if (kind === undefined) this.record("listPictures", state);
      else this.record("listPictures", state, kind);
      const pictures = [...this.pictures.values()]
        .filter((p) => (state === undefined || p.state === state) && (kind === undefined || pictureKindOf(p.kind) === kind))
        .map((p) => ({
          id: p.id,
          name: p.name,
          state: p.state,
          source: p.source,
          ...(p.kind !== undefined ? { kind: p.kind } : {}),
          ...(p.jobId !== undefined ? { jobId: p.jobId } : {}),
          ...(p.url !== undefined ? { url: p.url } : {}),
        }));
      return { pictures, generation: clone(this.usage), openJobs: clone(this.openJobs) };
    },
    createPicture: async (body) => {
      this.record("createPicture", { ...body, pngBase64: body.pngBase64.length > 0 ? "(png)" : "" });
      if (body.approve && !body.textFree) throw new ApiError(400, "VALIDATION_FAILED", [{ field: "textFree", rule: "not_text_free" }]);
      const id = fakePictureId(body.pngBase64);
      const existing = this.pictures.get(id);
      if (existing !== undefined) return { picture: this.publicPicture(existing), duplicate: true };
      const approved = body.approve;
      // As admin-api: a GENERATED picture takes its job's kind and refuses another; an upload defaults to activity-object.
      const jobKind = body.jobId !== undefined ? this.jobKinds.get(body.jobId) : undefined;
      if (body.source === "GENERATED" && body.kind !== undefined && body.kind !== pictureKindOf(jobKind)) {
        throw new ApiError(400, "VALIDATION_FAILED", [{ field: "kind", rule: "kind_mismatch" }]);
      }
      const stored: StoredPicture = {
        id,
        name: body.name,
        state: approved ? "APPROVED" : "DRAFT",
        source: body.source,
        kind: body.source === "GENERATED" ? pictureKindOf(jobKind) : pictureKindOf(body.kind),
        textFree: body.textFree,
        pngBase64: body.pngBase64,
        ...(body.jobId !== undefined ? { jobId: body.jobId } : {}),
        ...(approved ? { url: `/pictures/v1/${id}.png` } : {}),
      };
      this.pictures.set(id, stored);
      return { picture: this.publicPicture(stored) };
    },
    getPicture: async (pictureId) => {
      this.record("getPicture", pictureId);
      const stored = this.pictures.get(pictureId);
      if (stored === undefined) throw new ApiError(404, "NOT_FOUND");
      return {
        picture: this.publicPicture(stored),
        usedBy: [...(this.pictureUsers[pictureId] ?? [])],
        ...(stored.state === "DRAFT" ? { pngBase64: stored.pngBase64 } : {}),
      };
    },
    approvePicture: async (pictureId, body) => {
      this.record("approvePicture", pictureId, body);
      const stored = this.pictures.get(pictureId);
      if (stored === undefined) throw new ApiError(404, "NOT_FOUND");
      if (body.textFree !== true) throw new ApiError(400, "VALIDATION_FAILED", [{ field: "textFree", rule: "not_text_free" }]);
      stored.state = "APPROVED";
      stored.textFree = true;
      stored.url = `/pictures/v1/${pictureId}.png`;
      return { picture: this.publicPicture(stored) };
    },
    deletePicture: async (pictureId) => {
      this.record("deletePicture", pictureId);
      const users = this.pictureUsers[pictureId] ?? [];
      if (users.length > 0) {
        throw new ApiError(400, "VALIDATION_FAILED", users.map((id) => ({ field: `usedBy.${id}`, rule: "picture_in_use" })));
      }
      if (!this.pictures.delete(pictureId)) throw new ApiError(404, "NOT_FOUND");
      return { pictureId, deleted: true };
    },
    startPictureJob: async (body) => {
      this.record("startPictureJob", body);
      // admin-api checks the kind before it counts anything (R38).
      const kind: unknown = (body as { kind?: unknown }).kind;
      if (kind === undefined) throw new ApiError(400, "VALIDATION_FAILED", [{ field: "kind", rule: "required" }]);
      if (!isPictureKind(kind)) throw new ApiError(400, "VALIDATION_FAILED", [{ field: "kind", rule: "unknown_kind" }]);
      if (!this.startedJobs.has(body.jobId)) {
        const off = this.usage.drawingOn === false || this.usage.dailyCap <= 0 || this.usage.monthlyCap <= 0;
        const weight = pictureKindSpec(kind).capWeight; // a background takes 3 places (R38, Gate P2)
        if (off || this.usage.usedMonth + weight > this.usage.monthlyCap || this.usage.usedToday + weight > this.usage.dailyCap) {
          // admin-api's 429 details (api/shared/picture_admin.py): "off" when a cap is 0 or no queue is set up (R33
          // drawingOn false), else the period and resetsAt (the month when both caps are full).
          const { dailyCap, monthlyCap } = this.usage;
          if (off) throw new ApiError(429, "PICTURE_CAP_REACHED", [], { period: "off", dailyCap, monthlyCap });
          const period = this.usage.usedMonth + weight > monthlyCap ? "month" : "day";
          throw new ApiError(429, "PICTURE_CAP_REACHED", [], { period, resetsAt: "2026-11-17T00:00:00Z", dailyCap, monthlyCap });
        }
        this.startedJobs.add(body.jobId);
        this.jobKinds.set(body.jobId, kind);
        this.usage = { ...this.usage, usedToday: this.usage.usedToday + weight, usedMonth: this.usage.usedMonth + weight };
        const script = this.nextJobScripts.shift();
        if (script !== undefined && !this.jobScripts.has(body.jobId)) this.jobScripts.set(body.jobId, script);
      }
      return { jobId: body.jobId, kind, ...clone(this.usage) };
    },
    getPictureJob: async (jobId) => {
      this.record("getPictureJob", jobId);
      const script = this.jobScripts.get(jobId);
      if (script === undefined || script.length === 0) return { state: "QUEUED" };
      const next = script.length > 1 ? script.shift() : script[0];
      return clone(next as PictureJob);
    },
    listLevels: async () => {
      this.record("listLevels");
      return {
        items: [...this.levels.values()].map(({ level, updatedAt }) => ({ levelId: level.levelId, name: level.name, status: "DRAFT" as const, updatedAt })),
      };
    },
    createLevel: async (level: LevelFile) => {
      this.record("createLevel", level);
      if (this.levels.has(level.levelId)) throw new ApiError(400, "VALIDATION_FAILED", [{ field: "level.levelId", rule: "exists" }]);
      this.levels.set(level.levelId, { level: clone(level), draftRevision: 0, updatedAt: "2026-11-17T10:00:00Z" });
      return this.levelView(level.levelId);
    },
    getLevel: async (levelId: string) => {
      this.record("getLevel", levelId);
      return this.levelView(levelId);
    },
    saveLevel: async (levelId: string, body: { draftRevision: number; level: LevelFile }) => {
      this.record("saveLevel", levelId, body);
      const stored = this.levels.get(levelId);
      if (stored === undefined) throw new ApiError(404, "NOT_FOUND");
      if (stored.draftRevision !== body.draftRevision) throw new ApiError(409, "DRAFT_CONFLICT");
      this.levels.set(levelId, { level: clone(body.level), draftRevision: stored.draftRevision + 1, updatedAt: "2026-11-17T10:05:00Z" });
      return this.levelView(levelId);
    },
    deleteLevel: async (levelId: string) => {
      this.record("deleteLevel", levelId);
      if (!this.levels.delete(levelId)) throw new ApiError(404, "NOT_FOUND");
      return { levelId, deleted: true as const };
    },
  };

  /** Level drafts (Gate M, LD3), by level ID. */
  readonly levels = new Map<string, { level: LevelFile; draftRevision: number; updatedAt: string }>();

  private levelView(levelId: string): LevelView {
    const stored = this.levels.get(levelId);
    if (stored === undefined) throw new ApiError(404, "NOT_FOUND");
    return {
      header: { levelId, name: stored.level.name, status: "DRAFT", updatedAt: stored.updatedAt },
      draft: { level: clone(stored.level), draftRevision: stored.draftRevision, updatedAt: stored.updatedAt },
    };
  }

  callsNamed(name: string): Call[] {
    return this.calls.filter((c) => c.name === name);
  }
}
