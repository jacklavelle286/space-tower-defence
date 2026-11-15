import { defineConfig } from "vitest/config";

// Node-only tests for the admin's pure parts: PKCE and the token claims, config.json, the API client's error handling,
// and the review rules that enable Approve and Publish. The pages are thin React over these; a page test opts into jsdom
// with a `// @vitest-environment jsdom` first line and uses React Testing Library against a fake AdminApi.
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
