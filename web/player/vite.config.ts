import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** The repository's game-data/ folder (spine S5.1), published by the release under /game-data/. */
const GAME_DATA_DIR = resolve(import.meta.dirname, "..", "..", "game-data");
/** Only these paths are served: current.json and versioned ruleset and planet documents (VERSION_PATTERN). */
const GAME_DATA_PATH = /^\/(current\.json|(ruleset|campaign)\/[a-z0-9.-]{1,40}\.json)$/;

/**
 * Development only (`apply: "serve"`): serve game-data/ at /game-data/, the same paths the release publishes, so
 * `npm run dev` plays the data in the working tree (Phase 14 local development entry [ASSUMPTION]). Never part of a
 * build. The path pattern has no dots-and-slashes route out of the folder.
 */
function localGameData(): Plugin {
  return {
    name: "scd-local-game-data",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/game-data", (req, res, next) => {
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
      });
    },
  };
}

// Environment-free build: no hostnames, account IDs or pool IDs are baked in.
// Runtime values come from /config.json, published by the release workflow (plan H.8).
export default defineConfig({
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
