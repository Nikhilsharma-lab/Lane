import { expect, test } from "@playwright/test";
import { cleanupTestWorkspace, getProfileRole } from "./helpers/cleanup";
import { createTestUser, deleteTestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

test("a member can change their profile role without changing access", async ({
  page,
}) => {
  const user = await createTestUser("profile");

  try {
    await provisionAndSignIn(page, user, {
      name: "Profile Test User",
      workspaceName: "Profile Test Workspace",
    });

    await page.goto("/settings/profile");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expect(page.getByText("This is a profile label only.")).toBeVisible();

    await page.getByLabel("Role").click();
    await page.getByRole("option", { name: "Developer" }).click();
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status")).toHaveText("Profile updated.");
    expect(await getProfileRole(user.id)).toBe("developer");

    await page.getByLabel("Theme").click();
    await page.getByRole("option", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileNavigation = page.getByRole("button", { name: "Open navigation" });
    await expect(mobileNavigation).toBeVisible();
    await expect(page.locator("aside")).toBeHidden();
    await expect(page.getByLabel("Role")).toBeInViewport();
    await expect(page.getByLabel("Theme")).toBeInViewport();
    await mobileNavigation.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Requests", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem", { name: "Requests", exact: true })).toBeHidden();

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Requests" })).toBeVisible();
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
