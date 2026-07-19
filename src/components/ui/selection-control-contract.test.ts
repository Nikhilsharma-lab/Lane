import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const RADIO_GROUP = readFileSync(
  join(process.cwd(), "src/components/ui/radio-group.tsx"),
  "utf8"
)
const SELECT = readFileSync(
  join(process.cwd(), "src/components/ui/select.tsx"),
  "utf8"
)
const ONBOARDING = readFileSync(
  join(
    process.cwd(),
    "src/app/(auth)/onboarding/onboarding-form.tsx"
  ),
  "utf8"
)
const GLOBAL_STYLES = readFileSync(
  join(process.cwd(), "src/app/globals.css"),
  "utf8"
)

describe("Selection control contract", () => {
  it("keeps role selection on the shared Base UI radio primitive", () => {
    expect(RADIO_GROUP).toContain('from "@base-ui/react/radio"')
    expect(RADIO_GROUP).toContain('from "@base-ui/react/radio-group"')
    expect(ONBOARDING).toContain('from "@/components/ui/radio-group"')
    expect(ONBOARDING).not.toContain('role="radio"')
    expect(ONBOARDING).not.toContain("handleRoleKeyDown")
    expect(ONBOARDING).toContain('name="functionalRole"')
    expect(ONBOARDING).toContain("value={role}")
    expect(ONBOARDING).not.toContain("value={role ?? undefined}")
    expect(ONBOARDING).toContain("required")
    expect(ONBOARDING).toContain('data-slot="radio-option"')
    expect(GLOBAL_STYLES).toContain(
      '[data-slot="radio-group-item"]:focus-visible'
    )
    expect(GLOBAL_STYLES).toContain(
      "color-mix(in oklch, var(--ring) 50%, transparent)"
    )
    expect(GLOBAL_STYLES).toContain(
      '[data-slot="select-trigger"][aria-expanded="true"]'
    )
  })

  it("locks fixed, legible radio indicator states", () => {
    expect(RADIO_GROUP).toContain("size-[18px]")
    expect(RADIO_GROUP).toContain("border-muted-foreground")
    expect(RADIO_GROUP).toContain("data-checked:bg-brand")
    expect(RADIO_GROUP).toContain("text-brand-foreground")
    expect(RADIO_GROUP).toContain("data-disabled:bg-disabled")
    expect(RADIO_GROUP).toContain("data-disabled:text-disabled-foreground")
    expect(RADIO_GROUP).toContain("strokeWidth={3}")
    expect(RADIO_GROUP).not.toMatch(/opacity-/)
  })

  it("locks select focus, selected, disabled, and popup states", () => {
    expect(SELECT).toContain('align = "start"')
    expect(SELECT).toContain("alignItemWithTrigger = false")
    expect(SELECT).toContain("focus-visible:ring-3")
    expect(SELECT).toContain("aria-expanded:ring-3")
    expect(SELECT).toContain("data-icon=\"chevron\"")
    expect(SELECT).toContain("data-selected:bg-brand-soft")
    expect(SELECT).toContain("disabled:bg-disabled")
    expect(SELECT).toContain("data-disabled:bg-disabled")
    expect(SELECT).toContain("text-disabled-foreground")
    expect(SELECT).toContain("border border-border bg-popover")
    expect(SELECT).not.toMatch(/(?:disabled|data-disabled):opacity-/)
  })

  it("keeps onboarding labels, help, and meaningful option copy connected", () => {
    expect(ONBOARDING).toContain('aria-labelledby="role-label"')
    expect(ONBOARDING).toContain('aria-describedby="invite-role-helper"')
    expect(ONBOARDING).toContain('id="invite-role-helper"')
    expect(ONBOARDING).toContain('label="Member"')
    expect(ONBOARDING).toContain("Shared Requests and comments")
    expect(ONBOARDING).toContain("Only Requests they submit")
  })
})
