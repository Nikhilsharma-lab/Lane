import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

import { cleanupTestWorkspace, e2eDatabase, getTestWorkspaceId } from "./helpers/cleanup";
import { isItLivePrompt, journeyPopup, journeyStep } from "./helpers/journey";
import { toastRegion } from "./helpers/mark-done-undo";
import { createTestUser, deleteTestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

// #309: a Request whose Goal is No measurable impact has no release to record. Mark Done asks no "Is it live?" and its
// toast keeps Undo; the Done step says why there's no release, and its Requester closes it without a result.

const REASON = "Renames the settings labels; nothing a person does changes.";
const NO_RELEASE = "This Request has no measurable impact, so there’s no release to record.";

async function seedRequest(userId: string, title: string) {
  const orgId = await getTestWorkspaceId(userId);
  const sql = e2eDatabase();
  const id = randomUUID();
  try {
    await sql`
      INSERT INTO requests (id, org_id, title, description, status, created_by, no_measurable_impact_reason)
      VALUES (${id}, ${orgId}, ${title}, 'The settings page calls the same thing by two names.', 'open', ${userId}, ${REASON})
    `;
    return id;
  } finally {
    await sql.end();
  }
}

const strip = (page: Page) => page.locator('[data-slot="request-lifecycle-actions"]:visible');

test("#309: Pick up, Mark Done with no Is it live?, then Close without a result as Can’t be measured", async ({ page }) => {
  test.setTimeout(240_000);
  const user = await createTestUser("no-measurable-impact");
  try {
    await provisionAndSignIn(page, user, { name: "Nia Nomeasure", workspaceName: "No measurable impact" });
    const id = await seedRequest(user.id, "One name for the settings labels");
    await page.goto(`/requests/${id}`);
    await expect(journeyStep(page, "Open", "current step")).toBeVisible({ timeout: 30_000 });

    await strip(page).getByRole("button", { name: "Pick up", exact: true }).click();
    await expect(strip(page).getByRole("button", { name: "Mark Done", exact: true })).toBeVisible({ timeout: 20_000 });
    await strip(page).getByRole("button", { name: "Mark Done", exact: true }).click();

    // The Done step, once its reads agree: why there's no release, and Close without a result as the main button.
    const done = journeyStep(page, "Done", "current step");
    await expect(done.getByText(NO_RELEASE, { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(done.getByRole("button", { name: "Record release", exact: true })).toBeDisabled();
    await expect(done).toContainText("The Requester closes this Request without a result.");
    const close = done.getByRole("button", { name: "Close without a result", exact: true });
    await expect(close).toBeEnabled();
    await expect(close).toHaveClass(/primary/);
    // Mark Done asked nothing, and its toast still offers Undo.
    await expect(isItLivePrompt(page)).toHaveCount(0);
    const marked = toastRegion(page).locator("li").filter({ hasText: "is now Done." });
    await expect(marked.getByRole("button", { name: "Undo" })).toBeVisible();
    await done.screenshot({ path: test.info().outputPath("309-done-step.png") });

    await close.click();
    const closing = journeyPopup(page, "Close without a result");
    await expect(closing).toContainText("Goal: No measurable impact");
    await expect(closing).toContainText(REASON);
    await expect(closing.getByRole("combobox", { name: "Why" })).toContainText("Can’t be measured");
    await closing.screenshot({ path: test.info().outputPath("309-close-popup.png") });
    await closing.getByRole("button", { name: "Close without a result", exact: true }).click();

    const closed = journeyStep(page, "Closed without a result", "current step");
    await expect(closed).toBeVisible({ timeout: 20_000 });
    await expect(closed).toContainText("Closed without a result at Done: Can’t be measured.", { timeout: 20_000 });
    await page.screenshot({ path: test.info().outputPath("309-closed-without-result.png"), fullPage: true });
  } finally {
    // A closed Request's rows are immutable, so its workspace's rows stay; the user and their Clerk workspace go either way.
    try {
      await cleanupTestWorkspace(user.id).catch(error => console.warn(`[e2e] kept the local rows of ${user.id}'s workspace:`, (error as Error).message));
    } finally { await deleteTestUser(user.id); }
  }
});
