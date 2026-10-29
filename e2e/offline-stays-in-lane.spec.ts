import { expect, test, type Page } from "@playwright/test";

import { cleanupTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-user";
import { intakeDraftScope, intakeDraftStorageKey, type IntakeDraft } from "../src/lib/intake-draft";
import { createTriageToken } from "../src/lib/triage-token";

// #260 (walk findings A21, C6, A127, C1, A18): going offline never sends the tab to the browser's
// "No internet" page, never loses typed text and never queues a change for later.

const OFFLINE_LINE = /^You.re offline$/;
const OFFLINE_ANSWER = /You.re offline, this will work when you.re back/;

/** Marks this document, so a later check can tell the tab never loaded another page. It first lets the
 * page finish loading what it loads on its own (in development, lazily compiled chunks), so going
 * offline afterwards tests Lane, not a chunk that was still on its way. */
async function markDocument(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.evaluate(() => { (window as unknown as { __laneStayed?: boolean }).__laneStayed = true; });
}

/** The same Lane document is still on screen: no full page load, no browser error page. */
async function expectStillInLane(page: Page, path: string) {
  // A failed move falls back within half a second (A21); give it longer to show.
  await page.waitForTimeout(1_500);
  expect(page.url()).toMatch(/^http:\/\/localhost:\d+\//);
  expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(path);
  expect(await page.evaluate(() => (window as unknown as { __laneStayed?: boolean }).__laneStayed === true)).toBe(true);
  await expect(page.locator("#lane-main")).toBeVisible();
}

const offlineLine = (page: Page) => page.getByRole("status").filter({ hasText: OFFLINE_LINE });
const toasts = (page: Page) => page.getByRole("region", { name: /^Messages/ });
const row = (page: Page, id: string) => page.locator(`[role=row][data-request-id="${id}"]`);

test("offline, list changes roll back, pages stay put, and Try again works once back online", async ({ page, context }) => {
  test.setTimeout(480_000);
  const user = await createTestUser("offline-lane");
  try {
    await provisionAndSignIn(page, user, { name: "Offline PM", workspaceName: "Lane E2E Offline", role: "pm" });
    const pickUp = await seedTestRequest(user.id, "Offline pick up keeps its place");
    const priority = await seedTestRequest(user.id, "Offline priority keeps its place");
    await page.goto("/");
    await expect(row(page, pickUp.id)).toBeVisible();
    await expect(row(page, priority.id)).toBeVisible();
    await markDocument(page);

    // C6 and A127: the sidebar's Inbox and Impact links stay on the list while offline.
    await context.setOffline(true);
    await expect(offlineLine(page)).toBeVisible();
    await page.getByRole("link", { name: "Inbox" }).first().click();
    await expectStillInLane(page, "/");
    await page.getByRole("link", { name: "Impact", exact: true }).click();
    await expectStillInLane(page, "/");
    await expect(offlineLine(page)).toBeVisible();

    // A21: Pick up from the row menu says the shared offline answer and changes nothing.
    await row(page, pickUp.id).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Pick up" }).click();
    await expect(toasts(page)).toContainText(OFFLINE_ANSWER);
    await expect(row(page, pickUp.id).locator("button[data-status]")).toHaveAttribute("data-status", "open");
    await expectStillInLane(page, "/");

    // Nothing was queued: back online, the Request is still Open until Try again.
    await context.setOffline(false);
    await expect(offlineLine(page)).toHaveCount(0);
    await page.waitForTimeout(1_000);
    await expect(row(page, pickUp.id).locator("button[data-status]")).toHaveAttribute("data-status", "open");
    await toasts(page).getByRole("button", { name: "Try again" }).first().click();
    await expect(row(page, pickUp.id).locator("button[data-status]")).toHaveAttribute("data-status", "in_progress", { timeout: 20_000 });

    // A21: a priority change offline rolls back the same way.
    await context.setOffline(true);
    await row(page, priority.id).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Priority" }).click();
    await page.getByRole("menuitemcheckbox", { name: "High" }).click();
    await expect(toasts(page)).toContainText(OFFLINE_ANSWER);
    await expect(row(page, priority.id).locator("button[data-priority]")).toHaveAttribute("data-priority", "none");
    await expectStillInLane(page, "/");
    await context.setOffline(false);
    await toasts(page).getByRole("button", { name: "Try again" }).first().click();
    await expect(row(page, priority.id).locator("button[data-priority]")).toHaveAttribute("data-priority", "high", { timeout: 20_000 });

    // C6: on the Outcome report, Month / Quarter / Year offline keeps the page.
    await page.getByRole("link", { name: "Impact", exact: true }).click();
    await page.waitForURL("**/impact**");
    await page.getByRole("tab", { name: "Outcome report" }).click();
    const reportBy = page.getByRole("radiogroup", { name: "Report by" }).or(page.getByRole("group", { name: "Report by" })).first();
    await expect(reportBy).toBeVisible();
    await markDocument(page);
    const impactPath = new URL(page.url()).pathname + new URL(page.url()).search;
    await context.setOffline(true);
    await expect(offlineLine(page)).toBeVisible();
    await reportBy.getByText("Year", { exact: true }).click();
    await expectStillInLane(page, impactPath);
    await context.setOffline(false);
  } finally {
    await context.setOffline(false);
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});

/** Opens the composer at its review step with a signed review, as session-continuity-intake-draft.spec.ts does. */
async function openReviewedDraft(page: Page, user: TestUser, orgId: string, title: string) {
  const source = {
    title,
    description: "Customers lose the payment details they entered after a recoverable checkout error.",
    affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "",
    projectId: null, requestType: null,
    // New Requests take a measurement plan; a current value makes it ready to pick up.
    expectedImpact: {
      kind: "measurement" as const, version: 2 as const,
      primary: { key: "conversion" as const, name: "", unit: "percent" as const, current: 62, target: 80, noBaseline: false, check: "" as const },
      measurement: { audience: "all" as const, platform: "web" as const, windowDays: 30 as const, exactDates: false, startDate: "", endDate: "" },
      guardrails: [],
    },
  };
  const triage = { classification: "problem" as const, reframedProblem: null, extractedSolution: null };
  const draft: IntakeDraft = {
    version: 2, savedAt: Date.now(), source,
    review: { triage, token: createTriageToken(source, triage, { orgId, userId: user.id }), editedProblem: "" },
  };
  await page.goto("/intake");
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)), {
    key: intakeDraftStorageKey(intakeDraftScope(user.id, orgId)), value: draft,
  });
  await page.reload();
}

test("offline, Create Request says so in view and keeps the text; New Project shows Lane's own words", async ({ page, context }) => {
  test.setTimeout(360_000);
  const user = await createTestUser("offline-create");
  try {
    const orgId = await provisionAndSignIn(page, user, { name: "Offline Filer", workspaceName: "Lane E2E Offline Create", role: "pm" });
    const title = "Offline filing keeps what I wrote";
    await openReviewedDraft(page, user, orgId, title);
    const create = page.getByRole("button", { name: "Create Request", exact: true });
    await expect(create).toBeVisible({ timeout: 45_000 });
    await markDocument(page);

    // C1: Create offline answers where it can be seen, and the review keeps the text.
    await context.setOffline(true);
    await create.click();
    const answer = page.getByText(OFFLINE_ANSWER).first();
    await expect(answer).toBeVisible();
    await expect(answer).toBeInViewport();
    await expect(page.getByText(title).first()).toBeVisible();
    await expectStillInLane(page, "/intake");

    // A18: New Project offline never shows the browser's "Failed to fetch".
    await page.keyboard.press("Escape");
    const sidebar = page.getByRole("complementary", { name: "Workspace sidebar" });
    await sidebar.getByRole("button", { name: "New Project" }).click();
    await sidebar.getByRole("textbox", { name: "Project name" }).fill("Offline Project");
    await sidebar.getByRole("textbox", { name: "Project name" }).press("Enter");
    await expect(sidebar.getByText(OFFLINE_ANSWER)).toBeVisible();
    await expect(page.getByText("Failed to fetch")).toHaveCount(0);

    // Back online, the same review creates the Request.
    await context.setOffline(false);
    await openReviewedDraft(page, user, orgId, title);
    await page.getByRole("button", { name: "Create Request", exact: true }).click();
    await page.waitForURL("**/requests/**", { timeout: 45_000 });
  } finally {
    await context.setOffline(false);
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
