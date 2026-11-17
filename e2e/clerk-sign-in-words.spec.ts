import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

// #289 (D14): Clerk's sign-in and sign-up cards are titled in Lane's words, and sign-in has no Clerk subtitle.
test("sign-in and sign-up are titled in Lane's words", async ({ page }) => {
  await setupClerkTestingToken({ page });

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in to Lane", exact: true })).toBeVisible();
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await expect(page.getByText("Welcome back", { exact: false })).toHaveCount(0);

  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create your Lane account", exact: true })).toBeVisible();
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
});
