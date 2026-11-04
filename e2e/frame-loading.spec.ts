import { expect, test, type Page, type Route } from "@playwright/test";

import { cleanupTestWorkspace, seedPreviewFixtures, seedTestRequest } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

// #271 (Build 4 of #256, walk findings A115 and A116): opening a Request from Impact shows the Request's own
// skeleton, never the Requests list's, and the Request preview draws its skeleton with Close from its first frame,
// even while its code is still on the way.

type FirstSight = Window & { firstSight: Record<string, string> };

/** Notes, for each selector, the markup of the first element drawn that matches it. */
async function watchFirstSight(page: Page, selectors: Record<string, string>) {
  await page.evaluate(selectors => {
    const seen: Record<string, string> = {};
    (window as unknown as FirstSight).firstSight = seen;
    const check = () => {
      for (const [name, selector] of Object.entries(selectors)) {
        const element = document.querySelector(selector);
        if (element && !(name in seen)) seen[name] = element.outerHTML;
      }
    };
    check();
    new MutationObserver(check).observe(document.body, { subtree: true, childList: true, attributes: true });
  }, selectors);
}
const firstSight = (page: Page) => page.evaluate(() => ({ ...(window as unknown as FirstSight).firstSight }));

/** Holds matching requests until `release` is called. */
function holdUntilReleased() {
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  const handler = async (route: Route) => { await released; await route.continue().catch(() => undefined); };
  return { handler, release };
}

/** The page has loaded, and Lane's links have read their pages ahead (after load and the first idle moment). */
async function settle(page: Page) {
  await page.waitForLoadState("load");
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
}

test("opening a Request from Impact never draws the Requests list's skeleton on the way (A115)", async ({ page }) => {
  test.setTimeout(300_000);
  const user = await createTestUser("frame-loading-impact");
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await provisionAndSignIn(page, user, { name: "Loading PM", workspaceName: "Lane E2E Loading", role: "pm" });
    const request = await seedTestRequest(user.id, "Loading from Impact");

    // A115 happens when the click comes before Lane's links have read the Request ahead (a slow connection, or a
    // click soon after the page arrives). Reads ahead of Request pages never answer here, so the click's own
    // page request does the work, and it waits a moment so whatever loading frame the move draws stays on screen.
    await page.route("**/requests/**", (route, request) => request.headers()["next-router-prefetch"] ? undefined : route.fallback());
    await page.goto("/impact", { waitUntil: "domcontentloaded" });
    const row = page.getByRole("tabpanel", { name: "My work", exact: true }).locator(`a[data-request-id="${request.id}"]`);
    await expect(row).toBeVisible();
    await settle(page);

    const hold = holdUntilReleased();
    await page.route(`**/requests/${request.id}**`, (route, req) => req.headers()["rsc"] === "1" && !req.headers()["next-router-prefetch"] ? hold.handler(route) : route.fallback());
    await watchFirstSight(page, { detail: '[data-skeleton="detail"]', list: '[data-skeleton="list"]' });
    await row.click();
    await page.waitForTimeout(1_500);
    hold.release();
    await expect(page.locator("#request-title")).toHaveText("Loading from Impact");
    // The list's skeleton never shows on the way to a Request.
    expect(Object.keys(await firstSight(page))).not.toContain("list");
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});

test("the Request preview draws its skeleton with Close from its first frame while its code loads (A116)", async ({ page }) => {
  test.setTimeout(300_000);
  const user = await createTestUser("frame-loading-preview");
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await provisionAndSignIn(page, user, { name: "Preview Loading PM", workspaceName: "Lane E2E Preview loading", role: "pm" });
    const [id] = await seedPreviewFixtures(user.id, ["Preview while its code loads"]);

    await page.mouse.move(5, 5);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const title = page.locator(`[data-request-grid] [role="row"][data-request-id="${id}"] a[data-request-title]`);
    await expect(title).toBeVisible();
    await settle(page);

    // From here on, scripts the page asks for (the preview's code among them) wait.
    const hold = holdUntilReleased();
    await page.route("**/_next/static/chunks/**", hold.handler);
    const preview = page.getByRole("region", { name: "Request preview" });
    await watchFirstSight(page, { panel: "[data-request-peek]" });
    await title.click();
    await expect(preview).toBeVisible();

    // A116: the first frame of the panel is the skeleton with its Close, never a bare "Close preview" button.
    const first = await page.evaluate(html => {
      const panel = new DOMParser().parseFromString(html, "text/html").querySelector("[data-request-peek]")!;
      return { skeleton: !!panel.querySelector('[data-skeleton="request-preview"]'), close: !!panel.querySelector('[data-skeleton="request-preview"] button[aria-label="Close preview"]'), text: panel.textContent?.trim() ?? "" };
    }, (await firstSight(page)).panel);
    expect(first).toEqual({ skeleton: true, close: true, text: expect.not.stringMatching(/^Close preview$/) });
    await expect(preview.locator('[data-skeleton="request-preview"]').getByRole("button", { name: "Close preview" })).toBeVisible();

    hold.release();
    await page.unroute("**/_next/static/chunks/**");
    await expect(preview.getByRole("heading", { level: 2, name: "Preview while its code loads", exact: true })).toBeVisible();
    await preview.getByRole("button", { name: "Close preview" }).click();
    await expect(preview).toHaveCount(0);
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});

test("on a phone, a Request opened from Inbox shows its skeleton at once on a slow connection (A115)", async ({ browser }) => {
  test.setTimeout(300_000);
  const user = await createTestUser("frame-loading-inbox-phone");
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await provisionAndSignIn(page, user, { name: "Inbox Loading PM", workspaceName: "Lane E2E Inbox loading", role: "pm" });
    const [id] = await seedPreviewFixtures(user.id, ["Opened from the phone Inbox"]);
    await page.goto("/inbox", { waitUntil: "domcontentloaded" });
    const open = page.locator(`[data-inbox-item] button[data-inbox-open]`).filter({ hasText: "Opened from the phone Inbox" });
    await expect(open).toBeVisible({ timeout: 60_000 });
    await settle(page);

    // From here the connection is a slow phone's (400 ms each way), and the tap's own page request never answers in
    // time: whatever the tap draws within a second comes from what the Inbox read ahead after it loaded.
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: 50_000, uploadThroughput: 50_000 });
    const hold = holdUntilReleased();
    await page.route(`**/requests/${id}**`, (route, req) => req.headers()["rsc"] === "1" && !req.headers()["next-router-prefetch"] ? hold.handler(route) : route.fallback());
    await open.tap();
    await expect(page.locator('[data-skeleton="detail"]')).toBeVisible({ timeout: 1_000 });
    await page.screenshot({ path: test.info().outputPath("A115-inbox-phone-skeleton.png") });
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    hold.release();
    await expect(page.locator("#request-title")).toHaveText("Opened from the phone Inbox", { timeout: 30_000 });
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await context.close();
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});

// React shows a streamed part of the page by moving it out of a hidden holder on the next frame, and a background tab
// draws no frames. When something in the frame changes meanwhile (the composer's code arriving, say), React draws the
// Request itself and the streamed copy waits, hidden, for a frame. Only one of the two may be the Request's title.
test("a Request page loaded in a tab that isn't drawing has one #request-title", async ({ page }) => {
  test.setTimeout(300_000);
  const user = await createTestUser("frame-loading-one-title");
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await provisionAndSignIn(page, user, { name: "One Title PM", workspaceName: "Lane E2E One title", role: "pm" });
    const request = await seedTestRequest(user.id, "One title at a time");
    await page.addInitScript(() => {
      // Like a tab behind other windows: no frames for the first 3 s.
      const frame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => performance.now() < 3_000 ? window.setTimeout(() => frame(callback), 3_000 - performance.now()) : frame(callback);
      const seen = { most: 0 };
      (window as unknown as { titles: typeof seen }).titles = seen;
      new MutationObserver(() => { seen.most = Math.max(seen.most, document.querySelectorAll('[id="request-title"]').length); })
        .observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["id"] });
    });
    for (let load = 0; load < 3; load++) {
      await page.goto(`/requests/${request.id}`);
      await expect(page.getByRole("heading", { level: 1, name: "One title at a time", exact: true })).toBeVisible();
      await page.waitForTimeout(3_500);
      await expect(page.locator("#request-title")).toHaveText("One title at a time");
      expect(await page.evaluate(() => (window as unknown as { titles: { most: number } }).titles.most)).toBe(1);
    }
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
