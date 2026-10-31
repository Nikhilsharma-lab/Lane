import { expect, test, type Page } from "@playwright/test";

import { cleanupTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

// #266 (Build 3, lighter pages): the Requests list's first load carries neither the form-checking library (zod) nor
// Motion's deferred features (gestures, drag and layout). Judged from the scripts the page fetches, by text only those
// libraries carry, so a renamed or re-split file can't slip past: zod's own class names, and the strings of Motion's
// drag and layout code. Motion's features then arrive on their own once the page has loaded and is idle (Build 2's
// rule, src/lib/after-page-load.ts), and a press scales again from then on.

const ZOD = /"\$Zod(?:Type|Error|Object)"/;
const MOTION_FEATURES = /"drag-constraints-ref"|"projectionUpdate"/;

type Timing = { load: number; idle: number; scripts: { name: string; start: number }[] };
type LoadOrderWindow = Window & { __loadOrder?: { load?: number; idle?: number } };

async function timing(page: Page): Promise<Timing> {
  return page.evaluate(() => {
    const order = (window as LoadOrderWindow).__loadOrder!;
    const scripts = performance.getEntriesByType("resource")
      .filter(entry => /\.js(\?|$)/.test(entry.name))
      .map(entry => ({ name: new URL(entry.name).pathname, start: entry.startTime }));
    return { load: order.load!, idle: order.idle!, scripts };
  });
}

/** How "Save view" looks 150ms into a press that hasn't been let go: its transform, or "none". */
async function pressedTransform(page: Page) {
  const button = page.getByRole("button", { name: "Save view", exact: true });
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  const transform = await button.evaluate(element => getComputedStyle(element).transform);
  // Let go away from the button, so the press is no click.
  await page.mouse.move(box.x + box.width / 2, box.y + 400);
  await page.mouse.up();
  return transform;
}
const scaleOf = (transform: string) => transform === "none" ? 1 : Number(/^matrix\(([^,]+),/.exec(transform)?.[1] ?? 1);

test("the Requests list's first load carries no form checking and none of Motion's deferred features", async ({ page }) => {
  test.setTimeout(240_000);
  const user = await createTestUser("first-load-code");
  try {
    await provisionAndSignIn(page, user, { name: "First Load PM", workspaceName: "Lane E2E First load code", role: "pm" });
    for (let i = 0; i < 3; i++) await seedTestRequest(user.id, `First load Request ${i + 1}`);

    // Registered before any of Lane's scripts, so this idle callback is the first one queued after `load`.
    await page.addInitScript(() => {
      const order: { load?: number; idle?: number } = {};
      (window as LoadOrderWindow).__loadOrder = order;
      addEventListener("load", () => {
        order.load = performance.now();
        const idle = () => { order.idle = performance.now(); };
        if (typeof window.requestIdleCallback === "function") requestIdleCallback(idle); else setTimeout(idle, 1);
      }, { once: true });
    });
    const bodies = new Map<string, Promise<string>>();
    page.on("response", response => {
      const url = new URL(response.url());
      if (/\/_next\/static\/.+\.js$/.test(url.pathname) && !bodies.has(url.pathname)) bodies.set(url.pathname, response.text().catch(() => ""));
    });
    const carrying = async (scripts: Timing["scripts"], marker: RegExp) => {
      const found: string[] = [];
      for (const script of scripts) if (marker.test(await (bodies.get(script.name) ?? Promise.resolve("")))) found.push(script.name);
      return found;
    };
    // A cold first visit: nothing from the browser's cache.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await page.setViewportSize({ width: 1440, height: 900 });

    await test.step("first load: no zod, no Motion features; the features follow once the page is idle", async () => {
      await page.goto("/", { waitUntil: "load", timeout: 60_000 });
      await expect(page.getByText("First load Request 1").first()).toBeVisible();
      await expect.poll(() => page.evaluate(() => (window as LoadOrderWindow).__loadOrder?.idle ?? null), { timeout: 30_000 }).not.toBeNull();
      await expect(page.locator("html[data-motion-features=ready]")).toBeAttached({ timeout: 30_000 });
      const visit = await timing(page);
      const firstLoad = visit.scripts.filter(script => script.start < visit.idle);
      expect(firstLoad.length).toBeGreaterThan(0);
      expect(await carrying(firstLoad, ZOD)).toEqual([]);
      expect(await carrying(firstLoad, MOTION_FEATURES)).toEqual([]);
      // The check means something only if the features did arrive, on their own, after the first load.
      const features = await carrying(visit.scripts, MOTION_FEATURES);
      expect(features.length).toBeGreaterThan(0);
      for (const name of features) expect(visit.scripts.find(script => script.name === name)!.start).toBeGreaterThanOrEqual(visit.idle);
    });

    await test.step("the zod marker finds zod: the New Request form brings it when it opens", async () => {
      await page.locator("#lane-main").focus();
      await page.keyboard.press("c");
      const composer = page.getByRole("dialog");
      await expect(composer.getByRole("textbox").first()).toBeFocused();
      expect((await carrying((await timing(page)).scripts, ZOD)).length).toBeGreaterThan(0);
      await page.keyboard.press("Escape");
      await expect(composer).toBeHidden();
    });

    await test.step("once the features are in, a press scales as before; with motion turned off it doesn't", async () => {
      expect(scaleOf(await pressedTransform(page))).toBeLessThan(0.99);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.reload({ waitUntil: "load" });
      await expect(page.locator("html[data-motion-features=ready]")).toBeAttached({ timeout: 30_000 });
      expect(scaleOf(await pressedTransform(page))).toBe(1);
      await page.emulateMedia({ reducedMotion: "no-preference" });
    });
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
