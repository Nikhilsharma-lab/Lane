import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { cn } from "@/lib/utils"

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

const GLOBALS = source("src/app/globals.css")
const TYPOGRAPHY = source("src/components/ui/typography.tsx")
const BUTTON = source("src/components/ui/button.tsx")
const FIELD = source("src/components/ui/field.tsx")
const INPUT = source("src/components/ui/input.tsx")
const ROW = source("src/components/ui/row.tsx")
const DESIGN = source("DESIGN.md")
const MIGRATED_SURFACES = [
  "src/components/auth/auth-shell.tsx",
  "src/components/auth/auth-action.tsx",
  "src/components/auth/auth-field.tsx",
  "src/components/shell/sidebar.tsx",
  "src/components/shell/notification-bell.tsx",
  "src/app/(auth)/login/page.tsx",
  "src/app/(auth)/signup/signup-form.tsx",
  "src/app/(auth)/signup/check-email/check-email.tsx",
  "src/app/(auth)/forgot-password/recovery-form.tsx",
  "src/app/(auth)/reset-password/page.tsx",
  "src/app/(auth)/reset-password/reset-password-form.tsx",
  "src/app/(auth)/invite/[token]/page.tsx",
  "src/app/(auth)/onboarding/onboarding-form.tsx",
  "src/app/(app)/page.tsx",
  "src/app/(app)/requests/[id]/page.tsx",
  "src/app/(app)/settings/settings-nav.tsx",
  "src/app/(app)/settings/members/page.tsx",
  "src/app/(app)/settings/members/invite-form.tsx",
  "src/app/(app)/settings/members/member-row.tsx",
  "src/app/(app)/settings/members/invite-row.tsx",
  "src/app/(app)/settings/profile/page.tsx",
  "src/app/(app)/settings/profile/profile-form.tsx",
  "src/app/(app)/settings/profile/theme-preference.tsx",
].map(source)

describe("Typography and density contract", () => {
  it("owns the approved type scale in semantic theme tokens", () => {
    for (const token of [
      "--text-type-display",
      "--text-type-auth-title",
      "--text-type-auth-title-mobile",
      "--text-type-page-title",
      "--text-type-page-title-mobile",
      "--text-type-section-title",
      "--text-type-prose",
      "--text-type-ui",
      "--text-type-control",
      "--text-type-label",
      "--text-type-support",
      "--text-type-meta",
      "--text-type-micro",
    ]) {
      expect(GLOBALS).toContain(token)
    }

    expect(TYPOGRAPHY).toContain('role: "ui"')
    expect(TYPOGRAPHY).toContain("max-w-[22ch]")
    expect(TYPOGRAPHY).toContain("max-w-[68ch]")
    expect(TYPOGRAPHY).toContain("text-balance")
    expect(TYPOGRAPHY).toContain("text-pretty")
  })

  it("owns control and row density in semantic theme tokens", () => {
    for (const token of [
      "--spacing-control-utility: 2rem",
      "--spacing-control-product: 2.25rem",
      "--spacing-control-form: 2.75rem",
      "--spacing-control-form-touch: 3rem",
      "--spacing-touch-target: 2.75rem",
      "--spacing-row-identity: 3.25rem",
      "--spacing-row-identity-touch: 3.75rem",
    ]) {
      expect(GLOBALS).toContain(token)
    }

    expect(BUTTON).toContain("h-touch-target")
    expect(BUTTON).toContain("sm:h-control-product")
    expect(INPUT).toContain("h-control-form-touch")
    expect(INPUT).toContain("sm:h-control-form")
    expect(ROW).toContain("min-h-row-identity-touch")
    expect(ROW).toContain("sm:min-h-row-identity")
  })

  it("keeps shared primitives on semantic type roles", () => {
    expect(BUTTON).toContain("text-type-control")
    expect(FIELD).toContain("gap-2")
    expect(FIELD).toContain("text-type-label")
    expect(FIELD).toContain("text-type-support")
    expect(ROW).toContain("text-type-control")
    expect(ROW).toContain("text-type-meta")
    expect(ROW).toContain("text-type-micro")
  })

  it("teaches the class merger which semantic names are type and density", () => {
    expect(cn("text-type-control text-primary-foreground")).toBe(
      "text-type-control text-primary-foreground"
    )
    expect(cn("h-touch-target h-control-form-touch")).toBe(
      "h-control-form-touch"
    )
    expect(cn("sm:h-control-product sm:h-control-form")).toBe(
      "sm:h-control-form"
    )
  })

  it("prevents migrated product surfaces from recreating the old scale", () => {
    const joined = MIGRATED_SURFACES.join("\n")

    expect(joined).not.toMatch(/text-\[(?:10|11|12|13|14|15|16|18|22|24|28|30|36)px\]/)
    expect(joined).not.toMatch(/leading-\[(?:15|16|17|18|19|20|21|25|28|30|34|36|42)px\]/)
    expect(joined).not.toContain("space-y-[30px]")
    expect(joined).not.toContain("gap-[30px]")
    expect(joined).not.toContain("space-y-[18px]")
    expect(joined).not.toContain("gap-[7px]")
  })

  it("keeps typography and density identical in both themes", () => {
    const darkTheme = GLOBALS.match(/\.dark \{([\s\S]*?)\n\}/)?.[1] ?? ""
    const joined = MIGRATED_SURFACES.join("\n")

    expect(darkTheme).not.toContain("--text-type-")
    expect(darkTheme).not.toContain("--spacing-control-")
    expect(darkTheme).not.toContain("--spacing-row-")
    expect(joined).not.toMatch(/dark:(?:text-type|h-control|min-h-row)/)
  })

  it("records the approved responsive hierarchy in the canonical system", () => {
    expect(DESIGN).toContain("22px/28px on mobile and 24px/30px")
    expect(DESIGN).toContain("28px/34px on mobile and 30px/36px")
    expect(DESIGN).toContain("44px on desktop and 48px on mobile")
    expect(DESIGN).toContain("Typography and density are theme-invariant")
  })
})
