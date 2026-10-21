import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }))

import { RequestsWorkspaceLoading } from "@/app/(app)/requests-workspace-loading"
import { statusLabels, withoutHidden } from "@/test/exposed-markup"

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

const SKELETON = source("src/components/arc/skeleton/skeleton.tsx")
const SKELETON_STYLES = source("src/components/arc/skeleton/skeleton.module.css")
const INTAKE_LOADING = source("src/app/(app)/intake/loading.tsx")
const PROFILE_LOADING = source("src/app/(app)/settings/profile/loading.tsx")

// Plan item 2.0: every skeleton is also rendered inside the shell by
// src/app/(app)/app-frame.test.ts. This file keeps the Arc Skeleton contract
// they rely on and the destination-specific waits.
describe("Pilot entry and transition contract", () => {
  it("announces every skeleton wait and honors reduced motion", () => {
    expect(SKELETON).toContain('role="status"')
    expect(SKELETON).toContain('aria-label={label}')
    expect(SKELETON).toContain('aria-busy="true"')
    expect(SKELETON).toContain("useReducedMotion()")
    expect(SKELETON_STYLES).toContain("prefers-reduced-motion: reduce")

    // The Requests wait is announced and never hidden: its status sits in the
    // strip, outside the aria-hidden block that holds the decorative bars.
    const html = renderToStaticMarkup(createElement(RequestsWorkspaceLoading))
    expect(html).toContain('aria-busy="true"')
    const exposed = withoutHidden(html)
    expect(statusLabels(exposed)).toEqual(["Loading Requests"])
    expect(exposed).toContain('data-slot="page-strip"')
    expect(exposed).toContain('href="/intake"')
  })

  it("uses destination-specific geometry for Intake and Settings", () => {
    expect(INTAKE_LOADING).toContain('label="Loading New Request"')
    // /intake is a launcher (2026-10-13): its wait takes the launcher's centred layout.
    expect(INTAKE_LOADING).toContain('from "@/components/requests/intake-launcher.module.css"')
    expect(INTAKE_LOADING).toContain("className={launcher.launcher}")
    expect(INTAKE_LOADING).not.toContain("RequestsWorkspaceLoading")

    // The consolidated Settings (2026-10-20) waits in its own frame, not the Requests skeleton.
    expect(PROFILE_LOADING).toContain('label="Loading Profile settings"')
    expect(PROFILE_LOADING).toContain('from "@/components/settings/settings-loading"')
    expect(PROFILE_LOADING).not.toContain("RequestsWorkspaceLoading")
  })
})
