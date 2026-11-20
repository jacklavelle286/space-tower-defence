// Helpers for the deployed journeys (E2E-D). Rules kept here so every spec follows them:
// - Only the dedicated test accounts (I §I.2.10). Passwords come from the environment and are never printed: they are
//   typed with an `evaluate` (no step title or error message carries the value) and never compared in an `expect`.
// - The network log keeps method, path and status only. Never headers (the access token), never query strings (the
//   signed audio URL), never full URLs.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Browser, type BrowserContext, type Locator, type Page, type Response } from "@playwright/test";

export type TestAccount = "test-player-1" | "test-player-2";

const PASSWORD_VARIABLES: Record<TestAccount, string> = {
  "test-player-1": "SCD_E2E_PASSWORD_TEST_PLAYER_1",
  "test-player-2": "SCD_E2E_PASSWORD_TEST_PLAYER_2",
};

/** The nickname each test account is given if it has no profile yet (not a real name). */
export const TEST_NICKNAMES: Record<TestAccount, string> = {
  "test-player-1": "Tester One",
  "test-player-2": "Tester Two",
};

function password(account: TestAccount): string {
  const name = PASSWORD_VARIABLES[account];
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is not set. See web/player/e2e/deployed/README.md (read it from SSM, never commit it).`);
  }
  return value;
}

// ---------------------------------------------------------------------------------------------------------------
// What the page does, recorded without secrets.

export interface ApiCall {
  method: string;
  /** Path only, e.g. /api/runs/<runId>/ops. */
  path: string;
  status: number;
  /** Milliseconds from request start to the end of the response (Playwright's resource timing). */
  ms: number;
}

export interface Recorder {
  api: ApiCall[];
  /** Hosts other than the page's own that were contacted (e.g. the audio bucket), without paths. */
  otherHosts: Set<string>;
}

export function record(page: Page): Recorder {
  const recorder: Recorder = { api: [], otherHosts: new Set() };
  const origin = new URL(page.url() === "about:blank" ? baseUrl() : page.url()).host;
  page.on("requestfinished", (request) => {
    const url = new URL(request.url());
    if (url.host !== origin) {
      recorder.otherHosts.add(url.host);
      return;
    }
    if (!url.pathname.startsWith("/api/")) return;
    void request.response().then((response) => {
      recorder.api.push({
        method: request.method(),
        path: url.pathname,
        status: response?.status() ?? 0,
        ms: Math.round(request.timing().responseEnd),
      });
    });
  });
  return recorder;
}

function baseUrl(): string {
  return process.env["E2E_BASE_URL"] ?? "https://aliens.jackgl.com";
}

/**
 * Runs in the page before any of its scripts: records every audible `play()` of the one audio element (when it was
 * called, the last pointer press before it, when audio actually started) and replaces `speechSynthesis.speak` with a
 * counter, so the journey can prove no browser speech is used (AC-19).
 */
function audioSpy(): void {
  interface PlayRecord {
    pressAt: number | null;
    calledAt: number;
    startedAt: number | null;
    fromBlob: boolean;
    error: string | null;
  }
  const state = { plays: [] as PlayRecord[], speaks: 0, lastPress: null as number | null };
  (window as unknown as { scdE2eAudio: typeof state }).scdE2eAudio = state;
  window.addEventListener("pointerdown", () => (state.lastPress = performance.now()), true);
  window.addEventListener("keydown", () => (state.lastPress = performance.now()), true);
  const original = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function play(this: HTMLMediaElement) {
    const result = original.call(this);
    // The panel's "prime" is a muted play inside the gesture (E.9); only audible plays count.
    if (!this.muted) {
      const entry: PlayRecord = {
        pressAt: state.lastPress,
        calledAt: performance.now(),
        startedAt: null,
        fromBlob: (this.currentSrc || this.src).startsWith("blob:"),
        error: null,
      };
      state.plays.push(entry);
      this.addEventListener("playing", () => (entry.startedAt = performance.now()), { once: true });
      result.catch((error: unknown) => (entry.error = error instanceof Error ? error.name : "unknown"));
    }
    return result;
  };
  if ("speechSynthesis" in window) {
    window.speechSynthesis.speak = () => {
      state.speaks += 1;
    };
  }
}

export interface AudioState {
  plays: { pressAt: number | null; calledAt: number; startedAt: number | null; fromBlob: boolean; error: string | null }[];
  speaks: number;
}

export async function audioState(page: Page): Promise<AudioState> {
  return page.evaluate(() => {
    const s = (window as unknown as { scdE2eAudio?: AudioState }).scdE2eAudio;
    return { plays: s?.plays ?? [], speaks: s?.speaks ?? 0 };
  });
}

/** A fresh browser context (no tokens, no IndexedDB) with the audio spy installed. */
export async function freshContext(browser: Browser): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.addInitScript(audioSpy);
  return context;
}

// ---------------------------------------------------------------------------------------------------------------
// Signing in and the shell.

/** Types into a managed-login field without the value ever appearing in a step title, an error or a report. */
async function typeSecret(field: Locator, value: string): Promise<void> {
  await field.evaluate((element, secret) => {
    const input = element as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, secret);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

/** From the landing page, through Cognito managed login, back to the game (/home or /setup). */
export async function signIn(page: Page, account: TestAccount): Promise<void> {
  if (!page.url().startsWith(baseUrl())) await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => url.hostname.endsWith(".amazoncognito.com"));
  const username = page.locator('input[name="username"]:visible');
  const passwordField = page.locator('input[name="password"]:visible');
  await username.fill(account);
  // prompt=login (E.7.2): managed login always asks for the password, even right after another child signed out.
  expect(await passwordField.evaluate((element) => (element as HTMLInputElement).value.length)).toBe(0);
  await typeSecret(passwordField, password(account));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => url.origin === new URL(baseUrl()).origin && /^\/(home|setup)$/.test(url.pathname), {
    timeout: 60_000,
  });
}

/**
 * Makes sure the account has a profile (P3). A new profile gets the account's test nickname and a made-up birthday:
 * 1 January six years ago, computed at run time, so the account is age 6 for the whole year (the M1 activity is for
 * ages 5–6). Returns the nickname Home greets the player with.
 */
export async function ensureProfile(page: Page, account: TestAccount): Promise<string> {
  if (new URL(page.url()).pathname === "/setup") {
    await page.getByLabel("Your name").fill(TEST_NICKNAMES[account]);
    await page.locator('input[type="radio"]').first().check();
    await page.getByLabel("Day", { exact: true }).selectOption("1");
    await page.getByLabel("Month", { exact: true }).selectOption({ label: "January" });
    await page.getByLabel("Year", { exact: true }).selectOption(String(new Date().getFullYear() - 6));
    await page.getByRole("button", { name: "Done" }).click();
    await page.waitForURL(/\/home$/);
  }
  const greeting = page.locator("h1.home-greeting");
  await expect(greeting).toHaveText(/^Hi, .+!$/);
  return ((await greeting.textContent()) ?? "").replace(/^Hi, /, "").replace(/!$/, "");
}

/** The runId in /play/<runId>. */
export function runIdOf(page: Page): string {
  const match = /\/play\/([^/?#]+)$/.exec(new URL(page.url()).pathname);
  if (match?.[1] === undefined) throw new Error("not on a run screen");
  return match[1];
}

/**
 * Home → First Contact → the run screen. Answers the takeover question with "Play here" (it can only be this account).
 * Home lists the maps (LD23), each with Play and its challenges: these journeys start First Contact, the two-wave
 * challenge on the Moon they were written for.
 */
export async function newGame(page: Page): Promise<string> {
  await page.getByRole("group", { name: /^Challenges on / }).getByRole("button", { name: "First Contact", exact: true }).first().click();
  const playHere = page.getByRole("button", { name: "Play here" });
  await expect(async () => {
    if (await playHere.isVisible()) await playHere.click();
    expect(new URL(page.url()).pathname).toMatch(/^\/play\/[^/]+$/);
  }).toPass({ timeout: 60_000 });
  const limit = page.getByText("You have 5 games on the go");
  if (await limit.isVisible()) {
    throw new Error("RUN_LIMIT_REACHED: this test account has 5 unfinished runs (see README, 'Unfinished runs').");
  }
  return runIdOf(page);
}

// ---------------------------------------------------------------------------------------------------------------
// The battlefield.

/** Logical canvas size and tile size (web/player/src/game/layout.ts). */
const CANVAS = { width: 1920, height: 1056, tile: 96 };

/** Wave-1 open pads of luna-1-c1 nearest the middle of the route (game-data/campaign/luna-1-c1.json). */
export const NOVA_PADS = [
  { id: "p04", x: 6, y: 5 },
  { id: "p05", x: 6, y: 7 },
  { id: "p09", x: 10, y: 6 },
] as const;

export function hud(page: Page) {
  return {
    ready: page.getByRole("button", { name: "Ready!" }),
    wave: page.locator('.bf-stat[title="Wave"]'),
    async credits(): Promise<number> {
      const text = (await page.locator('.bf-stat[title="Credits"]').textContent()) ?? "";
      const value = Number(text.replace(/[^0-9]/g, ""));
      if (!Number.isFinite(value) || text.trim() === "") throw new Error("credits not shown");
      return value;
    },
  };
}

/** Clicks a pad on the Phaser canvas (scaled to fit) and buys a Nova there if the panel offers one. */
export async function placeNova(page: Page, pad: { x: number; y: number }): Promise<boolean> {
  const canvas = page.locator("canvas").first();
  const box = await canvas.boundingBox();
  if (box === null) throw new Error("battlefield canvas not visible");
  const px = CANVAS.tile / 2 + pad.x * CANVAS.tile;
  const py = CANVAS.tile / 2 + pad.y * CANVAS.tile;
  const padPanel = page.getByRole("dialog", { name: "Pad" });
  // The pads take input only once the scene has drawn them: click again until the pad panel opens.
  await expect(async () => {
    await page.mouse.click(box.x + (px * box.width) / CANVAS.width, box.y + (py * box.height) / CANVAS.height);
    await expect(padPanel).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  const buy = padPanel.getByRole("button", { name: /^Nova/ });
  let bought = false;
  if ((await buy.count()) > 0 && (await buy.isEnabled())) {
    await buy.click();
    bought = true;
  }
  const close = padPanel.getByRole("button", { name: "Close" });
  if (await close.isVisible()) await close.click();
  return bought;
}

/** Ready!, then 2x speed for the wave (the speed toggle only shows during a wave). */
export async function startWave(page: Page): Promise<void> {
  await hud(page).ready.click();
  const speed = page.getByRole("button", { name: /Speed 1x/ });
  await speed.click({ timeout: 10_000 }).catch(() => undefined);
}

// ---------------------------------------------------------------------------------------------------------------
// The learning panel (web/shared/src/learning/LearningPanel.tsx; words from copy.ts).

export function panel(page: Page) {
  const root = page.locator("section.lp");
  return {
    root,
    play: root.getByRole("button", { name: /^(Play|Play again)$/ }),
    options: root.getByRole("radio"),
    check: root.getByRole("button", { name: "Check" }),
    tries: root.locator(".lp-tries"),
    message: root.locator(".lp-message"),
    reward: root.locator(".lp-reward"),
    continueButton: root.getByRole("button", { name: "Continue" }),
    saveAndExit: root.getByRole("button", { name: "Save and exit" }),
    option(text: string): Locator {
      return root.getByRole("radio").filter({ has: page.locator(".lp-option-text", { hasText: new RegExp(`^${text}$`) }) });
    },
    async optionTexts(): Promise<string[]> {
      return root.locator(".lp-option-text").allTextContents();
    },
  };
}

/** The M1 activity as seeded (content/seed/activities/ph-0102.json): option texts and the accepted answer's text. */
export function seededActivity(): { prompt: string; options: string[]; answer: string } {
  const file = fileURLToPath(new URL("../../../../content/seed/activities/ph-0102.json", import.meta.url));
  const doc = JSON.parse(readFileSync(file, "utf8")) as {
    prompt: { text: string };
    activityPayload: { options: { id: string; text: string }[] };
    answerSpecification: { accepted: string[] };
  };
  const answer = doc.activityPayload.options.find((o) => o.id === doc.answerSpecification.accepted[0]);
  if (answer === undefined) throw new Error("ph-0102 seed has no accepted option");
  return { prompt: doc.prompt.text, options: doc.activityPayload.options.map((o) => o.text), answer: answer.text };
}

/** The ops answer for one SUBMIT_ATTEMPT press. */
export interface AttemptAnswer {
  result: string;
  outcome?: string;
  attempt?: { n: number; correct: boolean; slotStatus: string; rewardGranted: boolean };
}

export function isOpsWith(type: string) {
  return (response: Response): boolean => {
    const request = response.request();
    if (request.method() !== "POST" || !/^\/api\/runs\/[^/]+\/ops$/.test(new URL(response.url()).pathname)) return false;
    const body = request.postDataJSON() as { ops?: { type?: string }[] } | null;
    return body?.ops?.some((op) => op.type === type) ?? false;
  };
}

/** The result entry for the batch's SUBMIT_ATTEMPT op, and how many of those the batch carried. */
export async function attemptAnswer(response: Response): Promise<{ count: number; answer: AttemptAnswer }> {
  const body = response.request().postDataJSON() as { ops: { type: string }[] };
  const json = (await response.json()) as { results: AttemptAnswer[] };
  const indexes = body.ops.flatMap((op, i) => (op.type === "SUBMIT_ATTEMPT" ? [i] : []));
  const answer = json.results[indexes[0] ?? -1];
  if (answer === undefined) throw new Error("no result for SUBMIT_ATTEMPT");
  return { count: indexes.length, answer };
}
