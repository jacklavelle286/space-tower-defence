// Playwright for the deployed end-to-end journeys (E2E-D, I §I.2.1, Phase 23 / J M1-24). Run by the owner from a
// laptop after a release, never in CI and never by `npm test` (Vitest only looks in src/):
//
//   cd web/player && npx playwright test e2e/deployed
//
// with the test-account passwords in the environment (e2e/deployed/README.md). Only the dedicated test accounts are
// used (I §I.2.10). The target is the real hostname: B §B3.2 is not done on *.cloudfront.net (Phase 23 risk).
//
// Traces and videos are off on purpose: a trace records every request header (the access token) and every typed
// value, and a test report must never hold a token or a password (CLAUDE.md "Secrets"). Screenshots on failure show
// the game screen only; they land in test-results/, which git ignores.
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env["E2E_BASE_URL"] ?? "https://aliens.jackgl.com";
if (new URL(baseURL).hostname.endsWith(".cloudfront.net")) {
  throw new Error("E2E_BASE_URL must be the real hostname (aliens.jackgl.com), not a *.cloudfront.net name (Phase 23 risk).");
}

// One browser per run, chosen by E2E_BROWSER, so the one-clip browser check (docs/validation/browsers.md) is the same
// journey on each browser. "chrome" and "msedge" use the browser installed on the laptop (nothing to download);
// "chromium", "firefox" and "webkit" need `npx playwright install <name>` once (into ~/.cache, not the repository).
// WebKit is Playwright's build, not Safari: a Safari row in browsers.md is checked by hand on a Mac.
const BROWSERS = {
  chrome: { ...devices["Desktop Chrome"], channel: "chrome" },
  msedge: { ...devices["Desktop Edge"], channel: "msedge" },
  chromium: { ...devices["Desktop Chrome"] },
  firefox: { ...devices["Desktop Firefox"] },
  webkit: { ...devices["Desktop Safari"] },
} as const;
type BrowserName = keyof typeof BROWSERS;
const browser = (process.env["E2E_BROWSER"] ?? "chrome") as BrowserName;
if (!(browser in BROWSERS)) {
  throw new Error(`E2E_BROWSER must be one of ${Object.keys(BROWSERS).join(", ")}`);
}

export default defineConfig({
  testDir: "./e2e",
  // The journeys share two accounts and their play-session leases: one at a time, in file order, no retries (a
  // retry would start a second run and hide what went wrong).
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  timeout: 10 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL,
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 800 },
    locale: "en-GB",
    timezoneId: "Europe/London",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
  projects: [{ name: browser, use: BROWSERS[browser] }],
});
