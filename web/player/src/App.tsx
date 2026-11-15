import { AUTO, Game, Scale } from "phaser";
import { useEffect, useMemo, useRef, useState } from "react";
import { Battlefield, type LocalOptions } from "./battlefield/Battlefield";
import { BootScene } from "./game/BootScene";
import { loadGameData, type GameData } from "./game/gameData";

/**
 * Development options from the page URL (local slice only): ?seed=<text>, ?colony=<1..20> (start with less colony
 * health), ?auto=1 (plays by itself, placing Novas: it usually wins), ?auto=lose (presses Ready with no Novas placed,
 * so the aliens get through: with ?colony=1 the defeat screen comes in seconds), ?speed=2.
 */
function localOptions(search: string): LocalOptions {
  const params = new URLSearchParams(search);
  const colony = Number.parseInt(params.get("colony") ?? "", 10);
  return {
    seed: params.get("seed") ?? "local-dev-seed",
    colonyHealth: Number.isInteger(colony) && colony >= 1 && colony <= 20 ? colony : null,
    autoPlay: params.get("auto") === "1" ? "play" : params.get("auto") === "lose" ? "lose" : null,
    speed: params.get("speed") === "2" ? 2 : 1,
  };
}

/**
 * Phase 14: in `npm run dev` the page is the local battlefield slice, reading game-data/ from the working tree.
 * Production builds keep the Phase 1 walking-skeleton page until the player shell (sign-in, saved games) exists, so
 * nothing playable is deployed before saving works [ASSUMPTION, build-phases Phase 14 "Deployed: nothing"].
 */
export function App() {
  return (
    <main style={{ margin: 0, minHeight: "100vh", background: "#141633", color: "#FFF4D6" }}>
      <h1 style={{ margin: 0, padding: "8px 16px", fontSize: 28 }}>Space Colony Defence</h1>
      {import.meta.env.DEV ? <LocalSlice /> : <Skeleton />}
    </main>
  );
}

function LocalSlice() {
  const options = useMemo(() => localOptions(window.location.search), []);
  const [data, setData] = useState<GameData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState(0);

  useEffect(() => {
    let live = true;
    loadGameData().then(
      (loaded) => live && setData(loaded),
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, []);

  if (error !== null) return <p style={{ padding: 16 }}>Could not load the game data: {error}</p>;
  if (data === null) return <p style={{ padding: 16 }}>Loading…</p>;
  // A new key makes a fresh run: React unmounts the old battlefield (destroying its Phaser game) and mounts a new one.
  return <Battlefield key={game} data={data} options={options} onNewGame={() => setGame((g) => g + 1)} />;
}

/** The Phase 1 walking skeleton: a Phaser scene (rectangle + Nova) proving the deployed page renders. */
function Skeleton() {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const parent = container.current;
    if (!parent) return;
    const game = new Game({
      type: AUTO,
      parent,
      width: 1920,
      height: 1056,
      backgroundColor: "#141633",
      scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_HORIZONTALLY },
      scene: [BootScene],
      input: { keyboard: false },
    });
    return () => game.destroy(true);
  }, []);
  return <div ref={container} style={{ width: "100%", maxWidth: 1280, margin: "0 auto" }} />;
}
