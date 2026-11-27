import { expect, test } from "@playwright/test";

import { cleanupTestWorkspace, getProfileRole } from "./helpers/cleanup";
import {
  createTestUser,
  deleteTestUser,
  signInTestUser,
} from "./helpers/test-user";
import { createTestWorkspace } from "./helpers/workspaces";
import { ROLE_STEP_URL } from "../src/lib/onboarding-address";

/** Onboarding's address, with or without the role step's marker. */
const ONBOARDING = (url: URL) => url.pathname === "/onboarding";

test("role onboarding preserves the selection after a failed save", async ({
  page,
}) => {
  const user = await createTestUser("role-recovery");
  const orgId = await createTestWorkspace(
    user.id,
    "Lane E2E Recovery Workspace"
  );

  try {
    await signInTestUser(page, user, orgId);
    await page.goto(ROLE_STEP_URL);

    // Not Designer, which every profile starts as.
    const developer = page.getByRole("radio", { name: "Developer" });
    await developer.click();

    let failed = false;
    let attempts = 0;
    await page.route(ONBOARDING, async (route) => {
      if (route.request().method() === "POST") attempts += 1;
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
    await expect(developer).toBeChecked();
    expect(attempts).toBe(1);
    expect(await getProfileRole(user.id)).toBe("designer");

    await page.unroute(ONBOARDING);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "Requests", exact: true })
    ).toBeVisible();
    expect(await getProfileRole(user.id)).toBe("developer");
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
