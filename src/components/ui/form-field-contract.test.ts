import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

const INPUT = source("src/components/ui/input.tsx")
const FIELD = source("src/components/ui/field.tsx")
const AUTH_FIELD = source("src/components/auth/auth-field.tsx")
const PASSWORD_FIELD = source("src/components/auth/password-field.tsx")
const DESIGN = source("DESIGN.md")
const AUTH_ROUTES = [
  "src/app/(auth)/login/page.tsx",
  "src/app/(auth)/signup/signup-form.tsx",
  "src/app/(auth)/forgot-password/recovery-form.tsx",
  "src/app/(auth)/reset-password/reset-password-form.tsx",
  "src/app/(auth)/onboarding/onboarding-form.tsx",
].map(source)

describe("Form field contract", () => {
  it("keeps semantic field ownership on Lane's Base UI source", () => {
    expect(INPUT).toContain('from "@base-ui/react/input"')
    expect(FIELD).toContain('from "@base-ui/react/field"')
    expect(FIELD).toContain('data-slot="field-label"')
    expect(FIELD).toContain('data-slot="field-description"')
    expect(FIELD).toContain('data-slot="field-error"')
    expect(FIELD).toContain('role="alert"')
    expect(AUTH_FIELD).toContain('data-auth-field=""')
    expect(AUTH_FIELD).toContain("if (error) return <FieldError>")
  })

  it("locks geometry and semantic disabled/read-only treatment", () => {
    expect(AUTH_FIELD).toContain(
      '"h-control-form-touch bg-card px-3 sm:h-control-form dark:bg-card'
    )
    expect(AUTH_FIELD).toContain("read-only:bg-muted")
    expect(INPUT).toContain("disabled:bg-disabled")
    expect(INPUT).toContain("disabled:text-disabled-foreground")
    expect(INPUT).toContain("disabled:placeholder:text-disabled-foreground")
    expect(INPUT).not.toMatch(/disabled:opacity-/)
    expect(FIELD).not.toMatch(/(?:disabled|data-disabled):opacity-/)
  })

  it("keeps password controls visible, fixed, and disabled with the field", () => {
    expect(PASSWORD_FIELD).toContain(
      'import { EyeIcon, EyeOffIcon } from "lucide-react"'
    )
    expect(PASSWORD_FIELD).toContain("aria-pressed={visible}")
    expect(PASSWORD_FIELD).toContain("aria-controls={props.id}")
    expect(PASSWORD_FIELD).toContain("disabled={disabled}")
    expect(PASSWORD_FIELD).toContain('data-slot="password-control"')
    expect(PASSWORD_FIELD).toContain("focus-within:ring-3")
    expect(PASSWORD_FIELD).toContain("has-aria-invalid:ring-3")
    expect(PASSWORD_FIELD).toContain("focus-visible:ring-0")
    expect(PASSWORD_FIELD).toContain("w-control-form-touch")
    expect(PASSWORD_FIELD).toContain("sm:w-control-form")
    expect(PASSWORD_FIELD).toContain(
      "onMouseDown={(event) => event.preventDefault()}"
    )
  })

  it("prevents Auth and Onboarding routes from rebuilding text fields", () => {
    for (const route of AUTH_ROUTES) {
      expect(route).not.toContain('from "@/components/ui/input"')
      expect(route).not.toContain(
        'from "@/components/auth/password-field"'
      )
      expect(route).not.toContain("md:h-11")
    }

    expect(AUTH_ROUTES.join("\n")).toContain(
      'from "@/components/auth/auth-field"'
    )
  })

  it("records the same contract in the canonical design system", () => {
    expect(DESIGN).toContain("A field is one owned stack")
    expect(DESIGN).toContain("Helper copy yields to the error")
    expect(DESIGN).toContain("Disabled and read-only are different")
    expect(DESIGN).toContain("Password visibility uses only Lucide")
  })
})
