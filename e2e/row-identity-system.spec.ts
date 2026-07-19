import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  cleanupTestWorkspace,
  seedRowIdentityFixtures,
} from "./helpers/cleanup";
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
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/onboarding", { timeout: 15_000 });

    await page.locator("#fullName").clear();
    await page.locator("#fullName").fill("Row Identity Test");
    await page.getByRole("radio", { name: /^Designer/ }).click();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await page.locator("#workspaceName").clear();
    await page.locator("#workspaceName").fill("Row Identity Workspace");
    await page.getByRole("button", { name: "Create workspace" }).click();
    await expect(
      page.getByRole("heading", { name: "Bring one teammate" })
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Skip for now" }).click();

    const { requestId } = await seedRowIdentityFixtures(user.id);

    for (const surface of SURFACES) {
      await applySurface(page, surface);
      await page.goto("/settings/members");
      await hidePreviewChrome(page);

      const memberGroup = page.locator(
        '[data-slot="row-group"][aria-label="Workspace members"]'
      );
      const inviteGroup = page.locator(
        '[data-slot="row-group"][aria-label="Pending invitations"]'
      );
      await expect(memberGroup).toBeVisible();
      await expect(inviteGroup).toBeVisible();
      await expectFixedLanes(memberGroup.locator('[data-slot="row"]').first());
      await expectFixedLanes(inviteGroup.locator('[data-slot="row"]').first());
      const visibleTones = await page
        .locator('[data-slot="identity-mark"][data-tone]')
        .evaluateAll((marks) =>
          marks.map((mark) => mark.getAttribute("data-tone"))
        );
      expect(new Set(visibleTones)).toEqual(
        new Set(["raspberry", "persimmon", "chartreuse"])
      );
      const invitationIcons = inviteGroup.locator(
        '[data-slot="identity-mark"] svg'
      );
      await expect(invitationIcons).toHaveCount(3);
      for (let index = 0; index < 3; index += 1) {
        await expect(invitationIcons.nth(index)).toBeVisible();
      }
      await expect(
        page.getByRole("button", {
          name: /More actions for invite to maya\.longlastname/,
        })
      ).toBeVisible();
      await expect(page.locator("main")).toHaveScreenshot(
        `members-${surface.slug}.png`,
        {
        animations: "disabled",
        }
      );

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

      const notifications = page.getByRole("button", {
        name: "Notifications",
        exact: true,
      });
      await notifications.click();
      const notificationRow = page.locator(
        '[data-slot="row"]:has([data-notification-link])'
      );
      await expect(notificationRow).toBeVisible();
      await expectFixedLanes(notificationRow);
      const readAction = notificationRow.getByRole("button", {
        name: "Mark notification as read",
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
