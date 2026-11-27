/**
 * #389 (spec #383, stories 8 and 66): switching workspace and remembering the last-used one, as Server Actions a
 * person's browser calls, through Lane's server door and the session seam, on a local lane_test database.
 */
import { randomUUID } from "node:crypto"
import { beforeEach, describe, expect, it } from "vitest"
import { readSession } from "@/lib/session"
import { AuthBrowser, authRouteTestFile, doorData, doorLeave, doorRemove, fakeOutbound, switchOnAuthRoute, type Outbound } from "@/test/auth-route-browser"
import { rememberLastUsed, switchWorkspace } from "./workspace-actions"

const { connection, signedIn, createWorkspace, join } = authRouteTestFile("workspace-actions.test")

let outbound: Outbound
beforeEach(() => {
  switchOnAuthRoute()
  outbound = fakeOutbound()
})

const workspaceOf = (browser: AuthBrowser) => browser.action(async () => (await readSession())?.orgId ?? null)
const lastUsed = async (userId: string) => (await connection`select last_workspace_id from profiles where id = ${userId}`)[0].last_workspace_id
const activeIn = async (userId: string) => (await connection`select active_organization_id from session where user_id = ${userId}`)[0].active_organization_id
const nameWorkspace = (id: string, name: string) => connection`update organizations set name = ${name} where id = ${id}`

/** A person with two workspaces, in the second, which is also their last-used one. */
async function inTwoWorkspaces(label: string) {
  const person = await signedIn(outbound, label)
  const first = await createWorkspace(person.browser)
  const second = await createWorkspace(person.browser)
  await person.browser.action(() => rememberLastUsed())
  return { ...person, first, second }
}

describe("switching workspace", () => {
  it("changes the session's workspace and saves last used", async () => {
    const { browser, userId, first, second } = await inTwoWorkspaces("switcher")
    expect([await workspaceOf(browser), await lastUsed(userId)]).toEqual([second, second])

    expect(await browser.action(() => switchWorkspace(first))).toEqual({ ok: true })

    expect([await workspaceOf(browser), await lastUsed(userId)]).toEqual([first, first])
  })

  // Better Auth refuses this too, but clears the session's active workspace as it does.
  it.each([
    ["a workspace they were never in", async () => createWorkspace((await signedIn(outbound, "other")).browser)],
    ["no workspace at all", async () => randomUUID()],
    ["a missing argument", async () => undefined],
    ["null", async () => null],
  ])("refuses %s and changes neither", async (_what, target) => {
    const { browser, userId, second } = await inTwoWorkspaces("refused")
    const elsewhere = (await target()) as string

    expect(await browser.action(() => switchWorkspace(elsewhere))).toEqual({ ok: false, code: "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION" })

    expect([await workspaceOf(browser), await activeIn(userId), await lastUsed(userId)]).toEqual([second, second, second])
  })

  it("refuses a workspace that removed them, and one a signed-out browser names", async () => {
    const admin = await signedIn(outbound, "remover")
    const theirs = await createWorkspace(admin.browser)
    const person = await join(outbound, admin.browser, "member", "removed")
    const own = await createWorkspace(person.browser)
    doorData(await doorRemove(admin.browser, { organizationId: theirs, memberIdOrEmail: person.memberId }))

    expect(await person.browser.action(() => switchWorkspace(theirs))).toEqual({ ok: false, code: "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION" })
    expect(await workspaceOf(person.browser)).toBe(own)
    expect(await new AuthBrowser().action(() => switchWorkspace(own))).toEqual({ ok: false, code: "UNAUTHORIZED" })
  })
})

describe("remembering the last-used workspace", () => {
  it("answers first for a person with none saved, and not first once one is", async () => {
    const { browser, userId } = await signedIn(outbound, "starter")
    const first = await createWorkspace(browser)
    expect(await browser.action(() => rememberLastUsed())).toEqual({ ok: true, data: { first: true } })
    expect(await lastUsed(userId)).toBe(first)

    const second = await createWorkspace(browser)
    expect(await browser.action(() => rememberLastUsed())).toEqual({ ok: true, data: { first: false } })
    expect(await lastUsed(userId)).toBe(second)
  })

  it("answers not first for a person who had one and has no workspace left before joining", async () => {
    const admin = await signedIn(outbound, "admin")
    const left = await createWorkspace(admin.browser)
    const person = await join(outbound, admin.browser, "member", "returning")
    await person.browser.action(() => rememberLastUsed())
    doorData(await doorLeave(person.browser, left))
    expect(await workspaceOf(person.browser)).toBeNull()

    const joined = await createWorkspace(person.browser)
    expect(await person.browser.action(() => rememberLastUsed())).toEqual({ ok: true, data: { first: false } })
    expect(await lastUsed(person.userId)).toBe(joined)
  })

  it("ignores any workspace or person the caller sends", async () => {
    const other = await signedIn(outbound, "other")
    const theirs = await createWorkspace(other.browser)
    const { browser, userId } = await signedIn(outbound, "forger")
    const own = await createWorkspace(browser)
    const forged = rememberLastUsed as (...sent: unknown[]) => ReturnType<typeof rememberLastUsed>

    for (const sent of [theirs, { orgId: theirs }, { orgId: theirs, userId: other.userId }]) expect(await browser.action(() => forged(sent))).toMatchObject({ ok: true })

    expect([await lastUsed(userId), await lastUsed(other.userId)]).toEqual([own, null])
  })

  it("saves nothing for a person with no workspace, or nobody signed in", async () => {
    const { browser, userId } = await signedIn(outbound, "alone")
    expect(await browser.action(() => rememberLastUsed())).toEqual({ ok: false, code: "USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION" })
    expect(await lastUsed(userId)).toBeNull()
    expect(await new AuthBrowser().action(() => rememberLastUsed())).toEqual({ ok: false, code: "UNAUTHORIZED" })
  })

  it("isn't written by leaving or being removed", async () => {
    const admin = await signedIn(outbound, "keeper")
    const workspaceId = await createWorkspace(admin.browser)
    for (const go of ["leave", "remove"] as const) {
      const person = await join(outbound, admin.browser, "member", go)
      await person.browser.action(() => rememberLastUsed())
      const answer =
        go === "leave"
          ? await doorLeave(person.browser, workspaceId)
          : await doorRemove(admin.browser, { organizationId: workspaceId, memberIdOrEmail: person.memberId })
      expect(answer.ok).toBe(true)
      expect(await workspaceOf(person.browser)).toBeNull()
      expect(await lastUsed(person.userId)).toBe(workspaceId)
    }
  })
})

describe("the switcher's list", () => {
  it("is the person's own workspaces, by name", async () => {
    const { userId, first, second } = await inTwoWorkspaces("lister")
    const stranger = await signedIn(outbound, "stranger")
    await createWorkspace(stranger.browser)
    await nameWorkspace(first, "studio")
    await nameWorkspace(second, "Atelier")

    const { loadWorkspaces } = await import("@/lib/data/workspaces")
    expect(await loadWorkspaces(userId)).toEqual([
      { id: second, name: "Atelier" },
      { id: first, name: "studio" },
    ])
  })
})
