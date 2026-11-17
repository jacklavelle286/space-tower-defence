// Loading the live planet document from admin-api (Gate M, LD7): R46 sends current.json's campaign version and its
// document, and the editor merges and checks levels against it (levelFile.ts `liveBase`). A publish in the portal
// moves the live version without a release, so the copy this build was made with can be out of date.
import type { AdminApi, GameData } from "../api";
import { setLiveBase, type LiveBase } from "./levelFile";

export async function loadLiveBase(api: Pick<AdminApi, "getGameData">): Promise<{ base: LiveBase; data: GameData }> {
  const data = await api.getGameData();
  return { base: setLiveBase(data.current.campaignVersion, data.live), data };
}
