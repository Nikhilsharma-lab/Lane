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
