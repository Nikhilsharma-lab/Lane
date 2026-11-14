import { expect, test, type Page } from "@playwright/test";

import { cleanupTestWorkspace, seedTestRequest } from "./helpers/cleanup";
import { provisionAndSignIn } from "./helpers/auth";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-user";
import { intakeDraftScope, intakeDraftStorageKey, type IntakeDraft } from "../src/lib/intake-draft";
import { createTriageToken } from "../src/lib/triage-token";

// #285 (Build 7.4, spec #256 "Composer" and "Opening the composer"): the New Request composer at the polish bar.
// What a person sees and does: the Open group's + by Tab, a paste that doesn't fit, × asking before it drops text,
// the measurement calendar, Create offline, and where focus lands after filing from /intake.

const DISCARD = "Discard what you typed?";
const OFFLINE_ANSWER = /You.re offline, this will work when you.re back/;

/** A reviewed draft for /intake, signed as the gate signs it, so Create runs the real save with no AI call. */
async function openReviewedDraft(page: Page, user: TestUser, orgId: string, title: string, editedProblem: string) {
  const source = {
    title,
    description: "Please add a save-card button to checkout so customers stop retyping their details.",
    affectedPeople: "", desiredChange: "", observedEvidence: "", uncertainty: "", usefulLink: "",
    projectId: null, requestType: null,
    expectedImpact: {
      kind: "measurement" as const, version: 2 as const,
      primary: { key: "conversion" as const, name: "", unit: "percent" as const, current: 62, target: 80, noBaseline: false, check: "" as const },
      measurement: { audience: "all" as const, platform: "web" as const, windowDays: 30 as const, exactDates: false, startDate: "", endDate: "" },
      guardrails: [],
    },
  };
  const triage = { classification: "solution" as const, reframedProblem: editedProblem, extractedSolution: "A save-card button at checkout." };
  const draft: IntakeDraft = {
    version: 2, savedAt: Date.now(), source,
    review: { triage, token: createTriageToken(source, triage, { orgId, userId: user.id }), editedProblem },
  };
  // Nothing this tab kept earlier (the title typed above) may open the composer on /intake first.
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/intake");
  // The form saves the (empty) draft it starts with once it loads; the reviewed one goes in after that.
  await expect(page.locator('[data-composer-ready="true"]')).toBeAttached({ timeout: 60_000 });
  await page.evaluate(({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)), {
    key: intakeDraftStorageKey(intakeDraftScope(user.id, orgId)), value: draft,
  });
  await page.reload();
  await page.waitForFunction(({ userId }) => window.Clerk?.loaded && window.Clerk.user?.id === userId, { userId: user.id }, { timeout: 30_000 });
}

test("the New Request composer: the Open group's +, an overflowing paste, × asking first, the calendar, and Create offline (#285)", async ({ page, context }) => {
  test.setTimeout(480_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const user = await createTestUser("composer-polish");
  try {
    const orgId = await provisionAndSignIn(page, user, { name: "Composer Polisher", workspaceName: "Lane E2E Composer polish", role: "pm" });
    await seedTestRequest(user.id, "An Open Request so the Open group shows");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const composer = page.getByRole("dialog", { name: "New Request", exact: true });
    const title = composer.getByRole("textbox", { name: "Request title" });

    await test.step("C24: Tab reaches the Open group's + from its header, and it opens the composer", async () => {
      await page.goto("/");
      await expect(page.locator('[data-composer-ready="true"]')).toBeAttached({ timeout: 60_000 });
      const header = page.locator('[role="row"][data-grid-row="g:status:open"]');
      await expect(header).toBeVisible({ timeout: 30_000 });
      await header.focus();
      await page.keyboard.press("Tab");
      const add = header.getByRole("link", { name: "New Request", exact: true });
      await expect(add).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(header).toBeFocused();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await expect(title).toBeFocused({ timeout: 20_000 });
    });

    await test.step("C3: a paste that doesn't fit keeps what fits and says how much was left out", async () => {
      await page.evaluate(text => navigator.clipboard.writeText(text), "Checkout ".repeat(25));
      await page.keyboard.press("ControlOrMeta+V");
      await expect(title).toHaveValue("Checkout ".repeat(25).slice(0, 200));
      // The title's own line says so, and it is announced.
      const titleLine = composer.locator("#intake-title-description");
      await expect(titleLine).toBeVisible();
      await expect(titleLine).toContainText("25 characters didn’t fit and were left out.");
      await expect(composer.getByRole("status").filter({ hasText: "25 characters didn’t fit and were left out." })).toHaveCount(1);
      // Back under the limit, the field says how much room is left instead.
      await page.keyboard.press("Backspace");
      await expect(titleLine).toContainText("1 character left");
      await expect(titleLine).not.toContainText("left out");
    });

    await test.step("× with typed text asks first; Keep editing keeps it", async () => {
      await composer.getByRole("button", { name: "Close dialog", exact: true }).click();
      const prompt = page.getByRole("dialog", { name: DISCARD, exact: true });
      await expect(prompt).toBeVisible();
      await prompt.getByRole("button", { name: "Keep editing", exact: true }).click();
      await expect(prompt).toHaveCount(0);
      await expect(title).toHaveValue("Checkout ".repeat(25).slice(0, 199));
    });

    await test.step("C13 and C2: the window menu opens on its choice; the calendar opens on this month and refuses past days", async () => {
      const today = await page.evaluate(() => {
        const now = new Date();
        const key = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
        return { key: key(now), yesterday: key(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)), month: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(now), first: now.getDate() === 1 };
      });
      await composer.getByRole("button", { name: "Measurement window", exact: true }).click();
      const menu = page.getByRole("menu", { name: "Measurement window" });
      await expect(menu.getByRole("menuitemradio", { name: "30 days after release" })).toBeFocused();
      await menu.getByRole("menuitemradio", { name: "Custom date range…" }).click();
      const dates = page.getByRole("dialog", { name: "Measurement date range" });
      await expect(dates.getByRole("grid").first()).toHaveAccessibleName(today.month, { timeout: 20_000 });
      await expect(dates.locator(`[data-date="${today.key}"]`)).toBeEnabled();
      if (today.first) await expect(dates.getByRole("button", { name: "Previous month" })).toBeDisabled();
      else await expect(dates.locator(`[data-date="${today.yesterday}"]`)).toBeDisabled();
      await dates.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(dates).toHaveCount(0);
    });

    await test.step("C1: offline, the composer says so at the top, Create answers in view, and nothing typed changes", async () => {
      await openReviewedDraft(page, user, orgId, "Offline filing keeps every word", "Customers retype their card details after a checkout error.");
      const create = composer.getByRole("button", { name: "Create Request", exact: true });
      await expect(create).toBeVisible({ timeout: 45_000 });
      const problem = composer.getByRole("textbox", { name: "Problem to solve" });
      await problem.fill("Customers retype their card details after every checkout error.");
      await context.setOffline(true);
      await expect(composer.getByText(/^You.re offline$/).first()).toBeVisible();
      await create.click();
      const answer = composer.getByText(OFFLINE_ANSWER).first();
      await expect(answer).toBeVisible();
      await expect(answer).toBeInViewport();
      await expect(problem).toHaveValue("Customers retype their card details after every checkout error.");
      await expect(composer.getByRole("heading", { name: "Offline filing keeps every word" })).toBeVisible();
      await expect(page).toHaveURL(/\/intake$/);
    });

    await test.step("C22: filed from /intake, focus lands on the new Request's title", async () => {
      await context.setOffline(false);
      await composer.getByRole("button", { name: "Create Request", exact: true }).click();
      await page.waitForURL("**/requests/**", { timeout: 45_000 });
      await expect(page.locator("#request-title")).toBeFocused({ timeout: 20_000 });
      await expect(page.locator("#request-title")).toContainText("Offline filing keeps every word");
    });
  } finally {
    await context.setOffline(false);
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
