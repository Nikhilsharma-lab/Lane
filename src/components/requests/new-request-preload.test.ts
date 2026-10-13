import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")
const provider = read("src/components/requests/new-request-provider.tsx")
const link = read("src/components/requests/new-request-link.tsx")
const layout = read("src/app/(app)/layout.tsx")
const staticFormImport = /^\s*import\s[^;]*from\s+["']@\/app\/\(app\)\/intake\/intake-form["']/m

// Plan item 2.3: C focuses the title within 100 ms on the first open, and the
// form (react-hook-form, zod, the AI review) stays out of every route's first load.
describe("New Request composer preload", () => {
  it("keeps the form out of the layout's and provider's static imports", () => {
    expect(provider).not.toMatch(staticFormImport)
    expect(layout).not.toMatch(staticFormImport)
    expect(layout).not.toContain("intake-form")
    expect(provider).not.toContain("modulepreload")
  })

  it("loads the form once through a memoised dynamic import, with no next/dynamic Suspense boundary", () => {
    expect(provider).not.toContain("next/dynamic")
    // The type-only `typeof import(...)` brings in no code; the one runtime import is memoised.
    const runtime = provider.split("\n").filter(line => line.includes('import("@/app/(app)/intake/intake-form")') && !line.includes("typeof import("))
    expect(runtime).toHaveLength(1)
    expect(runtime[0]).toMatch(/formPromise \?\?= import\(/)
    expect(provider).toContain("useState<IntakeFormComponent | null>(() => loadedForm)")
  })

  it("preloads on idle and when the pointer or focus reaches New Request", () => {
    expect(provider).toContain("requestIdleCallback(preload")
    expect(link).toMatch(/onPointerEnter=\{[^}]*composer\?\.preload\(\)/)
    expect(link).toMatch(/onFocus=\{[^}]*composer\?\.preload\(\)/)
  })

  it("focuses the step's own target without scrolling the panel", () => {
    expect(provider).toContain('querySelector<HTMLElement>("[data-composer-autofocus]")')
    expect(provider).toContain("focus({ preventScroll: true })")
  })
})
