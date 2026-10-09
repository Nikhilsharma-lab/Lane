import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

const SKELETON = source("src/components/arc/skeleton/skeleton.tsx")
const SKELETON_STYLES = source("src/components/arc/skeleton/skeleton.module.css")
const REQUESTS_LOADING = source(
  "src/app/(app)/requests-workspace-loading.tsx"
)
const INTAKE_LOADING = source("src/app/(app)/intake/loading.tsx")
const PROFILE_LOADING = source(
  "src/app/(app)/settings/profile/loading.tsx"
)

describe("Pilot entry and transition contract", () => {
  it("announces every skeleton wait and honors reduced motion", () => {
    expect(SKELETON).toContain('role="status"')
    expect(SKELETON).toContain('aria-label={label}')
    expect(SKELETON).toContain('aria-busy="true"')
    expect(SKELETON).toContain("useReducedMotion()")
    expect(SKELETON_STYLES).toContain("prefers-reduced-motion: reduce")

    expect(REQUESTS_LOADING).toContain(
      'aria-label="Loading Request list"'
    )
    expect(REQUESTS_LOADING).not.toContain('aria-hidden="true"')
  })

  it("uses destination-specific geometry for Intake and Settings", () => {
    expect(INTAKE_LOADING).toContain('label="Loading Intake"')
    expect(INTAKE_LOADING).toContain("max-w-2xl")
    expect(INTAKE_LOADING).not.toContain("RequestsWorkspaceLoading")

    expect(source("src/components/settings/profile-sections.tsx")).toContain('label="Loading Profile settings"')
    expect(PROFILE_LOADING).not.toContain("RequestsWorkspaceLoading")
  })

})
