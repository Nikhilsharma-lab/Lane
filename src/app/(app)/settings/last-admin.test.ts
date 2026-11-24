/**
 * The workspace always keeps an Admin (#333 Q4), however many people change its membership at once: Leave, Remove and
 * role changes take turns per workspace. The Server Actions run as the people whose browsers call them, through
 * Lane's server door, on a local lane_test database.
 */
import { randomUUID } from "node:crypto"
import { beforeEach, expect, it, vi } from "vitest"
import { authErrorCopy } from "@/lib/auth-error-copy"
import { authRouteTestFile, fakeOutbound, switchOnAuthRoute, type AuthBrowser, type Outbound } from "@/test/auth-route-browser"
import { changeMemberRole, removeMember } from "./members/actions"
import { leaveWorkspace } from "./workspace-actions"

const { connection, domain, signedIn, createWorkspace, join } = authRouteTestFile("last-admin.test")

let outbound: Outbound
beforeEach(() => {
  switchOnAuthRoute()
  outbound = fakeOutbound()
})

const adminsOf = async (orgId: string) => (await connection`select user_id from member where organization_id = ${orgId} and role = 'admin'`).map((row) => row.user_id as string)

/** A workspace with two Admins and nobody else. */
async function twoAdmins() {
  const first = await signedIn(outbound, "first")
  const orgId = await createWorkspace(first.browser)
  return { orgId, first, second: await join(outbound, first.browser, "admin", "second") }
}
type Workspace = Awaited<ReturnType<typeof twoAdmins>>
type Person = { browser: AuthBrowser; userId: string }

const leave = ({ browser }: Person, orgId: string) => browser.action(() => leaveWorkspace({ orgId }))
const demote = ({ browser }: Person, target: Person, orgId: string) => browser.action(() => changeMemberRole({ userId: target.userId, role: "viewer" }, { orgId }))
const remove = ({ browser }: Person, target: Person, orgId: string) => browser.action(() => removeMember({ userId: target.userId }, { orgId }))

/** Two changes sent at the same moment: which the server reaches first is not decided. */
const AT_ONCE: [what: string, changes: (workspace: Workspace) => Promise<unknown>[]][] = [
  ["both Admins leave", ({ orgId, first, second }) => [leave(first, orgId), leave(second, orgId)]],
  ["each Admin makes the other a Viewer", ({ orgId, first, second }) => [demote(first, second, orgId), demote(second, first, orgId)]],
  ["each Admin removes the other", ({ orgId, first, second }) => [remove(first, second, orgId), remove(second, first, orgId)]],
  ["an Admin leaves and makes the other a Viewer", ({ orgId, first, second }) => [leave(first, orgId), demote(first, second, orgId)]],
  ["an Admin leaves and removes the other", ({ orgId, first, second }) => [leave(first, orgId), remove(first, second, orgId)]],
  ["an Admin makes the other a Viewer, who removes them", ({ orgId, first, second }) => [demote(first, second, orgId), remove(second, first, orgId)]],
]

it.each(AT_ONCE)("keeps one Admin when %s at once", async (_what, changes) => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  for (let round = 0; round < 4; round++) {
    const workspace = await twoAdmins()
    await Promise.all(changes(workspace))
    expect(await adminsOf(workspace.orgId)).toHaveLength(1)
  }
}, 30_000)

it("refuses the second Admin leaving in the only-Admin words", async () => {
  const { orgId, first, second } = await twoAdmins()
  const answers = await Promise.all([leave(first, orgId), leave(second, orgId)])
  expect(answers.filter((answer) => answer.ok)).toHaveLength(1)
  const refused = answers.find((answer) => !answer.ok) as { code?: string }
  expect(authErrorCopy(refused.code)).toBe("You’re the only Admin. Make someone else an Admin before you leave.")
})

/** People in the workspace who never act: their rows only. */
async function seated(orgId: string, count: number): Promise<string[]> {
  return Promise.all(Array.from({ length: count }, async () => {
    const userId = `user_${randomUUID()}`
    await connection`insert into profiles (id, full_name, email) values (${userId}, 'Seated', ${`${userId}@${domain}`})`
    await connection`insert into member (id, organization_id, user_id, role, created_at) values (${randomUUID()}, ${orgId}, ${userId}, 'guest', now())`
    return userId
  }))
}

// Each turn holds one of the server's 8 database connections while Better Auth's call takes another.
it("finishes more changes at once than the server has database connections, in one workspace and in several", async () => {
  const workspaces = await Promise.all(Array.from({ length: 10 }, async (_, at) => {
    const admin = await signedIn(outbound, `busy-${at}`)
    const orgId = await createWorkspace(admin.browser)
    return { admin, orgId, people: await seated(orgId, at === 0 ? 12 : 1) }
  }))
  const answers = await Promise.all(workspaces.flatMap(({ admin, orgId, people }) =>
    people.map((userId) => admin.browser.action(() => removeMember({ userId }, { orgId })))))
  expect(answers).toEqual(Array.from({ length: 21 }, () => ({ ok: true })))
}, 30_000)

// Two servers share only the database.
it("keeps one Admin when the changes reach two servers", async () => {
  for (let round = 0; round < 4; round++) {
    const { orgId, first, second } = await twoAdmins()
    vi.resetModules()
    const otherServer = await import("./workspace-actions")
    expect(otherServer.leaveWorkspace).not.toBe(leaveWorkspace)
    await Promise.all([leave(first, orgId), second.browser.action(() => otherServer.leaveWorkspace({ orgId }))])
    expect(await adminsOf(orgId)).toHaveLength(1)
  }
}, 30_000)
