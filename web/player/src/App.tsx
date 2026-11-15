import { MECHANICS_VERSION } from "@scd/game-core";
import { AUTO, Game, Scale } from "phaser";
import { useEffect, useRef } from "react";
import { BootScene } from "./game/BootScene";

/** Logical battlefield size (plan C3.1: 20 x 11 tiles of 96 px). Phaser scales it to fit the container. */
const WIDTH = 1920;
const HEIGHT = 1056;

export function App() {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const parent = container.current;
    if (!parent) return;

    // Created inside the effect and destroyed in its cleanup. In development React StrictMode mounts,
    // unmounts and re-mounts every component once; without the cleanup that would leave two Phaser
    // games (two canvases, two game loops) running in the same page.
    const game = new Game({
      type: AUTO,
      parent,
      width: WIDTH,
      height: HEIGHT,
      backgroundColor: "#141633",
      scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_HORIZONTALLY },
      scene: [BootScene],
      // Keyboard shortcuts and accessible controls live in the React DOM (plan E.5.2). With Phaser's
      // keyboard plugin off it never listens for keys, so it can never call preventDefault on Tab,
      // Space or the arrows. (disableGlobalCapture() is not enough: the next addKey() turns capture back on.)
      input: { keyboard: false },
    });

    return () => {
      game.destroy(true);
    };
  }, []);

  return (
    <main style={{ margin: 0, minHeight: "100vh", background: "#141633", color: "#FFF4D6", fontFamily: "sans-serif" }}>
      <h1 style={{ margin: 0, padding: "12px 16px", fontSize: 20 }}>Space Colony Defence</h1>
      <div ref={container} style={{ width: "100%", maxWidth: 1280, margin: "0 auto" }} />
      <p style={{ padding: "8px 16px", fontSize: 12, opacity: 0.7 }}>
        Walking skeleton. Rules version {MECHANICS_VERSION}.
      </p>
    </main>
  );
}
