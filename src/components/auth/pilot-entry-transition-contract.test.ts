import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

const SKELETON = source("src/components/arc/skeleton/skeleton.tsx")
const SKELETON_STYLES = source("src/components/arc/skeleton/skeleton.module.css")

// Plan item 2.0: the Requests, detail, Intake, Profile and Members skeletons are
// checked by rendering them (src/app/(app)/app-frame.test.ts): one strip, one
// exposed status with its label, and decorative bars inside aria-hidden. This
// file keeps the Arc Skeleton contract they all rely on.
describe("Pilot entry and transition contract", () => {
  it("announces every skeleton wait and honors reduced motion", () => {
    expect(SKELETON).toContain('role="status"')
    expect(SKELETON).toContain('aria-label={label}')
    expect(SKELETON).toContain('aria-busy="true"')
    expect(SKELETON).toContain("useReducedMotion()")
    expect(SKELETON_STYLES).toContain("prefers-reduced-motion: reduce")
  })

  it("names the Profile settings wait", () => {
    expect(source("src/components/settings/profile-sections.tsx")).toContain('label="Loading Profile settings"')
  })
})
