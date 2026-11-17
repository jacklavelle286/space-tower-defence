// The battle preview build (Gate M, LD12; scope-level-designer.md §4 option C): a second entry of web/player, built
// into the admin site's dist/ under preview/ (the admin build runs it after its own, which empties dist/). Phaser stays
// in this package: the admin bundle never imports it (web/admin/src/no-phaser.test.ts).
//
// The page's code is served from /preview/ (base). The battle art keeps its absolute /assets/... paths, so the art
// the battlefield, HUD and placeholder use (common, luna-1, ui; not the activity pictures) is copied to the admin
// site's root /assets/, beside the admin's own content-hashed bundles. The release sorts those copies as files from
// web/player/public (scripts/release_manifest.py --preview-public).
import { cp } from "node:fs/promises";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const ADMIN_DIST = resolve(import.meta.dirname, "..", "admin", "dist");
/** The art folders of web/player/public/assets the battle draws from. */
export const PREVIEW_ART = ["common", "luna-1", "ui"] as const;

function copyBattleArt(): Plugin {
  return {
    name: "scd-preview-art",
    apply: "build",
    async closeBundle() {
      for (const dir of PREVIEW_ART) {
        await cp(resolve(import.meta.dirname, "public", "assets", dir), resolve(ADMIN_DIST, "assets", dir), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  base: "/preview/",
  publicDir: false,
  plugins: [react(), copyBattleArt()],
  build: {
    outDir: resolve(ADMIN_DIST, "preview"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1600,
    rolldownOptions: {
      input: resolve(import.meta.dirname, "battle-preview.html"),
      output: {
        codeSplitting: {
          groups: [{ name: "phaser", test: /node_modules[\\/]phaser[\\/]/ }],
        },
      },
    },
  },
});
