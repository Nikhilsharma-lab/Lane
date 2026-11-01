import { expect, test, type Page, type Route } from "@playwright/test";

import { cleanupTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

// Nikhil, 2026-11-01: every popup opens exactly as fast as it did on main b6f7c20d, every time, including the very
// first open right after a page loads. The popups the shell opens by key ship with the page, and the composer's
// form is here by the page's `load`, so C and ? the moment the page has loaded need no download. To prove it, every
// script the page asks for after `load` is held back (never answered) while the key is pressed.

const SCRIPT = /\/_next\/static\/.+\.js$/;

/** Holds every script requested from now on, unanswered; the function it returns lets them through. */
async function holdScripts(page: Page) {
  const held: Route[] = [];
  const handler = (route: Route) => {
    if (!SCRIPT.test(new URL(route.request().url()).pathname)) return route.continue();
    held.push(route);
  };
  await page.route("**/*", handler);
  return async () => {
    await page.unroute("**/*", handler);
    await Promise.all(held.map(route => route.continue().catch(() => undefined)));
  };
}

test("on a cold first visit, C and ? pressed right after load open their popups at once, with no code to fetch", async ({ page }) => {
  test.setTimeout(240_000);
  const user = await createTestUser("popups-at-once");
  try {
    await provisionAndSignIn(page, user, { name: "Popups At Once PM", workspaceName: "Lane E2E Popups at once", role: "pm" });
    await seedTestRequest(user.id, "Popups at once Request");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });

      await test.step(`${width}: C opens New Request with its title focused`, async () => {
        await page.goto("/", { waitUntil: "load" });
        const release = await holdScripts(page);
        try {
          await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
          await page.keyboard.press("c");
          await expect(page.getByRole("dialog", { name: "New Request" })).toBeVisible({ timeout: 2_000 });
          await expect(page.locator("#intake-title")).toBeFocused({ timeout: 2_000 });
          await expect(page.getByRole("status", { name: "Loading New Request" })).toHaveCount(0);
        } finally {
          await release();
        }
      });

      await test.step(`${width}: ? opens Keyboard shortcuts with focus inside it`, async () => {
        await page.goto("/", { waitUntil: "load" });
        const release = await holdScripts(page);
        try {
          await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
          await page.keyboard.press("?");
          const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
          await expect(dialog).toBeVisible({ timeout: 2_000 });
          await expect.poll(() => dialog.evaluate(element => element.contains(document.activeElement)), { timeout: 2_000 }).toBe(true);
        } finally {
          await release();
        }
      });
    }
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
