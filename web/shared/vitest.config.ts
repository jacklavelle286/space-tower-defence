import { defineConfig } from "vitest/config";

// Node by default (canonicaliser, API client, audio module). Component tests opt into jsdom with a
// `// @vitest-environment jsdom` first line and use React Testing Library.
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
