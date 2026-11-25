/**
 * #395 (spec #383, stories 53–56): renaming a workspace and leaving it, as Server Actions a person's browser calls,
 * through Lane's guards, its server door and the session seam, on a local lane_test database.
 */
import { randomUUID } from "node:crypto"
import { beforeEach, describe, expect, it } from "vitest"
import { authErrorCopy } from "@/lib/auth-error-copy"
import { loadWorkspaceFrame } from "@/lib/data/workspace-frame"
import { sendAwayMemberless } from "@/lib/ensure-workspace"
import { activeMemberOf } from "@/lib/auth-guard"
import { readSession } from "@/lib/session"
import { AuthBrowser, authRouteTestFile, doorData, doorOpen, fakeOutbound, switchOnAuthRoute, type Outbound } from "@/test/auth-route-browser"
import { leaveWorkspace, renameWorkspace } from "./workspace-actions"

const { connection, signedIn, createWorkspace, join } = authRouteTestFile("workspace-rows.test")

let outbound: Outbound
beforeEach(() => {
  switchOnAuthRoute()
  outbound = fakeOutbound()
})

const ONLY_ADMIN = "You’re the only Admin. Make someone else an Admin before you leave."
const NAME = "Wren's studio"
const nameOf = async (id: string) => (await connection`select name from organizations where id = ${id}`)[0].name
const membersOf = async (id: string) => (await connection`select user_id from member where organization_id = ${id} order by created_at`).map((row) => row.user_id)
const workspaceOf = (browser: AuthBrowser) => browser.action(async () => (await readSession())?.orgId ?? null)
/** The name the sidebar shows this browser's person on their next load. */
const sidebarName = (browser: AuthBrowser) =>
  browser.action(async () => {
    const member = activeMemberOf(await readSession())
    const loaded = member && (await loadWorkspaceFrame(member))
    return loaded ? loaded.frame.workspaceName : null
  })

/** A workspace with one person in each of Lane's four roles; the Admin is its only one. */
async function fourRoles() {
  const admin = await signedIn(outbound, "admin")
  const orgId = await createWorkspace(admin.browser)
  const [member, guest, viewer] = [await join(outbound, admin.browser, "member"), await join(outbound, admin.browser, "guest"), await join(outbound, admin.browser, "viewer")]
  return { orgId, admin, member, guest, viewer }
}

describe("renaming the workspace", () => {
  it("is an Admin's, and everyone's sidebar shows the new name on the next load", async () => {
    const { orgId, admin, guest } = await fourRoles()
    expect(await sidebarName(guest.browser)).toBe(NAME)

    expect(await admin.browser.action(() => renameWorkspace({ name: "  Atelier Wren " }, { orgId }))).toEqual({ ok: true })

    expect([await sidebarName(admin.browser), await sidebarName(guest.browser)]).toEqual(["Atelier Wren", "Atelier Wren"])
  })

  it("is refused to a Member, a Guest and a Viewer, in Lane's words", async () => {
    const { orgId, member, guest, viewer } = await fourRoles()
    for (const { browser } of [member, guest, viewer]) {
      const answer = await browser.action(() => renameWorkspace({ name: "Taken over" }, { orgId }))
      expect(answer).toEqual({ ok: false, code: "YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION" })
    }
    expect(await nameOf(orgId)).toBe(NAME)
  })

  it("changes nothing for a workspace the Admin isn't in, one their session isn't in, or nobody signed in", async () => {
    const stranger = await signedIn(outbound, "stranger")
    const theirs = await createWorkspace(stranger.browser)
    const { browser } = await signedIn(outbound, "forger")
    const first = await createWorkspace(browser)
    const second = await createWorkspace(browser)

    for (const orgId of [theirs, first, randomUUID(), undefined as never])
      expect(await browser.action(() => renameWorkspace({ name: "Forged" }, { orgId }))).toEqual({ ok: false, code: "WORKSPACE_NOT_OPEN" })
    expect(await new AuthBrowser().action(() => renameWorkspace({ name: "Forged" }, { orgId: second }))).toEqual({ ok: false, code: "UNAUTHORIZED" })

    expect([await nameOf(theirs), await nameOf(first), await nameOf(second)]).toEqual([NAME, NAME, NAME])
  })

  it("changes only the name, and never to nothing", async () => {
    const { browser } = await signedIn(outbound, "namer")
    const orgId = await createWorkspace(browser)
    const [before] = await connection`select slug, plan from organizations where id = ${orgId}`
    for (const name of ["", "   ", 7 as never, undefined as never]) expect(await browser.action(() => renameWorkspace({ name }, { orgId }))).toEqual({ ok: false })
    for (const [name, code] of [["Acme\nYour account is locked", "NAME_NOT_PLAIN"], ["n".repeat(101), "NAME_TOO_LONG"]])
      expect(await browser.action(() => renameWorkspace({ name }, { orgId }))).toEqual({ ok: false, code })
    expect(await nameOf(orgId)).toBe(NAME)

    const forged = { name: "Renamed", slug: "forged", plan: "enterprise" }
    expect(await browser.action(() => renameWorkspace(forged, { orgId }))).toEqual({ ok: true })
    expect((await connection`select name, slug, plan from organizations where id = ${orgId}`)[0]).toEqual({ name: "Renamed", ...before })
  })
})

describe("leaving the workspace", () => {
  it("deletes only the leaver's member row there, for each role, and keeps their Requests and comments", async () => {
    const { orgId, admin, member, guest, viewer } = await fourRoles()
    const second = await join(outbound, admin.browser, "admin", "second-admin")
    for (const leaver of [member, guest, viewer, second]) {
      const elsewhere = await createWorkspace(leaver.browser)
      doorData(await doorOpen(leaver.browser, orgId))
      const [request] = await connection`insert into requests (org_id, title, description, created_by) values (${orgId}, 'Search is slow', 'Fixture', ${leaver.userId}) returning id`
      const [comment] = await connection`insert into comments (request_id, author_id, body) values (${request.id}, ${leaver.userId}, 'Still slow') returning id`
      const before = await membersOf(orgId)

      expect(await leaver.browser.action(() => leaveWorkspace({ orgId }))).toEqual({ ok: true })

      expect(await membersOf(orgId)).toEqual(before.filter((id) => id !== leaver.userId))
      expect(await membersOf(elsewhere)).toEqual([leaver.userId])
      expect((await connection`select created_by from requests where id = ${request.id}`)[0].created_by).toBe(leaver.userId)
      expect((await connection`select author_id from comments where id = ${comment.id}`)[0].author_id).toBe(leaver.userId)
      expect(await workspaceOf(leaver.browser)).toBe(elsewhere)
    }
  })

  it("refuses the only Admin a forged call, in the only-Admin words, however many others there are", async () => {
    const { orgId, admin } = await fourRoles()
    const before = await membersOf(orgId)

    const answer = await admin.browser.action(() => leaveWorkspace({ orgId }))

    expect(answer).toMatchObject({ ok: false })
    expect(authErrorCopy((answer as { code?: string }).code)).toBe(ONLY_ADMIN)
    expect([await membersOf(orgId), await workspaceOf(admin.browser)]).toEqual([before, orgId])
  })

  it("sends someone with no workspace left from `/` to Onboarding", async () => {
    const { orgId, guest } = await fourRoles()
    expect(await guest.browser.action(() => leaveWorkspace({ orgId }))).toEqual({ ok: true })

    expect(await workspaceOf(guest.browser)).toBeNull()
    await expect(guest.browser.action(() => sendAwayMemberless())).rejects.toMatchObject({ digest: expect.stringContaining(";/onboarding;") })
  })

  it("changes nothing for a workspace the person isn't in, one their session isn't in, or nobody signed in", async () => {
    const { orgId: theirs } = await fourRoles()
    const first = await signedIn(outbound, "inviter")
    const other = await createWorkspace(first.browser)
    const person = await join(outbound, first.browser, "member", "forger")
    const own = await createWorkspace(person.browser)
    const before = [await membersOf(theirs), await membersOf(other), await membersOf(own)]

    for (const orgId of [theirs, other, randomUUID(), undefined as never])
      expect(await person.browser.action(() => leaveWorkspace({ orgId }))).toEqual({ ok: false, code: "WORKSPACE_NOT_OPEN" })
    expect(await new AuthBrowser().action(() => leaveWorkspace({ orgId: own }))).toEqual({ ok: false, code: "UNAUTHORIZED" })
    // Another person or workspace sent along is ignored.
    const forged = leaveWorkspace as (...sent: unknown[]) => ReturnType<typeof leaveWorkspace>
    expect(await person.browser.action(() => forged({ orgId: own, userId: first.userId, organizationId: other }))).toMatchObject({ ok: false })

    expect([await membersOf(theirs), await membersOf(other), await membersOf(own)]).toEqual(before)
  })
})
