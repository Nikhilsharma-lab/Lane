import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

const LOADING_REGION = source("src/components/ui/loading-region.tsx")
const REQUESTS_LOADING = source(
  "src/app/(app)/requests-workspace-loading.tsx"
)
const INTAKE_LOADING = source("src/app/(app)/intake/loading.tsx")
const PROFILE_LOADING = source(
  "src/app/(app)/settings/profile/loading.tsx"
)
const INVITE_LOADING = source(
  "src/app/(auth)/invite/[token]/loading.tsx"
)
const ONBOARDING = source(
  "src/app/(auth)/onboarding/onboarding-form.tsx"
)
const INVITE_ACTION = source(
  "src/app/(auth)/invite/[token]/actions.ts"
)
const SIGNUP = source("src/app/(auth)/signup/signup-form.tsx")

describe("Pilot entry and transition contract", () => {
  it("announces every skeleton wait and honors reduced motion", () => {
    expect(LOADING_REGION).toContain('role="status"')
    expect(LOADING_REGION).toContain('aria-live="polite"')
    expect(LOADING_REGION).toContain('aria-busy="true"')
    expect(LOADING_REGION).toContain("motion-reduce:animate-none")

    expect(REQUESTS_LOADING).toContain(
      'selected ? "Loading selected Request" : "Loading Requests"'
    )
    expect(REQUESTS_LOADING).not.toContain('aria-hidden="true"')
  })

  it("uses destination-specific geometry for Intake and Settings", () => {
    expect(INTAKE_LOADING).toContain('label="Loading Intake"')
    expect(INTAKE_LOADING).toContain("lg:grid-cols")
    expect(INTAKE_LOADING).not.toContain("RequestsWorkspaceLoading")

    expect(PROFILE_LOADING).toContain(
      'label="Loading Profile settings"'
    )
    expect(PROFILE_LOADING).not.toContain("RequestsWorkspaceLoading")
  })

  it("checks invitations with a visible Lucide loading state, not a warning", () => {
    expect(INVITE_LOADING).toContain("LoaderCircleIcon")
    expect(INVITE_LOADING).toContain("Checking your invitation")
    expect(INVITE_LOADING).toContain("Checking invitation…")
    expect(INVITE_LOADING).not.toMatch(
      /CircleAlertIcon|InfoIcon|TriangleAlertIcon/
    )
  })

  it("keeps the joined-workspace handoff visible until Requests opens", () => {
    expect(ONBOARDING).toContain('title="Workspace joined"')
    expect(ONBOARDING).toContain("Opening the shared Requests workspace")
    expect(ONBOARDING).toContain('loadingLabel="Opening…"')
    expect(ONBOARDING).toContain("redirectOnSuccess: false")
    expect(INVITE_ACTION).toContain(
      "options?.redirectOnSuccess === false"
    )
  })

  it("explains the signup sequence and keeps action-local progress", () => {
    expect(SIGNUP).toContain(
      "Next, confirm your email and set up your team workspace."
    )
    expect(SIGNUP).toContain('"Creating account…"')
    expect(SIGNUP).toContain('"Opening email instructions…"')
  })
})
