import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

const FEEDBACK = source("src/components/ui/feedback.tsx")
const FIELD = source("src/components/ui/field.tsx")
const SONNER = source("src/components/ui/sonner.tsx")
const GLOBAL_STYLES = source("src/app/globals.css")
const DESIGN = source("DESIGN.md")
const FEEDBACK_CONSUMERS = [
  "src/app/(auth)/login/page.tsx",
  "src/app/(auth)/signup/signup-form.tsx",
  "src/app/(auth)/signup/check-email/check-email.tsx",
  "src/app/(auth)/forgot-password/recovery-form.tsx",
  "src/app/(auth)/reset-password/page.tsx",
  "src/app/(auth)/reset-password/reset-password-form.tsx",
  "src/app/(auth)/invite/[token]/accept-button.tsx",
  "src/app/(auth)/onboarding/onboarding-form.tsx",
  "src/app/(app)/settings/profile/profile-form.tsx",
  "src/app/(app)/settings/members/invite-form.tsx",
  "src/app/(app)/settings/members/invite-row.tsx",
  "src/app/(app)/settings/members/member-row.tsx",
  "src/app/(app)/requests/[id]/comment-form.tsx",
  "src/app/(app)/requests/[id]/lifecycle-buttons.tsx",
  "src/app/(app)/intake/intake-form.tsx",
].map(source)

describe("Feedback and status contract", () => {
  it("locks one shared semantic icon and announcement source", () => {
    expect(FEEDBACK).toContain("CircleAlertIcon")
    expect(FEEDBACK).toContain("CircleCheckIcon")
    expect(FEEDBACK).toContain("TriangleAlertIcon")
    expect(FEEDBACK).toContain("InfoIcon")
    expect(FEEDBACK).toContain("LoaderCircleIcon")
    expect(FEEDBACK).toContain('data-slot="feedback"')
    expect(FEEDBACK).toContain('role={kind === "error" ? "alert" : "status"}')
    expect(FEEDBACK).toContain(
      'aria-live={kind === "error" ? "assertive" : "polite"}'
    )
    expect(FEEDBACK).toContain('aria-atomic="true"')
    expect(FEEDBACK).not.toContain("icon?: LucideIcon")
  })

  it("locks icon lanes, vertical centering, and semantic surfaces", () => {
    expect(FEEDBACK).toContain("flex items-center text-type-support")
    expect(FEEDBACK).toContain('"size-8 rounded-md"')
    expect(FEEDBACK).toContain('"size-[18px]"')
    expect(FEEDBACK).toContain('panel ? "size-[18px]" : "size-4"')
    expect(FEEDBACK).toContain("border-destructive-border bg-destructive-soft")
    expect(FEEDBACK).toContain("border-success-border bg-success-soft")
    expect(FEEDBACK).toContain("border-warning-border bg-warning-soft")
    expect(FEEDBACK).toContain("border-info-border bg-info-soft")
  })

  it("keeps field validation attached and icon-free", () => {
    expect(FIELD).toContain('data-slot="field-error"')
    expect(FIELD).toContain('role="alert"')
    expect(FIELD).not.toContain("lucide-react")
    expect(FIELD).not.toContain("<svg")
  })

  it("prevents routes from rebuilding feedback chrome", () => {
    for (const consumer of FEEDBACK_CONSUMERS) {
      expect(consumer).toContain('from "@/components/ui/feedback"')
      expect(consumer).not.toContain("AuthFeedback")
      expect(consumer).not.toContain("InlineError")
    }
  })

  it("keeps toast semantics aligned with persistent feedback", () => {
    expect(SONNER).toContain("CircleAlertIcon")
    expect(SONNER).toContain("CircleCheckIcon")
    expect(SONNER).toContain("TriangleAlertIcon")
    expect(SONNER).toContain("LoaderCircleIcon")
    expect(SONNER).toContain("closeButton")
    expect(SONNER).toContain("!border-success-border")
    expect(SONNER).toContain("!border-destructive-border")
    expect(SONNER).toContain("!border-warning-border")
    expect(SONNER).toContain("!border-info-border")
    expect(SONNER).not.toContain("OctagonXIcon")
  })

  it("authors semantic contrast explicitly in both themes", () => {
    for (const token of [
      "--destructive-soft",
      "--destructive-border",
      "--destructive-icon",
      "--success",
      "--success-soft",
      "--success-border",
      "--success-icon",
      "--warning",
      "--warning-soft",
      "--warning-border",
      "--warning-icon",
      "--info",
      "--info-soft",
      "--info-border",
      "--info-icon",
    ]) {
      expect(GLOBAL_STYLES.split(token).length - 1).toBeGreaterThanOrEqual(3)
    }
  })

  it("records the same ownership rules in the canonical design system", () => {
    expect(DESIGN).toContain("exactly three feedback layers")
    expect(DESIGN).toContain("The nearest owner wins")
    expect(DESIGN).toContain("Field validation remains attached")
    expect(DESIGN).toContain("Sonner is reserved for outcomes")
    expect(DESIGN).toContain("Loading feedback never duplicates a button")
  })
})
