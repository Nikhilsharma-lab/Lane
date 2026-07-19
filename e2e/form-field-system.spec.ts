import { expect, test, type Page } from "@playwright/test";
import { cleanupTestWorkspace } from "./helpers/cleanup";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

const SURFACES = [
  {
    slug: "light-desktop",
    colorScheme: "light" as const,
    viewport: { width: 1280, height: 800 },
    controlHeight: 44,
  },
  {
    slug: "dark-desktop",
    colorScheme: "dark" as const,
    viewport: { width: 1280, height: 800 },
    controlHeight: 44,
  },
  {
    slug: "light-mobile",
    colorScheme: "light" as const,
    viewport: { width: 390, height: 844 },
    controlHeight: 48,
  },
  {
    slug: "dark-mobile",
    colorScheme: "dark" as const,
    viewport: { width: 390, height: 844 },
    controlHeight: 48,
  },
] as const;

async function applySurface(
  page: Page,
  surface: (typeof SURFACES)[number]
) {
  await page.setViewportSize(surface.viewport);
  await page.emulateMedia({ colorScheme: surface.colorScheme });

  if (surface.colorScheme === "dark") {
    await expect(page.locator("html")).toHaveClass(/dark/);
  } else {
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  }
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/onboarding", { timeout: 15_000 });
}

test.describe("Form field visual contract", () => {
  test("public Auth fields preserve geometry, focus, and password behavior", async ({
    page,
  }) => {
    await page.goto("/login");

    const emailField = page.locator('[data-auth-field=""]').filter({
      has: page.locator("#email"),
    });
    const passwordField = page.locator('[data-auth-field=""]').filter({
      has: page.locator("#password"),
    });
    const email = page.locator("#email");
    const password = page.locator("#password");
    const showPassword = page.getByRole("button", {
      name: "Show password",
    });

    await email.fill("maya@studionorth.co");
    await password.fill("North-star-2026");

    for (const surface of SURFACES) {
      await applySurface(page, surface);

      await email.blur();
      await expect(email).toHaveCSS("height", `${surface.controlHeight}px`);
      await expect(email).toHaveCSS("border-radius", "10px");
      await expect(emailField).toHaveScreenshot(
        `email-default-${surface.slug}.png`,
        { animations: "disabled" }
      );

      await email.focus();
      await expect(email).toBeFocused();
      expect(await email.evaluate((node) => getComputedStyle(node).boxShadow))
        .not.toBe("none");
      await expect(emailField).toHaveScreenshot(
        `email-focus-${surface.slug}.png`,
        { animations: "disabled" }
      );

      await password.focus();
      await expect(showPassword).toHaveCSS(
        "width",
        `${surface.controlHeight}px`
      );
      await showPassword.click();
      await expect(password).toBeFocused();
      await expect(password).toHaveAttribute("type", "text");
      await expect(password).toHaveValue("North-star-2026");
      await expect(
        page.getByRole("button", { name: "Hide password" })
      ).toHaveAttribute("aria-pressed", "true");
      await expect(passwordField).toHaveScreenshot(
        `password-visible-${surface.slug}.png`,
        { animations: "disabled" }
      );
      await page.getByRole("button", { name: "Hide password" }).click();
      await expect(password).toHaveAttribute("type", "password");
    }
  });

  test("Onboarding fields keep attached validation and legible disabled states", async ({
    page,
  }) => {
    const user = await createTestUser("field-contract");

    try {
      await applySurface(page, SURFACES[0]);
      await loginAs(page, user.email, user.password);

      const name = page.locator("#fullName");
      const nameField = page.locator('[data-auth-field=""]').filter({
        has: name,
      });
      await name.clear();
      await page.getByRole("button", { name: "Continue" }).click();
      await expect(name).toHaveAttribute("aria-invalid", "true");
      const describedBy = await name.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      await expect(page.locator(`#${describedBy}`)).toHaveText(
        "Enter your name to continue."
      );

      for (const surface of SURFACES) {
        await applySurface(page, surface);
        await expect(nameField).toHaveScreenshot(
          `name-invalid-${surface.slug}.png`,
          { animations: "disabled" }
        );
      }

      await name.fill("Field Contract Test");
      await expect(name).not.toHaveAttribute("aria-invalid", "true");
      await expect(
        page.getByText("Enter your name to continue.")
      ).not.toBeVisible();
      await page.getByRole("radio", { name: /^Designer/ }).click();
      await page.getByRole("button", { name: "Continue" }).click();

      const workspaceName = page.locator("#workspaceName");
      const workspaceField = page.locator('[data-auth-field=""]').filter({
        has: workspaceName,
      });
      await workspaceName.fill("Field Contract Workspace");

      await page.route("**/*", async (route) => {
        if (route.request().method() === "POST") {
          await new Promise((resolve) => setTimeout(resolve, 8_000));
        }
        await route.continue();
      });

      await page
        .getByRole("button", { name: "Create workspace" })
        .dispatchEvent("click");
      await expect(workspaceName).toBeDisabled();
      await expect(workspaceName).toHaveCSS("opacity", "1");

      for (const surface of SURFACES) {
        await applySurface(page, surface);
        await expect(workspaceField).toHaveScreenshot(
          `workspace-disabled-${surface.slug}.png`,
          { animations: "disabled" }
        );
      }

      await expect(
        page.getByRole("heading", { name: "Bring one teammate" })
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await cleanupTestWorkspace(user.id);
      await deleteTestUser(user.id);
    }
  });
});
