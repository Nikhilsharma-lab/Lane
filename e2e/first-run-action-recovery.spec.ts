import { expect, test } from "@playwright/test";

import { cleanupTestWorkspace, getProfileRole } from "./helpers/cleanup";
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
    let attempts = 0;
    await page.route("**/onboarding", async (route) => {
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
    await expect(designer).toBeChecked();
    expect(attempts).toBe(1);
    expect(await getProfileRole(user.id)).toBeNull();

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


test("one missing-session action response renews and saves the original role once", async ({ page }) => {
  const user = await createTestUser("explicit-expiry");
  const orgId = await createClerkTestOrganization(user.id, "Lane E2E Explicit Recovery");
  try {
    await signInTestUser(page, user, orgId);
    await page.goto("/onboarding");
    const designer = page.getByRole("radio", { name: "Designer" });
    await designer.focus();
    await designer.press("Space");
    await expect(designer).toBeChecked();
    let attempts = 0;
    let explicitExpiry = false;
    await page.route("**/onboarding", async route => {
      if (route.request().method() !== "POST") return route.continue();
      attempts += 1;
      if (attempts !== 1) return route.continue();
      // Send the real action without a session cookie on its first attempt.
      // Clerk remains signed in in the tab and can renew. The actual server
      // guard must return the signal; no action response is fabricated here.
      const headers = await route.request().allHeaders();
      // An explicit empty header prevents route.fetch from restoring cookies
      // from the browser context cookie jar.
      headers.cookie = "";
      delete headers.authorization;
      const response = await route.fetch({ headers, maxRedirects: 0 });
      explicitExpiry = (await response.text()).includes('"sessionExpired":true');
      expect(await getProfileRole(user.id)).toBeNull();
      await route.fulfill({ response });
    });
    const submit = page.getByRole("button", { name: "Continue", exact: true });
    await submit.focus();
    await submit.press("Enter");
    await expect(page).toHaveURL("/");
    expect(explicitExpiry).toBe(true);
    expect(attempts).toBe(2);
    expect(await getProfileRole(user.id)).toBe("designer");
    await expect(page.getByRole("heading", { name: "Requests", exact: true })).toBeVisible();
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
