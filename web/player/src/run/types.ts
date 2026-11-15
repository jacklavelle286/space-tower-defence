// Shapes of the run routes the run screen reads (G §4, §7), with small parsers: every response is untrusted until
// it has the fields the screen relies on. Field names follow api/shared/runs.py and api/shared/session.py.
import type { RunSummary } from "@scd/shared";

export interface SnapshotView {
  credits: number;
  placements: { padId: string; classId: string; level: number; targeting: string }[];
  colony: { health: number; shield: number };
  powers: Record<string, number>;
}

/** `currentSlot` (G §4.1): the slot the phase names, with the child's recorded answers (AC-17). */
export interface CurrentSlotView {
  slotId: string;
  kind: "NORMAL" | "METEOR";
  status: string;
  attempts: { n: number; answer: string; correct: boolean }[];
  withdrawn: boolean;
}

/** `RunView` (R8, R9, R11). */
export interface RunView extends RunSummary {
  plannedThrough: number;
  snapshot?: SnapshotView;
  seed?: string | null;
  pins: {
    ageBand: number | null;
    rulesetVersion: string;
    campaignVersion: string;
    assetManifestVersion: string | null;
    protocolVersion: number | null;
  };
  currentSlot: CurrentSlotView | null;
  recentOpIds: string[];
}

/** `RunDetail` (R9) = RunView + one compact entry per slot. */
export interface RunDetail extends RunView {
  slots: { slotId: string; kind: "NORMAL" | "METEOR"; status: string; attemptsUsed: number }[];
}

/** The lease a claim or create returned (R8 `session`, R13). */
export interface LeaseView {
  sessionId: string;
  generation: number;
  leaseExpiresAt: string;
  leaseSeconds: number;
  renewAfterSeconds: number;
}

export interface CreateRunBody {
  runId: string;
  planetId: string;
  waveSetId: string;
  rulesetVersion: string;
  campaignVersion: string;
  sessionId: string;
  deviceLabel: string;
  takeover?: boolean;
}

export interface CreateRunResponse {
  run: RunView;
  session: LeaseView;
}

export interface SessionBody {
  mode: "claim" | "renew";
  runId: string;
  sessionId: string;
  deviceLabel: string;
  generation?: number;
  takeover?: boolean;
}

/** One `slots[]` entry of the pack (G R10 allow-list). The definition is absent when `withdrawn`. */
export interface PackSlot {
  slotId: string;
  kind: "NORMAL" | "METEOR";
  activityId: string;
  activityVersion: string;
  interactionType?: string;
  prompt?: { text?: string };
  /** Per interaction type (C20.1); the learning panel reads it (toPanelActivity in web/shared). */
  activityPayload?: unknown;
  answerSpecification?: { accepted?: string[]; caseSensitive?: boolean };
  /** Two-step activities (C20.3): the second part, as authored. */
  additionalSteps?: unknown[];
  presentation?: { optionOrder?: string[]; tileOrder?: string[] };
  intro?: string | null;
  clips: Record<string, string>;
  reward: { credits: number; powerId?: string };
  withdrawn: boolean;
}

export interface Pack {
  protocolVersion: number;
  runId: string;
  revision: number;
  plannedThrough: number;
  packHash: string;
  gameData: { rulesetVersion: string; campaignVersion: string; assetManifestVersion: string | null };
  slots: PackSlot[];
  packStatus: { state: "COMPLETE" | "INCOMPLETE"; missing: { slotId: string; reason: string }[] };
}

export class ResponseShapeError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isString = (v: unknown): v is string => typeof v === "string";

function need(ok: boolean, what: string): void {
  if (!ok) throw new ResponseShapeError(`unexpected response: ${what}`);
}

function checkView(v: Record<string, unknown>): void {
  need(isString(v.runId) && isString(v.status) && isInt(v.wave) && isInt(v.finalWave) && isInt(v.revision), "run fields");
  need(isInt(v.highestCompletedWave) && isInt(v.plannedThrough), "run counters");
  need(isObject(v.pins) && isString(v.pins.rulesetVersion) && isString(v.pins.campaignVersion), "run pins");
  need(v.currentSlot === null || isObject(v.currentSlot), "currentSlot");
  if (isObject(v.currentSlot)) {
    const c = v.currentSlot;
    need(isString(c.slotId) && Array.isArray(c.attempts), "currentSlot fields");
    for (const a of c.attempts as unknown[]) need(isObject(a) && isString(a.answer) && typeof a.correct === "boolean", "attempt");
  }
  if (v.status === "IN_PROGRESS") need(isString(v.phase) && isObject(v.snapshot), "phase and snapshot");
}

export function parseRunView(body: unknown): RunView {
  need(isObject(body), "run view");
  checkView(body as Record<string, unknown>);
  return body as unknown as RunView;
}

export function parseRunDetail(body: unknown): RunDetail {
  need(isObject(body), "run detail");
  const v = body as Record<string, unknown>;
  checkView(v);
  need(Array.isArray(v.slots), "slots");
  for (const s of v.slots as unknown[]) need(isObject(s) && isString(s.slotId) && isString(s.status) && isInt(s.attemptsUsed), "slot entry");
  return body as unknown as RunDetail;
}

export function parsePack(body: unknown): Pack {
  need(isObject(body), "pack");
  const p = body as Record<string, unknown>;
  need(isString(p.runId) && Array.isArray(p.slots) && isObject(p.packStatus), "pack fields");
  for (const s of p.slots as unknown[]) {
    need(isObject(s) && isString(s.slotId) && isObject(s.clips) && isObject(s.reward) && typeof s.withdrawn === "boolean", "pack slot");
  }
  return body as unknown as Pack;
}

export function parseLease(body: unknown): LeaseView {
  need(isObject(body), "lease");
  const l = body as Record<string, unknown>;
  need(isString(l.sessionId) && isInt(l.generation) && isInt(l.renewAfterSeconds), "lease fields");
  return body as unknown as LeaseView;
}

export function parseCreateRun(body: unknown): CreateRunResponse {
  need(isObject(body), "create run");
  const b = body as Record<string, unknown>;
  return { run: parseRunView(b.run), session: parseLease(b.session) };
}
