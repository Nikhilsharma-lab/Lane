import { expect, test, type Page } from "@playwright/test";
import { cleanupTestWorkspace } from "./helpers/cleanup";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

const SURFACES = [
  {
    slug: "light-desktop",
    colorScheme: "light" as const,
    viewport: { width: 1280, height: 800 },
  },
  {
    slug: "dark-desktop",
    colorScheme: "dark" as const,
    viewport: { width: 1280, height: 800 },
  },
  {
    slug: "light-mobile",
    colorScheme: "light" as const,
    viewport: { width: 390, height: 844 },
  },
  {
    slug: "dark-mobile",
    colorScheme: "dark" as const,
    viewport: { width: 390, height: 844 },
  },
] as const;

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/onboarding", { timeout: 15_000 });
}

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

async function delayServerActions(page: Page) {
  await page.route("**/*", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await route.continue();
  });
}

test("selection controls preserve the same visual contract on every surface", async ({
  page,
}) => {
  const user = await createTestUser("selection-visual");
  const baseUiWarnings: string[] = [];
  page.on("console", (message) => {
    if (
      (message.type() === "warning" || message.type() === "error") &&
      message.text().includes("Base UI")
    ) {
      baseUiWarnings.push(message.text());
    }
  });

  try {
    await applySurface(page, SURFACES[0]);
    await loginAs(page, user.email, user.password);

    const fullNameInput = page.locator("#fullName");
    await fullNameInput.clear();
    await fullNameInput.fill("Selection Visual Test");

    const roleGroup = page.getByRole("radiogroup", { name: "Your role" });
    const pmRadio = roleGroup.getByRole("radio", { name: /^PM/ });
    const designerRadio = roleGroup.getByRole("radio", {
      name: /^Designer/,
    });
    await fullNameInput.press("Tab");
    await expect(pmRadio).toBeFocused();

    for (const surface of SURFACES) {
      await applySurface(page, surface);
      await expect(pmRadio).toBeFocused();
      await expect(roleGroup).toHaveScreenshot(
        `radio-group-focus-${surface.slug}.png`,
        { animations: "disabled" }
      );
    }

    await pmRadio.press("ArrowDown");
    await expect(designerRadio).toBeChecked();
    await expect(designerRadio).toBeFocused();

    for (const surface of SURFACES) {
      await applySurface(page, surface);
      await expect(roleGroup).toHaveScreenshot(
        `radio-group-${surface.slug}.png`,
        { animations: "disabled" }
      );
    }

    await page
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await page.locator("#workspaceName").clear();
    await page
      .locator("#workspaceName")
      .fill("Selection Visual Workspace");
    await page
      .getByRole("button", { name: "Create workspace" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Bring one teammate" })
    ).toBeVisible({ timeout: 10_000 });

    const accessSelect = page.getByRole("combobox", {
      name: "Workspace access",
    });
    for (const surface of SURFACES) {
      await applySurface(page, surface);
      await accessSelect.click();
      const listbox = page.getByRole("listbox");
      await expect(listbox).toBeVisible();
      await expect(accessSelect).toHaveAttribute("aria-expanded", "true");
      const openTriggerRing = await accessSelect.evaluate(
        (trigger) => getComputedStyle(trigger).boxShadow
      );
      expect(openTriggerRing).not.toBe("none");
      const chevron = accessSelect.locator('[data-icon="chevron"]');
      await expect(chevron).toHaveCount(1);
      await expect(chevron).toHaveAttribute("data-popup-open", "");
      await expect(chevron).toHaveCSS("transform", /matrix\(-1/);
      await expect(accessSelect).toHaveScreenshot(
        `select-trigger-open-${surface.slug}.png`,
        { animations: "disabled" }
      );
      await expect(listbox).toHaveScreenshot(
        `select-popup-${surface.slug}.png`,
        { animations: "disabled" }
      );
      await page.keyboard.press("Escape");
      await expect(listbox).not.toBeVisible();
    }

    await applySurface(page, SURFACES[3]);
    await page.locator("#inviteEmail").fill("visual@example.com");
    await delayServerActions(page);
    await page
      .getByRole("button", { name: "Send invite" })
      .dispatchEvent("click");
    await expect(
      page.getByRole("button", { name: "Sending invite…" })
    ).toHaveAttribute("aria-busy", "true");
    await expect(accessSelect).toBeDisabled();
    await expect(accessSelect).toHaveScreenshot(
      "select-disabled-dark-mobile.png",
      { animations: "disabled" }
    );

    await expect(
      page
        .getByText("Your workspace is ready")
        .or(page.getByText("Share the invite link"))
    ).toBeVisible({ timeout: 10_000 });
    expect(baseUiWarnings).toEqual([]);
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
