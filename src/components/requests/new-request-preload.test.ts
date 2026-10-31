import { readdirSync, readFileSync } from "node:fs"
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

  it("checks for a saved draft without the draft schema, so Zod stays out of the layout", () => {
    expect(provider).not.toMatch(/from ["']@\/lib\/intake-draft["']/)
    expect(provider).toMatch(/from ["']@\/lib\/intake-draft-key["']/)
    expect(read("src/lib/intake-draft-key.ts")).not.toMatch(/^\s*import\s/m)
  })

  it("loads the form once through a memoised dynamic import, with no next/dynamic Suspense boundary", () => {
    expect(provider).not.toContain("next/dynamic")
    // The type-only `typeof import(...)` brings in no code; the one runtime import is memoised.
    const runtime = provider.split("\n").filter(line => line.includes('import("@/app/(app)/intake/intake-form")') && !line.includes("typeof import("))
    expect(runtime).toHaveLength(1)
    // #267: Lane's one "load ahead, then open" helper keeps it, and renders it synchronously once it is here.
    expect(runtime[0]).toMatch(/popupCode\(\(\) => import\(/)
    expect(provider).toContain("usePopupCode(composerForm, open, unavailable, { transition: true })")
  })

  it("preloads once the page has loaded and is idle, and when the pointer or focus reaches New Request", () => {
    // Build 2's rule: never before the page's load event (after-page-load.ts).
    expect(provider).toContain("afterPageLoad(preloadComposer)")
    expect(link).toMatch(/onPointerEnter=\{[^}]*composer\?\.preload\(\)/)
    expect(link).toMatch(/onPointerDown=\{[^}]*composer\?\.preload\(\)/)
    expect(link).toMatch(/onFocus=\{[^}]*composer\?\.preload\(\)/)
  })

  it("focuses the step's own target without scrolling the panel", () => {
    expect(provider).toContain('querySelector<HTMLElement>("[data-composer-autofocus]")')
    expect(provider).toContain("focus({ preventScroll: true })")
  })
})

// 2026-10-13: Nikhil chose a centred dialog for the New Request composer, and
// /intake became a launcher. The Arc Drawer has no consumer and stays upstream.
describe("New Request composer host", () => {
  const sources = (readdirSync(join(process.cwd(), "src"), { recursive: true }) as string[])
    .filter(path => /\.(?:ts|tsx)$/.test(path))
    .map(path => ({ path, source: read(join("src", path)) }))

  it("opens the composer in Lane's adaptive popup (Arc Dialog, or Arc's bottom sheet under 640px, #263)", () => {
    // #267: the popup's code loads with the form's, on intent.
    expect(provider).toContain('popupCode(() => import("@/components/popup/adaptive-dialog"))')
    expect(provider).toMatch(/<popup\.DialogContent layout="composer"/)
  })

  it("keeps the composer out of the Arc Drawer and /intake with no form of its own", () => {
    // #263: the phone Properties panel moved to the adaptive popup, so nothing imports the Drawer.
    expect(sources.filter(({ source }) => /["']@\/components\/arc\/drawer\/drawer["']/.test(source)).map(({ path }) => path.replaceAll("\\", "/"))).toEqual([])
    const intakePage = read("src/app/(app)/intake/page.tsx")
    // #217: the launcher may carry the first-run guide beside it, but no form.
    expect(intakePage).toMatch(/<IntakeLauncher( guide=\{[^}]*\})? \/>/)
    expect(intakePage).not.toContain("intake-form")
  })
})
