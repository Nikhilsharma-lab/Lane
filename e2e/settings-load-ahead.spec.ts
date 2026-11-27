import { expect, test, type Page, type Route } from "@playwright/test";

import { cleanupTestWorkspace, e2eDatabase, finishFirstRuns, provisionTestWorkspace } from "./helpers/cleanup";
import { testEmail } from "./helpers/fixtures";
import { createTestUser, deleteTestUser, signInTestUser, type TestUser } from "./helpers/test-user";
import { addTestMember } from "./helpers/workspaces";

// #258 speed fix 1 (Build 1 in #256), since #396: the member list comes with the Settings page, streamed after the rest,
// so the browser asks nobody for it, whichever section is open. Members' own code still loads the first time Members is
// shown, from its own page, an in-place switch or a Settings search result, and stays for the visit. Opening the account
// menu loads Settings ahead, so clicking Settings answers at once: `next dev` never prefetches, so that check is in
// e2e/perf.spec.ts, which runs against a production build. Nothing looks different.

/** What the browser asks for that could be a member list: another site, Better Auth's workspace calls, a page's data or an action. */
const askedFor = (page: Page) => {
  const seen: string[] = [];
  page.on("request", request => {
    const url = new URL(request.url());
    const otherSite = url.origin !== new URL(page.url()).origin && url.protocol.startsWith("http");
    const authCall = url.pathname.startsWith("/api/auth/organization/");
    // The links' reading ahead is of other pages; a read of Settings' own data isn't prefetched in place.
    const pageData = url.pathname.startsWith("/settings/") && (request.method() === "POST" || (url.searchParams.has("_rsc") && !request.headers()["next-router-prefetch"]));
    if (otherSite || authCall || pageData) seen.push(`${request.method()} ${request.url()}`);
  });
  return seen;
};

/** The page has stopped fetching, so anything it would read has been read. */
async function settled(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1_500);
}

/** The app's own code, split into chunks. */
const CODE = /\/_next\/static\/chunks\//;
const memberName = "Marguerite Okonkwo-Fairweather";

test("the browser asks for no member list, Members' code loads once it is shown and stays for the visit, and changes still refresh the list", async ({ page }) => {
  test.setTimeout(900_000);
  const admin = await createTestUser("settings-load-ahead-admin");
  let member: TestUser | undefined;

  try {
    const orgId = await provisionTestWorkspace({ userId: admin.id, email: admin.email, name: "Lane E2E", workspaceName: `Lane E2E Settings load ahead ${Date.now()}` });
    member = await createTestUser("settings-load-ahead-member");
    await addTestMember(orgId, member.id, "member");
    const sql = e2eDatabase();
    try {
      await sql`update profiles set full_name = ${memberName} where id = ${member.id}`;
      await finishFirstRuns(sql, orgId, [member.id], "joined");
    } finally {
      await sql.end();
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/login", { timeout: 120_000 }); // the dev server compiles sign-in on first visit
    await signInTestUser(page, admin, orgId);

    const asked = askedFor(page);
    const people = page.getByRole("list", { name: "People in this workspace" });
    const membersNav = page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Members" });

    await test.step("Profile, Billing, Metrics and a Metric ask for no member list", async () => {
      for (const path of ["/settings/profile", "/settings/profile?section=billing", "/settings/metrics"]) {
        await page.goto(path);
        await expect(page.getByRole("button", { name: /Search settings/ })).toBeVisible();
        await settled(page);
        expect(asked, `asked for on ${path}`).toEqual([]);
      }
      // A Metric's own page (/settings/metrics/[id]): a starter metric every workspace has, opened from the list above.
      const metricPath = await page.getByRole("link", { name: "Conversion rate", exact: true }).getAttribute("href");
      expect(metricPath).toMatch(/^\/settings\/metrics\/[0-9a-f-]{36}$/);
      await page.goto(metricPath!);
      await expect(page.getByRole("heading", { name: "Conversion rate", exact: true })).toBeVisible();
      await settled(page);
      expect(asked, `asked for on ${metricPath}`).toEqual([]);
    });

    await test.step("switching to Members in place shows the list with its loading lines, and coming back doesn't reload it", async () => {
      await page.goto("/settings/profile");
      await settled(page);
      const code: string[] = [];
      let release!: () => void;
      const held = new Promise<void>(resolve => { release = resolve; });
      const hold = async (route: Route) => { code.push(route.request().url()); await held; await route.continue(); };
      await page.route(CODE, hold);
      await membersNav.click();
      await expect(page.getByRole("status", { name: "Loading people…" })).toBeVisible();
      release();
      await expect(people.getByText(memberName, { exact: true })).toBeVisible();
      await settled(page);
      const loaded = code.length;
      expect(loaded, "Members' code loads when it is shown").toBeGreaterThan(0);

      await page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Profile" }).click();
      await expect(people).toBeHidden();
      await membersNav.click();
      await expect(people.getByText(memberName, { exact: true })).toBeVisible();
      await expect(page.getByRole("status", { name: "Loading people…" })).toHaveCount(0);
      await settled(page);
      expect(code.length).toBe(loaded);
      expect(asked, "asked for by switching sections").toEqual([]);
      await page.unroute(CODE, hold);
    });

    await test.step("inviting, revoking and changing a role still refresh the list", async () => {
      const invitee = testEmail("load-ahead-invitee");
      // #288: one Invite people dialog; a sent invitation closes it and shows under Pending invitations.
      await page.getByRole("button", { name: "Invite people" }).click();
      const invite = page.getByRole("dialog", { name: "Invite people" });
      await invite.getByLabel("Email address").fill(invitee);
      await invite.getByRole("button", { name: "Send invitation" }).click();
      await expect(invite).toBeHidden();
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
