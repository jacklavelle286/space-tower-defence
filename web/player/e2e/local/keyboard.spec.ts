// Keyboard-only play and axe scans (Phase 68; D5): a new player, from profile setup to a finished two-wave game,
// pressing keys only, with an axe scan of every screen on the way. Against the development server (fake sign-in and
// API, no account). Run: cd web/player && npx playwright test -c playwright.local.config.ts
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** axe's serious and critical findings on the page as it is now (WCAG 2 A and AA rules). */
async function axe(page: Page, screen: string): Promise<void> {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`), `axe on ${screen}`).toEqual([]);
}

/** The element that has the keyboard focus, as "TAG name". */
const focused = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    return `${a?.tagName ?? ""} ${a?.getAttribute("aria-label") ?? a?.textContent?.trim().slice(0, 40) ?? ""}`;
  });

test("a new player sets up, plays two waves and answers an activity with the keyboard only", async ({ page }) => {
  await page.goto(`/auth/callback?devUser=keys-${Date.now()}`); // the dev server's fake sign-in (managed login is AWS's)
  await page.getByRole("heading", { name: /set up your astronaut/u }).waitFor();
  await axe(page, "profile setup");

  // Name, picture, school year (YG1: Year 1, band 6 for the dev activity), Done.
  await page.keyboard.press("Tab");
  await page.keyboard.type("Keys");
  await page.keyboard.press("Tab");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Tab"); // into the school years: Reception
  await page.keyboard.press("ArrowRight"); // Year 1
  await expect(page.getByLabel("Year 1", { exact: true })).toBeChecked();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");

  await page.getByRole("heading", { name: /Hi, Keys/u }).waitFor();
  await axe(page, "Home");
  await page.keyboard.press("Tab");
  expect(await focused(page)).toMatch(/Change/u); // YG1: the school year's Change button comes first
  await page.keyboard.press("Tab");
  expect(await focused(page)).toMatch(/First Contact/u); // LD23: the dev map's one challenge, on its map card
  await page.keyboard.press("Enter");
  // YG1: How hard? Easy has the focus.
  await page.getByRole("dialog", { name: "How hard?" }).waitFor();
  expect(await focused(page)).toMatch(/Easy/u);
  await axe(page, "how hard");
  await page.keyboard.press("Enter");

  // The battle: N chooses Nova and goes to the first empty pad, Enter places, R starts the wave.
  await page.getByText(/Wave 1 of/u).waitFor();
  await axe(page, "the battlefield (before the wave)");
  await page.keyboard.press("n");
  expect(await focused(page)).toMatch(/Pad \d+, empty/u);
  await page.keyboard.press("Enter");
  await expect(page.getByText("100", { exact: true })).toBeVisible(); // 150 credits less one Nova
  await page.keyboard.press("r");

  // The new-alien card has the focus; Enter goes on.
  await page.getByRole("button", { name: "Got it!" }).waitFor();
  expect(await focused(page)).toMatch(/Got it/u);
  await axe(page, "the new-alien card");
  await page.keyboard.press("Enter");
  await page.keyboard.press("f"); // 2x

  // The learning activity: Tab stays inside it; the keys line says what to press; 4 picks "sh", Tab to Check, Enter.
  const panel = page.getByRole("dialog");
  await panel.waitFor({ timeout: 120_000 });
  await expect(panel.getByText(/^Keys:/u)).toBeVisible();
  await axe(page, "the learning panel");
  for (let k = 0; k < 12; k += 1) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null), `Tab ${k + 1} left the panel`).toBe(true);
  }
  // Play first (the sound must be heard before a try counts, D6.5), then the choices.
  for (let k = 0; k < 4 && !/Play/u.test(await focused(page)); k += 1) await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  for (let k = 0; k < 4 && !/^BUTTON \d: /u.test(await focused(page)); k += 1) await page.keyboard.press("Tab");
  await page.keyboard.press("4");
  await page.keyboard.press("Tab");
  expect(await focused(page)).toMatch(/Check/u);
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /Continue/u }).waitFor();
  expect(await focused(page)).toMatch(/Continue/u);
  await page.keyboard.press("Enter");

  // Wave 2 and the end of the game.
  await page.getByText(/Wave 2 of/u).waitFor();
  await page.keyboard.press("r");
  await page.getByRole("heading", { name: /complete/iu }).waitFor({ timeout: 120_000 });
  await axe(page, "the end screen");
  expect(await focused(page)).toMatch(/Home/u);
  await page.keyboard.press("Enter");

  // Home again; My progress and Settings, by Tab and Enter, scanned too.
  for (const [name, heading] of [["My progress", /progress/iu], ["Settings", /settings/iu]] as const) {
    await page.getByRole("heading", { name: /Hi, Keys/u }).waitFor();
    for (let k = 0; k < 8 && !(await focused(page)).includes(name); k += 1) await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: heading }).first().waitFor();
    await axe(page, name);
    await page.goBack();
  }
});
