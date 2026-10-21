import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupTestWorkspace,
  seedRowIdentityFixtures,
} from "./helpers/cleanup";
import { createTestUser, deleteTestUser } from "./helpers/test-user";
import { provisionAndSignIn } from "./helpers/auth";

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

async function expectFixedLanes(row: Locator) {
  const leading = row.locator('[data-slot="row-leading"]');
  const content = row.locator('[data-slot="row-content"]');
  const actions = row.locator('[data-slot="row-actions"]');

  await expect(leading).toHaveCSS("width", "32px");
  await expect(content).toHaveCSS("min-width", "0px");
  await expect(actions).toHaveCSS("flex-shrink", "0");

  const boxes = await Promise.all([
    leading.boundingBox(),
    content.boundingBox(),
    actions.boundingBox(),
  ]);
  expect(boxes.every(Boolean)).toBe(true);
  expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
  expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x);
}

/**
 * Plan item 2.7: the notification row's own fixed lanes, [dot] [Request and
 * event] [toggle], on the 44px request row height, in place of the Arc row
 * slots it does not use.
 */
async function expectNotificationLanes(row: Locator) {
  const lead = row.locator('span[aria-hidden="true"]').first();
  const content = row.locator("[data-notification-open]");
  const toggle = row.getByRole("button", { name: /^Mark .+ (read|unread)$/ });

  await expect(lead).toHaveCSS("width", "16px");
  await expect(content).toHaveCSS("min-width", "0px");

  const boxes = await Promise.all([
    lead.boundingBox(),
    content.boundingBox(),
    toggle.boundingBox(),
    row.boundingBox(),
  ]);
  expect(boxes.every(Boolean)).toBe(true);
  expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
  expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x);
  expect(boxes[3]!.height).toBeGreaterThanOrEqual(44);
}

async function hidePreviewChrome(page: Page) {
  await page.addStyleTag({
    content: "nextjs-portal { display: none !important; }",
  });
}

test("rows and identities keep one contract on every surface", async ({
  page,
}) => {
  const user = await createTestUser("row-identity");

  try {
    await provisionAndSignIn(page, user, {
      name: "Row Identity Test",
      workspaceName: "Row Identity Workspace",
    });

    const { requestId } = await seedRowIdentityFixtures(user.id);

    for (const surface of SURFACES) {
      await applySurface(page, surface);
      await page.goto("/");
      await hidePreviewChrome(page);
      const requestRow = page.locator('[data-slot="row"]').filter({
        hasText: "Help customers understand why their Requests changed",
      });
      await expect(requestRow).toBeVisible();
      await expectFixedLanes(requestRow);
      await expect(requestRow).toHaveScreenshot(
        `request-row-${surface.slug}.png`,
        { animations: "disabled" }
      );

      await page.goto(`/requests/${requestId}`);
      await hidePreviewChrome(page);
      const commentGroup = page.locator(
        '[data-slot="row-group"][aria-label="Request comments"]'
      );
      await expect(commentGroup).toBeVisible();
      await expectFixedLanes(commentGroup.locator('[data-slot="row"]').first());
      await expect(
        commentGroup.locator('[data-slot="identity-mark"]').first()
      ).toContainText("RI");
      await expect(commentGroup).toHaveScreenshot(
        `comment-row-${surface.slug}.png`,
        { animations: "disabled" }
      );

      // Plan item 2.7 (decision D7): the popover's rows carry data-notification-row; the trigger
      // reads "Notifications, N unread" while the seeded notification is unread.
      const notifications = page.getByRole("button", {
        name: /^Notifications/,
      });
      await notifications.click();
      const notificationRow = page.locator("[data-notification-row]").first();
      await expect(notificationRow).toBeVisible();
      await expectNotificationLanes(notificationRow);
      const readAction = notificationRow.getByRole("button", {
        name: /^Mark .+ read$/,
      });
      await expect(readAction).toBeVisible();
      const iconContrast = await readAction.locator("svg").evaluate((icon) => ({
        color: getComputedStyle(icon).color,
        background: getComputedStyle(
          icon.closest<HTMLElement>("button")!
        ).backgroundColor,
      }));
      expect(iconContrast.color).not.toBe(iconContrast.background);
      await expect(notificationRow).toHaveScreenshot(
        `notification-row-${surface.slug}.png`,
        { animations: "disabled" }
      );
      await page.keyboard.press("Escape");
    }
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
