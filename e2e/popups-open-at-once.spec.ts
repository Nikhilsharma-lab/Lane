import { expect, test, type Page, type Route } from "@playwright/test";

import { cleanupTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

// Nikhil, 2026-11-01: every popup opens exactly as fast as it did on main b6f7c20d, every time, including the very
// first open right after a page loads. The popups the shell opens by key ship with the page; the composer's form, the
// search pane with the palette, and on a phone the bottom panel's code load the moment the page has loaded and is first idle
// (src/lib/after-page-load.ts: never before `load`, where they held a slow phone's page back), so a key pressed once
// they are here needs no download. To prove it, every script the page asks for from then on is held back (never
// answered) while the key is pressed.
// #268 (Nikhil, 2026-11-03, kept until Build 9, #291): a press in the moment between `load` and that code arriving may
// wait for it, so each check first waits for the page's after-load loads to arrive (loadAndIdle), then presses.

const SCRIPT = /\/_next\/static\/.+\.js$/;

/** Marks the page's first idle moment after `load`, from before any of Lane's scripts, as after-page-load.ts waits for. */
async function watchFirstIdle(page: Page) {
  await page.addInitScript(() => {
    addEventListener("load", () => {
      const idle = () => { (window as unknown as { __firstIdle?: boolean }).__firstIdle = true; };
      if (typeof window.requestIdleCallback === "function") requestIdleCallback(idle); else setTimeout(idle, 1);
    }, { once: true });
  });
}

/** Loads `path` cold and returns once the page has loaded, been idle once, and what it loads then has arrived. */
async function loadAndIdle(page: Page, path: string) {
  await page.goto(path, { waitUntil: "load" });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __firstIdle?: boolean }).__firstIdle === true), { timeout: 30_000 }).toBe(true);
  await page.waitForLoadState("networkidle");
}

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
    await watchFirstIdle(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });

      await test.step(`${width}: C opens New Request with its title focused`, async () => {
        await loadAndIdle(page, "/");
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
        await loadAndIdle(page, "/");
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

// Build 3: the shell's other shortcuts work the moment the page has loaded too. / opens search and ⌘K the command
// palette, Escape closes either, J and K move along the list's rows, and Escape leaves a Request page for the list.
// Every script the page asks for once its after-load loads are here is held back while the key is pressed. (J and K on a Request page follow
// the list it was opened from, so they never apply right after that page's own load.)
const SEARCH_INPUT = 'section[aria-label="Workspace search"] input[role="combobox"]';
const palette = (page: Page) => page.getByRole("dialog").filter({ has: page.getByPlaceholder("Find an action or place") });
const blur = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

/** Loads `path` cold, holds every script asked for once its after-load loads are here, runs `check`, then lets them through. */
async function rightAfterLoad(page: Page, path: string, check: () => Promise<void>) {
  await loadAndIdle(page, path);
  const release = await holdScripts(page);
  try { await check(); } finally { await release(); }
}

test("on a cold first visit, /, ⌘K, J, K and Escape pressed right after load work at once, with no code to fetch", async ({ page }) => {
  test.setTimeout(300_000);
  const user = await createTestUser("shortcuts-at-once");
  try {
    await provisionAndSignIn(page, user, { name: "Shortcuts At Once PM", workspaceName: "Lane E2E Shortcuts at once", role: "pm" });
    const requests: Awaited<ReturnType<typeof seedTestRequest>>[] = [];
    for (let i = 0; i < 3; i++) requests.push(await seedTestRequest(user.id, `Shortcuts at once Request ${i + 1}`));
    await watchFirstIdle(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });

      await test.step(`${width}: / opens search with its field focused, and Escape closes it`, () => rightAfterLoad(page, "/", async () => {
        await blur(page);
        await page.keyboard.press("/");
        await expect(page.locator(SEARCH_INPUT)).toBeFocused({ timeout: 2_000 });
        await expect(page.getByRole("status", { name: "Loading search" })).toHaveCount(0);
        await page.keyboard.press("Escape");
        await expect(page.locator(SEARCH_INPUT)).toBeHidden({ timeout: 2_000 });
      }));

      await test.step(`${width}: ⌘K opens the command palette with its field focused, and Escape closes it`, () => rightAfterLoad(page, "/", async () => {
        await blur(page);
        await page.keyboard.press("Meta+k");
        await expect(palette(page)).toBeVisible({ timeout: 2_000 });
        await expect(page.getByPlaceholder("Find an action or place")).toBeFocused({ timeout: 2_000 });
        await page.keyboard.press("Escape");
        await expect(palette(page)).toBeHidden({ timeout: 2_000 });
      }));

      await test.step(`${width}: J and K move along the list's rows`, () => rightAfterLoad(page, "/", async () => {
        const focusedRow = () => page.evaluate(() => document.activeElement?.closest("[role=row][data-request-id]")?.getAttribute("data-request-id") ?? null);
        await blur(page);
        await page.keyboard.press("j"); // from outside the list, J lands on its tab stop
        await expect(page.locator('[role=row][tabindex="0"]')).toBeFocused({ timeout: 2_000 });
        const first = await focusedRow();
        await page.keyboard.press("j");
        await expect.poll(focusedRow, { timeout: 2_000 }).not.toBe(first);
        await page.keyboard.press("k");
        await expect.poll(focusedRow, { timeout: 2_000 }).toBe(first);
      }));

      // Leaving is a page change: the list's own code comes after the Request page's load, as it does on main. The
      // key is taken at once (the address is the list's), and the list shows as soon as its code is here.
      await test.step(`${width}: Escape leaves a Request page for the list`, async () => {
        await loadAndIdle(page, `/requests/${requests[1].id}`);
        const release = await holdScripts(page);
        try {
          await blur(page);
          await page.keyboard.press("Escape");
          await expect(page).toHaveURL(/\/$/, { timeout: 2_000 });
        } finally {
          await release();
        }
        await expect(page.locator("[role=row][data-request-id]").first()).toBeVisible();
      });
    }
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
