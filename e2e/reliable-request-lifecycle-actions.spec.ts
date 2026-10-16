import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  cleanupTestWorkspace,
  seedTestRequest,
} from "./helpers/cleanup";
import { createTestUser, deleteTestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

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

test("Pick up and Mark Done recover reliably across responsive themes", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const user = await createTestUser("reliable-lifecycle");

  try {
    await provisionAndSignIn(page, user, {
      name: "Lifecycle Reliability Test",
      workspaceName: "Lifecycle Reliability",
    });

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
      // Plan item 2.5: the lifecycle slot sits in the page strip at every width
      // and reports through toasts; the status reads from the panel row from
      // 960px of content width, and from the state line below it.
      const toasts = page.getByRole("region", { name: /^Messages/ });
      await expect(
        detail.locator('[data-slot="page-strip"]').locator(lifecycle)
      ).toHaveCount(1);
      const status = surface.viewport.width >= 1440
        ? detail.locator("[data-detail-panel] [data-detail-status]")
        : detail.locator("[data-detail-state-line]");
      const expectStatus = (value: "open" | "in_progress" | "done", label: string, timeout?: number) =>
        surface.viewport.width >= 1440
          ? expect(status).toHaveAttribute("data-status", value, { timeout })
          : expect(status).toContainText(`${label},`, { timeout });

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
      await expect(toasts).toContainText(
        "Try again if this Request is still Open"
      );
      await expect(pickUp).toBeEnabled();
      await expectStatus("open", "Open");
      await page.unroute(actionPath);

      // A pick up is said in the polite region, with no success toast.
      await pickUp.click();
      await expectStatus("in_progress", "In Progress", 20_000);

      const failedCompletion = await holdAndFailNextAction(page, actionPath);
      const markDone = lifecycle.getByRole("button", {
        name: "Mark Done",
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
      await expect(toasts).toContainText(
        "Try again if this Request is still In Progress"
      );
      await expect(markDone).toBeEnabled();
      await expectStatus("in_progress", "In Progress");
      await page.unroute(actionPath);

      await markDone.click();
      await expectStatus("done", "Done", 20_000);
      await expect(toasts).toContainText("Marked Done");
    }
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
