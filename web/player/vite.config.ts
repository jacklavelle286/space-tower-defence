import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, searchForWorkspaceRoot, type Connect, type Plugin } from "vite";

/** The repository's game-data/ folder (spine S5.1), published by the release under /game-data/. */
const GAME_DATA_DIR = resolve(import.meta.dirname, "..", "..", "game-data");
/** Only these paths are served: current.json and versioned ruleset and planet documents (VERSION_PATTERN). */
/** The simulator's campaign, which the local battlefield's ?simWave= imports (Phase 34; dev and perf builds only). */
const SIM_DATA = resolve(import.meta.dirname, "..", "..", "tools", "sim", "game_data.json");
const GAME_DATA_PATH = /^\/(current\.json|(ruleset|campaign|asset-manifest)\/[a-z0-9.-]{1,40}\.json)$/;

/**
 * Development only: serve game-data/ at /game-data/, the same paths the release publishes, so `npm run dev` plays the
 * data in the working tree (Phase 14 local development entry [ASSUMPTION]), and so does `npm run preview:perf` (the
 * Phase 34 measurement build). Never part of a build's output. The path pattern has no dots-and-slashes route out of
 * the folder.
 */
const serveGameData: Connect.NextHandleFunction = (req, res, next) => {
  const path = (req.url ?? "/").split("?")[0] ?? "/";
  if (!GAME_DATA_PATH.test(path)) {
    next();
    return;
  }
  readFile(join(GAME_DATA_DIR, path)).then(
    (body) => {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");
      res.end(body);
    },
    () => {
      res.statusCode = 404;
      res.end();
    },
  );
};

function localGameData(): Plugin {
  return {
    name: "scd-local-game-data",
    configurePreviewServer(server) {
      server.middlewares.use("/game-data", serveGameData);
    },
    configureServer(server) {
      server.middlewares.use("/game-data", serveGameData);
    },
  };
}

// Environment-free build: no hostnames, account IDs or pool IDs are baked in.
// Runtime values come from /config.json, published by the release workflow (plan H.8).
export default defineConfig({
  // Fixed ports: the player is always 5173 (admin 5174); a busy port fails loudly instead of moving to the next one.
  server: { port: 5173, strictPort: true, fs: { allow: [searchForWorkspaceRoot(process.cwd()), SIM_DATA] } },
  preview: { port: 4173, strictPort: true },
  plugins: [react(), localGameData()],
  build: {
    // Phaser alone is about 1.2 MB minified; it gets its own long-cached chunk.
    chunkSizeWarningLimit: 1600,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: "phaser", test: /node_modules[\\/]phaser[\\/]/ }],
        },
      },
    },
  },
});
