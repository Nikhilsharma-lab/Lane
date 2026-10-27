import { expect, test, type Page, type Request } from "@playwright/test";

import { cleanupTestWorkspace, provisionTestWorkspace } from "./helpers/cleanup";
import { assertOwnedOrganization } from "./helpers/fixtures";
import { createTestUser, deleteTestUser, signInTestUser } from "./helpers/test-user";

// #258 speed fix 1 (Build 1 in #256). Settings reads the member list from Clerk only once Members is shown, from its
// own page, an in-place switch or a Settings search result, and keeps it for the visit. Opening the account menu
// loads Settings ahead, so clicking Settings answers at once. Nothing looks different.

/** Clerk's member list and pending invitations for a workspace (not the person's own memberships). */
const MEMBER_LIST = /\/v1\/organizations\/[^/]+\/(?:memberships|invitations)(?:\?|$)/;
const memberListRequests = (page: Page) => {
  const seen: string[] = [];
  page.on("request", request => { if (MEMBER_LIST.test(new URL(request.url()).pathname)) seen.push(request.url()); });
  return seen;
};
const isRsc = (request: Request) => /[?&]_rsc=/.test(request.url()) || request.headers()["rsc"] === "1";

/** Clerk is loaded with the workspace active and the page has stopped fetching, so anything it would read has been read. */
async function settled(page: Page) {
  await page.waitForFunction(() => Boolean(window.Clerk?.loaded && window.Clerk.organization));
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1_500);
}

const MEMBER = { first: "Marguerite", last: "Okonkwo-Fairweather" };
const memberName = `${MEMBER.first} ${MEMBER.last}`;

// One test, so it borrows only two lane-e2e users when Clerk's development instance is at its user cap.
test("the account menu loads Settings ahead; Settings reads the member list only once Members is shown, keeps it for the visit, and still refreshes it after changes", async ({ page }) => {
  // Borrowing users at Clerk's cap walks many users through Clerk's API, which can take minutes.
  test.setTimeout(900_000);
  const admin = await createTestUser("settings-load-ahead-admin");
  const member = await createTestUser("settings-load-ahead-member");

  try {
    const orgId = await provisionTestWorkspace({ userId: admin.id, email: admin.email, name: "Lane E2E", workspaceName: `Lane E2E Settings load ahead ${Date.now()}` });
    const client = await assertOwnedOrganization(orgId);
    await client.users.updateUser(member.id, { firstName: MEMBER.first, lastName: MEMBER.last });
    await client.organizations.createOrganizationMembership({ organizationId: orgId, userId: member.id, role: "org:member" });

    await page.setViewportSize({ width: 1440, height: 1000 });
    await signInTestUser(page, admin, orgId);

    await test.step("opening the account menu loads Settings ahead, before any click", async () => {
      await page.goto("/");
      await settled(page);
      const settings = new Set<string>();
      const onRequest = (request: Request) => {
        const { pathname } = new URL(request.url());
        if (isRsc(request) && pathname.startsWith("/settings/")) settings.add(pathname);
      };
      page.on("request", onRequest);
      await page.waitForTimeout(1_000);
      expect([...settings], "Settings loaded before the menu opened").toEqual([]);
      await page.getByRole("button", { name: /^Account menu/ }).click();
      await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
      await expect.poll(() => [...settings].sort()).toEqual(["/settings/members", "/settings/profile"]);
      await expect(page).toHaveURL("/");
      page.off("request", onRequest);
      await page.keyboard.press("Escape");
    });

    const memberList = memberListRequests(page);
    const people = page.getByRole("list", { name: "People in this workspace" });
    const membersNav = page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Members" });

    await test.step("Profile, Billing and Metrics don't ask Clerk for the member list", async () => {
      for (const path of ["/settings/profile", "/settings/profile?section=billing", "/settings/metrics"]) {
        await page.goto(path);
        await expect(page.getByRole("button", { name: /Search settings/ })).toBeVisible();
        await settled(page);
        expect(memberList, `member-list requests on ${path}`).toEqual([]);
      }
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
      await expect(people.getByText(memberName)).toBeVisible();
      await page.unroute(url => MEMBER_LIST.test(url.pathname));
      await settled(page);
      const loaded = memberList.length;
      expect(loaded).toBeGreaterThan(0);

      await page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Profile" }).click();
      await expect(people).toBeHidden();
      await membersNav.click();
      await expect(people.getByText(memberName)).toBeVisible();
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
      await expect(page.getByText(invitee)).toHaveCount(0);

      await people.getByRole("button", { name: `Role for ${memberName}: Member` }).click();
      await page.getByRole("option", { name: /^Admin/ }).click();
      await expect(people.getByRole("button", { name: `Role for ${memberName}: Admin` })).toBeVisible();
    });

    for (const query of ["members", "invite"]) {
      await test.step(`Settings search for "${query}" lands on Members with the list`, async () => {
        await page.goto("/settings/profile");
        await settled(page);
        await page.getByRole("button", { name: /Search settings/ }).click();
        await page.keyboard.type(query);
        await page.keyboard.press("Enter");
        await expect(page.locator("#settings-members")).toBeVisible();
        await expect(people.getByText(memberName)).toBeVisible();
      });
    }

    await test.step("the Members page shows the list", async () => {
      await page.goto("/settings/members");
      await expect(people.getByText(memberName)).toBeVisible();
    });
  } finally {
    await cleanupTestWorkspace(admin.id);
    await deleteTestUser(admin.id);
    await deleteTestUser(member.id);
  }
});
