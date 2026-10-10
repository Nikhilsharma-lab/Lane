import { expect, test } from "@playwright/test";

import { cleanupTestWorkspace } from "./helpers/cleanup";
import {
  createClerkTestOrganization,
  createTestUser,
  deleteTestUser,
  signInTestUser,
} from "./helpers/test-user";

test("role onboarding preserves the selection after a failed save", async ({
  page,
}) => {
  const user = await createTestUser("role-recovery");
  const orgId = await createClerkTestOrganization(
    user.id,
    "Lane E2E Recovery Workspace"
  );

  try {
    await signInTestUser(page, user, orgId);
    await page.goto("/onboarding");

    const designer = page.getByRole("radio", { name: "Designer" });
    await designer.click();

    let failed = false;
    await page.route("**/onboarding", async (route) => {
      if (!failed && route.request().method() === "POST") {
        failed = true;
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(
      page.getByText(/role selection is still here/i)
    ).toBeVisible();
    await expect(designer).toBeChecked();

    await page.unroute("**/onboarding");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "Requests", exact: true })
    ).toBeVisible();
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
