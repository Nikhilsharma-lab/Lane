import { expect, test } from "@playwright/test";

test("forgot-password shows Clerk recovery instead of bouncing to login", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await expect(page).toHaveURL(/\/forgot-password/);
  await expect(
    page.getByRole("heading", { name: "Forgot your password?" })
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
});

test("reset-password stays on the recovery route without a valid token", async ({
  page,
}) => {
  await page.goto("/reset-password");
  await expect(page).toHaveURL(/\/reset-password/);
  await expect(page).not.toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", {
      name: /reset your password|forgot (your )?password|sign in/i,
    })
  ).toBeVisible();
});
