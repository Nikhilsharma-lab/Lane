import { expect, test } from "@playwright/test"
import { visualReviewMode } from "../playwright.storybook.config"

// Capture deterministic fixture states only after each story's play function
// and shared afterEach hook finish. This also prevents mid-typing screenshots.
const stories = [
  "foundations-arc-application--specimen",
  "patterns-requests--populated",
  "patterns-requests--empty-results",
  "patterns-requests--long-title",
  "primitives-form-controls--text-field",
  "primitives-form-controls--invalid-field",
  "primitives-form-controls--disabled-and-read-only",
  "primitives-controls--variants",
  "primitives-controls--loading-actions",
  "primitives-overlays--open-dialog-with-long-content",
  "composites-feedback-and-identity--persistent-feedback",
  "composites-feedback-and-identity--identity-rows",
] as const

test.beforeEach(async ({ page }, testInfo) => {
  // A CLI --update-snapshots flag must never silently create or replace approval.
  expect(testInfo.config.updateSnapshots, "Snapshot updates are prohibited; review and promote explicit candidates instead.").toBe("none")
  await page.clock.setFixedTime(new Date("2026-09-30T08:00:00.000Z"))
})

for (const storyId of stories) {
  test(`${visualReviewMode}: ${storyId}`, async ({ page }, testInfo) => {
    const theme = testInfo.project.use.colorScheme === "dark" ? "dark" : "light"
    const query = new URLSearchParams({ id: storyId, viewMode: "story", globals: `theme:${theme}` })
    await page.goto(`/iframe.html?${query}`)

    await expect(page.locator("#storybook-root")).toBeVisible()
    await expect(page.locator("#storybook-root")).not.toBeEmpty()
    await expect(page.locator("#storybook-root")).toHaveAttribute("data-story-ready", "true")
    await expect(page.locator("body")).not.toHaveClass(/sb-show-errordisplay|sb-show-nopreview/)
    await expect(page.locator("html")).toHaveClass(theme === "dark" ? /(?:^|\s)dark(?:\s|$)/ : /(?:^|\s)light(?:\s|$)/)
    await page.evaluate(async () => { await document.fonts.ready })

    if (storyId === "primitives-overlays--open-dialog-with-long-content") {
      await expect(page.getByRole("dialog")).toBeVisible()
    }

    if (visualReviewMode === "compare") {
      // updateSnapshots:none makes missing and changed approved files fail.
      await expect(page).toHaveScreenshot(`${storyId}.png`, { fullPage: true })
    } else {
      const path = testInfo.outputPath(`${storyId}.candidate.png`)
      await page.screenshot({ path, fullPage: true, animations: "disabled", caret: "hide" })
      await testInfo.attach(`${storyId}: UNAPPROVED candidate`, { path, contentType: "image/png" })
      testInfo.annotations.push({ type: "review-required", description: "Candidate captured. No approved baseline exists; this is not visual regression approval." })
    }
  })
}
