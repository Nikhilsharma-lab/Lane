import { expect, test, type Page } from "@playwright/test"

import {
  cleanupTestWorkspace,
  seedRowIdentityFixtures,
} from "./helpers/cleanup"
import { createTestUser, deleteTestUser } from "./helpers/test-user"
import { provisionAndSignIn } from "./helpers/auth"

const SURFACES = [
  {
    slug: "desktop-light",
    colorScheme: "light" as const,
    viewport: { width: 1440, height: 900 },
  },
  {
    slug: "desktop-dark",
    colorScheme: "dark" as const,
    viewport: { width: 1440, height: 900 },
  },
  {
    slug: "tablet-light",
    colorScheme: "light" as const,
    viewport: { width: 1024, height: 768 },
  },
  {
    slug: "tablet-dark",
    colorScheme: "dark" as const,
    viewport: { width: 1024, height: 768 },
  },
  {
    slug: "mobile-light",
    colorScheme: "light" as const,
    viewport: { width: 390, height: 844 },
  },
  {
    slug: "mobile-dark",
    colorScheme: "dark" as const,
    viewport: { width: 390, height: 844 },
  },
] as const

async function applySurface(
  page: Page,
  surface: (typeof SURFACES)[number]
) {
  await page.setViewportSize(surface.viewport)
  await page.emulateMedia({ colorScheme: surface.colorScheme })

  if (surface.colorScheme === "dark") {
    await expect(page.locator("html")).toHaveClass(/dark/)
  } else {
    await expect(page.locator("html")).not.toHaveClass(/dark/)
  }
}

test("Requests workspace preserves selection, panes, and responsive routes", async ({
  page,
}) => {
  test.setTimeout(120_000)
  const user = await createTestUser("requests-workspace")

  try {
    await provisionAndSignIn(page, user, {
      name: "Request Workspace Test",
      workspaceName: "Request Workspace",
    })
    const { requestId } = await seedRowIdentityFixtures(user.id)
    const detailPath = `/requests/${requestId}`

    for (const surface of SURFACES) {
      await applySurface(page, surface)
      await page.goto(detailPath)
      await page.addStyleTag({
        content: "nextjs-portal { display: none !important; }",
      })

      const workspace = page.locator('[data-slot="requests-workspace"]')
      const detail = page.getByRole("region", {
        name: "Request detail: Help customers understand why their Requests changed",
      })
      const globalNavigation = page.locator(
        '[data-slot="global-navigation"]'
      )
      const mobileNavigation = page.locator(
        '[data-slot="mobile-navigation"]'
      )

      await expect(workspace).toBeVisible()
      await expect(detail).toBeVisible()
      if (surface.viewport.width >= 640) {
        await expect(globalNavigation).toBeVisible()
        await expect(mobileNavigation).toBeHidden()
      } else {
        await expect(globalNavigation).toBeHidden()
        await expect(mobileNavigation).toBeVisible()
      }

      // Plan item 2.5: detail has no list pane. The strip names LAN-n, and at
      // 640px and below a back link stands in for the trail.
      const strip = detail.locator('[data-slot="page-strip"]')
      await expect(strip.locator('li[aria-current="page"]')).toHaveText(/^LAN-\d+$/)
      if (surface.viewport.width <= 640) {
        await expect(strip.getByRole("link", { name: "Back to Requests" })).toBeVisible()
      } else {
        await expect(strip.getByRole("link", { name: "Back to Requests" })).toBeHidden()
      }

      const visibleNavigation = page.locator(
        '[data-slot="global-navigation"]:visible, [data-slot="mobile-navigation"]:visible'
      )
      await expect(
        visibleNavigation
          .locator("svg.lucide-bell")
          .locator("..")
          .getByText("1", { exact: true })
      ).toBeVisible()

      await expect(workspace).toHaveScreenshot(
        `requests-workspace-${surface.slug}.png`,
        { animations: "disabled" }
      )
      await expect(page.locator("body")).toHaveScreenshot(
        `requests-shell-${surface.slug}.png`,
        { animations: "disabled" }
      )

      if (surface.viewport.width < 1024) {
        await page.goto("/")
        await page.addStyleTag({
          content: "nextjs-portal { display: none !important; }",
        })
        await expect(page.getByRole("table", { name: "Requests", exact: true })).toBeVisible()
        await expect(detail).toHaveCount(0)
        await expect(
          page.getByRole("button", {
            name: "Filter Requests by status",
          })
        ).toBeVisible()
        const searchHeight = await page.getByRole("textbox", { name: "Filter Requests", exact: true }).evaluate(el => el.getBoundingClientRect().height)
        const statusHeight = await page.getByRole("button", { name: "Filter Requests by status", exact: true }).evaluate(el => el.getBoundingClientRect().height)
        expect(searchHeight).toBe(statusHeight)
        expect(searchHeight).toBe(surface.viewport.width < 640 ? 44 : 32)
        if (surface.viewport.width >= 640) {
          await expect(globalNavigation.getByRole("link", { name: "New Request", exact: true })).toBeVisible()
          await expect(globalNavigation.getByRole("link", { name: "In Progress", exact: true })).toHaveAttribute("href", "/?status=in_progress")
          await expect(globalNavigation.locator('[data-slot="sidebar-footer"]').getByRole("link", { name: "Members", exact: true })).toBeVisible()
        }
        await expect(workspace).toHaveScreenshot(
          `requests-list-${surface.slug}.png`,
          { animations: "disabled" }
        )
      }
    }

    await applySurface(page, SURFACES[0])
    await page.goto(detailPath)
    await expect(
      page.locator(
        '[data-slot="request-workspace-keyboard"][data-ready="true"]'
      )
    ).toBeAttached()
    await page.keyboard.press("Escape")
    await expect(page).toHaveURL("/")
    // Plan item 2.4: focus returns to the Request's row, the list's one tab stop.
    await expect(page.locator(`#request-row-${requestId}`)).toBeFocused()

    // Plan item 2.5: opened from the list, J moves to the next Request in the
    // list's order (replacing the history entry) and Esc returns to the list
    // with focus on the last Request viewed.
    const rows = page.locator("[role=row][data-request-id]")
    if ((await rows.count()) > 1) {
      const firstId = await rows.nth(0).getAttribute("data-request-id")
      const secondId = await rows.nth(1).getAttribute("data-request-id")
      await rows.nth(0).locator("a[data-request-title]").click()
      await expect(page).toHaveURL(`/requests/${firstId}`)
      await expect(page.locator("#request-title")).toBeFocused()
      await page.keyboard.press("j")
      await expect(page).toHaveURL(`/requests/${secondId}`)
      await expect(page.locator(`[data-detail][data-request-id="${secondId}"] #problem`)).toBeVisible()
      await page.keyboard.press("Escape")
      await expect(page).toHaveURL("/")
      await expect(page.locator(`#request-row-${secondId}`)).toBeFocused()
    }
  } finally {
    await cleanupTestWorkspace(user.id)
    await deleteTestUser(user.id)
  }
})
