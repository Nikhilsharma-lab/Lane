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

      // Functional-label helpers explain perspective, not permissions.
      await expect(
        page.locator("text=Product direction and prioritisation")
      ).toBeVisible();
      await expect(
        page.locator("text=Research, interaction, and visual craft")
      ).toBeVisible();
      await expect(
        page.locator("text=Engineering and implementation")
      ).toBeVisible();

      await page.getByRole("radio", { name: /^PM/ }).click();

      await page
        .locator('button[type="submit"]', { hasText: "Continue" })
        .click();

      await page.locator("#workspaceName").clear();
      await page.locator("#workspaceName").fill("E2E Test Workspace");
      await page
        .locator('button[type="submit"]', { hasText: "Create workspace" })
        .click();

      // Invite step appears after create
      await expect(
        page.locator("text=Bring one teammate")
      ).toBeVisible({ timeout: 10_000 });
      // Creating the workspace must not revalidate onboarding out from under
      // the client-side post-create invite step.
      await page.waitForTimeout(1_500);
      await expect(page.locator("text=Bring one teammate")).toBeVisible();

      await page
        .locator("button", { hasText: "Skip for now" })
        .click();

      await expect(page).toHaveURL("/", { timeout: 15_000 });
      await expect(
        page.locator("h1", { hasText: "Requests" })
      ).toBeVisible({ timeout: 5_000 });

      // Empty board shows problem-framed guidance
      await expect(
        page.locator("text=problem you're trying to solve")
      ).toBeVisible();

      // Verify the custom fullName persisted
      const storedName = await getProfileFullName(user.id);
      expect(storedName).toBe("E2E Custom Name");
    } finally {
      await cleanupTestWorkspace(user.id);
      await deleteTestUser(user.id);
    }
  });

  test("create workspace → invite step → send invite → continue to board", async ({
    page,
  }) => {
    const user = await createTestUser("invite-send");

    try {
      await page.emulateMedia({ colorScheme: "dark" });
      await loginAs(page, user.email, user.password);
      await page.waitForURL("**/onboarding", { timeout: 15_000 });

      await expect(page.locator("html")).toHaveClass(/dark/);

      const fullNameInput = page.locator("#fullName");
      await fullNameInput.clear();
      await fullNameInput.fill("Invite Sender");

      await page.getByRole("radio", { name: /^Designer/ }).click();
      await page
        .locator('button[type="submit"]', { hasText: "Continue" })
        .click();

      await page.locator("#workspaceName").clear();
      await page.locator("#workspaceName").fill("Invite Test Workspace");
      await page
        .locator('button[type="submit"]', { hasText: "Create workspace" })
        .click();

      // Invite step
      await expect(
        page.locator("text=Bring one teammate")
      ).toBeVisible({ timeout: 10_000 });

      await page.locator("#inviteEmail").fill("invited-colleague@example.com");
      await page.locator("button", { hasText: "Send invite" }).click();

      // Success: durable invite URL shown, whether or not email delivery succeeds.
      await expect(
        page
          .locator("text=Your workspace is ready")
          .or(page.locator("text=Share the invite link"))
      ).toBeVisible({ timeout: 10_000 });

      await page
        .locator("button", { hasText: "Continue to Requests" })
        .click();

      await expect(page).toHaveURL("/", { timeout: 15_000 });
      await expect(
        page.locator("h1", { hasText: "Requests" })
      ).toBeVisible({ timeout: 5_000 });
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

      await page.getByRole("radio", { name: /^Developer/ }).click();
      await page
        .locator('button[type="submit"]', { hasText: "Continue" })
        .click();

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
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: "dark" });
      await loginAs(page, user.email, user.password);

      await page.waitForURL("**/onboarding", { timeout: 15_000 });

      await expect(page.locator("html")).toHaveClass(/dark/);

      await expect(
        page.locator("text=How do you work?")
      ).toBeVisible({ timeout: 5_000 });

      await expect(page.locator("#workspaceName")).not.toBeVisible();

      await expect(
        page.locator("button", { hasText: "Join" })
      ).not.toBeVisible();
    } finally {
      await deleteTestUser(user.id);
    }
  });

  test("selection controls keep keyboard, focus, and dark-mode state contracts", async ({
    page,
  }) => {
    const user = await createTestUser("selection-controls");

    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: "dark" });
      await loginAs(page, user.email, user.password);
      await page.waitForURL("**/onboarding", { timeout: 15_000 });

      const fullNameInput = page.locator("#fullName");
      await fullNameInput.clear();
      await fullNameInput.fill("Selection Control Test");

      const roleGroup = page.getByRole("radiogroup", { name: "Your role" });
      const radios = roleGroup.getByRole("radio");
      await expect(radios).toHaveCount(3);

      const pmRadio = roleGroup.getByRole("radio", { name: /PM/ });
      const designerRadio = roleGroup.getByRole("radio", {
        name: /Designer/,
      });
      await fullNameInput.press("Tab");
      await expect(pmRadio).toBeFocused();
      await pmRadio.press("ArrowDown");
      await expect(designerRadio).toBeChecked();
      await expect(designerRadio).toBeFocused();

      const designerRow = page.locator(
        'label:has([data-slot="radio-group-item"][data-checked])'
      );
      await expect(designerRow).toHaveCount(1);
      const selectedVisuals = await designerRow.evaluate((row) => {
        const indicator = row.querySelector<HTMLElement>(
          '[data-slot="radio-group-item"]'
        );
        const icon = row.querySelector<SVGElement>("svg");
        const check = indicator?.querySelector<SVGElement>("svg");
        return {
          rowBackground: getComputedStyle(row).backgroundColor,
          rowBorder: getComputedStyle(row).borderBottomColor,
          rowFocusRing: getComputedStyle(row).boxShadow,
          indicatorChecked: indicator?.hasAttribute("data-checked") ?? false,
          checkStroke: check?.getAttribute("stroke") ?? "",
          iconStroke: icon?.getAttribute("stroke") ?? "",
          indicatorFocused: indicator?.matches(":focus") ?? false,
          indicatorFocusVisible:
            indicator?.matches(":focus-visible") ?? false,
          rowHasFocusVisible: row.matches(
            ':has([data-slot="radio-group-item"]:focus-visible)'
          ),
        };
      });
      expect(selectedVisuals.rowBackground).not.toBe("rgba(0, 0, 0, 0)");
      expect(selectedVisuals.rowBorder).not.toBe("rgba(0, 0, 0, 0)");
      expect(
        selectedVisuals.rowFocusRing,
        JSON.stringify(selectedVisuals)
      ).not.toBe("none");
      expect(selectedVisuals.indicatorChecked).toBe(true);
      expect(selectedVisuals.checkStroke).toBe("currentColor");
      expect(selectedVisuals.iconStroke).toBe("currentColor");

      await page
        .locator('button[type="submit"]', { hasText: "Continue" })
        .click();
      await page.locator("#workspaceName").clear();
      await page.locator("#workspaceName").fill("Selection Test Workspace");
      await page
        .locator('button[type="submit"]', { hasText: "Create workspace" })
        .click();

      await expect(
        page.getByRole("heading", { name: "Bring one teammate" })
      ).toBeVisible({ timeout: 10_000 });

      const accessSelect = page.getByRole("combobox", {
        name: "Workspace access",
      });
      await expect(accessSelect).toHaveCount(1);
      await accessSelect.click();

      const accessOptions = page.getByRole("option");
      await expect(accessOptions).toHaveCount(3);
      await expect(
        page.getByRole("option", { name: /Member/ })
      ).toHaveAttribute("data-selected", "");

      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(accessSelect).toContainText("Admin");
      await expect(page.locator("#invite-role-helper")).toContainText(
        "invite and manage workspace members"
      );
    } finally {
      await cleanupTestWorkspace(user.id);
      await deleteTestUser(user.id);
    }
  });
});
