import { expect, test, type Page, type Route } from "@playwright/test";

import { cleanupTestWorkspace, seedPreviewFixtures } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

// #284 (Build 7.3 of #256): the Inbox tells the truth after Back on a phone (C5), shows its own placeholder (C14),
// keeps the open item in the address, says one thing when it is empty (C26), lines up its text, wraps rows on phones
// (C27) and leads to Choose what reaches you (C28). Offline moves into the Inbox (C6): offline-stays-in-lane.spec.ts.
// Loading ahead on hover: request-preview-load-ahead.spec.ts.

/** The page has loaded, and what it reads ahead after load and the first idle moment has been read. */
async function settle(page: Page) {
  await page.waitForLoadState("load");
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
}

const fyi = (page: Page) => page.getByRole("region", { name: "For your information" });
const row = (page: Page, text: string) => page.locator("[data-inbox-item]").filter({ hasText: text });

test("on a phone, an Inbox item opened and left with Back shows read, with the right count and focus on its row (C5, C27)", async ({ browser }) => {
  test.setTimeout(300_000);
  const user = await createTestUser("inbox-phone-back");
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    await provisionAndSignIn(page, user, { name: "Inbox Phone PM", workspaceName: "Lane E2E Inbox phone", role: "pm" });
    const long = "Returning shoppers cannot find the delivery date for pre-orders before they pay at checkout";
    await seedPreviewFixtures(user.id, ["Phone Back one", "Phone Back two", long]);
    await page.goto("/inbox", { waitUntil: "domcontentloaded" });
    await expect(fyi(page).locator("[data-inbox-item]")).toHaveCount(3, { timeout: 60_000 });
    await expect(page.getByLabel("3 unread", { exact: true })).toBeVisible();
    await settle(page);

    await test.step("C27: rows wrap to two lines and the read toggle is 44px", async () => {
      const primary = row(page, long).locator("[data-inbox-open] > span").first();
      const lines = await primary.evaluate(node => Math.round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight)));
      expect(lines).toBe(2);
      const toggle = row(page, long).getByRole("button", { name: /^Mark LAN-\d+ read$/ });
      const box = await toggle.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });

    await test.step("the strip shows Inbox, Choose what reaches you and Mark all read whole, at 390px and 320px", async () => {
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        const strip = page.locator('[data-slot="page-strip"]');
        const parts = [
          strip.getByRole("heading", { name: "Inbox", exact: true }),
          strip.getByRole("link", { name: "Choose what reaches you", exact: true }),
          strip.getByRole("button", { name: "Mark all read", exact: true }),
        ];
        const boxes = [];
        for (const part of parts) {
          await expect(part).toBeVisible();
          // Whole: inside the strip and the window, and its text not cut.
          boxes.push(await part.evaluate(node => {
            const box = node.getBoundingClientRect();
            const edge = node.closest('[data-slot="page-strip"]')!.getBoundingClientRect();
            const inside = box.width > 0 && box.left >= edge.left - 0.5 && box.right <= Math.min(edge.right, innerWidth) + 0.5;
            return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, whole: inside && node.scrollWidth <= node.clientWidth + 1 };
          }));
        }
        expect(boxes.map(box => box.whole), `${width}px: Inbox, Choose what reaches you, Mark all read whole`).toEqual([true, true, true]);
        // None covers another.
        for (const [index, box] of boxes.entries()) for (const other of boxes.slice(index + 1)) {
          expect(box.right <= other.left + 0.5 || other.right <= box.left + 0.5 || box.bottom <= other.top + 0.5 || other.bottom <= box.top + 0.5).toBe(true);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
      await page.setViewportSize({ width: 390, height: 844 });
    });

    await test.step("C5: open an item, go Back: it is read, the count leaves it out and focus is on its row", async () => {
      const opened = row(page, "Phone Back two");
      const id = await opened.getAttribute("data-inbox-item");
      await opened.locator("[data-inbox-open]").tap();
      await page.waitForURL("**/requests/**");
      await expect(page.locator("#request-title")).toHaveText("Phone Back two", { timeout: 30_000 });

      await page.goBack();
      await page.waitForURL(url => url.pathname === "/inbox" && url.searchParams.get("item") === id);
      await expect(opened).toBeVisible();
      await expect(opened).not.toHaveAttribute("data-unread");
      await expect(page.getByLabel("2 unread", { exact: true })).toBeVisible();
      await expect(opened.locator("[data-inbox-open]")).toBeFocused();
      // The re-read on return keeps it in its place, read, and the count right.
      await page.waitForTimeout(1_500);
      await expect(opened).not.toHaveAttribute("data-unread");
      await expect(page.getByLabel("2 unread", { exact: true })).toBeVisible();
      await expect(row(page, "Phone Back one")).toHaveAttribute("data-unread", "true");
    });
  } finally {
    await context.close();
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});

type FirstSight = Window & { firstSight: Record<string, boolean> };

test("the Inbox: its own placeholder, the open item kept in the address, one left edge, Choose what reaches you and one empty message", async ({ page }) => {
  test.setTimeout(300_000);
  const user = await createTestUser("inbox-polish");
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await provisionAndSignIn(page, user, { name: "Inbox Polish PM", workspaceName: "Lane E2E Inbox polish", role: "pm" });
    const [first] = await seedPreviewFixtures(user.id, ["Kept open one", "Kept open two"]);
    const preview = page.getByRole("region", { name: "Request preview" });

    await test.step("C14: going to the Inbox from the Requests list shows the Inbox's placeholder, never the list's", async () => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.locator("[data-request-grid]")).toBeVisible({ timeout: 60_000 });
      await settle(page);
      let release!: () => void;
      const released = new Promise<void>(resolve => { release = resolve; });
      const inboxPage = (url: URL) => url.pathname === "/inbox";
      const hold = async (route: Route) => {
        if (route.request().headers()["rsc"] !== "1" || route.request().headers()["next-router-prefetch"]) return route.fallback();
        await released;
        await route.continue().catch(() => undefined);
      };
      await page.route(inboxPage, hold);
      await page.evaluate(() => {
        const seen: Record<string, boolean> = {};
        (window as unknown as FirstSight).firstSight = seen;
        new MutationObserver(() => {
          if (document.querySelector('[data-skeleton="inbox"]')) seen.inbox = true;
          if (document.querySelector('[data-skeleton="list"]')) seen.list = true;
        }).observe(document.body, { subtree: true, childList: true, attributes: true });
      });
      await page.getByRole("link", { name: /^Inbox/ }).first().click();
      await expect(page.locator('[data-skeleton="inbox"]')).toBeAttached({ timeout: 5_000 });
      release();
      await page.unroute(inboxPage, hold);
      await expect(fyi(page).locator("[data-inbox-item]")).toHaveCount(2, { timeout: 30_000 });
      expect(await page.evaluate(() => (window as unknown as FirstSight).firstSight)).toEqual({ inbox: true });
    });

    await test.step("section headings, empty lines and row text start at one left edge", async () => {
      const textLeft = (selector: string) => page.locator(selector).first().evaluate(node => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return Math.round(range.getBoundingClientRect().left);
      });
      const heading = await textLeft("#inbox-needs-you");
      expect(await page.getByText("Nothing needs you right now.").evaluate(node => {
        const range = document.createRange();
        range.selectNodeContents(node);
        return Math.round(range.getBoundingClientRect().left);
      })).toBe(heading);
      expect(await textLeft("#inbox-for-your-information")).toBe(heading);
      expect(await textLeft("[data-inbox-item] [data-inbox-open] > span")).toBe(heading);
    });

    await test.step("the open item is kept in the address: Back and a reload reopen it", async () => {
      const item = row(page, "Kept open one");
      const id = await item.getAttribute("data-inbox-item");
      await item.locator("[data-inbox-open]").click();
      await expect(preview).toHaveAttribute("data-request-id", first);
      await expect.poll(() => new URL(page.url()).searchParams.get("item")).toBe(id);

      await preview.getByRole("link", { name: /full page/i }).first().click();
      await page.waitForURL(`**/requests/${first}**`);
      await expect(page.locator("#request-title")).toHaveText("Kept open one", { timeout: 30_000 });
      await page.goBack();
      await expect(preview).toHaveAttribute("data-request-id", first, { timeout: 30_000 });
      await expect(item).toHaveAttribute("aria-current", "true");

      // Read now, it stays listed while the address holds it open.
      await page.reload();
      await expect(preview).toHaveAttribute("data-request-id", first, { timeout: 30_000 });
      await expect(item).not.toHaveAttribute("data-unread");
      await preview.getByRole("button", { name: "Close preview" }).click();
      await expect(preview).toHaveCount(0);
      await expect.poll(() => new URL(page.url()).search).toBe("");
    });

    await test.step("C28: the strip's Choose what reaches you opens Settings at Inbox delivery", async () => {
      await page.locator('[data-slot="page-strip"]').getByRole("link", { name: "Choose what reaches you" }).click();
      await page.waitForURL("**/settings/profile?section=inbox-delivery");
      await expect(page.locator("#settings-inbox-delivery")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator("#settings-inbox-delivery").getByRole("heading", { name: "Inbox delivery" })).toBeVisible();
    });

    await test.step("C26: nothing in either section is one message, with the link and no preview pane", async () => {
      await page.goto("/inbox", { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: "Mark all read" }).click();
      await expect(page.getByRole("button", { name: "Mark all read" })).toHaveCount(0);
      await page.goto("/inbox", { waitUntil: "domcontentloaded" });
      const empty = page.getByRole("heading", { level: 2, name: "Nothing needs you, and nothing new" });
      await expect(empty).toBeVisible({ timeout: 60_000 });
      await expect(page.locator("#lane-main").getByRole("heading", { level: 2 })).toHaveCount(1);
      await expect(page.locator("[data-inbox-preview]")).toHaveCount(0);
      await expect(page.getByText("Select an item to see its Request here.")).toHaveCount(0);
      // The link shows once, under the message; the strip leaves its own out.
      await expect(page.locator("#lane-main").getByRole("link", { name: "Choose what reaches you" })).toHaveCount(1);
      await expect(page.locator('[data-slot="page-strip"]').getByRole("link", { name: "Choose what reaches you" })).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath("inbox-empty-1440.png") });
    });
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});

type Moves = Window & { inboxMoves: string[]; inboxWatching: boolean };

/** Whether a row slides in `mode`: every transform the existing rows carry while a new item pushes them down. */
async function rowMovesWhenAnItemArrives(page: Page, userId: string, title: string) {
  await page.evaluate(() => {
    const view = window as unknown as Moves;
    view.inboxMoves = [];
    view.inboxWatching = true;
    const rows = [...document.querySelectorAll<HTMLElement>("[data-inbox-item]")];
    const sample = () => {
      for (const element of rows) if (element.style.transform && element.style.transform !== "none") view.inboxMoves.push(element.style.transform);
      if (view.inboxWatching) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await seedPreviewFixtures(userId, [title]);
  // The Inbox reads its list again when the window takes focus.
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(row(page, title)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1_000);
  return page.evaluate(() => { const view = window as unknown as Moves; view.inboxWatching = false; return view.inboxMoves; });
}

test("an Inbox row pushed down by a new item slides, and with motion turned down it moves at once (#284)", async ({ page }) => {
  test.setTimeout(300_000);
  const user = await createTestUser("inbox-slide");
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await provisionAndSignIn(page, user, { name: "Inbox Slide PM", workspaceName: "Lane E2E Inbox slide", role: "pm" });
    await seedPreviewFixtures(user.id, ["Slide one", "Slide two"]);
    await page.goto("/inbox", { waitUntil: "domcontentloaded" });
    await expect(fyi(page).locator("[data-inbox-item]")).toHaveCount(2, { timeout: 60_000 });
    await settle(page);
    expect(await rowMovesWhenAnItemArrives(page, user.id, "Slide three")).not.toEqual([]);

    // Polish bar §10: with motion turned down on the device, the rows take their new places without moving. Motion reads
    // the setting as a row first renders, so the page loads again with it.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(fyi(page).locator("[data-inbox-item]")).toHaveCount(3, { timeout: 60_000 });
    await settle(page);
    expect(await rowMovesWhenAnItemArrives(page, user.id, "Slide four")).toEqual([]);
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
