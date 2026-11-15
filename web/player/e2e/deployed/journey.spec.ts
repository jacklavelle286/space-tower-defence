// The M1 journey on production (B §B3.2 "done when", J M1-24, Phase 23 exit criteria), as one E2E-D test on
// test-player-1:
//   1. a clip plays through the real speech service (AC-19, browser half: audio from local bytes, POST /api/speech
//      200 on every press, no browser speech; with the speech response held back 3 s, audio still starts first and
//      the request is still sent). The other half of AC-19, matching each press's `tts` log line, is an owner step:
//      the test prints each response's API Gateway request ID (docs/validation/m1-done-when.md row 1b);
//   2. three attempts and one reward (AC-16): wrong, wrong, right; the reward is granted once;
//   3. a refresh keeps the attempts (AC-17, the I §I.4.2 core: same option order, "tried" kept, tries left kept),
//      checked after one wrong answer and again after two (Phase 22: two greyed tries, one try left);
//   4. leaving and returning resumes from the cloud save: Save and exit, then a fresh browser context (no local
//      state at all) signs in and continues the same run at the same wave with the same credits;
//   5. the run finishes, and opening it again shows its final screen (RUN_TERMINAL, owner decision at Gate C).
// The run is played to its end so test runs never pile up against the five-open-runs limit. It never touches any
// other run of the account (the canary, I §I.2.10).
import { expect, test, type Page } from "@playwright/test";
import {
  attemptAnswer,
  audioState,
  ensureProfile,
  freshContext,
  hud,
  isOpsWith,
  newGame,
  NOVA_PADS,
  panel,
  placeNova,
  record,
  runIdOf,
  seededActivity,
  signIn,
  startWave,
  type Recorder,
} from "./support";

const ACCOUNT = "test-player-1";
/** Extra Play presses after the first, for the latency rows (I §I.2.9 asks for 10 per browser: set 9). */
const EXTRA_PRESSES = Number(process.env["E2E_EXTRA_PLAY_PRESSES"] ?? "2");

interface PressTiming {
  press: number;
  /** Play press to audio start, ms (the clip is stored locally, so this is I §I.2.9 case b). */
  toAudioMs: number | null;
  /** Round trip of the POST /api/speech sent with this press, ms (case c). */
  speechMs: number;
  speechStatus: number;
  /** API Gateway's request ID (the `apigw-requestid` header), which is the `requestId` on the `tts` log line. */
  requestId: string;
}

/** How long the slow-network step holds back the speech response (I §I.3 AC-19: 3 s). */
const HOLD_SPEECH_MS = 3_000;

/** Presses Play, waits for the audio to start and for the concurrent POST /api/speech, then for the clip to end. */
async function pressPlay(page: Page, press: number): Promise<PressTiming> {
  const lp = panel(page);
  const before = (await audioState(page)).plays.length;
  const speech = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/speech");
  await lp.play.click();
  const response = await speech;
  await expect
    .poll(async () => (await audioState(page)).plays.slice(before).some((p) => p.startedAt !== null || p.error !== null), {
      timeout: 15_000,
    })
    .toBe(true);
  const plays = (await audioState(page)).plays.slice(before);
  const played = plays.find((p) => p.startedAt !== null);
  expect(played, `audio did not start: ${plays.map((p) => p.error).join(", ")}`).toBeDefined();
  expect(played?.fromBlob, "audio plays from stored bytes (a blob: URL)").toBe(true);
  // The clip ends by itself; the button goes back from Stop to Play again.
  await expect(lp.play).toBeVisible({ timeout: 30_000 });
  return {
    press,
    toAudioMs:
      played !== undefined && played.startedAt !== null && played.pressAt !== null
        ? Math.round(played.startedAt - played.pressAt)
        : null,
    speechMs: Math.round(response.request().timing().responseEnd),
    speechStatus: response.status(),
    requestId: response.headers()["apigw-requestid"] ?? "?",
  };
}

/** Slow network (Phase 22, AC-19): the speech response is held back, the stored clip still plays at once, and the
 *  request is still sent and answered 200. */
async function pressPlayWithSlowSpeech(page: Page): Promise<void> {
  const lp = panel(page);
  const isSpeech = (url: URL) => url.pathname === "/api/speech";
  await page.route(isSpeech, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await new Promise((resolve) => setTimeout(resolve, HOLD_SPEECH_MS));
    return route.continue();
  });
  try {
    const before = (await audioState(page)).plays.length;
    let answered = false;
    const speech = page
      .waitForResponse((r) => r.request().method() === "POST" && isSpeech(new URL(r.url())))
      .then((response) => {
        answered = true;
        return response;
      });
    await lp.play.click();
    await expect
      .poll(async () => (await audioState(page)).plays.slice(before).some((p) => p.startedAt !== null), { timeout: HOLD_SPEECH_MS })
      .toBe(true);
    expect(answered, "audio started before the speech response arrived").toBe(false);
    const response = await speech;
    expect(response.status()).toBe(200);
    await expect(lp.play).toBeVisible({ timeout: 30_000 });
  } finally {
    await page.unroute(isSpeech);
  }
}

async function submit(page: Page, optionText: string) {
  const lp = panel(page);
  await lp.option(optionText).click();
  const ops = page.waitForResponse(isOpsWith("SUBMIT_ATTEMPT"));
  // A double click is still one attempt (Check latches, I §I.4.2 step 7).
  await lp.check.dblclick();
  const answered = await ops;
  expect(answered.status()).toBe(200);
  return attemptAnswer(answered);
}

function summary(recorder: Recorder): string {
  const counts = new Map<string, number>();
  for (const call of recorder.api) {
    const key = `${call.method} ${call.path.replace(/\/runs\/[^/]+/, "/runs/{runId}")} ${call.status}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([k, n]) => `${n} x ${k}`).join("\n");
}

test("M1 journey on production: clip, three attempts, one reward, refresh, resume from the cloud", async ({ browser }) => {
  const seeded = seededActivity();
  const wrong = seeded.options.filter((t) => t !== seeded.answer);
  expect(wrong.length).toBeGreaterThanOrEqual(2);
  const timings: PressTiming[] = [];

  // --- Sign in, profile, New game -------------------------------------------------------------------------------
  const first = await freshContext(browser);
  let page = await first.newPage();
  let recorder = record(page);
  await test.step("sign in through managed login", async () => {
    await page.goto("/");
    await signIn(page, ACCOUNT);
    await ensureProfile(page, ACCOUNT);
  });

  const runId = await test.step("New game", async () => newGame(page));
  await expect(hud(page).wave).toHaveText(/Wave 1 of 2/, { timeout: 60_000 });

  // --- Wave 1 -----------------------------------------------------------------------------------------------------
  await test.step("place Novas and clear wave 1", async () => {
    await expect(hud(page).ready).toBeVisible();
    let bought = 0;
    for (const pad of NOVA_PADS) if (await placeNova(page, pad)) bought += 1;
    expect(bought, "at least one Nova placed").toBeGreaterThan(0);
    await startWave(page);
    await expect(panel(page).root).toBeVisible({ timeout: 4 * 60_000 });
  });

  // --- The activity: a clip through the real service ---------------------------------------------------------------
  const lp = panel(page);
  await test.step("the activity opens with three tries and the seeded options", async () => {
    await expect(lp.root.locator(".lp-heading")).toHaveText(seeded.prompt);
    await expect(lp.tries).toContainText("Tries left: 3");
    await expect(lp.options.first()).toBeVisible({ timeout: 30_000 }); // hidden until the sound is ready
    expect([...(await lp.optionTexts())].sort()).toEqual([...seeded.options].sort());
  });
  const order = await lp.optionTexts();

  await test.step("Play: audio from local bytes, POST /api/speech 200, no browser speech", async () => {
    timings.push(await pressPlay(page, 1));
    for (let i = 0; i < EXTRA_PRESSES; i += 1) timings.push(await pressPlay(page, i + 2));
    for (const t of timings) expect(t.speechStatus).toBe(200);
    expect((await audioState(page)).speaks).toBe(0);
  });

  await test.step("slow network: with the speech response held back, audio still starts first", async () => {
    await pressPlayWithSlowSpeech(page);
  });

  // --- Attempt 1, then a refresh ----------------------------------------------------------------------------------
  await test.step("attempt 1: wrong", async () => {
    const { count, answer } = await submit(page, wrong[0] ?? "");
    expect(count).toBe(1);
    expect(answer).toMatchObject({ result: "APPLIED", outcome: "INCORRECT", attempt: { n: 1, correct: false } });
    await expect(lp.message).toContainText("Not quite. Have another go.");
    await expect(lp.tries).toContainText("Tries left: 2");
    await expect(lp.option(wrong[0] ?? "")).toHaveAccessibleName(/, tried$/);
  });

  await test.step("refresh keeps the attempt", async () => {
    await page.reload();
    await expect(lp.root).toBeVisible({ timeout: 60_000 });
    await expect(lp.tries).toContainText("Tries left: 2");
    await expect(lp.options.first()).toBeVisible({ timeout: 30_000 });
    expect(await lp.optionTexts()).toEqual(order);
    await expect(lp.option(wrong[0] ?? "")).toHaveAccessibleName(/, tried$/);
    timings.push(await pressPlay(page, timings.length + 1));
  });

  // --- Attempts 2 and 3: one reward -------------------------------------------------------------------------------
  await test.step("attempt 2: wrong", async () => {
    const { count, answer } = await submit(page, wrong[1] ?? "");
    expect(count).toBe(1);
    expect(answer).toMatchObject({ result: "APPLIED", outcome: "INCORRECT", attempt: { n: 2, correct: false } });
    await expect(lp.tries).toContainText("Tries left: 1");
  });

  await test.step("refresh after two wrong answers: two tried options, one try left", async () => {
    await page.reload();
    await expect(lp.root).toBeVisible({ timeout: 60_000 });
    await expect(lp.tries).toContainText("Tries left: 1");
    await expect(lp.options.first()).toBeVisible({ timeout: 30_000 });
    expect(await lp.optionTexts()).toEqual(order);
    await expect(lp.option(wrong[0] ?? "")).toHaveAccessibleName(/, tried$/);
    await expect(lp.option(wrong[1] ?? "")).toHaveAccessibleName(/, tried$/);
  });

  const creditsBefore = await hud(page).credits();
  const reward = await test.step("attempt 3: right, rewarded once", async () => {
    const { count, answer } = await submit(page, seeded.answer);
    expect(count).toBe(1);
    expect(answer).toMatchObject({
      result: "APPLIED",
      outcome: "RESOLVED_SUCCEEDED",
      attempt: { n: 3, correct: true, slotStatus: "SUCCEEDED", rewardGranted: true },
    });
    await expect(lp.message).toContainText("You got it!");
    await expect(lp.reward).toHaveCount(1);
    const line = (await lp.reward.textContent()) ?? "";
    const match = /^\+(\d+) space credits$/.exec(line.trim());
    expect(match, `reward line "${line}"`).not.toBeNull();
    return Number(match?.[1]);
  });

  await test.step("Continue: credits up by the reward, wave 2 ready", async () => {
    await lp.continueButton.click();
    await expect(lp.root).toHaveCount(0);
    await expect(hud(page).wave).toHaveText(/Wave 2 of 2/);
    await expect.poll(() => hud(page).credits()).toBe(creditsBefore + reward);
  });

  await test.step("refresh again: the activity does not come back and the reward is not paid twice", async () => {
    await page.reload();
    await expect(hud(page).ready).toBeVisible({ timeout: 60_000 });
    await expect(lp.root).toHaveCount(0);
    await expect.poll(() => hud(page).credits()).toBe(creditsBefore + reward);
  });

  // --- Leave, then come back in a browser with no local state -----------------------------------------------------
  const creditsAtExit = await hud(page).credits();
  await test.step("Save and exit", async () => {
    await page.getByRole("button", { name: "Save and exit" }).click();
    await page.waitForURL(/\/home$/, { timeout: 60_000 });
    await expect(page.locator(".continue-card")).toContainText("Wave 2");
  });
  const firstSummary = summary(recorder);
  await first.close();

  const second = await freshContext(browser);
  page = await second.newPage();
  recorder = record(page);
  await test.step("a fresh browser signs in and continues the same run from the cloud save", async () => {
    await page.goto("/");
    const me = page.waitForResponse((r) => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/me");
    await signIn(page, ACCOUNT);
    const body = (await (await me).json()) as { runs: { runId: string; status: string; playable?: boolean }[] };
    const offered = body.runs.find((r) => r.playable === true && r.status === "IN_PROGRESS");
    if (offered?.runId === runId) {
      await page.locator(".continue-card").getByRole("button", { name: "Continue" }).click();
    } else {
      // Home's Continue offers another open run first (e.g. the canary): open this run by its link instead.
      test.info().annotations.push({ type: "note", description: "Continue offered another run; opened this run by its link" });
      await page.goto(`/play/${runId}`);
    }
    await page.waitForURL(new RegExp(`/play/${runId}$`));
    await expect(hud(page).wave).toHaveText(/Wave 2 of 2/, { timeout: 60_000 });
    await expect(hud(page).ready).toBeVisible();
    await expect.poll(() => hud(page).credits()).toBe(creditsAtExit);
    expect(runIdOf(page)).toBe(runId);
  });

  // --- Finish the run; an ended run shows its final screen --------------------------------------------------------
  await test.step("wave 2 to the end of the run", async () => {
    await startWave(page);
    const end = page.getByRole("dialog", { name: /^(Challenge complete!|The aliens got through this time\.)$/ });
    await expect(end).toBeVisible({ timeout: 4 * 60_000 });
    test.info().annotations.push({ type: "run end", description: (await end.getAttribute("aria-label")) ?? "" });
    await end.getByRole("button", { name: "Home" }).click();
    await page.waitForURL(/\/home$/, { timeout: 60_000 });
  });

  await test.step("opening the ended run shows its final screen", async () => {
    await page.goto(`/play/${runId}`);
    await expect(page.locator(".bf-end")).toBeVisible({ timeout: 60_000 });
    await expect(hud(page).ready).toHaveCount(0);
    await page.locator(".bf-end").getByRole("button", { name: "Home" }).click();
    await page.waitForURL(/\/home$/);
  });

  // --- Evidence (no tokens, no URLs with query strings) -----------------------------------------------------------
  const lines = timings.map((t) => `press ${t.press}: audio ${t.toAudioMs ?? "?"} ms, POST /api/speech ${t.speechStatus} in ${t.speechMs} ms, requestId ${t.requestId}`);
  test.info().annotations.push({ type: "runId", description: runId });
  test.info().annotations.push({ type: "play timings", description: lines.join("; ") });
  console.log(`E2E-D journey, run ${runId}\n${lines.join("\n")}\n-- first browser\n${firstSummary}\n-- second browser\n${summary(recorder)}`);
  await second.close();
});
