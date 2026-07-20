import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  cleanupTestWorkspace,
  seedTestRequest,
} from "./helpers/cleanup";
import { createTestUser, deleteTestUser } from "./helpers/test-user";

const SURFACES = [
  {
    name: "desktop light",
    colorScheme: "light" as const,
    viewport: { width: 1440, height: 900 },
  },
  {
    name: "desktop dark",
    colorScheme: "dark" as const,
    viewport: { width: 1440, height: 900 },
  },
  {
    name: "mobile light",
    colorScheme: "light" as const,
    viewport: { width: 390, height: 844 },
  },
  {
    name: "mobile dark",
    colorScheme: "dark" as const,
    viewport: { width: 390, height: 844 },
  },
] as const;

async function onboard(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL("**/onboarding", { timeout: 20_000 });

  await page
    .getByLabel("Your name", { exact: true })
    .fill("Lifecycle Reliability Test");
  await page.getByRole("radio", { name: /^Designer/ }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByLabel("Workspace name", { exact: true })
    .fill("Lifecycle Reliability");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Bring one teammate" })
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(
    page.getByRole("heading", { name: "Requests", exact: true })
  ).toBeVisible({ timeout: 20_000 });
}

async function holdAndFailNextAction(page: Page, path: string) {
  let releaseRequest: (() => void) | undefined;
  let markSeen: (() => void) | undefined;
  let requestCount = 0;
  const released = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  const seen = new Promise<void>((resolve) => {
    markSeen = resolve;
  });

  await page.route(path, async (route) => {
    const request = route.request();
    if (
      request.method() === "POST" &&
      request.headers()["next-action"]
    ) {
      requestCount += 1;
      markSeen?.();
      await released;
      await route.abort("failed");
      return;
    }
    await route.continue();
  });

  return {
    seen,
    release() {
      releaseRequest?.();
    },
    count() {
      return requestCount;
    },
  };
}

async function clickTwice(button: Locator) {
  await button.evaluate((element: HTMLButtonElement) => {
    element.click();
    element.click();
  });
}

test("Pick up and Mark done recover reliably across responsive themes", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const user = await createTestUser("reliable-lifecycle");

  try {
    await onboard(page, user.email, user.password);

    for (const surface of SURFACES) {
      await page.setViewportSize(surface.viewport);
      await page.emulateMedia({ colorScheme: surface.colorScheme });

      const title = `${surface.name}: lifecycle action`;
      const request = await seedTestRequest(user.id, title);
      const detailPath = `/requests/${request.id}`;
      const actionPath = `**/requests/${request.id}**`;
      await page.goto(detailPath);

      if (surface.colorScheme === "dark") {
        await expect(page.locator("html")).toHaveClass(/dark/);
      } else {
        await expect(page.locator("html")).not.toHaveClass(/dark/);
      }

      const lifecycle = page.locator(
        '[data-slot="request-lifecycle-actions"]:visible'
      );
      const detail = page.getByRole("region", {
        name: `Request detail: ${title}`,
      });
      await expect(lifecycle).toHaveCount(1);
      await expect(detail).toBeVisible();

      const failedPickup = await holdAndFailNextAction(page, actionPath);
      const pickUp = lifecycle.getByRole("button", {
        name: "Pick up",
        exact: true,
      });
      await clickTwice(pickUp);
      await failedPickup.seen;

      const pickingUp = lifecycle.getByRole("button", {
        name: "Picking up…",
        exact: true,
      });
      await expect(pickingUp).toBeDisabled();
      await expect(pickingUp).toHaveAttribute("aria-busy", "true");
      expect(failedPickup.count(), surface.name).toBe(1);

      failedPickup.release();
      await expect(
        lifecycle.locator('[data-slot="feedback"][role="alert"]')
      ).toContainText("try again if this Request remains Open");
      await expect(pickUp).toBeEnabled();
      await expect(detail.getByText("Open", { exact: true })).toBeVisible();
      await page.unroute(actionPath);

      await pickUp.click();
      await expect(
        detail.getByText("In Progress", { exact: true })
      ).toBeVisible({ timeout: 20_000 });
      await expect(lifecycle).toContainText("Moved to In Progress.");

      const failedCompletion = await holdAndFailNextAction(page, actionPath);
      const markDone = lifecycle.getByRole("button", {
        name: "Mark done",
        exact: true,
      });
      await clickTwice(markDone);
      await failedCompletion.seen;

      const completing = lifecycle.getByRole("button", {
        name: "Completing…",
        exact: true,
      });
      await expect(completing).toBeDisabled();
      await expect(completing).toHaveAttribute("aria-busy", "true");
      expect(failedCompletion.count(), surface.name).toBe(1);

      failedCompletion.release();
      await expect(
        lifecycle.locator('[data-slot="feedback"][role="alert"]')
      ).toContainText("try again if this Request remains In Progress");
      await expect(markDone).toBeEnabled();
      await expect(
        detail.getByText("In Progress", { exact: true })
      ).toBeVisible();
      await page.unroute(actionPath);

      await markDone.click();
      await expect(detail.getByText("Done", { exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await expect(lifecycle).toContainText("Moved to Done.");
    }
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
