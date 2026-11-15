import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Environment-free build: no hostnames, account IDs or pool IDs are baked in.
// Runtime values come from /config.json, published by the release workflow (plan H.8).
export default defineConfig({
  plugins: [react()],
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
