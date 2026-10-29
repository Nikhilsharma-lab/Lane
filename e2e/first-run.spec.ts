import { expect, test } from "@playwright/test";

import { cleanupTestWorkspace, e2eDatabase } from "./helpers/cleanup";
import { assertOwnedOrganization, registerBrowserTestOrganization } from "./helpers/fixtures";
import { createTestUser, deleteTestUser, signInTestUser } from "./helpers/test-user";

// The guide's Free Requests line before the first Request: all 4 left on a clean database; some left and shared
// with another example.com workspace, which used the rest (3fad2ccf); or none left, used by that workspace.
const FREE_LINE = /^(?:([1-4]) of 4 Free Requests left\.(?: They are shared with another workspace from example\.com, which used ([1-3])\.)?|The Free Requests for example\.com were already used by another workspace\.)$/;
const ALL_USED_WITH_ANOTHER = "This workspace and another from example.com have used the 4 Free Requests for example.com.";

/** The line once this workspace has filed one Request (billing isn't enforced, so the 5th is still filed). */
function freeLineAfterFiling(before: string) {
  const [, left, usedElsewhere] = before.match(FREE_LINE)!;
  if (!left) return ALL_USED_WITH_ANOTHER;
  const leftAfter = Number(left) - 1;
  if (!usedElsewhere) return `${leftAfter} of 4 Free Requests left.`;
  if (leftAfter === 0) return ALL_USED_WITH_ANOTHER;
  return `${leftAfter} of 4 Free Requests left. They are shared with another workspace from example.com, which used ${usedElsewhere}.`;
}

// #217 (spec #195, item 6): one browser walkthrough of a new team's first run. Prior art: onboarding.spec.ts
// (creating the workspace through Clerk's task) and request-outcome.spec.ts (a Request through the real app).
// Hosted gate: needs migrations 0035–0050 on Lane Staging (the Metrics library, Free Requests and first-run
// progress); until then it runs only against a local database by hand. The Request goes through the real
// problem check (the AI gate), so the staging Anthropic key is used once.
test("a new team's first run: create a workspace, follow the guide, file a Request with a library metric and a Reviewer, see the Free Requests left", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const founder = await createTestUser("first-run-founder");
  const teammate = await createTestUser("first-run-teammate");
  const workspaceName = `Lane E2E First run ${Date.now()}`;

  try {
    // Create the workspace and pick a profile label: the onboarding that was already there.
    await signInTestUser(page, founder);
    await page.goto("/onboarding");
    await page.locator('input[name="name"]').fill(workspaceName);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Choose your role" })).toBeVisible();
    const orgId = (await page.evaluate(() => window.Clerk.organization?.id))!;
    await registerBrowserTestOrganization(orgId, founder.id, workspaceName);
    await page.getByRole("radio", { name: "PM" }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL("/");

    // A teammate is in the workspace, so they can be picked as a Reviewer.
    const client = await assertOwnedOrganization(orgId);
    await client.organizations.createOrganizationMembership({ organizationId: orgId, userId: teammate.id, role: "org:member" });
    await client.users.updateUser(teammate.id, { firstName: "Riley", lastName: "Reviewer" });
    const sql = e2eDatabase();
    try {
      // A borrowed user (LANE_E2E_REUSE_USERS) may already have a profile from an earlier run on this database.
      await sql`insert into profiles(id,full_name,email,role) values (${teammate.id},'Riley Reviewer',${teammate.email},'designer')
        on conflict (id) do update set full_name = excluded.full_name, email = excluded.email, role = excluded.role`;
    } finally {
      await sql.end();
    }

    // The first run is the empty workspace's welcome, one step at a time, with no sample data.
    // The composer's idle preload marks a hydrated page, so the guide's buttons answer clicks.
    const hydrated = () => expect(page.locator('[data-composer-ready="true"]')).toBeAttached({ timeout: 30_000 });
    const guide = page.locator("[data-first-run='first_request']");
    await hydrated();
    await expect(guide.getByRole("heading", { name: "File your first Request" })).toBeVisible();
    await expect(guide.getByRole("progressbar")).toHaveAccessibleName("Step 1 of 5: Start with the problem");
    await expect(guide).toContainText("Lane checks the framing");
    await expect(page.getByRole("heading", { name: "No Requests yet" })).toHaveCount(0);
    await guide.getByRole("button", { name: "Next step" }).click();
    await expect(guide.getByRole("progressbar")).toHaveAccessibleName("Step 2 of 5: Predict the result");
    await expect(guide.getByRole("link", { name: "Open the Metrics library" })).toHaveAttribute("href", "/settings/metrics");

    // Progress is saved for this person: a reload resumes at the step they reached.
    await page.waitForTimeout(1_000);
    await page.reload();
    await expect(guide.getByRole("progressbar")).toHaveAccessibleName("Step 2 of 5: Predict the result");
    await hydrated();
    await guide.getByRole("button", { name: "Next step" }).click();
    await expect(guide.getByRole("heading", { name: "Ask Reviewers" })).toBeVisible();
    await expect(guide).toContainText("Looks good or Raise a concern");
    // Teammates can be invited from the first run (Clerk sends no email to a +clerk_test address).
    const invite = guide.getByRole("form", { name: "Invite teammates" });
    await invite.getByLabel("Email address").fill(`lane-e2e-first-run-invitee-${Date.now()}+clerk_test@example.com`);
    await invite.getByRole("button", { name: "Send invitation" }).click();
    await expect(invite.getByRole("status")).toContainText("as a Reviewer.");

    // Free Requests belong to the creator's company domain (#213). Every e2e user is at example.com, so on a
    // shared database another fixture workspace may already have used some or all of them; the guide says so.
    await guide.getByRole("button", { name: "Next step" }).click();
    const freeLine = guide.getByText(/Free Requests (left|for example\.com were already used)/);
    await expect(freeLine).toHaveText(FREE_LINE);
    const freeAfterFiling = freeLineAfterFiling((await freeLine.textContent())!);
    await guide.getByRole("button", { name: "Next step" }).click();
    await expect(guide.getByRole("heading", { name: "Release and Result due" })).toBeVisible();
    await expect(guide).toContainText("Lane brings you back");

    // File the first Request from the guide: the composer explains each part as it goes.
    await guide.getByRole("link", { name: "File your first Request" }).click();
    const composer = page.getByRole("dialog", { name: "New Request" });
    await expect(composer.locator("[data-first-run-hint]").first()).toBeVisible();
    await page.locator("#intake-title").fill("Returning customers lose their card details after a checkout error");
    await page.locator("#intake-description").fill("When a payment fails with a recoverable error, returning customers have to type their card details again, and many give up.");
    await composer.getByRole("combobox", { name: "Metric", exact: true }).click();
    await page.getByRole("group", { name: "Metrics library" }).getByRole("option", { name: "Conversion rate", exact: true }).click();
    await composer.getByRole("spinbutton", { name: "Current value" }).fill("62");
    await composer.getByRole("spinbutton", { name: /^Target after release/ }).fill("80");
    await composer.getByRole("button", { name: "Reviewers", exact: true }).click();
    await page.getByRole("dialog", { name: "Reviewers", exact: true }).getByRole("option", { name: "Riley Reviewer" }).click();
    await page.keyboard.press("Escape");
    await expect(page.locator("#intake-reviewers")).toHaveAccessibleName("Reviewers: Riley Reviewer");
    await composer.getByRole("button", { name: "Review Request", exact: true }).click();
    await composer.getByRole("button", { name: "Create Request", exact: true }).click({ timeout: 60_000 });
    await expect(composer).toBeHidden({ timeout: 60_000 });

    // The guide says what happens next, with the Free Requests left.
    const filed = page.locator("[data-first-run-filed]");
    await expect(filed.getByRole("heading", { name: "Your first Request is filed" })).toBeVisible({ timeout: 30_000 });
    await expect(filed).toContainText(freeAfterFiling);
    await expect(page.getByRole("link", { name: /Returning customers lose their card details/ })).toBeVisible();
    await filed.getByRole("button", { name: "Finish the guide" }).click();
    await expect(filed).toHaveCount(0);

    // The teammate who joined gets the short first run that shows their Inbox, with the review waiting.
    const context = await browser.newContext();
    try {
      const teammatePage = await context.newPage();
      await signInTestUser(teammatePage, teammate, orgId);
      await teammatePage.goto("/");
      const joined = teammatePage.locator("[data-first-run='joined']");
      await expect(joined.getByRole("heading", { name: `Welcome to ${workspaceName}` })).toBeVisible();
      await expect(teammatePage.locator('[data-composer-ready="true"]')).toBeAttached({ timeout: 30_000 });
      await joined.getByRole("link", { name: "Open your Inbox" }).click();
      await expect(teammatePage).toHaveURL("/inbox");
      await expect(teammatePage.getByRole("region", { name: /^Needs you/ })).toContainText("Returning customers lose their card details");
      await teammatePage.goto("/");
      await expect(teammatePage.locator("[data-first-run]")).toHaveCount(0);
    } finally {
      await context.close();
    }

    // Found again from help: the account menu's First-run guide.
    await page.locator("#lane-sidebar").getByRole("button").first().click();
    await page.getByRole("menuitem", { name: "First-run guide" }).click();
    await expect(page.locator("[data-first-run='first_request']")).toBeVisible({ timeout: 30_000 });
  } finally {
    await cleanupTestWorkspace(founder.id);
    await deleteTestUser(founder.id);
    await deleteTestUser(teammate.id);
  }
});
