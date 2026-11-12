import { randomUUID } from "node:crypto";
import { expect, test, type Page, type Request, type Route } from "@playwright/test";

import { cleanupTestWorkspace, e2eDatabase, getTestWorkspaceId } from "./helpers/cleanup";
import { answerIsItLive, journey, journeyStep, recordReleaseInPrompt } from "./helpers/journey";
import { compiledJourneyRead } from "./helpers/server-action-identity";
import { toastRegion } from "./helpers/mark-done-undo";
import { createTestUser, deleteTestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

// #278 (Build 6.2): the Journey follows the strip with no reload (B1), shows a close at once (C2-4), has one main button
// per step with the rest of Measuring under More (B36), says when a result is overdue (C2-11), and offers Reopen on Done
// for 15 minutes from the saved Done time (B32).

const DAY_MS = 86_400_000;

/** A conversion-rate goal: 62% now, 80% after release, measured for 7 days after release. */
const GOAL = {
  kind: "measurement", version: 4,
  primary: { key: "conversion", name: "", unit: "percent", current: 62, target: 80, noBaseline: false, check: "" },
  measurement: { audience: "all", audienceName: "", platform: "all", platformName: "", windowDays: 7, exactDates: false, startDate: "", endDate: "" },
  guardrails: [],
};

/** Inserts a Request by `userId` in their test workspace, with its saved moments. */
async function seedRequest(userId: string, title: string, more: { status?: "open" | "done"; createdAt?: string; pickedUpAt?: string; doneAt?: string } = {}) {
  const orgId = await getTestWorkspaceId(userId);
  const sql = e2eDatabase();
  const id = randomUUID();
  try {
    await sql`
      INSERT INTO requests (id, org_id, title, description, status, created_by, assigned_to, expected_impact, created_at, picked_up_at, done_at)
      VALUES (${id}, ${orgId}, ${title}, 'Returning customers give up when checkout asks for their card again.', ${more.status ?? "open"}, ${userId},
        ${more.status === "done" ? userId : null}, ${sql.json(GOAL)}, ${more.createdAt ?? new Date().toISOString()}, ${more.pickedUpAt ?? null}, ${more.doneAt ?? null})
    `;
    return id;
  } finally {
    await sql.end();
  }
}

/** This Request's Journey reads, by the running build's own action identity. */
async function journeyReads(requestId: string, orgId: string) {
  const { id } = await compiledJourneyRead();
  return (request: Request) => {
    if (request.method() !== "POST" || request.headers()["next-action"] !== id) return false;
    try {
      const args: unknown = JSON.parse(request.postData() ?? "null");
      return Array.isArray(args) && args[0] === requestId && (args[1] as { orgId?: string } | null)?.orgId === orgId;
    } catch { return false; }
  };
}

/** Holds every Journey read until released: what the Journey shows meanwhile comes from the live Request alone. */
async function holdJourneyReads(page: Page, matches: (request: Request) => boolean) {
  const gate = Promise.withResolvers<void>();
  const held: Promise<void>[] = [];
  const handler = (route: Route) => {
    if (!matches(route.request())) return route.fallback();
    const sent = gate.promise.then(() => route.continue());
    held.push(sent);
    return sent;
  };
  await page.route("**/requests/**", handler);
  return {
    held: () => held.length,
    async release() {
      // Every held read is sent on before the route goes, so none is left to the default handling.
      gate.resolve();
      await Promise.all(held);
      await page.unroute("**/requests/**", handler);
    },
  };
}

/** The workspace's rows go where they can: one with release history keeps them (history is immutable). The user and
 * their Clerk workspace go either way. */
async function cleanup(userId: string) {
  try {
    await cleanupTestWorkspace(userId).catch(error => console.warn(`[e2e] kept the local rows of ${userId}'s workspace:`, (error as Error).message));
  } finally { await deleteTestUser(userId); }
}

const strip = (page: Page) => page.locator('[data-slot="request-lifecycle-actions"]:visible');

test.describe("the Journey stays current (#278)", () => {
  test("B1, C2-4: the Journey follows Pick up, Mark Done and Close without a result with no reload", async ({ page }) => {
    test.setTimeout(240_000);
    const user = await createTestUser("journey-current");
    try {
      const orgId = await provisionAndSignIn(page, user, { name: "Jo Journey", workspaceName: "Journey current" });
      const id = await seedRequest(user.id, "Saved cards survive a failed payment");
      const reads = await journeyReads(id, orgId);
      await page.goto(`/requests/${id}`);
      await expect(journeyStep(page, "Open", "current step")).toBeVisible({ timeout: 30_000 });
      await expect(journey(page).getByText("Loading journey…", { exact: true })).toHaveCount(0);
      // A mark on this document: a reload would start a new one without it.
      await page.evaluate(() => { (window as Window & { journeyNoReload?: boolean }).journeyNoReload = true; });

      // Pick up: the Journey moves with the strip while its reads are still out, then fills in what they say.
      let hold = await holdJourneyReads(page, reads);
      await strip(page).getByRole("button", { name: "Pick up", exact: true }).click();
      const inProgress = journeyStep(page, "In progress", "current step");
      await expect(inProgress).toBeVisible();
      await expect(inProgress).toContainText("is working on this. Mark Done when the work is finished.");
      await expect(strip(page).getByRole("button", { name: "Mark Done", exact: true })).toBeVisible({ timeout: 20_000 });
      await expect.poll(() => hold.held()).toBeGreaterThan(0);
      await hold.release();
      await expect(inProgress.getByRole("button", { name: "Close without a result", exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(inProgress.getByText(/^Picked up by .+ on /)).toBeVisible();

      // Mark Done: the Done step and its next steps at once; Record release once the reads agree.
      hold = await holdJourneyReads(page, reads);
      await strip(page).getByRole("button", { name: "Mark Done", exact: true }).click();
      const done = journeyStep(page, "Done", "current step");
      await expect(done).toBeVisible();
      await expect(done).toContainText("Record the release once the work reaches all users. Anyone working on this Request can record it.");
      await answerIsItLive(page, "not yet");
      await hold.release();
      await expect(done.getByRole("button", { name: "Record release", exact: true })).toBeVisible({ timeout: 20_000 });
      await expect(done.getByText(/^Marked Done on /)).toBeVisible();

      // Close without a result: Closed at once, with a message, before the reads bring who closed it.
      await done.getByRole("button", { name: "Close without a result", exact: true }).click();
      await journey(page).getByRole("combobox", { name: "Why" }).click();
      await page.getByRole("option", { name: "Rolled back" }).click();
      hold = await holdJourneyReads(page, reads);
      await journey(page).getByRole("button", { name: "Close without a result", exact: true }).click();
      const closed = journeyStep(page, "Closed without a result", "current step");
      await expect(closed).toBeVisible({ timeout: 20_000 });
      await expect(closed).toContainText("Closed Requests can’t be reopened.");
      await expect(journeyStep(page, "Done", "finished")).toBeVisible();
      await expect(toastRegion(page)).toContainText("Request closed");
      await hold.release();
      await expect(closed).toContainText("Closed without a result at Done: Rolled back.", { timeout: 20_000 });
      expect(await page.evaluate(() => (window as Window & { journeyNoReload?: boolean }).journeyNoReload)).toBe(true);
    } finally {
      await cleanup(user.id);
    }
  });

  test("B36, C2-11: an overdue Measuring step has one main button and a More menu with Void last, and says the result was due", async ({ page }) => {
    test.setTimeout(240_000);
    const user = await createTestUser("journey-more");
    try {
      const orgId = await provisionAndSignIn(page, user, { name: "Mo More", workspaceName: "Journey more" });
      // Filed, picked up and Done 60 days ago, so a release on the day it was filed is long past its 7-day result.
      const filed = new Date(Date.now() - 60 * DAY_MS);
      const id = await seedRequest(user.id, "Checkout keeps the saved card", { status: "done", createdAt: filed.toISOString(), pickedUpAt: filed.toISOString(), doneAt: filed.toISOString() });
      void orgId;
      await page.goto(`/requests/${id}`);
      const done = journeyStep(page, "Done", "current step");
      // Reopen's 15 minutes ended long ago.
      await expect(done.getByRole("button", { name: "Record release", exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(done.getByRole("button", { name: "Reopen", exact: true })).toHaveCount(0);
      await done.getByRole("button", { name: "Record release", exact: true }).click();
      const releaseDay = filed.toISOString().slice(0, 10);
      await journey(page).getByLabel("Release date", { exact: true }).fill(releaseDay);
      await journey(page).getByLabel("Value before release (%)", { exact: true }).fill("62");
      await journey(page).getByLabel("Release evidence", { exact: true }).fill("Feature flag at 100% since the day it was filed");
      await journey(page).getByRole("checkbox", { name: "The agreed audience received this work" }).check();
      await journey(page).getByRole("button", { name: "Mark as released", exact: true }).click();

      const measuring = journeyStep(page, "Measuring", "current step");
      const countdown = measuring.getByRole("status");
      await expect(countdown).toHaveText(/^Overdue \d+ days$/, { timeout: 20_000 });
      await expect(measuring).toContainText(/The result was due on .+\. .+ records it and closes this Request\./);
      await expect(measuring).toContainText("Released to all users on ");
      // The warning tone, at text contrast.
      const [tone, ink] = await countdown.evaluate(element => {
        const probe = document.createElement("span");
        probe.style.color = "var(--request-warning-ink)";
        element.after(probe);
        const colours = [getComputedStyle(element).color, getComputedStyle(probe).color];
        probe.remove();
        return colours;
      });
      expect(tone).toBe(ink);

      // One main button, and More.
      await expect(measuring.getByRole("button")).toHaveText(["Close Request", "More"]);
      await expect(measuring.getByRole("button", { name: "Close Request", exact: true })).toBeEnabled();
      await measuring.getByRole("button", { name: "More", exact: true }).click();
      const menu = page.getByRole("menu", { name: "More", exact: true });
      await expect(menu.getByRole("menuitem")).toHaveText(["Close without a result", "Correct release", "Create follow-up Request", "Void incorrect release"]);
      // Void is last, set apart by the menu's one separator.
      expect(await menu.evaluate(element => [...element.querySelectorAll('[role="separator"], [role="menuitem"]')].map(item => item.getAttribute("role") === "separator" ? "—" : item.textContent))).toEqual(["Close without a result", "Correct release", "Create follow-up Request", "—", "Void incorrect release"]);
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(measuring.getByRole("button", { name: "More", exact: true })).toBeFocused();
      await page.screenshot({ path: test.info().outputPath("B36-measuring-overdue-1440-light.png"), fullPage: true });
    } finally {
      await cleanup(user.id);
    }
  });

  test("B32: Reopen shows on Done, returns to In progress with Back to In progress, ends with its 15 minutes and is gone after a release", async ({ page }) => {
    test.setTimeout(300_000);
    const user = await createTestUser("journey-reopen");
    try {
      await provisionAndSignIn(page, user, { name: "Rae Reopen", workspaceName: "Journey reopen" });
      const now = Date.now();
      const id = await seedRequest(user.id, "Saved card shows its last four digits", { status: "done", pickedUpAt: new Date(now - 60_000).toISOString(), doneAt: new Date(now).toISOString() });
      await page.goto(`/requests/${id}`);
      const done = journeyStep(page, "Done", "current step");
      const reopen = done.getByRole("button", { name: "Reopen", exact: true });
      await expect(reopen).toBeVisible({ timeout: 30_000 });
      await expect(done.getByRole("button")).toHaveText(["Record release", "Reopen", "Close without a result"]);
      await page.screenshot({ path: test.info().outputPath("B32-done-reopen-1440-light.png"), fullPage: true });

      // Reopen: back to In progress, said in the toast's words, with no reload.
      await reopen.click();
      await expect(journeyStep(page, "In progress", "current step")).toBeVisible();
      await expect(toastRegion(page)).toContainText("Back to In progress", { timeout: 20_000 });
      await expect(strip(page).getByRole("button", { name: "Mark Done", exact: true })).toBeVisible();
      await page.reload();
      await expect(journeyStep(page, "In progress", "current step")).toBeVisible({ timeout: 30_000 });

      // Marked Done again: Reopen is back, and using it takes the toast's Undo with it.
      await strip(page).getByRole("button", { name: "Mark Done", exact: true }).click();
      await answerIsItLive(page, "not yet");
      await expect(toastRegion(page).getByRole("button", { name: "Undo", exact: true })).toBeVisible();
      await expect(reopen).toBeVisible({ timeout: 20_000 });
      await reopen.click();
      await expect(toastRegion(page)).toContainText("Back to In progress", { timeout: 20_000 });
      await expect(toastRegion(page).getByRole("button", { name: "Undo", exact: true })).toHaveCount(0);
      await expect(journeyStep(page, "In progress", "current step")).toBeVisible();

      // Recording the release ends it: Measuring has no Reopen, and the Done step none either.
      await expect(strip(page).getByRole("button", { name: "Mark Done", exact: true })).toBeVisible({ timeout: 20_000 });
      await strip(page).getByRole("button", { name: "Mark Done", exact: true }).click();
      await answerIsItLive(page, "yes");
      await recordReleaseInPrompt(page, "Feature flag at 100% for every shopper");
      await expect(journeyStep(page, "Measuring", "current step")).toBeVisible({ timeout: 20_000 });
      await expect(journey(page).getByRole("button", { name: "Reopen", exact: true })).toHaveCount(0);
      await page.reload();
      await expect(journeyStep(page, "Measuring", "current step")).toBeVisible({ timeout: 30_000 });
      await expect(journey(page).getByRole("button", { name: "Reopen", exact: true })).toHaveCount(0);

      // The window ends on the page's clock, from the saved Done time: the button goes without a reload.
      const late = await seedRequest(user.id, "Saved card survives a reload", { status: "done", pickedUpAt: new Date(Date.now() - 20 * 60_000).toISOString(), doneAt: new Date(Date.now() - 14 * 60_000).toISOString() });
      await page.clock.install({ time: Date.now() });
      await page.goto(`/requests/${late}`);
      const lateReopen = journeyStep(page, "Done", "current step").getByRole("button", { name: "Reopen", exact: true });
      await expect(lateReopen).toBeVisible({ timeout: 30_000 });
      await page.clock.fastForward(70_000);
      await expect(lateReopen).toHaveCount(0);
      await expect(journeyStep(page, "Done", "current step").getByRole("button", { name: "Record release", exact: true })).toBeVisible();
    } finally {
      await cleanup(user.id);
    }
  });
});
