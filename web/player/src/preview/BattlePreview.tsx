// The battle preview page (Gate M, LD12; scope-level-designer.md §4 option C): the level editor opens it in a new tab
// on the admin site and hands it the draft over a BroadcastChannel (@scd/shared/preview). It plays the real
// battlefield on a LocalRun: nothing is saved and the API is never called, so no run, bounds or reward can come of it
// (AC-04). Watch: the competent test player's towers, Ready pressed by itself and the learning skipped; Play: the
// operator plays from the same point, with the learning placeholder between waves.
import { compileBattleConfig, parsePlanet, parseRuleset, type PlanetDocument, type Ruleset } from "@scd/game-core";
import { REPO_ART } from "@scd/shared/manifest";
import { PREVIEW_CHANNEL, previewMessage, type PreviewDraft } from "@scd/shared/preview";
import { useEffect, useMemo, useState } from "react";
import { ActivityPlaceholder } from "../battlefield/ActivityPlaceholder";
import { Battlefield } from "../battlefield/Battlefield";
import { useGameBridge } from "../battlefield/bridgeContext";
import { EndScreen } from "../battlefield/EndScreen";
import { Hud } from "../battlefield/Hud";
import { PausedCard } from "../battlefield/PausedCard";
import { useAutoPlay } from "../battlefield/useAutoPlay";
import { useHud } from "../battlefield/useBridge";
import { LocalRun } from "../game/localRun";
import { BattlefieldControls } from "../hud/BattlefieldControls";
import { previewStart } from "./start";

/** How often the page says it is ready until the editor answers (the editor may still be setting up its listener). */
const READY_EVERY_MS = 1000;

interface Loaded {
  readonly draft: PreviewDraft;
  readonly ruleset: Ruleset;
  readonly planet: PlanetDocument;
}

/** Waits for this session's draft on the channel. */
function useDraft(session: string | null): { loaded: Loaded | null; error: string | null } {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(session === null ? "Open the preview from the level editor's Test tab." : null);
  useEffect(() => {
    if (session === null) return;
    const channel = new BroadcastChannel(PREVIEW_CHANNEL);
    let done = false;
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const message = previewMessage(event.data);
      if (done || message?.type !== "draft" || message.session !== session) return;
      done = true;
      try {
        const ruleset = parseRuleset(message.draft.ruleset);
        setLoaded({ draft: message.draft, ruleset, planet: parsePlanet(message.draft.planet, ruleset) });
      } catch (e) {
        setError(`This draft cannot be played: ${e instanceof Error ? e.message : String(e)}`);
      }
      channel.close();
    };
    const ready = () => !done && channel.postMessage({ type: "ready", session });
    ready();
    const timer = window.setInterval(ready, READY_EVERY_MS);
    const giveUp = window.setTimeout(() => !done && setError("The level editor did not answer. Close this tab and open the preview again."), 15_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(giveUp);
      channel.close();
    };
  }, [session]);
  return { loaded, error };
}

export function BattlePreview() {
  const session = useMemo(() => new URL(window.location.href).searchParams.get("session"), []);
  const { loaded, error } = useDraft(session);
  const [round, setRound] = useState(0);
  const game = useMemo(() => {
    if (loaded === null) return null;
    const config = compileBattleConfig(loaded.ruleset, loaded.planet, loaded.draft.waveSetId);
    const start = previewStart(loaded.ruleset, config, loaded.draft.wave, loaded.draft.mode);
    return { data: { ruleset: loaded.ruleset, planet: loaded.planet, art: REPO_ART }, run: new LocalRun(start.run), start, round };
  }, [loaded, round]);

  useEffect(() => {
    if (loaded !== null) document.title = `Preview: ${loaded.draft.title}`;
  }, [loaded]);

  let body;
  if (error !== null) body = <p className="notice" style={{ padding: 16 }}>{error}</p>;
  else if (game === null || loaded === null) body = <p style={{ padding: 16 }}>Waiting for the level editor…</p>;
  else
    body = (
      <Battlefield key={game.round} data={game.data} waveSetId={loaded.draft.waveSetId} run={game.run} seed="preview" speed={loaded.draft.speed}>
        <Overlays run={game.run} watch={loaded.draft.mode === "watch"} onAgain={() => setRound((r) => r + 1)} />
      </Battlefield>
    );
  const info =
    loaded === null || game === null
      ? null
      : `${loaded.draft.mode === "watch" ? "Watching the test player" : "Playing"} ${loaded.draft.title}, ${loaded.draft.waveSetId}, from wave ${game.start.run.wave} at ${loaded.draft.speed}x` +
        (game.start.lostAt !== null ? ` (the test player lost at wave ${game.start.lostAt}, so it starts there)` : "") +
        ". Nothing is saved.";
  return (
    <main className="run-screen">
      <h1 style={{ margin: 0, padding: "8px 16px", fontSize: 22 }}>Battle preview</h1>
      {info !== null && (
        <p role="status" style={{ margin: 0, padding: "0 16px 8px" }}>
          {info}
        </p>
      )}
      {body}
    </main>
  );
}

function Overlays({ run, watch, onAgain }: { run: LocalRun; watch: boolean; onAgain: () => void }) {
  const bridge = useGameBridge();
  const hud = useHud(bridge);
  useAutoPlay(bridge, run, hud, watch ? "watch" : null);
  const ended = hud.runStatus !== "IN_PROGRESS";
  const between = hud.runPhase === "ACTIVITY" || hud.runPhase === "METEOR";
  return (
    <>
      <Hud bridge={bridge} hud={hud} />
      <BattlefieldControls bridge={bridge} hud={hud} active={!ended && !between} />
      {between && !watch && <ActivityPlaceholder run={run} afterWave={hud.wave - 1} />}
      {hud.paused && !ended && hud.battle === "IN_WAVE" && <PausedCard bridge={bridge} />}
      {ended && <EndScreen hud={hud} onAction={onAgain} actionLabel="Again" />}
    </>
  );
}
