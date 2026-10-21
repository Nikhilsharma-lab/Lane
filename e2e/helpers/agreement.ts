import {
  expect,
  type Browser,
  type Page,
  type TestInfo,
} from "@playwright/test";
import postgres from "postgres";
import { createTestUser, signInTestUser } from "./test-user";
import { provisionAndSignIn } from "./auth";
import { assertOwnedOrganization, assertOwnedUser } from "./fixtures";
import { assertE2ETarget } from "./safety";
import {
  intakeDraftScope,
  intakeDraftStorageKey,
  type IntakeDraft,
} from "../../src/lib/intake-draft";
import { createTriageToken } from "../../src/lib/triage-token";

// These fixtures have review history. Retain exact creation receipts
// for staging inspection; do not disable history triggers for teardown.
export async function createAgreementTeam(browser: Browser, ownerPage: Page) {
  const users = await Promise.all(
    ["PM", "Designer", "Developer"].map((createLabel) =>
      createTestUser(`agreement-${createLabel}`),
    ),
  );
  for (const [i, user] of users.entries()) {
    const client = await assertOwnedUser(user.id);
    await client.users.updateUser(user.id, {
      firstName: `Agreement ${["PM", "Designer", "Developer"][i]}`,
      lastName: "",
    });
  }
  const orgId = await provisionAndSignIn(ownerPage, users[0], {
    name: "Agreement PM",
    workspaceName: "Agreement acceptance",
    role: "pm",
  });
  const client = await assertOwnedOrganization(orgId);
  const sql = postgres(assertE2ETarget().databaseUrl, {
    ssl: "require",
    max: 1,
  });
  try {
    for (const [index, user] of users.slice(1).entries()) {
      await client.organizations.createOrganizationMembership({
        organizationId: orgId,
        userId: user.id,
        role: "org:member",
      });
      await sql`insert into profiles(id,full_name,email,role) values (${user.id},${`Agreement ${index === 0 ? "Designer" : "Developer"}`},${user.email},${index === 0 ? "designer" : "developer"})`;
    }
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
      await testInfo.attach("retained-agreement-fixtures", {
        body: JSON.stringify({ orgId, userIds: users.map((user) => user.id) }),
        contentType: "application/json",
      });
      await Promise.all(contexts.map((context) => context.close()));
    },
  };
}
export type AgreementTeam = Awaited<ReturnType<typeof createAgreementTeam>>;

/**
 * Creates a Request as the PM. With `reviewers`, the PM goes back from the
 * restored review to the compose step, picks them in the Reviewers property,
 * and reviews again through the real gate, so the save carries the picks.
 */
export async function createRequestThroughIntake(
  team: AgreementTeam,
  title: string,
  { reviewers = [] }: { reviewers?: string[] } = {},
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
    expectedImpact: {
      kind: "verification" as const,
      result:
        "Customers can recover checkout without reentering payment details.",
      source: "Pilot walkthrough",
      reviewAfterDays: 14,
    },
  };
  const triage = {
    classification: "problem" as const,
    reframedProblem: source.description,
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
      editedProblem: triage.reframedProblem,
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
export async function addReviewerThroughUI(team: AgreementTeam, name: string) {
  const panel = team.pages[0].getByRole("region", {
    name: "Reviewers",
    exact: true,
  });
  await panel.getByRole("button", { name: "Add reviewer", exact: true }).click();
  await panel.getByRole("combobox", { name: "Reviewer", exact: true }).click();
  await team.pages[0].getByRole("option", { name, exact: true }).click();
  const submit = panel.getByRole("button", { name: "Add", exact: true });
  await submit.focus();
  await expect(submit).toBeFocused();
  await submit.press("Enter");
  await expect(panel.getByRole("listitem").filter({ hasText: name })).toContainText("Waiting");
}
