import { readdirSync } from "node:fs"
import { AppProviders } from "@/test/app-providers";
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
import ImpactLoading from "./impact/loading"
import ProfileLoading from "./settings/profile/loading"
import MembersLoading from "./settings/members/loading"
import MetricsLoading from "./settings/metrics/loading"
import MetricDefinitionLoading from "./settings/metrics/[id]/loading"
import AppError from "./error"
import RootError from "../error"
import NotFound from "../not-found"
import GlobalError from "../global-error"
import { RequestUnavailable } from "@/components/requests/detail-view"
import { ProjectUnavailable } from "./requests-overview"
import { statusLabels, withoutHidden } from "@/test/exposed-markup"

// Plan item 2.0 (risk 1): with the shell topbar gone, the page strip is the only
// carrier of the expand control on phones, so every frame under the (app)
// layout must render exactly one. These render each frame as the server sends it.
/** The page inside the shell's <main>; the sidebar keeps live regions of its own. */
const page = (html: string) => /<main\b[\s\S]*<\/main>/.exec(html)?.[0] ?? ""
const exposedStatuses = (html: string) => statusLabels(withoutHidden(page(html)))
const strips = (html: string) => html.match(/data-slot="page-strip"/g)?.length ?? 0

const inShell = (pathname: string, children: ReactNode) => renderToStaticMarkup(createElement(AppProviders, null, createElement(SidebarView, {
  workspaceName: "Lane Studio", fullName: "Test Member", email: "member@example.test", role: "member",
  pathname, notifications: null,
}, children)))

const skeletons: [string, string, ComponentType, string, string][] = [
  ["loading.tsx", "/", ListLoading, "list", "Loading Requests"],
  ["requests/[id]/loading.tsx", "/requests/x", DetailLoading, "detail", "Loading selected Request"],
  ["intake/loading.tsx", "/intake", IntakeLoading, "intake", "Loading New Request"],
  ["impact/loading.tsx", "/impact", ImpactLoading, "impact", "Loading impact"],
]

const settingsSkeletons: [string, string, ComponentType, string][] = [
  ["settings/profile/loading.tsx", "/settings/profile", ProfileLoading, "Loading Profile settings"],
  ["settings/members/loading.tsx", "/settings/members", MembersLoading, "Loading Members"],
  ["settings/metrics/loading.tsx", "/settings/metrics", MetricsLoading, "Loading Metrics"],
  ["settings/metrics/[id]/loading.tsx", "/settings/metrics/x", MetricDefinitionLoading, "Loading metric"],
]

describe("(app) loading frames", () => {
  it("covers every loading.tsx under the (app) layout", () => {
    const root = join(process.cwd(), "src/app/(app)")
    const found = (readdirSync(root, { recursive: true }) as string[]).map(path => relative(root, join(root, path)).replaceAll("\\", "/")).filter(path => /(^|\/)loading\.tsx$/.test(path)).sort()
    expect(found).toEqual([...skeletons, ...settingsSkeletons].map(([file]) => file).sort())
  })

  it.each(skeletons)("%s renders one strip, waits, and announces one status", (_file, pathname, Loading, name, label) => {
    const html = inShell(pathname, createElement(Loading))
    expect(strips(html)).toBe(1)
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain(`data-skeleton="${name}"`)
    expect(exposedStatuses(html)).toEqual([label])
    // The strip, and with it the expand control, is never inside an aria-hidden block.
    expect(strips(withoutHidden(html))).toBe(1)
  })

  it.each(settingsSkeletons)("%s preserves Settings navigation and announces one loading status", (_file, pathname, Loading, label) => {
    const html = inShell(pathname, createElement(Loading))
    const visible = withoutHidden(page(html))
    expect(html).toContain('aria-busy="true"')
    expect(exposedStatuses(html)).toEqual([label])
    expect([...visible.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map(match => match[1])).toEqual(["Settings"])
    expect(visible).toMatch(/<a\b[^>]*href="\/"[^>]*>[\s\S]*?Back to Requests<\/a>/)
  })

  it("draws the list from the loaded list's toolbar and 44px compact rows, with no data selectors", () => {
    const html = inShell("/", createElement(ListLoading))
    expect(html).toContain("data-preview-table")
    expect(html.match(/data-compact-row="true"/g)).toHaveLength(12)
    expect(html).not.toContain("data-request-id")
    expect(html).toContain('href="/intake"')
  })

  it("keeps the detail skeleton free of the loaded page's content anchors", () => {
    const html = inShell("/requests/x", createElement(DetailLoading))
    // Plan item 2.5: #problem, the title and data-request-id mark the loaded page for the perf spec.
    for (const marker of ['id="problem"', 'id="request-title"', "data-request-id"]) expect(html).not.toContain(marker)
    expect(html).toContain('aria-label="Back to Requests"')
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
    const html = renderToStaticMarkup(createElement(AppProviders, null, element()))
    expect(strips(html)).toBe(1)
    expect(/<header\b[^>]*data-slot="page-strip"[^>]*>[\s\S]*?<\/header>/.exec(html)?.[0]).toMatch(new RegExp(`<h1\\b[^>]*>${title}</h1>`))
    expect(html).not.toContain("Expand sidebar")
    expect(html).not.toContain('aria-label="Breadcrumb"')
  })

  it("names the global error's failure inside its alert, as a heading below the strip's h1", () => {
    const html = renderToStaticMarkup(createElement(AppProviders, null, createElement(GlobalError, { error: new Error("Illustrative"), reset: () => {} })))
    const alert = /<div\b[^>]*role="alert"[^>]*>[\s\S]*<\/div>/.exec(html)?.[0] ?? ""
    expect(alert).toMatch(/<h2\b[^>]*>Lane can’t load right now<\/h2>/)
    expect(alert).toContain("Your data is safe.")
    expect(alert).toContain('href="mailto:uselaneapp@gmail.com"')
    expect(alert).not.toContain('data-slot="page-strip"')
  })

  it.each([
    ["Request", "/requests/x", () => createElement(RequestUnavailable, { returnHref: "/" }), "Request unavailable"],
    ["Project", "/", () => createElement(ProjectUnavailable), "Project unavailable"],
  ])("%s unavailable names its page once, as the strip's h1, and the body says what happened", (_name, pathname, element, title) => {
    const main = page(inShell(pathname, element()))
    if (title === "Request unavailable") expect(main).toContain('aria-label="Back to Requests"')
    expect(strips(main)).toBe(1)
    const h1s = [...main.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map(match => match[1])
    expect(h1s).toEqual([title])
    expect(/<header\b[^>]*data-slot="page-strip"[^>]*>[\s\S]*?<\/header>/.exec(main)?.[0]).toMatch(new RegExp(`<h1\\b[^>]*>${title}</h1>`))
    const body = main.slice(main.indexOf("</header>"))
    expect(body).not.toContain(title)
    expect(body).toMatch(/<h2\b/)
  })

  it("leaves the global error's focus ring to the shared keyboard outline", () => {
    const html = renderToStaticMarkup(createElement(AppProviders, null, createElement(GlobalError, { error: new Error("Illustrative"), reset: () => {} })))
    expect(html).not.toContain("focus-visible:outline")
    expect(html).toContain(">Reload</button>")
  })
})
