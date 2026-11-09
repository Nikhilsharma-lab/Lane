import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

import { cleanupTestWorkspace, e2eDatabase } from "./helpers/cleanup";
import { answerIsItLive } from "./helpers/journey";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

/**
 * #280: the strip's Pick up and Mark Done show the next state at once (first change within 0.1s), the new button
 * can't be pressed until the move is confirmed and looks busy only past the placeholder delay, and a refusal rolls
 * back with a message. A greyed Pick up says why in visible text (B19), for any Request.
 */

const goal = (current: number | null) => ({
  kind: "measurement", version: 4,
  primary: { key: "conversion", name: "", unit: "percent", current, target: 80, noBaseline: false, check: "" },
  measurement: { audience: "all", audienceName: "", platform: "all", platformName: "", windowDays: 30, exactDates: false, startDate: "", endDate: "" },
  guardrails: [],
});

const strip = (page: Page) => page.locator('[data-slot="page-strip"] [data-slot="request-lifecycle-actions"]');
const toasts = (page: Page) => page.getByRole("region", { name: /^Messages/ });

async function seedRequest(orgId: string, userId: string, title: string, current: number | null) {
  const sql = e2eDatabase();
  try {
    const id = randomUUID();
    await sql`INSERT INTO requests ${sql({ id, org_id: orgId, title, description: "Returning customers give up when checkout asks for their card again.", created_by: userId, expected_impact: sql.json(goal(current)) })}`;
    return id;
  } finally { await sql.end(); }
}

/** Holds this Request's next server action until `release`, then fails it as a lost response would. */
async function holdNextAction(page: Page, requestId: string) {
  const path = `**/requests/${requestId}**`;
  const released = Promise.withResolvers<void>();
  const seen = Promise.withResolvers<void>();
  let count = 0;
  await page.route(path, async route => {
    if (route.request().method() !== "POST" || !route.request().headers()["next-action"]) return route.continue();
    count++;
    seen.resolve();
    await released.promise;
    await route.abort("failed");
  });
  return { seen: seen.promise, count: () => count, async release() { released.resolve(); await page.unroute(path); } };
}

/**
 * Presses `from` and reports, from the page's own clock, how long the strip took to stop showing it and what it
 * showed first: the next button's label and its busy and unavailable states, or nothing.
 */
async function pressAndWatch(page: Page, from: string) {
  return strip(page).evaluate((slot, from) => new Promise<{ ms: number; next: string | null; busy: string | null; disabled: string | null }>(resolve => {
    const button = [...slot.querySelectorAll("button")].find(item => item.textContent?.trim() === from)!;
    const host = slot.closest('[data-slot="page-strip"]')!;
    let start = 0;
    const read = () => {
      const shown = host.querySelector<HTMLButtonElement>('[data-slot="request-lifecycle-actions"] button');
      if (shown?.textContent?.trim() === from) return false;
      observer.disconnect();
      resolve({ ms: performance.now() - start, next: shown?.textContent?.trim() ?? null, busy: shown?.getAttribute("aria-busy") ?? null, disabled: shown?.getAttribute("aria-disabled") ?? null });
      return true;
    };
    const observer = new MutationObserver(read);
    observer.observe(host, { subtree: true, childList: true, characterData: true, attributes: true });
    start = performance.now();
    button.click();
    read();
  }), from);
}

test("a greyed Pick up says why in the strip, not only on hover (B19)", async ({ page }) => {
  test.setTimeout(180_000);
  let user: TestUser | undefined;
  try {
    user = await createTestUser("strip-reason");
    const orgId = await provisionAndSignIn(page, user, { name: "Strip Reason", workspaceName: "Strip reason" });
    const id = await seedRequest(orgId, user.id, "Card details survive a failed payment", null);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/requests/${id}`);
      const reason = strip(page).getByText("Add the current value before picking up this Request.", { exact: true });
      await expect(reason).toBeVisible();
      expect((await reason.boundingBox())?.width ?? 0, `the reason is laid out as text at ${width}px`).toBeGreaterThan(40);
      await expect(strip(page).getByRole("button", { name: "Pick up", exact: true })).toBeDisabled();
    }
  } finally {
    if (user) try { await cleanupTestWorkspace(user.id); } finally { await deleteTestUser(user.id); }
  }
});

test("Pick up and Mark Done show the next state at once and roll back on a refusal", async ({ page }) => {
  test.setTimeout(240_000);
  let user: TestUser | undefined;
  try {
    user = await createTestUser("strip-instant");
    await page.setViewportSize({ width: 1440, height: 900 });
    const orgId = await provisionAndSignIn(page, user, { name: "Strip Instant", workspaceName: "Strip instant" });
    const id = await seedRequest(orgId, user.id, "Checkout keeps the saved card", 62);
    await page.goto(`/requests/${id}`);
    const pickUp = strip(page).getByRole("button", { name: "Pick up", exact: true });
    const markDone = strip(page).getByRole("button", { name: "Mark Done", exact: true });
    await expect(pickUp).toBeEnabled();

    // Pick up: Mark Done shows in the same moment, not pressable and not yet busy; busy only past the delay.
    let held = await holdNextAction(page, id);
    const picked = await pressAndWatch(page, "Pick up");
    expect(picked.ms, "first change after Pick up").toBeLessThanOrEqual(100);
    expect(picked).toMatchObject({ next: "Mark Done", disabled: "true", busy: null });
    await held.seen;
    await expect(markDone).toHaveAttribute("aria-busy", "true");
    // The double-submit guard: pressing the new Mark Done sends nothing.
    await markDone.evaluate((button: HTMLButtonElement) => button.click());
    await page.waitForTimeout(300);
    expect(held.count()).toBe(1);
    await held.release();
    await expect(toasts(page)).toContainText("Try again if this Request is still Open");
    await expect(pickUp).toBeEnabled();
    await expect(markDone).toHaveCount(0);

    // Confirmed, Mark Done becomes pressable.
    await pickUp.click();
    await expect(markDone).toBeEnabled({ timeout: 20_000 });
    await expect(markDone).not.toHaveAttribute("aria-disabled", "true");

    // Mark Done: the strip empties at once (Done has no next move here); a refusal brings Mark Done back.
    held = await holdNextAction(page, id);
    const done = await pressAndWatch(page, "Mark Done");
    expect(done.ms, "first change after Mark Done").toBeLessThanOrEqual(100);
    expect(done.next).toBeNull();
    await held.seen;
    await held.release();
    await expect(toasts(page)).toContainText("Try again if this Request is still In progress");
    await expect(markDone).toBeEnabled();

    await markDone.click();
    await answerIsItLive(page, "not yet");
    await expect(markDone).toHaveCount(0);
    await page.reload();
    await expect(page.locator("[data-detail-panel] [data-detail-status]")).toHaveAttribute("data-status", "done");
  } finally {
    if (user) try { await cleanupTestWorkspace(user.id); } finally { await deleteTestUser(user.id); }
  }
});
