import { expect, test, type Page } from "@playwright/test"

import {
  cleanupTestWorkspace,
  seedRowIdentityFixtures,
} from "./helpers/cleanup"
import { createTestUser, deleteTestUser } from "./helpers/test-user"

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

async function onboard(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.getByLabel("Email", { exact: true }).fill(email)
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await page.waitForURL("**/onboarding", { timeout: 20_000 })

  await page.getByLabel("Your name", { exact: true }).fill("Request Workspace Test")
  await page.getByRole("radio", { name: /^Designer/ }).click()
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await page
    .getByLabel("Workspace name", { exact: true })
    .fill("Request Workspace")
  await page.getByRole("button", { name: "Create workspace" }).click()
  await expect(
    page.getByRole("heading", { name: "Bring one teammate" })
  ).toBeVisible({ timeout: 15_000 })
  await page.getByRole("button", { name: "Skip for now" }).click()
  await expect(
    page.getByRole("heading", { name: "Requests", exact: true })
  ).toBeVisible({ timeout: 15_000 })
}

test("Requests workspace preserves selection, panes, and responsive routes", async ({
  page,
}) => {
  test.setTimeout(120_000)
  const user = await createTestUser("requests-workspace")

  try {
    await onboard(page, user.email, user.password)
    const { requestId } = await seedRowIdentityFixtures(user.id)
    const detailPath = `/requests/${requestId}`

    for (const surface of SURFACES) {
      await applySurface(page, surface)
      await page.goto(detailPath)
      await page.addStyleTag({
        content: "nextjs-portal { display: none !important; }",
      })

      const workspace = page.locator('[data-slot="requests-workspace"]')
      const requestList = page.getByRole("complementary", {
        name: "Request list",
      })
      const detail = page.getByRole("region", {
        name: "Request detail: Help customers understand why their Requests changed",
      })
      const selectedLink = page.locator(`#request-${requestId}`)
      const selectedRow = page.locator('[data-slot="row"]').filter({
        has: selectedLink,
      })
      const globalNavigation = page.locator(
        '[data-slot="global-navigation"]'
      )
      const mobileNavigation = page.locator(
        '[data-slot="mobile-navigation"]'
      )

      await expect(workspace).toBeVisible()
      await expect(detail).toBeVisible()
      if (surface.viewport.width >= 1280) {
        await expect(globalNavigation).toBeVisible()
        await expect(mobileNavigation).toBeHidden()
      } else {
        await expect(globalNavigation).toBeHidden()
        await expect(mobileNavigation).toBeVisible()
      }

      if (surface.viewport.width >= 1024) {
        await expect(requestList).toBeVisible()
        await expect(
          page.getByRole("combobox", {
            name: "Filter Requests by status",
          })
        ).toBeVisible()
        await expect(selectedLink).toHaveAttribute("aria-current", "page")
        await expect(selectedRow).toHaveCSS("border-left-width", "0px")
        await expect(selectedRow).not.toHaveCSS(
          "background-color",
          "rgba(0, 0, 0, 0)"
        )
      } else {
        await expect(requestList).toBeHidden()
        await expect(
          page.getByRole("link", { name: "Close Request detail" })
        ).toBeVisible()
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
        await expect(requestList).toBeVisible()
        await expect(detail).toHaveCount(0)
        await expect(
          page.getByRole("combobox", {
            name: "Filter Requests by status",
          })
        ).toBeVisible()
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
    await expect(page.locator(`#request-${requestId}`)).toBeFocused()

    await page.goto(`${detailPath}?status=done`)
    await expect(
      page.getByRole("region", {
        name: "Request detail: Help customers understand why their Requests changed",
      })
    ).toBeVisible()
    await expect(page.getByText("Nothing in Done", { exact: true })).toBeVisible()
  } finally {
    await cleanupTestWorkspace(user.id)
    await deleteTestUser(user.id)
  }
})
