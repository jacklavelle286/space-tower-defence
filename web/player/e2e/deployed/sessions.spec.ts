// Two M1 joins only a deployment proves (E2E-D, I §I.3):
// - AC-05 (M1 basic): one child signs out and another signs in on the same browser. Managed login asks for the
//   password again (prompt=login), and the second child sees nothing of the first.
// - AC-28 (M1 fence): a second browser on the same account is kept out of a run that is open elsewhere ("You're
//   already playing on …"), and gets in once the first browser saves and exits (the lease is released).
// test-player-2 keeps at most one unfinished run: the fence test continues it if Home offers Continue, and only
// starts a new game when there is none.
import { expect, test, type Page } from "@playwright/test";
import { ensureProfile, freshContext, hud, newGame, panel, runIdOf, signIn } from "./support";

/** On a run screen, ready to play: preparation (Ready!) or the learning panel. */
async function runOpen(page: Page): Promise<void> {
  await expect(hud(page).ready.or(panel(page).root)).toBeVisible({ timeout: 60_000 });
}

/** Save and exit from wherever the run is (the panel has its own button while it is open). */
async function saveAndExit(page: Page): Promise<void> {
  const lp = panel(page);
  if (await lp.root.isVisible()) await lp.saveAndExit.click();
  else await page.getByRole("button", { name: "Save and exit" }).click();
  await page.waitForURL(/\/home$/, { timeout: 60_000 });
}

test("switching child on one browser: password asked again, nothing of the first child shown (AC-05 basic)", async ({ browser }) => {
  const context = await freshContext(browser);
  const page = await context.newPage();
  await page.goto("/");
  await signIn(page, "test-player-1");
  const firstName = await ensureProfile(page, "test-player-1");

  await page.getByRole("button", { name: "Sign out" }).click();
  // Cognito /logout, then back to the landing page.
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible({ timeout: 60_000 });
  expect(new URL(page.url()).pathname).toBe("/");

  // signIn checks that the password field starts empty (no silent re-entry as the first child).
  await signIn(page, "test-player-2");
  const secondName = await ensureProfile(page, "test-player-2");
  if (secondName === firstName) {
    test.info().annotations.push({ type: "warning", description: "both test accounts have the same nickname; the name check proves nothing" });
  } else {
    await expect(page.locator("body")).not.toContainText(firstName);
  }
  // Token storage keys are named after the signed-in user (Amplify, ADR-0012 check 17). Only key names are read.
  const keys = await page.evaluate(() => Object.keys(window.localStorage));
  expect(keys.some((k) => k.includes("test-player-1"))).toBe(false);
  await context.close();
});

test("a second browser on the same account is fenced until the first saves and exits (AC-28 M1 fence)", async ({ browser }) => {
  const contextA = await freshContext(browser);
  const a = await contextA.newPage();
  await a.goto("/");
  await signIn(a, "test-player-2");
  await ensureProfile(a, "test-player-2");
  const continueButton = a.locator(".continue-card").getByRole("button", { name: "Continue" });
  let runId: string;
  if (await continueButton.isVisible()) {
    await continueButton.click();
    await a.waitForURL(/\/play\/[^/]+$/);
    runId = runIdOf(a);
  } else {
    runId = await newGame(a);
  }
  await runOpen(a);

  const contextB = await freshContext(browser);
  const b = await contextB.newPage();
  await b.goto("/");
  await signIn(b, "test-player-2");
  await expect(b.getByText(/^You're playing on .+ right now\.$/)).toBeVisible();
  await b.goto(`/play/${runId}`);
  await expect(b.getByText(/^You're already playing on /)).toBeVisible({ timeout: 60_000 });
  await expect(hud(b).ready).toHaveCount(0);

  await saveAndExit(a); // releases the lease after the queue
  await b.getByRole("button", { name: "Try again" }).click();
  await runOpen(b);
  expect(runIdOf(b)).toBe(runId);
  await saveAndExit(b);

  await contextA.close();
  await contextB.close();
});
