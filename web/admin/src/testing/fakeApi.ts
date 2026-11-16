// A fake AdminApi for the editor tests: activities and speech in memory, with the server's ordering rules (stale
// draftRevision -> 409 DRAFT_CONFLICT; publish needs every checklist line and the preview-solve of this revision).
// Validation answers with `problems`, which a test sets: the real checks are admin-api's, and the shared fixtures
// (contracts/fixtures/activities/) prove the editor's drafts pass them. Every call is recorded. Example IDs only.
import { ApiError, type ActivitySummary, type ActivityView, type AdminApi, type BankStatus, type Definition, type NewActivity, type Problem, type SpeechSummary, type SpeechView } from "../api";
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

type Stored = { header: ActivityView["header"]; definition: Definition; draftRevision: number; versions: ActivityView["versions"] };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class FakeAdminApi {
  readonly calls: Call[] = [];
  readonly activities = new Map<string, Stored>();
  /** What R30 answers (a test may replace it). */
  bank: BankStatus = clone(BANK);
  /** What the next validate returns as problems (empty: valid). */
  problems: Problem[] = [];
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

  readonly api: AdminApi = {
    listSpeech: async () => {
      this.record("listSpeech");
      return { items: clone([...SPEECH]) };
    },
    createSpeech: async () => {
      throw new ApiError(501, "NOT_IMPLEMENTED");
    },
    getSpeech: async (speechId: string) => {
      this.record("getSpeech", speechId);
      const summary = SPEECH.find((s) => s.speechId === speechId);
      if (summary === undefined) throw new ApiError(404, "NOT_FOUND");
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
  };

  callsNamed(name: string): Call[] {
    return this.calls.filter((c) => c.name === name);
  }
}
