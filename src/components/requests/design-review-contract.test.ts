import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Plan item 2.6: the Ask for review panel's contract, read from the source
// files as requests-workspace-contract.test.ts reads the workspace's.
function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

const PANEL = source("src/components/requests/design-review-panel.tsx")
const PANEL_STYLES = source("src/components/requests/design-review-panel.module.css")
const PICKER = source("src/components/requests/reviewer-picker.tsx")
const PICKER_SHELL = source("src/components/requests/request-property-pickers.tsx")

describe("Ask for review contract", () => {
  it("draws no coloured side border and no hand-made focus fill (the craft floor)", () => {
    expect(PANEL_STYLES).not.toMatch(/border-(?:left|inline-start)\s*:\s*(?!1px|0)/)
    expect(PANEL_STYLES).not.toMatch(/:focus-visible\s*\{[^}]*background/)
    expect(PANEL_STYLES).not.toMatch(/data-review-primary/)
  })

  it("renders times in the viewer's zone through LocalTime, never pinned to UTC", () => {
    expect(PANEL).toContain('from "./local-time"')
    for (const removed of ['timeZone: "UTC"', '" UTC"', "Find reviewers", "Checkbox", "formatDate"]) expect(PANEL, removed).not.toContain(removed)
  })

  it("builds the reviewer type-ahead on the Project picker's shell with the debounce and abort", () => {
    expect(PICKER).toContain('from "./request-property-pickers"')
    expect(PICKER).toContain("PickerOptions")
    expect(PICKER).toContain("REVIEWER_DEBOUNCE_MS")
    expect(PICKER).toContain("AbortController")
    expect(PICKER).toContain("multiselectable")
    expect(PICKER_SHELL).toContain("aria-multiselectable")
    expect(PICKER_SHELL).toContain("event.stopPropagation()")
  })

  it("keeps the decision labels inside the section: feedback, not agreement", () => {
    for (const path of [
      "src/components/requests/detail-properties.tsx",
      "src/components/requests/detail-properties-drawer.tsx",
      "src/components/requests/detail-strip.tsx",
      "src/components/requests/request-row.tsx",
      "src/components/requests/row-presentation.tsx",
      "src/components/shell/notification-bell-view.tsx",
      "src/components/requests/pending-mutations-provider.tsx",
      "src/components/requests/detail-view.tsx",
    ]) {
      const file = source(path)
      expect(file, path).not.toContain("Changes requested")
      expect(file, path).not.toContain("changes_requested")
      expect(file, path).not.toContain("Approved")
    }
    expect(PANEL).not.toContain("Approved")
  })

  // The retired adapter is covered behaviorally by the no-storage review-actions tests.

  it("offers a named reviewer a secondary submit and keeps the opened form primary (decision D4)", () => {
    expect(PANEL).toContain('variant={opened ? "primary" : "secondary"}')
    expect(PANEL).toContain('data-review-primary={opened ? "" : undefined}')
  })
})
