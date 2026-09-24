import { expect, test } from "@playwright/test";

import {
  cleanupTestWorkspace,
  getProfileFullName,
} from "./helpers/cleanup";
import {
  createClerkTestOrganization,
  createTestUser,
  deleteTestUser,
  signInTestUser,
} from "./helpers/test-user";

test("a Clerk user chooses a Lane role and enters their active workspace", async ({
  page,
}) => {
  const user = await createTestUser("onboarding-existing-org");
  const orgId = await createClerkTestOrganization(
    user.id,
    "Lane E2E Existing Workspace"
  );

  try {
    await signInTestUser(page, user, orgId);
    await page.goto("/onboarding");

    await expect(
      page.getByRole("heading", { name: "How do you work?" })
    ).toBeVisible();
    await page.getByRole("radio", { name: "Designer" }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "Requests", exact: true })
    ).toBeVisible();
    expect(await getProfileFullName(user.id)).toBe("Lane E2E");
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});

test("workspace membership comes before a Lane role, including after an interrupted sign-in", async ({
  page,
}) => {
  const user = await createTestUser("onboarding-new-org");
  const workspaceName = `Lane E2E Workspace First ${Date.now()}`;

  try {
    await signInTestUser(page, user);
    await expect
      .poll(() => page.evaluate(() => window.Clerk.session?.currentTask?.key))
      .toBe("choose-organization");

    // Returning directly to Lane must resume Clerk's pending membership task.
    await page.goto("/onboarding");
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.getByRole("radio", { name: "PM", exact: true })).toHaveCount(0);
    expect(await getProfileFullName(user.id)).toBeNull();

    await page.reload();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.getByRole("radio", { name: "PM", exact: true })).toHaveCount(0);

    await page.locator('input[name="name"]').fill(workspaceName);
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "How do you work?" })
    ).toBeVisible();
    await page.getByRole("radio", { name: "PM" }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    await expect(page).toHaveURL("/");
    await expect(
      page.getByRole("heading", { name: "Requests", exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("complementary").getByText(workspaceName, { exact: true })
    ).toBeVisible();
    expect(await getProfileFullName(user.id)).toBe("Lane E2E");
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
