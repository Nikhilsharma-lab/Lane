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

})
