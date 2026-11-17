// axe on the admin's screens (Phase 68), through its development pages (no sign-in, the fake API): the level editor
// and each of its tabs, Levels → Aliens, and the activity editor. Serious and critical findings fail.
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const ADMIN = "http://localhost:5174";

async function axe(page: Page, screen: string): Promise<void> {
  // The development pages' own header (the editor preview's type switcher) is not part of the admin app.
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("header.top").analyze();
  const bad = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(", ")}`), `axe on ${screen}`).toEqual([]);
}

test("the level editor, every tab", async ({ page }) => {
  await page.goto(`${ADMIN}/level-preview.html`);
  const tabs = page.getByRole("tab");
  await tabs.first().waitFor();
  for (const name of await tabs.allInnerTexts()) {
    await page.getByRole("tab", { name }).click();
    await axe(page, `level editor, ${name} tab`);
  }
});

test("Levels → Aliens", async ({ page }) => {
  await page.goto(`${ADMIN}/aliens-preview.html`);
  await page.getByRole("heading", { name: "Aliens" }).waitFor();
  await axe(page, "Aliens");
});

test("the activity editor", async ({ page }) => {
  await page.goto(`${ADMIN}/editor-preview.html`);
  await page.locator("main, .shell").first().waitFor();
  await page.waitForTimeout(1000);
  await axe(page, "activity editor");
});
