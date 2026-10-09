import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

import {
  cleanupTestWorkspace,
  getProfileFullName,
  getProfileRole,
} from "./helpers/cleanup";
import { deleteTestUser } from "./helpers/test-user";
import { safeClerkClient } from "./helpers/safety";
import { registerBrowserTestOrganization, registerBrowserTestUser, testEmail } from "./helpers/fixtures";

test("real signup requires a Clerk workspace before the Lane role and Requests", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000);
  // This exercise creates and removes only one disposable staging identity.
  // Never use test OTPs or the cleanup helpers against production services.
  expect(new URL(baseURL!).hostname).toBe("lane-staging.vercel.app");
  await safeClerkClient();
  const email = testEmail("ui-signup");
  const workspaceName = `Lane E2E UI Signup ${Date.now()}`;
  let userId: string | null = null;

  try {
    await setupClerkTestingToken({ page });
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
    await page.getByLabel("Email address", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("LaneSignupE2E1234!");
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    // Clerk's documented test-email suffix suppresses delivery and accepts this
    // code. Typing, rather than fill(), drives the segmented OTP component.
    const code = page.locator('input[autocomplete="one-time-code"]');
    await expect(code).toBeVisible();
    await code.pressSequentially("424242");

    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.Clerk.session?.currentTask?.key))
      .toBe("choose-organization");
    userId = await page.evaluate(() => window.Clerk.user?.id ?? null);
    expect(userId).toMatch(/^user_/);
    await registerBrowserTestUser(userId!, email);
    await expect(page.getByRole("radiogroup", { name: "Your role" })).toHaveCount(0);
    expect(await getProfileFullName(userId!)).toBeNull();

    await page.locator('input[name="name"]').fill(workspaceName);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "How do you work?" })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.Clerk.organization?.id))
      .toMatch(/^org_/);
    const orgId = await page.evaluate(() => window.Clerk.organization?.id);
    await registerBrowserTestOrganization(orgId!, userId!, workspaceName);
    await page.getByRole("radio", { name: /^PM\b/ }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Requests", exact: true })).toBeVisible();
    await expect(
      page.getByRole("complementary").getByText(workspaceName, { exact: true })
    ).toBeVisible();
    expect(await getProfileRole(userId!)).toBe("pm");
    expect(await getProfileFullName(userId!)).toBe(email);
  } finally {
    // If signup succeeded but navigation failed, discover only this exact test
    // address; never clean up unrelated users or pre-existing workspaces.
    if (!userId) {
      const client = await safeClerkClient();
      const users = await client.users.getUserList({ emailAddress: [email], limit: 2 });
      userId = users.data.find((user) =>
        user.emailAddresses.some((address) => address.emailAddress === email)
      )?.id ?? null;
      if (userId) await registerBrowserTestUser(userId, email);
    }
    if (userId) {
      await cleanupTestWorkspace(userId);
      await deleteTestUser(userId);
    }
  }
});
