/**
 * #402: what the app frame is answered after an in-app move, through the real session seam on a local lane_test
 * database. Sessions and workspaces are made through `/api/auth/[...all]` as the browser makes them.
 */
import { beforeEach, expect, it, vi } from "vitest"
import { queryCounter } from "@/db"
import { loadWorkspaceFrame } from "@/lib/data/workspace-frame"
import { getMember } from "@/lib/ensure-workspace"
import { AUTH_ORIGIN, authRouteTestFile, fakeOutbound, switchOnAuthRoute, type AuthBrowser, type Outbound } from "@/test/auth-route-browser"
import { GET } from "./route"

const { connection, signedIn, createWorkspace, join } = authRouteTestFile("frame-answer.test")

let outbound: Outbound
beforeEach(() => {
  switchOnAuthRoute()
  outbound = fakeOutbound()
})

/** What the route answers the frame drawn for this workspace, and how many queries it took. */
async function ask(browser: AuthBrowser, orgId: string | null) {
  const query = new URLSearchParams({ ...(orgId ? { org: orgId } : {}), only: "role" })
  const { result, statements } = await queryCounter.measure(() => browser.action(() => GET(new Request(`${AUTH_ORIGIN}/api/notifications/unread?${query}`))))
  return { status: result.status, body: await result.json(), cache: result.headers.get("cache-control"), statements }
}

it("answers the person and their role in the frame's workspace, with the session read alone and uncacheable", async () => {
  const { browser, userId } = await signedIn(outbound, "admin")
  const orgId = await createWorkspace(browser)
  expect(await ask(browser, orgId)).toEqual({ status: 200, body: { role: "admin", userId }, cache: "private, no-store", statements: 1 })
})

it("says the same workspace, person and role as the frame a full load draws, so a full load never meets a mismatch", async () => {
  const admin = await signedIn(outbound, "admin")
  const orgId = await createWorkspace(admin.browser)
  for (const role of ["admin", "member", "guest", "viewer"]) {
    const person = await join(outbound, admin.browser, role)
    const loaded = await person.browser.action(async () => loadWorkspaceFrame((await getMember())!))
    await loaded!.frame.needsYouCount
    expect(loaded!.frame).toMatchObject({ orgId, role, userId: person.userId })
    expect(await ask(person.browser, loaded!.frame.orgId)).toMatchObject({ status: 200, body: { role: loaded!.frame.role, userId: loaded!.frame.userId } })
  }
})

it("answers the new role once it has changed", async () => {
  const admin = await signedIn(outbound, "admin")
  const orgId = await createWorkspace(admin.browser)
  const member = await join(outbound, admin.browser, "member")
  expect(await ask(member.browser, orgId)).toMatchObject({ status: 200, body: { role: "member" } })
  await connection`update member set role = 'viewer' where organization_id = ${orgId} and user_id = ${member.userId}`
  expect(await ask(member.browser, orgId)).toMatchObject({ status: 200, body: { role: "viewer" } })
})

it("refuses the frame's workspace after a removal, with another workspace or none, and after a switch elsewhere", async () => {
  const admin = await signedIn(outbound, "admin")
  const orgId = await createWorkspace(admin.browser)
  const member = await join(outbound, admin.browser, "member")
  const changed = { status: 403, body: { error: "Your workspace session changed. Refresh the page to continue.", code: "WORKSPACE_CHANGED" }, cache: "private, no-store", statements: 1 }

  await connection`delete from member where organization_id = ${orgId} and user_id = ${member.userId}`
  expect(await ask(member.browser, orgId)).toEqual(changed)
  await createWorkspace(member.browser)
  expect(await ask(member.browser, orgId)).toEqual(changed)
  // Another tab of the Admin's opens another workspace.
  await createWorkspace(admin.browser)
  expect(await ask(admin.browser, orgId)).toEqual(changed)
})

// Another tab of the browser signs in as someone else, whose last-used workspace is the same one.
it("answers the other person once someone else is signed in, in the same workspace and role", async () => {
  const admin = await signedIn(outbound, "admin")
  const orgId = await createWorkspace(admin.browser)
  const first = await join(outbound, admin.browser, "member", "first")
  const second = await join(outbound, admin.browser, "member", "second")
  first.browser.cookies.clear()
  for (const [name, value] of second.browser.cookies) first.browser.cookies.set(name, value)
  expect(await ask(first.browser, orgId)).toMatchObject({ status: 200, body: { role: "member", userId: second.userId }, statements: 1 })
})

it("answers 401 to a session that ended, and 400 without a workspace, as before", async () => {
  const { browser } = await signedIn(outbound, "admin")
  const orgId = await createWorkspace(browser)
  expect(await ask(browser, null)).toMatchObject({ status: 400, body: { error: "A workspace is required." }, statements: 1 })
  const cookies = new Map(browser.cookies)
  expect((await browser.post("/sign-out")).status).toBe(200)
  for (const [name, value] of cookies) browser.cookies.set(name, value)
  vi.unstubAllGlobals()
  for (const asked of [orgId, null])
    expect(await ask(browser, asked)).toMatchObject({ status: 401, body: { error: "Sign in to continue." }, statements: 1 })
})
