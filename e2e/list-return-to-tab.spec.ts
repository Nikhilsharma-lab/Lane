import { randomUUID } from "node:crypto";
import { expect, test, type Page, type Request } from "@playwright/test";
import { cleanupTestWorkspace, e2eDatabase } from "./helpers/cleanup";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

/**
 * Follow-up to Build 5 of #256 (decision 4a, 2026-11-12): the list reads fresh rows only when you come back to a tab
 * that was hidden. A window focus with the tab already visible reads nothing. The return sends one request, the rows
 * on screen don't fetch their page data again, a change still waiting for its answer stays shown (and holds the read),
 * and the page never moves away.
 */

const row = (page: Page, id: string) => page.locator(`[data-request-grid] [role="row"][data-request-id="${id}"]`);
const group = (page: Page, label: string) => page.getByRole("rowgroup", { name: `${label} Requests`, exact: true });

/** Page data: an RSC read (a refresh or a prefetch) or a server action call, from this app. */
const isPageData = (request: Request, origin: string) => request.url().startsWith(origin)
  && (/[?&]_rsc=/.test(request.url()) || request.headers()["rsc"] === "1" || "next-action" in request.headers());

/** Every page-data request the page sends from now on. */
function watchPageData(page: Page) {
  const origin = new URL(page.url()).origin;
  const seen: { url: string; method: string; prefetch: boolean; action: boolean }[] = [];
  page.on("request", request => {
    if (!isPageData(request, origin)) return;
    const headers = request.headers();
    seen.push({ url: request.url(), method: request.method(), prefetch: headers["next-router-prefetch"] === "1", action: "next-action" in headers });
  });
  return seen;
}

/** The tab is hidden, then shown again: the document's own visibility, as a tab switch changes it. */
async function setVisibility(page: Page, state: "hidden" | "visible") {
  await page.evaluate(next => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => next });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => next === "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
}

async function openList(page: Page) {
  await page.goto("/");
  await expect(page.locator('[data-composer-ready="true"]')).toBeAttached({ timeout: 30_000 });
  await expect(page.locator("[data-request-grid]")).toBeVisible();
  // The list's feel (and its return-to-tab read) loads once the page is idle; the rows' prefetches settle too.
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1_000);
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
}

test("the list reads fresh rows only on a return to a hidden tab, with one request and no prefetches", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  let owner: TestUser | undefined;
  try {
    owner = await createTestUser("list-return-to-tab");
    const orgId = await provisionAndSignIn(page, owner, { name: "Tab Returner", workspaceName: "Return to the tab" });
    const ids = Array.from({ length: 8 }, () => randomUUID());
    const sql = e2eDatabase();
    try {
      await sql`INSERT INTO requests ${sql(ids.map((id, index) => ({ id, org_id: orgId, title: `Returning row ${index + 1}`, description: "Seeded by list-return-to-tab.spec.ts",
        status: "open", created_by: owner!.id, created_at: new Date(Date.now() - index * 60_000) })))}`;
    } finally { await sql.end(); }

    await openList(page);
    await expect(group(page, "Open").locator("[data-request-id]")).toHaveCount(ids.length);
    await page.evaluate(() => { (window as unknown as { __laneStayed: boolean }).__laneStayed = true; });
    const entries = await page.evaluate(() => history.length);
    const requests = watchPageData(page);

    await test.step("a window focus with the tab visible reads nothing", async () => {
      for (let run = 0; run < 3; run++) {
        await page.evaluate(() => window.dispatchEvent(new Event("focus")));
        await page.waitForTimeout(700);
      }
      await page.waitForTimeout(1_500);
      expect(requests, "A window focus must not read the list or its rows' page data").toEqual([]);
    });

    await test.step("coming back to a hidden tab sends one request and restarts no prefetch", async () => {
      const db = e2eDatabase();
      try { await db`UPDATE requests SET title = 'Renamed while the tab was hidden' WHERE id = ${ids[2]}`; } finally { await db.end(); }
      await setVisibility(page, "hidden");
      await page.waitForTimeout(700);
      expect(requests, "Hiding the tab reads nothing").toEqual([]);
      await setVisibility(page, "visible");
      // A visible tab's focus usually arrives with it; it adds nothing.
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(row(page, ids[2])).toContainText("Renamed while the tab was hidden", { timeout: 15_000 });
      // Restarted prefetches start straight after a refresh lands; give them time to show.
      await page.waitForTimeout(3_000);
      expect(requests, "One read, and no prefetch, on the return").toHaveLength(1);
      expect(requests[0].prefetch).toBe(false);
      expect(page.url()).toBe(new URL("/", page.url()).href);
      expect(await page.evaluate(() => history.length), "The read adds no history entry").toBe(entries);
      expect(await page.evaluate(() => (window as unknown as { __laneStayed?: boolean }).__laneStayed)).toBe(true);
    });

    await test.step("a change still waiting for its answer stays shown, and the return reads nothing until it lands", async () => {
      const target = ids[0];
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      let holding = true;
      // Holds the first server action (the Pick up) until the tab has come back.
      await page.route(() => true, async route => {
        if (!holding || !("next-action" in route.request().headers())) return route.fallback();
        holding = false;
        await held;
        await route.fallback();
      });
      requests.length = 0;
      await row(page, target).click({ button: "right" });
      await page.getByRole("menuitem", { name: "Pick up" }).click();
      await expect(group(page, "In progress").locator(`[data-request-id="${target}"]`)).toBeVisible();
      await expect.poll(() => requests.filter(request => request.action).length).toBe(1);
      // The pointer resting on a row reads that Request's page ahead (Build 1); only the list's own reads count here.
      const listReads = () => requests.filter(request => request.action || new URL(request.url).pathname === "/");
      await setVisibility(page, "hidden");
      await setVisibility(page, "visible");
      await page.waitForTimeout(1_500);
      await expect(group(page, "In progress").locator(`[data-request-id="${target}"]`)).toBeVisible();
      expect(listReads(), "Only the held Pick up was sent").toHaveLength(1);
      release();
      await expect(group(page, "In progress").locator(`[data-request-id="${target}"]`)).toBeVisible();
      await page.unrouteAll({ behavior: "ignoreErrors" });
      expect(page.url()).toBe(new URL("/", page.url()).href);
      expect(await page.evaluate(() => (window as unknown as { __laneStayed?: boolean }).__laneStayed)).toBe(true);
    });
  } finally {
    if (owner) { await cleanupTestWorkspace(owner.id); await deleteTestUser(owner.id); }
  }
});
