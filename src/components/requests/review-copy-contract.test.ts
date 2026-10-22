import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Reviewers answer Looks good or Raise a concern (REQUIREMENTS.md §4.4). The
// retired design review's decision labels must not come back on these surfaces.
function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8")
}

describe("Review copy", () => {
  it("keeps the retired design-review decision labels out of the list, detail and bell", () => {
    for (const path of [
      "src/components/requests/detail-properties.tsx",
      "src/components/requests/detail-properties-drawer.tsx",
      "src/components/requests/detail-strip.tsx",
      "src/components/requests/request-row.tsx",
      "src/components/requests/row-presentation.tsx",
      "src/components/shell/notification-bell-view.tsx",
      "src/components/requests/pending-mutations-provider.tsx",
      "src/components/requests/detail-view.tsx",
      "src/components/requests/request-reviewers-panel.tsx",
    ]) {
      const file = source(path)
      expect(file, path).not.toContain("Changes requested")
      expect(file, path).not.toContain("changes_requested")
      expect(file, path).not.toContain("Approved")
    }
  })
})
