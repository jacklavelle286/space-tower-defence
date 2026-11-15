import { defineConfig } from "vitest/config";

// Node by default for the player's pure parts (bridge throttle, layout, asset table, queue). Component tests opt into
// jsdom with a `// @vitest-environment jsdom` first line and use React Testing Library. The real Phaser game is never
// mounted in a test (I-validation TS-C).
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
