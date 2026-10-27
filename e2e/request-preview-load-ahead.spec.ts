import { expect, test, type Page } from "@playwright/test";
import { cleanupTestWorkspace, seedPreviewFixtures } from "./helpers/cleanup";
import { createTestUser, deleteTestUser, signInTestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

/**
 * #258 (speed fix 2): resting on a row, or keyboard focus stopping on one, reads its Request into the
 * preview's memory before the preview opens, so opening it shows the Request at once. Only where the
 * preview is offered (768px and wider with a mouse), and only the row a held J stops on.
 */

const TITLES = ["Preview ahead one", "Preview ahead two", "Preview ahead three", "Preview ahead four", "Preview ahead five"];
const READ = /\/api\/requests\/([0-9a-f-]{36})\?/;

/** Every Request read the page makes through the Request read route, in order. */
function recordReads(page: Page) {
  const reads: string[] = [];
  page.on("request", request => {
    const match = request.method() === "GET" ? READ.exec(request.url()) : null;
    if (match) reads.push(match[1]);
  });
  return reads;
}

/** Notes whether the preview's Request skeleton is ever drawn from now on. */
async function watchForSkeleton(page: Page) {
  await page.evaluate(() => {
    const flag = window as unknown as { sawPreviewSkeleton: string | false };
    flag.sawPreviewSkeleton = false;
    // The skeleton shown while the Request is read. (The panel's own loading state, while the preview's code
    // arrives, is a dev server compiling that code on first use; a production build has it long before.)
    const check = () => {
      const skeleton = document.querySelector('[data-skeleton="request-preview"]');
      if (skeleton) flag.sawPreviewSkeleton = skeleton.outerHTML.slice(0, 120);
    };
    new MutationObserver(check).observe(document.body, { subtree: true, childList: true, attributes: true });
  });
}
const sawSkeleton = (page: Page) => page.evaluate(() => (window as unknown as { sawPreviewSkeleton: string | false }).sawPreviewSkeleton);

/** Waits until React has hydrated `selector`, so pointer and focus handlers are live. */
async function hydrated(page: Page, selector: string) {
  await page.waitForFunction(found => {
    const element = document.querySelector(found);
    return !!element && Object.keys(element).some(key => key.startsWith("__reactFiber"));
  }, selector, { timeout: 60_000 });
}

/** Holds J past several rows: each press lands well inside the rest delay. */
async function holdJ(page: Page, presses: number) {
  for (let index = 0; index < presses; index++) await page.keyboard.press("j");
}

test("the Request preview loads ahead on the Requests list and the Inbox", async ({ browser, page }) => {
  // A dev server compiles the list, the Inbox and the read route on first use.
  test.setTimeout(300_000);
  const user = await createTestUser("preview-ahead");
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    // A cold dev server compiles sign-in on the first visit; give it that time once.
    await page.goto("/login", { waitUntil: "domcontentloaded", timeout: 120_000 });
    const orgId = await provisionAndSignIn(page, user, { name: "Preview Ahead Test", workspaceName: "Preview Ahead Workspace" });
    await seedPreviewFixtures(user.id, TITLES);
    const reads = recordReads(page);

    await test.step("Requests list: resting on a row reads it before the preview opens", async () => {
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const rows = page.locator('[data-request-grid] [role="row"][data-request-id]');
      await expect(rows).toHaveCount(TITLES.length);
      await hydrated(page, '[data-request-grid] [role="row"][data-request-id]');
      const ids = await rows.evaluateAll(elements => elements.map(element => (element as HTMLElement).dataset.requestId!));
      expect(reads).toEqual([]);

      const title = rows.nth(1).locator("a[data-request-title]");
      const readAhead = page.waitForResponse(response => response.url().includes(`/api/requests/${ids[1]}?`), { timeout: 60_000 });
      await title.hover();
      await readAhead;
      await expect(page.locator("[data-request-peek]")).toHaveCount(0);
      expect(reads).toEqual([ids[1]]);

      // Resting again while the copy is fresh reads nothing more.
      await page.mouse.move(5, 5);
      await title.hover();
      await page.waitForTimeout(400);
      expect(reads).toEqual([ids[1]]);

      await watchForSkeleton(page);
      await title.click();
      const preview = page.getByRole("region", { name: "Request preview" });
      await expect(preview).toHaveAttribute("data-request-id", ids[1]);
      await expect(preview.getByRole("heading", { level: 2, name: (await title.textContent())!, exact: true })).toBeVisible();
      expect(await sawSkeleton(page)).toBe(false);
      // Opening still reads a fresh copy behind the loaded one.
      await expect.poll(() => reads.length).toBe(2);
      expect(reads).toEqual([ids[1], ids[1]]);

      await page.keyboard.press("Escape");
      await expect(page.locator("[data-request-peek]")).toHaveCount(0);
    });

    await test.step("Requests list: holding J reads only the row it stops on", async () => {
      const rows = page.locator('[data-request-grid] [role="row"][data-request-id]');
      await rows.first().focus();
      await page.mouse.move(5, 5);
      reads.length = 0;
      await holdJ(page, 3);
      const stoppedOn = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.requestId);
      await page.waitForTimeout(800);
      expect(stoppedOn).toBeTruthy();
      expect(reads).toEqual([stoppedOn]);
    });

    await test.step("Inbox: resting on an item reads it before the preview opens, and J reads only where it stops", async () => {
      await page.goto("/inbox", { waitUntil: "domcontentloaded" });
      const items = page.getByRole("region", { name: "For your information" }).locator("[data-inbox-item]");
      await expect(items).toHaveCount(TITLES.length);
      await hydrated(page, "[data-inbox-item]");
      reads.length = 0;

      const open = items.nth(2).locator("[data-inbox-open]");
      const readAhead = page.waitForResponse(response => READ.test(response.url()), { timeout: 60_000 });
      await open.hover();
      const read = READ.exec((await readAhead).url())![1];
      await expect(page.locator("[data-request-peek]")).toHaveCount(0);
      expect(reads).toEqual([read]);

      await watchForSkeleton(page);
      await open.click();
      const preview = page.getByRole("region", { name: "Request preview" });
      await expect(preview).toHaveAttribute("data-request-id", read);
      await expect(preview.getByRole("heading", { level: 2, name: /^Preview ahead / })).toBeVisible();
      expect(await sawSkeleton(page)).toBe(false);

      await page.keyboard.press("Escape");
      await expect(page.locator("[data-request-peek]")).toHaveCount(0);

      await items.first().locator("[data-inbox-open]").focus();
      await page.mouse.move(5, 5);
      reads.length = 0;
      await holdJ(page, 3);
      await page.waitForTimeout(800);
      expect(reads).toHaveLength(1);
      // The item focus stopped on is the one read: opening it shows that Request.
      await page.keyboard.press("Enter");
      await expect(page.getByRole("region", { name: "Request preview" })).toHaveAttribute("data-request-id", reads[0]);
    });

    await test.step("a narrow window does not load ahead", async () => {
      await page.setViewportSize({ width: 700, height: 1000 });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const rows = page.locator('[data-request-grid] [role="row"][data-request-id]');
      await expect(rows).toHaveCount(TITLES.length);
      await hydrated(page, '[data-request-grid] [role="row"][data-request-id]');
      reads.length = 0;
      await rows.nth(1).locator("a[data-request-title]").hover();
      await page.waitForTimeout(500);
      await rows.nth(2).focus();
      await page.waitForTimeout(500);
      expect(reads).toEqual([]);
    });

    await test.step("a touch screen does not load ahead", async () => {
      const context = await browser.newContext({ viewport: { width: 1024, height: 900 }, hasTouch: true, isMobile: true });
      try {
        const touch = await context.newPage();
        await signInTestUser(touch, user, orgId);
        const touchReads = recordReads(touch);
        await touch.goto("/", { waitUntil: "domcontentloaded" });
        expect(await touch.evaluate(() => window.matchMedia("(pointer: fine)").matches)).toBe(false);
        const rows = touch.locator('[data-request-grid] [role="row"][data-request-id]');
        await expect(rows).toHaveCount(TITLES.length);
        await hydrated(touch, '[data-request-grid] [role="row"][data-request-id]');
        await rows.nth(3).focus();
        await touch.waitForTimeout(500);
        expect(touchReads).toEqual([]);
      } finally {
        await context.close();
      }
    });
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
