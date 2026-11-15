// Reading a run from the cloud save: R9 (the run and its slots), R10 (the pack: activity definitions and clips for
// the unresolved slots), then the game data the run pinned. Everything the run screen shows on entry comes from here,
// never from what the page remembered (spine S3.7).
import type { RunState } from "@scd/game-core";
import type { ApiResult } from "@scd/shared";
import type { PanelActivity } from "@scd/shared/learning";
import type { PlayerApi } from "../api/playerApi";
import type { GameData } from "../game/gameData";
import { buildRunState, panelActivity } from "./buildRunState";
import { parsePack, parseRunDetail, type Pack, type RunDetail } from "./types";

export interface SlotContent {
  activity: PanelActivity | null;
  clips: Readonly<Record<string, string>>;
}

export interface LoadedRun {
  detail: RunDetail;
  pack: Pack;
  data: GameData;
  state: RunState;
  content: ReadonlyMap<string, SlotContent>;
}

export type LoadOutcome =
  | { kind: "ready"; run: LoadedRun }
  | { kind: "ended"; detail: RunDetail }
  | { kind: "not-found" }
  | { kind: "auth-required" }
  | { kind: "failed" };

function problem(result: ApiResult<unknown>): LoadOutcome {
  if (result.kind === "auth-required" || result.kind === "identity-changed") return { kind: "auth-required" };
  if (result.kind === "error" && result.code === "NOT_FOUND") return { kind: "not-found" };
  return { kind: "failed" };
}

export async function loadRun(
  api: Pick<PlayerApi, "getRun" | "getPack">,
  runId: string,
  loadData: (rulesetVersion: string, campaignVersion: string) => Promise<GameData>,
): Promise<LoadOutcome> {
  const runResult = await api.getRun(runId);
  if (runResult.kind !== "ok") return problem(runResult);
  let detail: RunDetail;
  try {
    detail = parseRunDetail(runResult.body);
  } catch {
    return { kind: "failed" };
  }
  if (detail.status !== "IN_PROGRESS") return { kind: "ended", detail };

  const packResult = await api.getPack(runId);
  if (packResult.kind !== "ok") return problem(packResult);
  let pack: Pack;
  let data: GameData;
  try {
    pack = parsePack(packResult.body);
    data = await loadData(detail.pins.rulesetVersion, detail.pins.campaignVersion);
  } catch {
    return { kind: "failed" };
  }
  const content = new Map<string, SlotContent>(pack.slots.map((slot) => [slot.slotId, { activity: panelActivity(slot), clips: slot.clips }]));
  return { kind: "ready", run: { detail, pack, data, state: buildRunState(detail, pack, data.ruleset), content } };
}
