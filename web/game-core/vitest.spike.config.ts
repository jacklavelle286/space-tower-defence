// The LD0 spike runs (Gate M): long measurements kept out of the normal test run. From web/:
//   npx vitest run -c game-core/vitest.spike.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.spike.ts"],
    environment: "node",
    testTimeout: 3_600_000,
  },
});
