import { expect, test, type Page } from "@playwright/test";

import { cleanupTestWorkspace } from "./helpers/cleanup";
import {
  createClerkTestOrganization,
  createTestUser,
  deleteTestUser,
  signInTestUser,
} from "./helpers/test-user";

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
}

test("the Lane role selector preserves keyboard and visual behavior", async ({
  page,
}) => {
  const user = await createTestUser("selection-visual");
  const orgId = await createClerkTestOrganization(
    user.id,
    "Lane E2E Selection Workspace"
  );

  try {
    await signInTestUser(page, user, orgId);
    await page.goto("/onboarding");

    const roleGroup = page.getByRole("radiogroup", { name: "Your role" });
    const pmRadio = roleGroup.getByRole("radio", { name: "PM" });
    const designerRadio = roleGroup.getByRole("radio", { name: "Designer" });
    await pmRadio.focus();

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
  } finally {
    await cleanupTestWorkspace(user.id);
    await deleteTestUser(user.id);
  }
});
