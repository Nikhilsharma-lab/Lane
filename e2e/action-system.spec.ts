import { expect, test, type Locator, type Page } from "@playwright/test";
import { cleanupTestWorkspace } from "./helpers/cleanup";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL("**/onboarding", { timeout: 15_000 });
}

async function expectIconToInheritActionColor(action: Locator) {
  await expect(action).toBeVisible();
  const icon = action.locator('svg[data-icon="inline-start"]');
  await expect(icon).toBeVisible();
  await expect(icon).toHaveAttribute("stroke", "currentColor");

  const styles = await action.evaluate((element) => {
    const svg = element.querySelector<SVGElement>(
      'svg[data-icon="inline-start"]'
    );
    if (!svg) throw new Error("Action icon not found");

    const descendantStrokes = Array.from(
      svg.querySelectorAll<SVGElement>("[stroke]")
    ).map((node) => node.getAttribute("stroke"));

    return {
      actionColor: getComputedStyle(element).color,
      iconColor: getComputedStyle(svg).color,
      descendantStrokes,
    };
  });

  expect(styles.iconColor).toBe(styles.actionColor);
  expect(
    styles.descendantStrokes.filter(
      (stroke) => stroke !== null && stroke !== "currentColor" && stroke !== "none"
    )
  ).toEqual([]);
}

async function continueToWorkspace(page: Page) {
  await page.getByRole("radio", { name: /^Designer/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator("#workspaceName")).toBeVisible();
}

async function delayServerActions(page: Page) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    await route.continue();
  });
}

test.describe("Auth action visual contract", () => {
  test("Night Studio mobile icons remain legible through disabled, loading, and ready states", async ({
    page,
  }) => {
    const user = await createTestUser("action-dark");

    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: "dark" });
      await loginAs(page, user.email, user.password);
      await expect(page.locator("html")).toHaveClass(/dark/);
      await continueToWorkspace(page);

      const backAction = page.getByRole("button", { name: "Back to role" });
      await expectIconToInheritActionColor(backAction);
      await expect(backAction).toHaveScreenshot("tertiary-dark-mobile.png", {
        animations: "disabled",
      });

      await page.locator("#workspaceName").fill("Action Contract Dark");
      await page.getByRole("button", { name: "Create workspace" }).click();
      await expect(page.getByText("Bring one teammate")).toBeVisible({
        timeout: 10_000,
      });

      const sendAction = page.locator('button[type="submit"]');
      await expect(sendAction).toContainText("Send invite");
      await expect(sendAction).toBeDisabled();
      await expectIconToInheritActionColor(sendAction);
      await expect(sendAction).toHaveScreenshot(
        "primary-disabled-dark-mobile.png",
        { animations: "disabled" }
      );

      await page
        .locator("#inviteEmail")
        .fill(`action-${Date.now()}@example.com`);
      await expect(sendAction).toBeEnabled();
      await expectIconToInheritActionColor(sendAction);

      await delayServerActions(page);

      await sendAction.dispatchEvent("click");
      await expect(sendAction).toHaveAttribute("aria-busy", "true");
      await expect(sendAction).toContainText("Sending invite…");
      await expectIconToInheritActionColor(sendAction);
      await expect(sendAction).toHaveScreenshot("primary-loading-dark-mobile.png", {
        animations: "disabled",
      });

      await expect(
        page
          .getByText("Your workspace is ready")
          .or(page.getByText("Share the invite link"))
      ).toBeVisible({ timeout: 10_000 });

      const copyAction = page.getByRole("button", { name: "Copy", exact: true });
      await expectIconToInheritActionColor(copyAction);
      await expect(copyAction).toHaveText("Copy");
      await copyAction.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          )
      );
      await expect(copyAction).toHaveScreenshot("utility-dark-mobile.png", {
        animations: "disabled",
      });
    } finally {
      await cleanupTestWorkspace(user.id);
      await deleteTestUser(user.id);
    }
  });

  test("Gallery Light desktop icons remain legible in tertiary and loading actions", async ({
    page,
  }) => {
    const user = await createTestUser("action-light");

    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.emulateMedia({ colorScheme: "light" });
      await loginAs(page, user.email, user.password);
      await expect(page.locator("html")).not.toHaveClass(/dark/);
      await continueToWorkspace(page);

      const backAction = page.getByRole("button", { name: "Back to role" });
      await expectIconToInheritActionColor(backAction);
      await expect(backAction).toHaveScreenshot("tertiary-light-desktop.png", {
        animations: "disabled",
      });

      await page.locator("#workspaceName").fill("Action Contract Light");
      const createAction = page.locator('button[type="submit"]');
      await expect(createAction).toContainText("Create workspace");

      await delayServerActions(page);

      await createAction.dispatchEvent("click");
      await expect(createAction).toHaveAttribute("aria-busy", "true");
      await expect(createAction).toContainText("Creating workspace…");
      await expectIconToInheritActionColor(createAction);
      await expect(createAction).toHaveScreenshot(
        "primary-loading-light-desktop.png",
        { animations: "disabled" }
      );

      await expect(page.getByText("Bring one teammate")).toBeVisible({
        timeout: 10_000,
      });

      const sendAction = page.locator('button[type="submit"]');
      await expect(sendAction).toBeDisabled();
      await expectIconToInheritActionColor(sendAction);
      await expect(sendAction).toHaveScreenshot(
        "primary-disabled-light-desktop.png",
        { animations: "disabled" }
      );
    } finally {
      await cleanupTestWorkspace(user.id);
      await deleteTestUser(user.id);
    }
  });

  for (const surface of [
    {
      name: "Gallery Light mobile",
      slug: "light-mobile",
      colorScheme: "light" as const,
      viewport: { width: 390, height: 844 },
    },
    {
      name: "Night Studio desktop",
      slug: "dark-desktop",
      colorScheme: "dark" as const,
      viewport: { width: 1280, height: 800 },
    },
  ]) {
    test(`${surface.name} preserves action icon contrast`, async ({ page }) => {
      const user = await createTestUser(`action-${surface.slug}`);

      try {
        await page.setViewportSize(surface.viewport);
        await page.emulateMedia({ colorScheme: surface.colorScheme });
        await loginAs(page, user.email, user.password);

        if (surface.colorScheme === "dark") {
          await expect(page.locator("html")).toHaveClass(/dark/);
        } else {
          await expect(page.locator("html")).not.toHaveClass(/dark/);
        }

        await continueToWorkspace(page);

        const backAction = page.getByRole("button", { name: "Back to role" });
        await expectIconToInheritActionColor(backAction);
        await expect(backAction).toHaveScreenshot(
          `tertiary-${surface.slug}.png`,
          { animations: "disabled" }
        );

        await page
          .locator("#workspaceName")
          .fill(`Action Contract ${surface.name}`);
        const createAction = page.locator('button[type="submit"]');
        await delayServerActions(page);
        await createAction.dispatchEvent("click");
        await expect(createAction).toHaveAttribute("aria-busy", "true");
        await expect(createAction).toContainText("Creating workspace…");
        await expectIconToInheritActionColor(createAction);
        await expect(createAction).toHaveScreenshot(
          `primary-loading-${surface.slug}.png`,
          { animations: "disabled" }
        );

        await expect(page.getByText("Bring one teammate")).toBeVisible({
          timeout: 10_000,
        });

        const sendAction = page.locator('button[type="submit"]');
        await expect(sendAction).toBeDisabled();
        await expectIconToInheritActionColor(sendAction);
        await expect(sendAction).toHaveScreenshot(
          `primary-disabled-${surface.slug}.png`,
          { animations: "disabled" }
        );
      } finally {
        await cleanupTestWorkspace(user.id);
        await deleteTestUser(user.id);
      }
    });
  }
});
