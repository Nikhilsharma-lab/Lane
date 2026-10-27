import { expect, test } from "@playwright/test";

import { cleanupTestWorkspace, provisionTestWorkspace } from "./helpers/cleanup";
import { checkManageWorkspace, removeMemberInClerk } from "./helpers/clerk-windows";
import { assertOwnedOrganization } from "./helpers/fixtures";
import { createTestUser, deleteTestUser, signInTestUser } from "./helpers/test-user";

// #257 D4 (walk finding D4): an Admin removes a teammate in Clerk's Manage members window and checks Manage
// workspace, on a narrow laptop window, by keyboard, in light and dark. Clerk's windows used to squeeze their page
// into the empty column left by the hidden navigation, cutting off names, emails and the organization actions.
const NARROW_LAPTOP = { width: 1024, height: 640 };

for (const colorScheme of ["light", "dark"] as const) {
  test(`an Admin removes a member in Clerk's window and Manage workspace shows its actions in full (${colorScheme})`, async ({ page }) => {
    test.setTimeout(240_000);
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

      await removeMemberInClerk(page, { name: memberName, email: member.email });
      await checkManageWorkspace(page, workspaceName);
    } finally {
      await cleanupTestWorkspace(admin.id);
      await deleteTestUser(admin.id);
      await deleteTestUser(member.id);
    }
  });
}
