import { expect, test } from "@playwright/test";

import { cleanupTestWorkspace, provisionTestWorkspace } from "./helpers/cleanup";
import { checkManageAccount, checkManageMembers, checkManageWorkspace, removeMemberInClerk } from "./helpers/clerk-windows";
import { assertOwnedOrganization } from "./helpers/fixtures";
import { createTestUser, deleteTestUser, signInTestUser } from "./helpers/test-user";

// #257 D4 (walk finding D4): an Admin opens Clerk's Manage members and Manage workspace windows by keyboard, in
// light and dark, at every width DESIGN.md asks for, then removes a teammate. Clerk's windows used to squeeze their
// page into the empty column left by the hidden navigation, cutting off names, emails and the organization actions.
// Manage account keeps Clerk's own side navigation and must look as it did.
const WIDTHS = [1440, 1024, 768, 390] as const;
// At 390 the windows are only checked to fit without sideways scrolling: Clerk's "≡ Organization" menu row and the
// Role column wrapping letter by letter are Build 8 work (#256).
const PHONE = 390;
// Clerk folds Manage account's side navigation into a menu below laptop widths, as it always has.
const SIDE_NAVIGATION_WIDTHS: readonly number[] = [1440, 1024];
const NARROW_LAPTOP = { width: 1024, height: 640 };

for (const colorScheme of ["light", "dark"] as const) {
  test(`an Admin sees Clerk's member, workspace and account windows in full and removes a member (${colorScheme})`, async ({ page }) => {
    test.setTimeout(360_000);
    const admin = await createTestUser(`clerk-windows-admin-${colorScheme}`);
    const member = await createTestUser(`clerk-windows-member-${colorScheme}`);
    const workspaceName = `Lane E2E Clerk windows ${colorScheme} ${Date.now()}`;
    const memberName = "Marguerite Okonkwo-Fairweather";

    try {
      const orgId = await provisionTestWorkspace({ userId: admin.id, email: admin.email, name: "Lane E2E", workspaceName });
      const client = await assertOwnedOrganization(orgId);
      await client.users.updateUser(member.id, { firstName: "Marguerite", lastName: "Okonkwo-Fairweather" });
      await client.organizations.createOrganizationMembership({ organizationId: orgId, userId: member.id, role: "org:member" });

      await page.setViewportSize(NARROW_LAPTOP);
      await page.emulateMedia({ colorScheme });
      await signInTestUser(page, admin, orgId);
      await page.goto("/settings/members");
      await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${colorScheme}\\b`));

      for (const width of WIDTHS) {
        await test.step(`${width}px`, async () => {
          await page.setViewportSize({ width, height: 900 });
          await checkManageMembers(page, { name: memberName, email: member.email }, { inFull: width !== PHONE });
          await checkManageWorkspace(page, workspaceName, { inFull: width !== PHONE });
          await checkManageAccount(page, { sideNavigation: SIDE_NAVIGATION_WIDTHS.includes(width) });
        });
      }

      await page.setViewportSize(NARROW_LAPTOP);
      await removeMemberInClerk(page, { name: memberName, email: member.email });
    } finally {
      await cleanupTestWorkspace(admin.id);
      await deleteTestUser(admin.id);
      await deleteTestUser(member.id);
    }
  });
}
