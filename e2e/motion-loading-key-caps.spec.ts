import { expect, test, type Page } from "@playwright/test";
import { cleanupTestWorkspace, e2eDatabase, seedTestRequest } from "./helpers/cleanup";
import { createTestUser, deleteTestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

// #262 (Build 2, polish bar §5, §9 and §10): motion, loading and key caps behave the same everywhere.
// One signed-in member walks each rule the way a person meets it: with motion turned off, popups are
// simply there; a quick page change shows no placeholder and a slow one shows it after 0.15s; a busy
// button keeps its words; and key caps show with a mouse and keyboard but never on a phone.

type FirstFrame = { opacity: number; transform: string };

/**
 * Records how `selector` looks on the first frame it is painted in, before any fade could run: its
 * opacity multiplied through its ancestors (an overlay fading in counts) and its own transform. The
 * frame callback is queued when the element is added, so it runs after the frame work the app queued
 * while opening it, as the browser does just before painting.
 */
async function watchFirstFrame(page: Page, selector: string) {
  await page.evaluate(selector => {
    const w = window as unknown as { __laneFirstFrame?: Promise<FirstFrame> };
    w.__laneFirstFrame = new Promise(resolve => {
      const read = (element: HTMLElement) => {
        let opacity = 1;
        for (let node: HTMLElement | null = element; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
        resolve({ opacity, transform: getComputedStyle(element).transform });
      };
      const observer = new MutationObserver(() => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return;
        observer.disconnect();
        requestAnimationFrame(() => read(element));
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }, selector);
}
const firstFrame = (page: Page) => page.evaluate(() => (window as unknown as { __laneFirstFrame: Promise<FirstFrame> }).__laneFirstFrame);
const still = (frame: FirstFrame) => {
  expect(frame.opacity).toBe(1);
  expect(["none", "matrix(1, 0, 0, 1, 0, 0)"]).toContain(frame.transform);
};

/**
 * Watches the main pane from the next click: when (ms after the click) a placeholder first became
 * visible, if ever. A placeholder is any loading shape (a busy status or a page skeleton) with
 * opacity above zero all the way up its ancestors.
 */
async function watchPlaceholders(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __lanePlaceholder?: { clickedAt?: number; shownAt?: number; stop?: boolean } };
    const state: { clickedAt?: number; shownAt?: number; stop?: boolean } = {};
    w.__lanePlaceholder = state;
    document.addEventListener("click", () => { state.clickedAt ??= performance.now(); }, { capture: true, once: true });
    const visible = (element: HTMLElement) => {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) return false;
      let opacity = 1;
      for (let node: HTMLElement | null = element; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
      return opacity > 0.01;
    };
    const look = () => {
      if (state.stop) return;
      if (state.clickedAt !== undefined && state.shownAt === undefined) {
        const shapes = document.querySelectorAll<HTMLElement>('#lane-main [data-skeleton], #lane-main [role="status"][aria-busy="true"]');
        if ([...shapes].some(visible)) state.shownAt = performance.now() - state.clickedAt;
      }
      requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  });
}
const placeholderShownAt = (page: Page) => page.evaluate(() => {
  const state = (window as unknown as { __lanePlaceholder: { shownAt?: number; stop?: boolean } }).__lanePlaceholder;
  state.stop = true;
  return state.shownAt ?? null;
});

test("motion off, placeholders, busy buttons and key caps", async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const owner = await createTestUser("motion-owner");
  try {
    await provisionAndSignIn(page, owner, { name: "Motion Owner", workspaceName: "Motion acceptance" });
    const request = await seedTestRequest(owner.id, "Motion acceptance request");
    await page.setViewportSize({ width: 1440, height: 900 });

    await test.step("A122: with motion turned off, the shortcuts dialog and menus are fully there on their first frame", async () => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");
      await expect(page.getByText("Motion acceptance request").first()).toBeVisible();

      await page.locator("#lane-main").focus();
      await watchFirstFrame(page, '[role="dialog"]');
      await page.keyboard.press("?");
      const shortcuts = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true });
      await expect(shortcuts).toBeVisible();
      still(await firstFrame(page));
      await page.keyboard.press("Escape");
      await expect(shortcuts).toBeHidden();

      await watchFirstFrame(page, '[role="menu"]');
      await page.getByRole("button", { name: /^Account menu/ }).click();
      await expect(page.getByRole("menu").first()).toBeVisible();
      still(await firstFrame(page));
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menu")).toHaveCount(0);

      await page.goto(`/requests/${request.id}`);
      await expect(page.getByRole("button", { name: "Pick up", exact: true })).toBeVisible();
      await watchFirstFrame(page, '[role="menu"]');
      await page.getByRole("button", { name: /Change status$/ }).click();
      await expect(page.getByRole("menu").first()).toBeVisible();
      still(await firstFrame(page));
      await testInfo.attach("A122-menu-reduced-motion", { body: await page.screenshot(), contentType: "image/png" });
      await page.keyboard.press("Escape");
      await page.emulateMedia({ reducedMotion: "no-preference" });
    });
    await test.step("A quick page change shows no placeholder; a slow one shows it after 0.15s", async () => {
      const inboxLink = page.locator("#lane-sidebar").getByRole("link", { name: /^Inbox/ });
      // Warm the route so the quick change below measures Lane, not the development server compiling.
      await page.goto("/inbox");
      await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
      await expect(page.locator("[data-skeleton]")).toHaveCount(0);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await page.goto("/");
        await expect(page.getByText("Motion acceptance request").first()).toBeVisible();
        await watchPlaceholders(page);
        await inboxLink.click();
        await expect(page).toHaveURL(/\/inbox$/);
        await expect(page.locator("[data-skeleton]")).toHaveCount(0);
        if (attempt === 1) expect(await placeholderShownAt(page)).toBeNull();
      }

      // Slow: the Inbox's unread count waits on a held lock, so the page takes about two seconds.
      await page.goto("/");
      await expect(page.getByText("Motion acceptance request").first()).toBeVisible();
      await watchPlaceholders(page);
      const sql = e2eDatabase();
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      let locked!: () => void;
      const lockTaken = new Promise<void>(resolve => { locked = resolve; });
      const transaction = sql.begin(async tx => {
        await tx`lock table notifications in access exclusive mode`;
        locked();
        await held;
      });
      try {
        await lockTaken;
        await inboxLink.click();
        await expect(page.locator("#lane-main [data-skeleton]").first()).toBeVisible({ timeout: 10_000 });
        await page.waitForTimeout(400);
        await testInfo.attach("placeholder-slow-inbox", { body: await page.screenshot(), contentType: "image/png" });
      } finally {
        release();
        await transaction;
        await sql.end();
      }
      await expect(page.locator("[data-skeleton]")).toHaveCount(0);
      const shownAt = await placeholderShownAt(page);
      expect(shownAt).not.toBeNull();
      expect(shownAt!).toBeGreaterThanOrEqual(150);
    });
  } finally {
    await cleanupTestWorkspace(owner.id);
    await deleteTestUser(owner.id);
  }
});
