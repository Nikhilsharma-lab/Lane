import { readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { createElement, type ComponentType, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("@clerk/nextjs", () => ({ useOrganization: () => ({ isLoaded: false }), useClerk: () => ({ signOut: vi.fn() }) }))
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
}))
// next/font is a Next build transform; global-error only reads the class names.
vi.mock("@/lib/fonts", () => ({ fontVariables: "" }))

import { SidebarView } from "@/components/shell/sidebar-view"
import ListLoading from "./loading"
import DetailLoading from "./requests/[id]/loading"
import IntakeLoading from "./intake/loading"
import ProfileLoading from "./settings/profile/loading"
import MembersLoading from "./settings/members/loading"
import AppError from "./error"
import RootError from "../error"
import NotFound from "../not-found"
import GlobalError from "../global-error"

// Plan item 2.0 (risk 1): with the shell topbar gone, the page strip is the only
// carrier of the expand control on phones, so every frame under the (app)
// layout must render exactly one. These render each frame as the server sends it.
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"])

/** Drops every element marked aria-hidden="true", with its subtree. */
function withoutHidden(html: string) {
  let out = "", depth = 0, last = 0
  for (const tag of html.matchAll(/<(\/?)([a-zA-Z][\w:-]*)\b[^>]*>/g)) {
    const [text, closing, name] = tag
    const index = tag.index!
    if (depth === 0) out += html.slice(last, index)
    last = index + text.length
    const opens = !closing && !VOID.has(name.toLowerCase()) && !text.endsWith("/>")
    if (depth > 0) { if (opens) depth++; else if (closing) depth--; continue }
    if (!closing && /\baria-hidden="true"/.test(text)) { if (opens) depth = 1; continue }
    out += text
  }
  return depth === 0 ? out + html.slice(last) : out
}
/** The page inside the shell's <main>; the sidebar keeps live regions of its own. */
const page = (html: string) => /<main\b[\s\S]*<\/main>/.exec(html)?.[0] ?? ""
const exposedStatuses = (html: string) => [...withoutHidden(page(html)).matchAll(/<[^>]*\brole="status"[^>]*>/g)].map(([tag]) => /aria-label="([^"]*)"/.exec(tag)?.[1] ?? "")
const strips = (html: string) => html.match(/data-slot="page-strip"/g)?.length ?? 0

const inShell = (pathname: string, children: ReactNode) => renderToStaticMarkup(createElement(SidebarView, {
  workspaceName: "Lane Studio", fullName: "Test Member", email: "member@example.test", role: "member",
  pathname, statusFilter: "all", notifications: null,
}, children))

const skeletons: [string, string, ComponentType, string, string][] = [
  ["loading.tsx", "/", ListLoading, "list", "Loading Requests"],
  ["requests/[id]/loading.tsx", "/requests/x", DetailLoading, "detail", "Loading selected Request"],
  ["intake/loading.tsx", "/intake", IntakeLoading, "intake", "Loading Intake"],
  ["settings/profile/loading.tsx", "/settings/profile", ProfileLoading, "profile", "Loading Profile settings"],
  ["settings/members/loading.tsx", "/settings/members", MembersLoading, "members", "Loading Members"],
]

describe("(app) loading frames", () => {
  it("covers every loading.tsx under the (app) layout", () => {
    const root = join(process.cwd(), "src/app/(app)")
    const found = (readdirSync(root, { recursive: true }) as string[]).map(path => relative(root, join(root, path)).replaceAll("\\", "/")).filter(path => /(^|\/)loading\.tsx$/.test(path)).sort()
    expect(found).toEqual(skeletons.map(([file]) => file).sort())
  })

  it.each(skeletons)("%s renders one strip, waits, and announces one status", (_file, pathname, Loading, name, label) => {
    const html = inShell(pathname, createElement(Loading))
    expect(strips(html)).toBe(1)
    expect(html).toContain('aria-busy="true"')
    // Members keeps its unchanged loading.tsx; the Arc Skeleton carries aria-busy there.
    if (name !== "members") expect(html).toContain(`data-skeleton="${name}"`)
    expect(exposedStatuses(html)).toEqual([label])
    // The strip, and with it the expand control, is never inside an aria-hidden block.
    expect(strips(withoutHidden(html))).toBe(1)
  })

  it("draws the list from the loaded list's toolbar and 44px compact rows, with no data selectors", () => {
    const html = inShell("/", createElement(ListLoading))
    expect(html).toContain("data-preview-table")
    expect(html.match(/data-compact-row="true"/g)).toHaveLength(12)
    expect(html).not.toContain("data-request-id")
    expect(html).toContain('href="/intake"')
  })

  it("keeps the detail skeleton free of the loaded page's content anchor", () => {
    const html = inShell("/requests/x", createElement(DetailLoading))
    expect(html).not.toContain('id="request-problem"')
    expect(html).toContain('aria-label="Close Request detail"')
    expect(html).toContain('data-slot="requests-workspace"')
  })
})

describe("error frames", () => {
  it("keeps the shell's trail above the (app) error and alerts only the message", () => {
    const html = inShell("/requests/x", createElement(AppError, { error: new Error("Illustrative"), reset: () => {} }))
    expect(strips(html)).toBe(1)
    expect(html).toMatch(/<li aria-current="page"><h1\b[^>]*>Page unavailable<\/h1><\/li>/)
    expect(/role="alert"[\s\S]*$/.exec(html)?.[0]).not.toContain('aria-label="Breadcrumb"')
  })

  it.each([
    ["error.tsx", () => createElement(RootError, { error: new Error("Illustrative"), reset: () => {} }), "Database unavailable"],
    ["not-found.tsx", () => createElement(NotFound), "Page not found"],
    ["global-error.tsx", () => createElement(GlobalError, { error: new Error("Illustrative"), reset: () => {} }), "Lane unavailable"],
  ])("root %s renders the strip with its h1 and no expand control", (_file, element, title) => {
    const html = renderToStaticMarkup(element())
    expect(strips(html)).toBe(1)
    expect(/<header\b[^>]*data-slot="page-strip"[^>]*>[\s\S]*?<\/header>/.exec(html)?.[0]).toMatch(new RegExp(`<h1\\b[^>]*>${title}</h1>`))
    expect(html).not.toContain("Expand sidebar")
    expect(html).not.toContain('aria-label="Breadcrumb"')
  })

  it("names the global error's failure inside its alert, as a heading below the strip's h1", () => {
    const html = renderToStaticMarkup(createElement(GlobalError, { error: new Error("Illustrative"), reset: () => {} }))
    const alert = /<div\b[^>]*role="alert"[^>]*>[\s\S]*<\/div>/.exec(html)?.[0] ?? ""
    expect(alert).toMatch(/<h2\b[^>]*>Lane can’t load right now<\/h2>/)
    expect(alert).toContain("Your data is safe.")
    expect(alert).not.toContain('data-slot="page-strip"')
  })

  it("leaves the global error's focus ring to the shared keyboard outline", () => {
    const html = renderToStaticMarkup(createElement(GlobalError, { error: new Error("Illustrative"), reset: () => {} }))
    expect(html).not.toContain("focus-visible:outline")
    expect(html).toContain(">Reload</button>")
  })
})
