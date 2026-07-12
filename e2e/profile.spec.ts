import { expect, test } from "@playwright/test";
import { cleanupTestWorkspace, getProfileRole } from "./helpers/cleanup";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

test("a member can change their profile role without changing access", async ({
  page,
}) => {
  const user = await createTestUser("profile");

  try {
    await page.goto("/login");
    await page.locator("#email").fill(user.email);
    await page.locator("#password").fill(user.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/onboarding");

    await page.locator("#fullName").fill("Profile Test User");
    await page.locator("#workspaceName").fill("Profile Test Workspace");
    await page.locator("button", { hasText: "Designer" }).click();
    await page.locator('button[type="submit"]', { hasText: "Get started" }).click();
    await page.locator("button", { hasText: "Skip for now" }).click();

    await page.goto("/settings/profile");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText("This is a profile label only.")).toBeVisible();

    await page.getByLabel("Role").click();
    await page.getByRole("option", { name: "Developer" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toHaveText("Profile updated.");
    expect(await getProfileRole(user.id)).toBe("developer");

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Requests" })).toBeVisible();
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
