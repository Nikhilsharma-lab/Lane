import { expect, test, type Page } from "@playwright/test";

import { cleanupTestWorkspace, provisionTestWorkspace } from "./helpers/cleanup";
import { assertOwnedOrganization } from "./helpers/fixtures";
import { createTestUser, deleteTestUser, signInTestUser, type TestUser } from "./helpers/test-user";

// #258 speed fix 1 (Build 1 in #256). Settings reads the member list from Clerk only once Members is shown, from its
// own page, an in-place switch or a Settings search result, and keeps it for the visit. Opening the account menu
// loads Settings ahead, so clicking Settings answers at once: `next dev` never prefetches, so that check is in
// e2e/perf.spec.ts, which runs against a production build. Nothing looks different.

/** Clerk's member list and pending invitations for a workspace (not the person's own memberships). */
const MEMBER_LIST = /\/v1\/organizations\/[^/]+\/(?:memberships|invitations)(?:\?|$)/;
const memberListRequests = (page: Page) => {
  const seen: string[] = [];
  page.on("request", request => { if (MEMBER_LIST.test(new URL(request.url()).pathname)) seen.push(request.url()); });
  return seen;
};

/** Clerk is loaded with the workspace active and the page has stopped fetching, so anything it would read has been read. */
async function settled(page: Page) {
  await page.waitForFunction(() => Boolean(window.Clerk?.loaded && window.Clerk.organization), undefined, { timeout: 60_000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1_500);
}

const MEMBER = { first: "Marguerite", last: "Okonkwo-Fairweather" };
const memberName = `${MEMBER.first} ${MEMBER.last}`;

test("Settings reads the member list only once Members is shown, keeps it for the visit, and still refreshes it after changes", async ({ page }) => {
  // Borrowing users at Clerk's cap walks many users through Clerk's API, which can take minutes.
  test.setTimeout(900_000);
  const admin = await createTestUser("settings-load-ahead-admin");
  let member: TestUser | undefined;

  try {
    // Each person joins the workspace as soon as they're borrowed: at Clerk's cap, a parallel run borrows only people in no workspace.
    const orgId = await provisionTestWorkspace({ userId: admin.id, email: admin.email, name: "Lane E2E", workspaceName: `Lane E2E Settings load ahead ${Date.now()}` });
    member = await createTestUser("settings-load-ahead-member");
    const client = await assertOwnedOrganization(orgId);
    await client.organizations.createOrganizationMembership({ organizationId: orgId, userId: member.id, role: "org:member" });
    await client.users.updateUser(member.id, { firstName: MEMBER.first, lastName: MEMBER.last });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/login", { timeout: 120_000 }); // the dev server compiles sign-in on first visit
    await signInTestUser(page, admin, orgId);

    const memberList = memberListRequests(page);
    const people = page.getByRole("list", { name: "People in this workspace" });
    const membersNav = page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Members" });

    await test.step("Profile, Billing, Metrics and a Metric don't ask Clerk for the member list", async () => {
      for (const path of ["/settings/profile", "/settings/profile?section=billing", "/settings/metrics"]) {
        await page.goto(path);
        await expect(page.getByRole("button", { name: /Search settings/ })).toBeVisible();
        await settled(page);
        expect(memberList, `member-list requests on ${path}`).toEqual([]);
      }
      // A Metric's own page (/settings/metrics/[id]): a starter metric every workspace has, opened from the list above.
      const metricPath = await page.getByRole("link", { name: "Conversion rate", exact: true }).getAttribute("href");
      expect(metricPath).toMatch(/^\/settings\/metrics\/[0-9a-f-]{36}$/);
      await page.goto(metricPath!);
      await expect(page.getByRole("heading", { name: "Conversion rate", exact: true })).toBeVisible();
      await settled(page);
      expect(memberList, `member-list requests on ${metricPath}`).toEqual([]);
    });

    await test.step("switching to Members in place shows the list with its loading lines, and coming back doesn't reload it", async () => {
      await page.goto("/settings/profile");
      await settled(page);
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      await page.route(url => MEMBER_LIST.test(url.pathname), async route => { await held; await route.continue(); });
      await membersNav.click();
      await expect(page.getByRole("status", { name: "Loading people…" })).toBeVisible();
      release();
      await expect(people.getByText(memberName, { exact: true })).toBeVisible();
      await page.unroute(url => MEMBER_LIST.test(url.pathname));
      await settled(page);
      const loaded = memberList.length;
      expect(loaded).toBeGreaterThan(0);

      await page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Profile" }).click();
      await expect(people).toBeHidden();
      await membersNav.click();
      await expect(people.getByText(memberName, { exact: true })).toBeVisible();
      await expect(page.getByRole("status", { name: "Loading people…" })).toHaveCount(0);
      await settled(page);
      expect(memberList.length).toBe(loaded);
    });

    await test.step("inviting, revoking and changing a role still refresh the list", async () => {
      const invitee = `lane-e2e-settings-load-ahead-invitee-${Date.now()}+clerk_test@example.com`;
      const invite = page.getByRole("form", { name: "Invite someone" });
      await invite.getByLabel("Email address").fill(invitee);
      await invite.getByRole("button", { name: "Send invitation" }).click();
      const pending = page.getByRole("list", { name: "Pending invitations" });
      await expect(pending.getByText(invitee)).toBeVisible();

      await pending.getByRole("button", { name: `Revoke the invitation for ${invitee}` }).click();
      await expect(page.getByRole("status").filter({ hasText: `The invitation for ${invitee} was revoked.` })).toBeVisible();
      await expect(pending.getByText(invitee)).toHaveCount(0);

      await people.getByRole("combobox", { name: `Role for ${memberName}: Member` }).click();
      await page.getByRole("option", { name: /^Admin/ }).click();
      await expect(people.getByRole("combobox", { name: `Role for ${memberName}: Admin` })).toBeVisible();
    });

    for (const query of ["members", "invite"]) {
      await test.step(`Settings search for "${query}" lands on Members with the list`, async () => {
        await page.goto("/settings/profile");
        await settled(page);
        await page.getByRole("button", { name: /Search settings/ }).click();
        await page.keyboard.type(query);
        await page.keyboard.press("Enter");
        await expect(page.locator("#settings-members")).toBeVisible();
        await expect(people.getByText(memberName, { exact: true })).toBeVisible();
      });
    }

    await test.step("the Members page shows the list", async () => {
      await page.goto("/settings/members");
      await expect(people.getByText(memberName, { exact: true })).toBeVisible();
    });
  } finally {
    await cleanupTestWorkspace(admin.id);
    await deleteTestUser(admin.id);
    if (member) await deleteTestUser(member.id);
  }
});
