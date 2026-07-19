import { expect, test, type Locator, type Page } from "@playwright/test"

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

async function expectSemanticIcon(feedback: Locator, expectedSize: number) {
  const iconLane = feedback.locator('[data-slot="feedback-icon"]')
  const icon = iconLane.locator("svg")

  await expect(iconLane).toBeVisible()
  await expect(icon).toBeVisible()
  await expect(icon).toHaveCSS("width", `${expectedSize}px`)
  await expect(icon).toHaveCSS("height", `${expectedSize}px`)

  const contrast = await icon.evaluate((element) => {
    const iconColor = getComputedStyle(element).color
    const feedback = element.closest<HTMLElement>('[data-slot="feedback"]')
    if (!feedback) throw new Error("Feedback owner not found")

    return {
      iconColor,
      backgroundColor: getComputedStyle(feedback).backgroundColor,
      strokes: Array.from(
        element.querySelectorAll<SVGElement>("[stroke]")
      ).map((node) => node.getAttribute("stroke")),
    }
  })

  expect(contrast.iconColor).not.toBe(contrast.backgroundColor)
  expect(
    contrast.strokes.filter(
      (stroke) => stroke !== null && stroke !== "currentColor" && stroke !== "none"
    )
  ).toEqual([])
}

test.describe("Feedback and status visual contract", () => {
  for (const surface of SURFACES) {
    test(`${surface.slug} preserves panel and inline semantics`, async ({
      page,
    }) => {
      await page.goto("/login?reset=success")
      await applySurface(page, surface)

      const success = page.locator(
        '[data-slot="feedback"][data-kind="success"][data-variant="panel"]'
      )
      await expect(success).toHaveAttribute("role", "status")
      await expect(success).toHaveAttribute("aria-live", "polite")
      await expectSemanticIcon(success, 18)
      await expect(success).toHaveScreenshot(
        `success-panel-${surface.slug}.png`,
        { animations: "disabled" }
      )

      await page.goto("/login?error=auth")
      await applySurface(page, surface)

      const error = page.locator(
        '[data-slot="feedback"][data-kind="error"][data-variant="inline"]'
      )
      await expect(error).toHaveAttribute("role", "alert")
      await expect(error).toHaveAttribute("aria-live", "assertive")
      await expectSemanticIcon(error, 16)
      await expect(error).toHaveScreenshot(
        `error-inline-${surface.slug}.png`,
        { animations: "disabled" }
      )
    })
  }
})
