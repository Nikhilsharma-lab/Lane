/**
 * #395 (spec #383 "Workspace rows"): the workspace name and Leave rows, as each of the four Settings pages renders
 * them for each role, with the members read from a local lane_test database. The session is faked at the seam.
 */
import { randomUUID } from "node:crypto"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import postgres from "postgres"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { ToastStackProvider } from "@/components/arc/toast-stack/toast-stack"
import { leaveThenOpenLane } from "@/components/settings/workspace-rows"
import type { WorkspaceContext } from "@/lib/ensure-workspace"
import { WORKSPACE_ROLES } from "@/lib/role-rules"
import { addMembers, setMembers } from "@/test/member-fixtures"
import { requireTestDatabase } from "@/test/test-database"

const ORG = "org_workspace_rows", OTHER = "org_workspace_rows_other"
const ADMIN = "user_rows_admin"
const userOf = (role: WorkspaceContext["role"]) => `user_rows_${role}`
const visit = vi.hoisted(() => ({ workspace: null as unknown }))
vi.mock("@/lib/ensure-workspace", () => ({ getWorkspace: async () => visit.workspace }))
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  usePathname: () => "/settings/profile",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock("@/components/settings/workspace-members-loader", () => ({ WorkspaceMembersLoader: () => null }))
vi.mock("./profile/account-panels", () => ({ accountPanels: async () => ({}) }))
// Static markup can't wait for code that loads after the page, so the rows are drawn straight away.
vi.mock("@/components/settings/workspace-rows-loader", async () => {
  const { LeaveWorkspace, WorkspaceName } = await import("@/components/settings/workspace-rows")
  return { LeaveWorkspaceLoader: LeaveWorkspace, WorkspaceNameLoader: WorkspaceName }
})
vi.mock("./profile/profile-form", () => ({ ProfileForm: () => null }))
vi.mock("./profile/theme-preference", () => ({ ThemePreference: () => null }))

let metricId = ""
const PAGES = {
  Profile: async () => (await import("./profile/page")).default({ searchParams: Promise.resolve({}) }),
  Members: async () => (await import("./members/page")).default(),
  Metrics: async () => (await import("./metrics/(library)/page")).default({ searchParams: Promise.resolve({}) }),
  "a Metric": async () => (await import("./metrics/[id]/page")).default({ params: Promise.resolve({ id: metricId }), searchParams: Promise.resolve({}) }),
}
type Page = keyof typeof PAGES
/** The pages each role can open: a Guest only Profile, a Viewer all but Members. */
const OPENS: Record<WorkspaceContext["role"], Page[]> = {
  admin: ["Profile", "Members", "Metrics", "a Metric"],
  member: ["Profile", "Members", "Metrics", "a Metric"],
  viewer: ["Profile", "Metrics", "a Metric"],
  guest: ["Profile"],
}
const VISITS = WORKSPACE_ROLES.flatMap((role) => OPENS[role].map((page) => [role, page] as const))

/** Settings → Workspace details on the page, for someone in this role. */
async function details(role: WorkspaceContext["role"], page: Page) {
  visit.workspace = { userId: userOf(role), orgId: ORG, role, profileRole: "pm", fullName: "Pat", email: "pat@example.test", workspaceName: "Atelier Wren" } satisfies WorkspaceContext
  const html = renderToStaticMarkup(createElement(ToastStackProvider, null, await PAGES[page]()))
  const section = html.slice(html.indexOf('<section id="settings-workspace"'))
  expect(section.length).toBeGreaterThan(1)
  return section.slice(0, section.indexOf("</section></section>"))
}
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim()
const leaveButton = (html: string) => /<button[^>]*>(?:<[^>]+>)*Leave workspace/.exec(html)?.[0] ?? ""

let connection: ReturnType<typeof postgres>
beforeAll(async () => {
  requireTestDatabase(process.env.DATABASE_URL)
  connection = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false })
  await connection`insert into organizations (id, name, slug) values (${ORG}, 'Atelier Wren', 'workspace-rows'), (${OTHER}, 'Elsewhere', 'workspace-rows-other')`
  await setMembers(ORG, { [ADMIN]: "admin" })
  const { addMetricDefinition } = await import("@/lib/metrics-library")
  const added = await addMetricDefinition({ orgId: ORG }, ADMIN, { name: `Trials ${randomUUID().slice(0, 8)}`, unit: "count", link: null, howCounted: "Trials started." })
  if (!("id" in added)) throw new Error(added.error)
  metricId = added.id
})
afterAll(async () => {
  await connection`delete from organizations where id in (${ORG}, ${OTHER})`
  await connection`delete from profiles where id like 'user_rows_%'`
  await connection.end()
})
beforeEach(async () => {
  await setMembers(ORG, Object.fromEntries(WORKSPACE_ROLES.map((role) => [userOf(role), role])))
})

describe("the workspace rows on every Settings page", () => {
  it.each(VISITS)("give %s one name row and Leave, on %s", async (role, page) => {
    const html = await details(role, page)
    expect(text(html).match(/Workspace name/g)?.length).toBe(role === "admin" ? 2 : 1)
    if (role === "admin") {
      expect(html).toMatch(/<form[^>]*aria-label="Workspace name"/)
      expect(html).toMatch(/<input[^>]*value="Atelier Wren"/)
      expect(text(html)).not.toContain("Only Admins can change it.")
    } else {
      expect(html).not.toContain("<form")
      expect(text(html)).toContain("Workspace name Only Admins can change it. Atelier Wren")
    }
    expect(text(html)).toContain("Leave Atelier Wren")
    expect(leaveButton(html)).not.toBe("")
    expect(html).not.toMatch(/Manage workspace|Clerk/)
  })

  it.each(OPENS.admin)("grey the only Admin's Leave with its reason, and lead to the People list, on %s", async (page) => {
    const html = await details("admin", page)
    expect(leaveButton(html)).toMatch(/\bdisabled=""/)
    expect(text(html)).toContain("You’re the only Admin. Make someone else an Admin before you leave. Make someone an Admin")
    expect(html).toMatch(/<a [^>]*href="\/settings\/profile\?section=members#people"[^>]*>Make someone an Admin<\/a>/)
  })

  it("offer Leave to an Admin once someone else here is one, and not for an Admin of another workspace", async () => {
    await addMembers(OTHER, { user_rows_elsewhere: "admin" })
    expect(leaveButton(await details("admin", "Profile"))).toMatch(/\bdisabled=""/)
    await addMembers(ORG, { user_rows_second: "admin" })
    const html = await details("admin", "Profile")
    expect(leaveButton(html)).not.toMatch(/\bdisabled=""/)
    expect(text(html)).not.toContain("only Admin")
  })

  it.each(["member", "guest", "viewer"] as const)("offer Leave to a %s", async (role) => {
    expect(leaveButton(await details(role, "Profile"))).not.toMatch(/\bdisabled=""/)
  })
})

describe("after leaving", () => {
  it("loads `/` in full, and stays put when the server refuses", async () => {
    const replace = vi.fn()
    vi.stubGlobal("window", { location: { replace } })
    const refused = { ok: false as const, code: "ONLY_ADMIN" }
    expect(await leaveThenOpenLane(async () => refused)).toEqual(refused)
    expect(replace).not.toHaveBeenCalled()
    expect(await leaveThenOpenLane(async () => ({ ok: true }))).toEqual({ ok: true })
    expect(replace).toHaveBeenCalledExactlyOnceWith("/")
    vi.unstubAllGlobals()
  })
})
