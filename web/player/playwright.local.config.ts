// Playwright for the local journeys (Phase 68; I §I.2.1): keyboard-only play and axe scans against the development
// servers (the player's fake sign-in and in-memory API, src/dev/devServices.ts; the admin's development pages on its
// fake API), so they need no account and no AWS:
//
//   cd web/player && npx playwright test -c playwright.local.config.ts
//
// The dev server is started for the run (or reused if one is already on port 5173). Uses the installed Chrome.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e/local",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  timeout: 3 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: "http://localhost:5173",
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 800 },
    locale: "en-GB",
    timezoneId: "Europe/London",
  },
  // The player (5173) and, for admin.spec.ts, the admin's development pages (5174), each reused if already running.
  webServer: [
    { command: "npm run dev", url: "http://localhost:5173", reuseExistingServer: true, timeout: 60_000 },
    { command: "npm run dev", cwd: "../admin", url: "http://localhost:5174/level-preview.html", reuseExistingServer: true, timeout: 60_000 },
  ],
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
});
