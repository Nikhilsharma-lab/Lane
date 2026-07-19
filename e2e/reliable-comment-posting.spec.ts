import { expect, test, type Page } from "@playwright/test"

import {
  cleanupTestWorkspace,
  seedTestRequest,
} from "./helpers/cleanup"
import { createTestUser, deleteTestUser } from "./helpers/test-user"

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
] as const

async function onboard(page: Page, email: string, password: string) {
  await page.goto("/login")
  await page.getByLabel("Email", { exact: true }).fill(email)
  await page.getByLabel("Password", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await page.waitForURL("**/onboarding", { timeout: 20_000 })

  await page.getByLabel("Your name", { exact: true }).fill("Comment Reliability Test")
  await page.getByRole("radio", { name: /^Designer/ }).click()
  await page.getByRole("button", { name: "Continue", exact: true }).click()
  await page
    .getByLabel("Workspace name", { exact: true })
    .fill("Comment Reliability")
  await page.getByRole("button", { name: "Create workspace" }).click()
  await expect(
    page.getByRole("heading", { name: "Bring one teammate" })
  ).toBeVisible({ timeout: 15_000 })
  await page.getByRole("button", { name: "Skip for now" }).click()
  await expect(
    page.getByRole("heading", { name: "Requests", exact: true })
  ).toBeVisible({ timeout: 15_000 })
}

async function holdNextCommentPost(page: Page) {
  let releaseRequest: (() => void) | undefined
  let markSeen: (() => void) | undefined
  let requestCount = 0
  const released = new Promise<void>((resolve) => {
    releaseRequest = resolve
  })
  const seen = new Promise<void>((resolve) => {
    markSeen = resolve
  })

  await page.route("**/requests/**", async (route) => {
    const request = route.request()
    if (
      request.method() === "POST" &&
      request.headers()["next-action"]
    ) {
      requestCount += 1
      markSeen?.()
      await released
    }
    await route.continue()
  })

  return {
    seen,
    release() {
      releaseRequest?.()
    },
    count() {
      return requestCount
    },
  }
}

test("comments show immediate progress, block duplicates, and preserve failed drafts", async ({
  page,
}) => {
  test.setTimeout(180_000)
  const user = await createTestUser("reliable-comment")

  try {
    await onboard(page, user.email, user.password)
    const request = await seedTestRequest(
      user.id,
      "Make comment posting trustworthy"
    )
    const detailPath = `/requests/${request.id}`

    for (const [index, surface] of SURFACES.entries()) {
      await page.setViewportSize(surface.viewport)
      await page.emulateMedia({ colorScheme: surface.colorScheme })
      await page.goto(detailPath)

      if (surface.colorScheme === "dark") {
        await expect(page.locator("html")).toHaveClass(/dark/)
      } else {
        await expect(page.locator("html")).not.toHaveClass(/dark/)
      }

      const form = page.locator("form").filter({
        has: page.getByLabel("Comment", { exact: true }),
      })
      const textarea = page.getByLabel("Comment", { exact: true })
      const submit = page.getByRole("button", {
        name: "Post comment",
        exact: true,
      })
      const slowComment = `${surface.name}: one slow comment`

      await textarea.fill(slowComment)
      const heldPost = await holdNextCommentPost(page)
      await textarea.evaluate((element: HTMLTextAreaElement) => {
        const shortcut = {
          key: "Enter",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }
        element.dispatchEvent(new KeyboardEvent("keydown", shortcut))
        element.dispatchEvent(new KeyboardEvent("keydown", shortcut))
      })
      await heldPost.seen

      await expect(
        page.getByRole("button", { name: "Posting…", exact: true })
      ).toBeDisabled()
      await expect(textarea).toHaveAttribute("readonly", "")
      await expect(textarea).toHaveValue(slowComment)
      await expect(form).toHaveAttribute("aria-busy", "true")
      expect(heldPost.count()).toBe(1)

      heldPost.release()
      await expect(
        page.getByText(slowComment, { exact: true })
      ).toBeVisible({ timeout: 20_000 })
      await expect(textarea).toHaveValue("")
      await page.unroute("**/requests/**")

      const failedComment = `${surface.name}: keep this failed draft`
      await textarea.fill(failedComment)
      let failedRequestCount = 0
      await page.route("**/requests/**", async (route) => {
        const requestToFail = route.request()
        if (
          failedRequestCount === 0 &&
          requestToFail.method() === "POST" &&
          requestToFail.headers()["next-action"]
        ) {
          failedRequestCount += 1
          await route.abort("failed")
          return
        }
        await route.continue()
      })

      await submit.click()
      await expect(
        form.locator('[data-slot="feedback"][role="alert"]')
      ).toContainText("Your draft is still here.")
      await expect(textarea).toHaveValue(failedComment)
      await expect(
        page.getByRole("button", { name: "Try again", exact: true })
      ).toBeEnabled()
      await expect(form).not.toHaveAttribute("aria-busy", "true")
      expect(failedRequestCount).toBe(1)

      await page.unroute("**/requests/**")
      await page
        .getByRole("button", { name: "Try again", exact: true })
        .click()
      await expect(
        page.getByText(failedComment, { exact: true })
      ).toBeVisible({ timeout: 20_000 })
      await expect(textarea).toHaveValue("")

      if (index < SURFACES.length - 1) {
        await page.goto(detailPath)
      }
    }
  } finally {
    await cleanupTestWorkspace(user.id)
    await deleteTestUser(user.id)
  }
})
