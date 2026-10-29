import {
  expect,
  type Browser,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { createTestUser, deleteTestUser, signInTestUser, type TestUser } from "./test-user";
import { provisionAndSignIn } from "./auth";
import { cleanupTestWorkspace, e2eDatabase, finishFirstRuns } from "./cleanup";
import { assertOwnedOrganization, assertOwnedUser, borrowedUserNames } from "./fixtures";
import {
  intakeDraftScope,
  intakeDraftStorageKey,
  type IntakeDraft,
} from "../../src/lib/intake-draft";
import { createTriageToken } from "../../src/lib/triage-token";

// These fixtures have review history. Retain exact creation receipts
// for staging inspection; do not disable history triggers for teardown.
//
// With LANE_E2E_REUSE_USERS=1 the users may be borrowed (e2e/helpers/test-user.ts). Borrowed users are
// given back, never retained: when the team can't be completed, and when it closes.
export async function createReviewTeam(browser: Browser, ownerPage: Page) {
  // One at a time, so two borrows never pick the same free user.
  const users: TestUser[] = [];
  try {
    for (const label of ["PM", "Designer", "Developer"]) users.push(await createTestUser(`review-${label}`));
  } catch (error) {
    // Nothing to inspect yet: hand back every user already got (a borrowed one keeps its own name).
    await Promise.allSettled(users.map((user) => deleteTestUser(user.id)));
    throw error;
  }
  try {
    return await assembleReviewTeam(browser, ownerPage, users);
  } catch (error) {
    await giveBackBorrowed(users);
    throw error;
  }
}

/**
 * Gives back the team's borrowed users; users this run created stay, with their receipts, for inspection. A borrowed
 * owner (users[0]) goes first, taking the workspace it owns with it; a borrowed teammate of a kept owner leaves the
 * workspace (`orgId`) before it goes back.
 */
async function giveBackBorrowed(users: TestUser[], orgId?: string) {
  const ownerBorrowed = Boolean(users[0] && borrowedUserNames(users[0].id));
  for (const user of ownerBorrowed ? users : users.slice(1)) {
    if (!borrowedUserNames(user.id)) continue;
    try {
      if (!ownerBorrowed && orgId) {
        const client = await assertOwnedOrganization(orgId);
        await client.organizations.deleteOrganizationMembership({ organizationId: orgId, userId: user.id });
      }
      // The workspace's local rows go too where they can, so the next run that borrows this user starts clean. A
      // workspace with release history keeps its rows (history is immutable); the user still goes back.
      if (ownerBorrowed) await cleanupTestWorkspace(user.id).catch((error) => console.warn(`[e2e] kept the local rows of ${user.id}'s workspace:`, error.message));
      await deleteTestUser(user.id);
    } catch (error) {
      console.warn(`[e2e] couldn't give back borrowed user ${user.id}:`, error);
    }
  }
}

async function assembleReviewTeam(browser: Browser, ownerPage: Page, users: TestUser[]) {
  for (const [i, user] of users.entries()) {
    const client = await assertOwnedUser(user.id);
    await client.users.updateUser(user.id, {
      firstName: `Review ${["PM", "Designer", "Developer"][i]}`,
      lastName: "",
    });
  }
  const orgId = await provisionAndSignIn(ownerPage, users[0], {
    name: "Review PM",
    workspaceName: "Review acceptance",
    role: "pm",
  });
  const client = await assertOwnedOrganization(orgId);
  const sql = e2eDatabase();
  try {
    for (const [index, user] of users.slice(1).entries()) {
      await client.organizations.createOrganizationMembership({
        organizationId: orgId,
        userId: user.id,
        role: "org:member",
      });
      // A borrowed user (LANE_E2E_REUSE_USERS=1) may already have a profile from an earlier run on this database.
      await sql`insert into profiles(id,full_name,email,role) values (${user.id},${`Review ${index === 0 ? "Designer" : "Developer"}`},${user.email},${index === 0 ? "designer" : "developer"})
        on conflict (id) do update set full_name = excluded.full_name, email = excluded.email, role = excluded.role`;
    }
    // #217: these journeys aren't about the first run; the teammates have already seen theirs.
    await finishFirstRuns(sql, orgId, users.slice(1).map((user) => user.id), "joined");
  } finally {
    await sql.end();
  }
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const pages = [
    ownerPage,
    ...(await Promise.all(contexts.map((context) => context.newPage()))),
  ];
  for (const [index, page] of pages.slice(1).entries())
    await signInTestUser(page, users[index + 1], orgId);
  return {
    users,
    orgId,
    pages,
    async close(testInfo: TestInfo) {
      await testInfo.attach("retained-review-fixtures", {
        body: JSON.stringify({ orgId, userIds: users.map((user) => user.id) }),
        contentType: "application/json",
      });
      await Promise.all(contexts.map((context) => context.close()));
      await giveBackBorrowed(users, orgId);
    },
  };
}
export type ReviewTeam = Awaited<ReturnType<typeof createReviewTeam>>;

/**
 * Creates a Request as the PM. With `reviewers`, the PM goes back from the
 * restored review to the compose step, picks them in the Reviewers property,
 * and reviews again through the real gate, so the save carries the picks.
 * `windowDays` is the agreed measurement window (7, 14, 30 or 90 days, the
 * plan's only choices), so a release recorded today is due that many days later.
 */
export async function createRequestThroughIntake(
  team: ReviewTeam,
  title: string,
  {
    reviewers = [],
    windowDays = 30,
  }: { reviewers?: string[]; windowDays?: 7 | 14 | 30 | 90 } = {},
) {
  const page = team.pages[0];
  const source = {
    title,
    description:
      "Customers lose the payment details they entered after a recoverable checkout error.",
    affectedPeople: "Returning customers",
    desiredChange: "Recover checkout without losing entered details",
    observedEvidence: "Pilot walkthrough fixture",
    uncertainty: "Recovery support in the current provider",
    usefulLink: "",
    projectId: null,
    requestType: null,
    // New Requests take a measurement plan only; a current value makes it ready to pick up.
    expectedImpact: {
      kind: "measurement" as const, version: 2 as const,
      primary: { key: "conversion" as const, name: "", unit: "percent" as const, current: 62, target: 80, noBaseline: false, check: "" as const },
      measurement: { audience: "all" as const, platform: "web" as const, windowDays, exactDates: false, startDate: "", endDate: "" },
      guardrails: [],
    },
  };
  // A problem keeps its own wording: no reframed problem (request-framing.ts).
  const triage = {
    classification: "problem" as const,
    reframedProblem: null,
    extractedSolution: null,
  };
  // Same signed-review seam as session-continuity-intake-draft.spec.ts. The save,
  // memberships, reviews and lifecycle below use the real app.
  const draft: IntakeDraft = {
    version: 2,
    savedAt: Date.now(),
    source,
    review: {
      triage,
      token: createTriageToken(source, triage, {
        orgId: team.orgId,
        userId: team.users[0].id,
      }),
      editedProblem: "",
    },
  };
  await page.goto("/intake");
  await page.evaluate(
    ({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)),
    {
      key: intakeDraftStorageKey(
        intakeDraftScope(team.users[0].id, team.orgId),
      ),
      value: draft,
    },
  );
  await page.reload();
  const create = page.getByRole("button", { name: "Create Request", exact: true });
  if (reviewers.length) {
    await page.getByRole("button", { name: "Edit Request", exact: true }).click();
    await page.getByRole("button", { name: "Reviewers", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Reviewers", exact: true });
    await expect(picker).toContainText("Add people who should look at this before work starts. Optional.");
    for (const name of reviewers)
      await picker.getByRole("option", { name, exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.locator("#intake-reviewers")).toHaveAccessibleName(`Reviewers: ${reviewers.join(", ")}`);
    await page.getByRole("button", { name: "Review Request", exact: true }).click();
    await expect(create).toBeVisible({ timeout: 45_000 });
    await expect(page.getByLabel(`Reviewers: ${reviewers.join(", ")}`)).toBeVisible();
  }
  await create.click();
  await page.waitForURL("**/requests/**", { timeout: 45_000 });
  return {
    id: new URL(page.url()).pathname.split("/").at(-1)!,
    orgId: team.orgId,
  };
}

/** The requester asks a teammate to review the Request before work starts. */
export async function addReviewerThroughUI(team: ReviewTeam, name: string) {
  const panel = team.pages[0].getByRole("region", {
    name: "Reviewers",
    exact: true,
  });
  await panel.getByRole("button", { name: "Add reviewer", exact: true }).click();
  await panel.getByRole("combobox", { name: "Reviewer", exact: true }).click();
  await team.pages[0].getByRole("option", { name, exact: true }).click();
  const submit = panel.getByRole("button", { name: "Add reviewer", exact: true });
  await submit.focus();
  await expect(submit).toBeFocused();
  await submit.press("Enter");
  await expect(panel.getByRole("listitem").filter({ hasText: name })).toContainText("Waiting");
}
