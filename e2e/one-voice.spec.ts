import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";

import { cleanupTestWorkspace, e2eDatabase, getProfileFullName, getTestWorkspaceId } from "./helpers/cleanup";
import { journey } from "./helpers/journey";
import { safeClerkClient } from "./helpers/safety";
import { createTestUser, deleteTestUser, signInTestUser, type TestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

// #261 (Build 2.2): names, "Goal" and dates read the same everywhere. Walk findings D5, B6, C8 (one name), C2-6 and
// Z3 (Goal), B5, B7 and C15 (dates).

/** A goal measured as a conversion rate: 62% now, 80% after release, 30 days after release. */
const GOAL = {
  kind: "measurement", version: 4,
  primary: { key: "conversion", name: "", unit: "percent", current: 62, target: 80, noBaseline: false, check: "" },
  measurement: { audience: "all", audienceName: "", platform: "all", platformName: "", windowDays: 30, exactDates: false, startDate: "", endDate: "" },
  guardrails: [],
};

/** Inserts a Request by `userId` in their test workspace, with any of its saved moments set. */
async function seedRequest(userId: string, title: string, more: { status?: "open" | "in_progress" | "done"; createdAt?: string; pickedUpAt?: string; doneAt?: string; goal?: typeof GOAL; comment?: string } = {}) {
  const orgId = await getTestWorkspaceId(userId);
  const sql = e2eDatabase();
  const id = randomUUID();
  try {
    await sql`
      INSERT INTO requests (id, org_id, title, description, status, created_by, assigned_to, expected_impact, created_at, picked_up_at, done_at)
      VALUES (${id}, ${orgId}, ${title}, 'Returning customers give up when checkout asks for their card again.', ${more.status ?? "open"}, ${userId},
        ${more.status && more.status !== "open" ? userId : null}, ${sql.json(more.goal ?? GOAL)}, ${more.createdAt ?? new Date().toISOString()},
        ${more.pickedUpAt ?? null}, ${more.doneAt ?? null})
    `;
    if (more.comment) await sql`INSERT INTO comments (request_id, author_id, body) VALUES (${id}, ${userId}, ${more.comment})`;
    return id;
  } finally {
    await sql.end();
  }
}

const accountMenu = (page: Page) => page.getByRole("button", { name: /^Account menu, / });
const NOT_GOAL_WORDS = /predict|expected impact/i;

test.describe("one name per person (D5, B6, C8)", () => {
  test("after a rename through Clerk, the sidebar, a comment and Settings all show the new name; an old mismatch is fixed too", async ({ page }) => {
    test.setTimeout(240_000);
    // A borrowed user's name is changed here: borrow from the end of the list, and always give the name back.
    const user = await createTestUser("one-name", undefined, { borrowFrom: "last" });
    const clerk = await safeClerkClient();
    const original = await clerk.users.getUser(user.id);
    try {
      // Lane's saved copy starts out of step with the account ("Lane E2E"), as it was for everyone renamed before this build.
      await provisionAndSignIn(page, user, { name: "Stale Lane Copy", workspaceName: "One Name" });
      const requestId = await seedRequest(user.id, "Card details survive a failed payment", { comment: "Adding the payment logs here." });

      // Settings → Profile shows the account's name and brings Lane's copy in step; the sidebar elsewhere follows.
      await page.goto("/settings/profile");
      await expect(page.getByText(`${original.firstName} ${original.lastName}`, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
      await expect.poll(() => getProfileFullName(user.id), { timeout: 20_000 }).toBe(`${original.firstName} ${original.lastName}`);
      await page.goto("/");
      await expect(accountMenu(page)).toHaveAccessibleName(`Account menu, ${original.firstName} ${original.lastName}`, { timeout: 20_000 });

      // A rename through Clerk ("Manage account" saves to Clerk the same way).
      const renamed = { firstName: "Priya", lastName: `Raman ${randomUUID().slice(0, 4)}` };
      const newName = `${renamed.firstName} ${renamed.lastName}`;
      await clerk.users.updateUser(user.id, renamed);

      await page.goto("/settings/profile");
      await expect(page.getByText(newName, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
      await page.screenshot({ path: test.info().outputPath("D5-settings-after-rename-1440-light.png"), fullPage: true });
      await expect.poll(() => getProfileFullName(user.id), { timeout: 20_000 }).toBe(newName);
      await page.goto("/");
      await expect(accountMenu(page)).toHaveAccessibleName(`Account menu, ${newName}`, { timeout: 20_000 });

      await page.goto(`/requests/${requestId}`);
      await expect(accountMenu(page)).toHaveAccessibleName(`Account menu, ${newName}`);
      const comments = page.getByRole("list", { name: "Request comments" });
      await expect(comments.getByText(newName, { exact: true })).toBeVisible();
      await expect(page.getByText("Stale Lane Copy")).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath("D5-request-after-rename-1440-light.png"), fullPage: true });
    } finally {
      // Give the borrowed account its name back even when a step above failed (deleteTestUser restores its own name too).
      await clerk.users.updateUser(user.id, { firstName: original.firstName ?? "", lastName: original.lastName ?? "" });
      try { await cleanupTestWorkspace(user.id); } finally { await deleteTestUser(user.id); }
    }
  });
});

test.describe("Goal wording (C2-6, Z3)", () => {
  test("the composer, Request page and Impact say Goal, never prediction or Expected impact", async ({ page }) => {
    test.setTimeout(240_000);
    const user = await createTestUser("goal-words");
    try {
      await provisionAndSignIn(page, user, { name: "Goal Words", workspaceName: "Goal Words" });
      const requestId = await seedRequest(user.id, "Fewer people abandon checkout");

      await page.goto("/");
      await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "New Request" }).click();
      const composer = page.getByRole("dialog", { name: "New Request" });
      await expect(composer.getByRole("group", { name: "Goal", exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(composer).not.toContainText(NOT_GOAL_WORDS);
      await page.keyboard.press("Escape");

      await page.goto(`/requests/${requestId}`);
      const goal = page.getByRole("region", { name: "Goal", exact: true });
      await expect(goal).toBeVisible();
      await expect(goal).toContainText("80% (from 62%)");
      await expect(journey(page)).toBeVisible();
      await expect(page.locator("main")).not.toContainText(NOT_GOAL_WORDS);

      await page.goto("/impact");
      await page.getByRole("tab", { name: "My work" }).click();
      await expect(page.getByText("Goal set, not measured yet")).toBeVisible({ timeout: 20_000 });
      await expect(page.locator("main")).not.toContainText(NOT_GOAL_WORDS);
      await page.getByRole("tab", { name: "Outcome report" }).click();
      await expect(page.locator("main")).not.toContainText(NOT_GOAL_WORDS);
    } finally {
      try { await cleanupTestWorkspace(user.id); } finally { await deleteTestUser(user.id); }
    }
  });
});

/** The Request page in a browser set to `timeZoneId`, signed in as `user`. */
async function requestPageIn(browser: Browser, timeZoneId: string, user: TestUser, orgId: string, requestId: string) {
  const context = await browser.newContext({ timezoneId: timeZoneId, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await signInTestUser(page, user, orgId);
  await page.goto(`/requests/${requestId}`);
  await expect(journey(page).getByText(/^Requested by /)).toBeVisible({ timeout: 30_000 });
  return { context, page };
}

test.describe("dates (B5, B7, C15)", () => {
  test("in a non-UTC zone, Submitted and the Journey's moments agree, and the planned measuring days are the same in two zones", async ({ browser, page }) => {
    test.setTimeout(240_000);
    const user = await createTestUser("one-date");
    try {
      const orgId = await provisionAndSignIn(page, user, { name: "Dana Dates", workspaceName: "One Date" });
      // Last year, so every moment reads as a day. 20:00 UTC is already the next day in India and still the same day in
      // Los Angeles, for the filing, the pickup and Done alike.
      const year = new Date().getUTCFullYear() - 1;
      const requestId = await seedRequest(user.id, "Delivery dates match everywhere", {
        status: "done", createdAt: `${year}-10-20T20:00:00.000Z`, pickedUpAt: `${year}-10-21T20:30:00.000Z`, doneAt: `${year}-10-22T20:00:00.000Z`,
        goal: { ...GOAL, measurement: { ...GOAL.measurement, exactDates: true, startDate: `${year}-11-01`, endDate: `${year}-11-30` } },
      });

      const india = await requestPageIn(browser, "Asia/Kolkata", user, orgId, requestId);
      await expect(india.page.getByText(`Dana Dates, 21 Oct ${year}`, { exact: true })).toBeVisible();
      await expect(journey(india.page).getByText(`Requested by Dana Dates on 21 Oct ${year}.`, { exact: true })).toBeVisible();
      await expect(journey(india.page).getByText(`Picked up by Dana Dates on 22 Oct ${year}.`, { exact: true })).toBeVisible();
      await expect(journey(india.page).getByText(`Marked Done on 23 Oct ${year}.`, { exact: true })).toBeVisible();
      // Hovering a Journey moment shows its full date and time, in the viewer's zone.
      await expect(journey(india.page).getByText(`Requested by Dana Dates on 21 Oct ${year}.`, { exact: true }).locator("time"))
        .toHaveAttribute("title", new RegExp(`^[A-Z][a-z]+day 21 October ${year}, 01:30$`));
      await expect(india.page.getByRole("region", { name: "Goal", exact: true })).toContainText(`1 Nov ${year} to 30 Nov ${year}`);
      await expect(india.page.locator("main")).not.toContainText("UTC");
      await india.page.screenshot({ path: test.info().outputPath("B5-request-india-1440-light.png"), fullPage: true });

      const losAngeles = await requestPageIn(browser, "America/Los_Angeles", user, orgId, requestId);
      await expect(losAngeles.page.getByText(`Dana Dates, 20 Oct ${year}`, { exact: true })).toBeVisible();
      await expect(journey(losAngeles.page).getByText(`Requested by Dana Dates on 20 Oct ${year}.`, { exact: true })).toBeVisible();
      await expect(journey(losAngeles.page).getByText(`Picked up by Dana Dates on 21 Oct ${year}.`, { exact: true })).toBeVisible();
      await expect(journey(losAngeles.page).getByText(`Marked Done on 22 Oct ${year}.`, { exact: true })).toBeVisible();
      await expect(journey(losAngeles.page).getByText(`Picked up by Dana Dates on 21 Oct ${year}.`, { exact: true }).locator("time"))
        .toHaveAttribute("title", new RegExp(`^[A-Z][a-z]+day 21 October ${year}, 13:30$`));
      // Planned days have no zone: the same calendar days in both.
      await expect(losAngeles.page.getByRole("region", { name: "Goal", exact: true })).toContainText(`1 Nov ${year} to 30 Nov ${year}`);
      await losAngeles.page.screenshot({ path: test.info().outputPath("B5-request-los-angeles-1440-light.png"), fullPage: true });

      await india.context.close();
      await losAngeles.context.close();
    } finally {
      try { await cleanupTestWorkspace(user.id); } finally { await deleteTestUser(user.id); }
    }
  });
});
