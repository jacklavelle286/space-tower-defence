import { defineConfig } from "vitest/config";

// Node-only tests for the player's pure parts (bridge throttle, layout, asset table). The real Phaser game is never
// mounted in a test (I-validation TS-C).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
