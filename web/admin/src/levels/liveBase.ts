// Loading the planet a level is merged into from admin-api (Gate M, LD7, LD10): R46 sends the planet's document (its
// live one, an unreleased planet's newest, or its empty starting document) and the version a publish names as its
// source, and the editor merges and checks levels against it (levelFile.ts `liveBase`). A publish in the portal moves
// these without a release, so the copy this build was made with can be out of date. From AM1 it also sends the live
// ruleset (a made alien is a new ruleset), which every check uses from then on.
import type { AdminApi, GameData } from "../api";
import { setLiveBase, setLiveRuleset, type LiveBase } from "./levelFile";

export interface LoadedBase {
  readonly base: LiveBase;
  readonly data: GameData;
  /** The planet whose document this is. */
  readonly planetId: string;
  /** Whether that planet is released (in current.json): only then can a level of it be published live. */
  readonly released: boolean;
}

export async function loadLiveBase(api: Pick<AdminApi, "getGameData">, planetId?: string): Promise<LoadedBase> {
  const data = await api.getGameData(planetId);
  const planet = data.base?.planetId ?? planetId ?? "luna-1";
  const version = data.base?.sourceVersion ?? data.current.campaignVersion;
  const listed = data.current.planets ?? [{ planetId: null, campaignVersion: data.current.campaignVersion }];
  const released = listed.some((p) => p.planetId === planet || (p.planetId === null && p.campaignVersion === version));
  if (data.ruleset !== undefined) setLiveRuleset(data.ruleset); // AM1: before the planet, which may name made aliens
  return { base: setLiveBase(version, data.live), data, planetId: planet, released };
}
