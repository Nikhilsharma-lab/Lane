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
      await page.screenshot({ path: testInfo.outputPath("A122-menu-reduced-motion.png") });
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
        await page.screenshot({ path: testInfo.outputPath("placeholder-slow-inbox.png") });
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
    await test.step("Key caps show with a mouse and keyboard and never on a phone", async () => {
      await page.goto("/");
      await expect(page.getByText("Motion acceptance request").first()).toBeVisible();
      await page.locator("#lane-main").focus();
      await page.keyboard.press("?");
      const shortcuts = page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true });
      await expect(shortcuts).toBeVisible();
      await expect(shortcuts.locator("kbd").first()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("key-caps-desktop-1440.png") });
      await page.keyboard.press("Escape");

      // A phone: a coarse, touch-first pointer at 390px.
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await expect(page.getByText("Motion acceptance request").first()).toBeVisible();
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      await page.locator("#lane-main").focus();
      await page.keyboard.press("?");
      await expect(shortcuts).toBeVisible();
      await expect(shortcuts.locator("kbd").first()).toBeAttached();
      await expect(page.locator("kbd:visible")).toHaveCount(0);
      // Nor the "or" written between two caps (check page leftover).
      await expect(shortcuts.getByText("or", { exact: true }).filter({ visible: true })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath("key-caps-phone-390.png") });
      await page.keyboard.press("Escape");
      await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
      await page.setViewportSize({ width: 1440, height: 900 });
    });
    await test.step("The clicked row shows as pressed until the next page arrives", async () => {
      // Holds the Request page from before the list loads, so a production build's prefetch can't bring it in
      // within the frame the row is read on.
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      await page.route(/\/requests\/[^/?]+(\?|$)/, async route => { await held; await route.continue().catch(() => undefined); });
      let looks: { before: string; after: string; pressed: string };
      try {
        await page.goto("/");
        const row = page.getByRole("row", { name: /Motion acceptance request/ });
        await expect(row).toBeVisible();
        // The pressed state loads once the page has loaded and is idle (src/lib/after-page-load.ts).
        await expect(page.locator("html[data-loading-feel=ready]")).toHaveCount(1, { timeout: 20_000 });
        // Clicks the row's title link and reads the row on the next frame, while the Request page is held back.
        looks = await row.evaluate(async element => {
          const probe = document.createElement("div");
          probe.style.background = "var(--interaction-pressed)";
          element.append(probe);
          const pressed = getComputedStyle(probe).backgroundColor;
          probe.remove();
          const before = getComputedStyle(element).backgroundColor;
          element.querySelector<HTMLAnchorElement>("a[href^='/requests/']")!.click();
          await new Promise(requestAnimationFrame);
          return { before, after: getComputedStyle(element).backgroundColor, pressed };
        });
      } finally {
        release();
      }
      expect(looks.before).not.toBe(looks.pressed);
      expect(looks.after).toBe(looks.pressed);
      await expect(page).toHaveURL(/\/requests\//);
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await expect(page.getByRole("button", { name: "Pick up", exact: true })).toBeVisible();
      await expect(page.locator("[data-pressed]")).toHaveCount(0);
    });
    await test.step("The sidebar's and Settings' own links show as pressed too, and nothing is pressed offline", async () => {
      // The pointer rests on the link it clicked, so hover styles must not hide the pressed wash. The next page is
      // held back until the wash has been read, and the link's own colour transition has run.
      const pressedColour = (link: ReturnType<Page["locator"]>) => link.evaluate(element => {
        const probe = document.createElement("span");
        probe.style.background = "var(--interaction-pressed)";
        element.parentElement!.append(probe);
        const colour = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return colour;
      });
      // Holds every request for the next page from before the page that links to it loads, so neither a prefetch
      // nor the move itself can bring it in while the link is read.
      const pressedOnClick = async (from: string, link: ReturnType<Page["locator"]>, path: RegExp, url: RegExp) => {
        let release!: () => void;
        const held = new Promise<void>(resolve => { release = resolve; });
        await page.route(path, async route => { await held; await route.continue().catch(() => undefined); });
        try {
          await page.goto(from);
          await expect(link).toBeVisible({ timeout: 20_000 });
          await expect(page.locator("html[data-loading-feel=ready]")).toHaveCount(1, { timeout: 20_000 });
          await link.hover();
          const pressed = await pressedColour(link);
          await link.click({ noWaitAfter: true });
          await expect.poll(() => link.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(pressed);
        } finally {
          release();
        }
        await expect(page).toHaveURL(url);
        await page.unrouteAll({ behavior: "ignoreErrors" });
        await expect(page.locator("[data-pressed]")).toHaveCount(0);
      };
      const sidebar = page.locator("#lane-sidebar");
      await pressedOnClick("/", sidebar.getByRole("link", { name: /^Impact$/ }), /\/impact(\?|$)/, /\/impact$/);
      await pressedOnClick("/", sidebar.getByRole("link", { name: /^Inbox/ }), /\/inbox(\?|$)/, /\/inbox$/);
      // Metrics has its own page; the Profile page's own sections show in place, with nothing to wait for.
      await pressedOnClick("/settings/profile", page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Metrics", exact: true }),
        /\/settings\/metrics(\?|$)/, /\/settings\/metrics$/);
      await page.screenshot({ path: testInfo.outputPath("pressed-settings-nav.png") });

      await page.goto("/");
      await expect(page.getByText("Motion acceptance request").first()).toBeVisible();
      await page.context().setOffline(true);
      try {
        await sidebar.getByRole("link", { name: /^Impact$/ }).click();
        await expect(page.locator("[data-pressed]")).toHaveCount(0);
        await expect(page).not.toHaveURL(/\/impact$/);
      } finally {
        await page.context().setOffline(false);
      }
    });
    await test.step("Check-page samples: light and dark, desktop and phone", async () => {
      // Screenshots for the pull request's check page; the behaviour is asserted in the steps above.
      for (const theme of ["light", "dark"] as const) {
        await page.evaluate(saved => localStorage.setItem("theme", saved), theme);
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
          await page.emulateMedia({ reducedMotion: "reduce" });
          await page.goto(`/requests/${request.id}`);
          await expect(page.getByRole("button", { name: "Pick up", exact: true })).toBeVisible();
          await page.locator("#lane-main").focus();
          await page.keyboard.press("?");
          await expect(page.getByRole("dialog", { name: "Keyboard shortcuts", exact: true })).toBeVisible();
          await page.screenshot({ path: testInfo.outputPath(`A122-key-caps-shortcuts-${width}-${theme}.png`) });
          await page.keyboard.press("Escape");
          await page.emulateMedia({ reducedMotion: "no-preference" });
        }
      }
      await page.evaluate(() => localStorage.removeItem("theme"));
      await page.setViewportSize({ width: 1440, height: 900 });
    });
  } finally {
    await cleanupTestWorkspace(owner.id);
    await deleteTestUser(owner.id);
  }
});
