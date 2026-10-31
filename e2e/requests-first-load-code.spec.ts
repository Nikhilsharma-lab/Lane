import { expect, test, type Page } from "@playwright/test";

import { cleanupTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

// #266 (Build 3, lighter pages): the Requests list's first load carries no form-checking library (zod), and Motion's
// features come with the page that uses them, never later (no animation may look different at any moment after the
// first paint). Judged from the scripts each page's HTML makes it fetch, by text only those libraries carry, so a
// renamed or re-split file can't slip past: zod's own class names, and the strings of Motion's drag and layout code.
// The signed-in list carries layout and drag in its first load and fetches no Motion code after it; the sign-in page,
// which has nothing that glides or drags, carries neither.

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

test("the Requests list's first load carries no form checking, and Motion's features come with the page", async ({ browser, page }, testInfo) => {
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

    await test.step("first load: no zod; Motion's layout and drag are in it, and no Motion code follows", async () => {
      const documentResponse = page.waitForResponse(response => response.request().isNavigationRequest() && new URL(response.url()).pathname === "/");
      await page.goto("/", { waitUntil: "load", timeout: 60_000 });
      // The page's first load is the code its HTML asks for (script tags and the client components it streams), as
      // the code-size baseline counts it. Popups that load ahead on their own (the New Request form) are not part of it.
      const html = await (await documentResponse).text();
      const firstLoadNames = new Set([...html.matchAll(/\/_next\/static\/chunks\/[\w.-]+\.js/g)].map(match => match[0]));
      await expect(page.getByText("First load Request 1").first()).toBeVisible();
      await expect.poll(() => page.evaluate(() => (window as LoadOrderWindow).__loadOrder?.idle ?? null), { timeout: 30_000 }).not.toBeNull();
      const firstLoad = (await timing(page)).scripts.filter(script => firstLoadNames.has(script.name));
      expect(firstLoad.length).toBeGreaterThan(10);
      expect(await carrying(firstLoad, ZOD)).toEqual([]);
      expect((await carrying(firstLoad, MOTION_FEATURES)).length).toBeGreaterThan(0);
      // Three more seconds after idle: whatever the page fetches on its own by then carries no Motion code.
      await page.waitForTimeout(3_000);
      const later = (await timing(page)).scripts.filter(script => !firstLoadNames.has(script.name));
      expect(await carrying(later, MOTION_FEATURES)).toEqual([]);
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

    await test.step("a press scales from the first load on; with motion turned off it doesn't", async () => {
      await page.reload({ waitUntil: "load" });
      expect(scaleOf(await pressedTransform(page))).toBeLessThan(0.99);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.reload({ waitUntil: "load" });
      expect(scaleOf(await pressedTransform(page))).toBe(1);
      await page.emulateMedia({ reducedMotion: "no-preference" });
    });

    await test.step("the sign-in page's first load carries none of Motion's layout and drag", async () => {
      const visitor = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
      const signIn = await visitor.newPage();
      // The response after any redirect (Clerk's development handshake) is the sign-in page itself.
      const response = (await signIn.goto("/login", { waitUntil: "load", timeout: 60_000 }))!;
      expect(new URL(response.url()).pathname).toBe("/login");
      const html = await response.text();
      const names = [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[\w.-]+\.js/g)].map(match => match[0]))];
      expect(names.length).toBeGreaterThan(5);
      const bodies = await Promise.all(names.map(async name => (await signIn.request.get(name)).text()));
      expect(names.filter((_, index) => MOTION_FEATURES.test(bodies[index]))).toEqual([]);
      await visitor.close();
    });
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
