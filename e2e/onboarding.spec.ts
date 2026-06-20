import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser } from "./helpers/test-user";
import {
  cleanupTestWorkspace,
  seedPendingInvite,
  cleanupTestInvite,
  createTestWorkspace,
  deleteTestWorkspace,
  getProfileFullName,
} from "./helpers/cleanup";

const INVITE_TOKEN = `e2e-invite-${Date.now()}`;

async function loginAs(
  page: import("@playwright/test").Page,
  email: string,
  password: string
) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
}

test.describe("onboarding e2e", () => {
  test("signup → create workspace → board renders immediately, fullName persists", async ({
    page,
  }) => {
    const user = await createTestUser("create");

    try {
      await loginAs(page, user.email, user.password);

      await page.waitForURL("**/onboarding", { timeout: 15_000 });

      // fullName field exists and is editable
      const fullNameInput = page.locator("#fullName");
      await expect(fullNameInput).toBeVisible();
      await fullNameInput.clear();
      await fullNameInput.fill("E2E Custom Name");

      // Role helpers are neutral (no action-implying copy)
      await expect(
        page.locator("text=Strategy and prioritisation")
      ).toBeVisible();
      await expect(
        page.locator("text=Research, UI, and visual craft")
      ).toBeVisible();
      await expect(
        page.locator("text=Engineering and implementation")
      ).toBeVisible();

      await page.locator("#workspaceName").clear();
      await page.locator("#workspaceName").fill("E2E Test Workspace");

      await page
        .locator("button", { hasText: "Product Manager" })
        .click();

      await page
        .locator('button[type="submit"]', { hasText: "Get started" })
        .click();

      await expect(page).toHaveURL("/", { timeout: 15_000 });
      await expect(
        page.locator("h1", { hasText: "Requests" })
      ).toBeVisible({ timeout: 5_000 });

      // Verify the custom fullName persisted
      const storedName = await getProfileFullName(user.id);
      expect(storedName).toBe("E2E Custom Name");
    } finally {
      await cleanupTestWorkspace(user.id);
      await deleteTestUser(user.id);
    }
  });

  test("signup → pending invite → Join → board renders, joined existing workspace", async ({
    page,
  }) => {
    const user = await createTestUser("invite-join");
    const wsName = `E2E Invite Workspace ${Date.now()}`;
    const wsSlug = `e2e-invite-ws-${Date.now()}`;
    const wsId = await createTestWorkspace(wsName, wsSlug);

    try {
      await seedPendingInvite(wsId, user.email, INVITE_TOKEN);

      await loginAs(page, user.email, user.password);

      await page.waitForURL("**/onboarding", { timeout: 15_000 });

      await expect(
        page.locator(`text=${wsName}`)
      ).toBeVisible({ timeout: 5_000 });

      await page.locator("button", { hasText: "Join" }).click();

      await expect(page).toHaveURL("/", { timeout: 15_000 });
      await expect(
        page.locator("h1", { hasText: "Requests" })
      ).toBeVisible({ timeout: 5_000 });
    } finally {
      await cleanupTestInvite(INVITE_TOKEN);
      await cleanupTestWorkspace(user.id);
      await deleteTestWorkspace(wsId);
      await deleteTestUser(user.id);
    }
  });

  test("signup with no invite → shows create form, not invite card", async ({
    page,
  }) => {
    const user = await createTestUser("no-invite");

    try {
      await loginAs(page, user.email, user.password);

      await page.waitForURL("**/onboarding", { timeout: 15_000 });

      await expect(
        page.locator("text=Set up your workspace to get started.")
      ).toBeVisible({ timeout: 5_000 });

      await expect(page.locator("#workspaceName")).toBeVisible();

      await expect(
        page.locator("button", { hasText: "Join" })
      ).not.toBeVisible();
    } finally {
      await deleteTestUser(user.id);
    }
  });
});
