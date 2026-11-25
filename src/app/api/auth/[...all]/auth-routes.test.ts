/**
 * What of Better Auth a browser can reach at `/api/auth` (Nikhil on #349, 2026-11-25): what Lane's browser auth client
 * calls, and nothing else. Every workspace change and session change of Lane's goes through a guarded Server Action. The
 * routes are read from Better Auth's own table, so an upgrade that adds one fails here until it's turned off or listed.
 */
import { beforeEach, describe, expect, it } from "vitest"
import { askAuthServer } from "@/lib/auth-server"
import { WORKSPACE_ROLES } from "@/lib/role-rules"
import { authRouteTestFile, fakeOutbound, switchOnAuthRoute, type AuthAnswer, type AuthBrowser, type Outbound } from "@/test/auth-route-browser"

const { connection, domain, signedIn, createWorkspace, join } = authRouteTestFile("auth-routes.test")

let outbound: Outbound
beforeEach(() => {
  switchOnAuthRoute()
  outbound = fakeOutbound()
})

/** What src/lib/auth-client.ts calls, and where Google's redirect and its error land. */
const FOR_THE_BROWSER = [
  "POST /sign-in/email",
  "POST /sign-in/email-otp",
  "POST /sign-in/social",
  "POST /sign-up/email",
  "POST /sign-out",
  "POST /email-otp/send-verification-otp",
  "POST /email-otp/verify-email",
  "POST /email-otp/request-password-reset",
  "POST /email-otp/reset-password",
  "GET /get-session",
  "POST /get-session",
  "POST /update-user",
  "POST /change-password",
  "POST /link-social",
  "GET /list-accounts",
  "POST /unlink-account",
  "POST /organization/accept-invitation",
  "POST /organization/reject-invitation",
  "GET /callback/:id",
  "POST /callback/:id",
  "GET /error",
]
/**
 * Better Auth turns a path off by its exact text, so it can't turn off one with a parameter. This one opens a password
 * reset link, which Lane never sends (reset is by code), so there is no token it takes.
 */
const CAN_NOT_BE_OFF = ["GET /reset-password/:token"]

type Route = { method: "GET" | "POST"; path: string }
const nameOf = ({ method, path }: Route) => `${method} ${path}`

/** Every route Better Auth would serve, less what runs only on the server. Lane's route file serves GET and POST. */
async function liveRoutes(): Promise<Route[]> {
  const { browser } = await signedIn(outbound, "reader")
  const table = await browser.action(() =>
    askAuthServer(async (api) =>
      Object.values(api as unknown as Record<string, { path?: string; options?: { method?: string | string[]; metadata?: { SERVER_ONLY?: boolean } } }>).map(({ path, options }) => ({ path, method: options?.method, serverOnly: options?.metadata?.SERVER_ONLY })),
    ),
  )
  if (!table.ok) throw new Error("The server door didn't answer")
  return table.data.flatMap(({ path, method, serverOnly }) =>
    path && !serverOnly ? [method ?? "*"].flat().flatMap((each) => (each === "GET" || each === "POST" ? [{ method: each, path }] : [])) : [])
}

const isOff = ({ status, body }: AuthAnswer) => status === 404 && body === "Not Found"
const ask = (browser: AuthBrowser, { method, path }: Route) => browser.call(method, path.replace(/:\w+/g, "x"), method === "POST" ? {} : undefined)

describe("the routes a browser can reach", () => {
  it("are the ones Lane's browser client calls, of every route Better Auth has", async () => {
    const routes = await liveRoutes()
    expect(routes.length).toBeGreaterThan(50)
    expect(FOR_THE_BROWSER.filter((name) => !routes.map(nameOf).includes(name))).toEqual([])

    const { browser } = await signedIn(outbound, "asker")
    await createWorkspace(browser)
    const reachable: string[] = []
    for (const route of routes) if (!isOff(await ask(browser, route))) reachable.push(nameOf(route))
    expect(reachable.sort()).toEqual([...FOR_THE_BROWSER, ...CAN_NOT_BE_OFF].sort())
  })

  it("stay off under another spelling of their address", async () => {
    const admin = await signedIn(outbound, "speller")
    await createWorkspace(admin.browser)
    for (const path of ["/organization/list-members/", "//organization/list-members", "/organization//list-members", "/organization/./list-members", "/x/../organization/list-members", "/organization/%6Cist-members", "/ORGANIZATION/list-members", "/organization/list-members?x=1"])
      expect([path, (await admin.browser.get(path)).status]).toEqual([path, 404])
  })
})

describe("workspaces, asked for at the route itself", () => {
  /** Everything stored about the workspace and its people's sessions. */
  const stored = async (workspaceId: string, userIds: string[]) => ({
    workspace: [...(await connection`select * from organizations where id = ${workspaceId}`)],
    members: [...(await connection`select * from member where organization_id = ${workspaceId} order by id`)],
    invitations: [...(await connection`select * from invitation where organization_id = ${workspaceId} order by id`)],
    theirs: [...(await connection`select id, organization_id from member where user_id in ${connection(userIds)} order by id`)],
    sessions: [...(await connection`select id, token, expires_at, active_organization_id from session where user_id in ${connection(userIds)} order by id`)],
    sent: outbound.emails().length,
  })

  it("refuses a Guest, a Viewer, a Member and an Admin alike: nothing is told and nothing changes", async () => {
    const admin = await signedIn(outbound, "admin")
    const workspaceId = await createWorkspace(admin.browser)
    const others = await Promise.all(WORKSPACE_ROLES.map(async (role) => ({ role, ...(await join(outbound, admin.browser, role, `asking-${role}`)) })))
    const target = await join(outbound, admin.browser, "member", "target")
    const waiting = `waiting@${domain}`
    const [{ id: invitationId }] = await connection`insert into invitation (id, organization_id, email, role, status, expires_at, inviter_id) values (${`inv-${workspaceId}`}, ${workspaceId}, ${waiting}, 'guest', 'pending', now() + interval '1 day', ${admin.userId}) returning id`
    const [{ token }] = await connection`select token from session where user_id = ${target.userId} limit 1`
    const people = [admin.userId, target.userId, ...others.map(({ userId }) => userId)]
    const before = await stored(workspaceId, people)

    for (const { role, browser } of others) {
      const of = (path: string) => `/organization/${path}?organizationId=${workspaceId}`
      const answers: Record<string, AuthAnswer> = {
        "list-members": await browser.get(of("list-members")),
        "get-full-organization": await browser.get(of("get-full-organization")),
        list: await browser.get("/organization/list"),
        "list-invitations": await browser.get(of("list-invitations")),
        "get-active-member": await browser.get("/organization/get-active-member"),
        "get-active-member-role": await browser.get("/organization/get-active-member-role"),
        "get-invitation": await browser.get(`/organization/get-invitation?id=${invitationId}`),
        "list-user-invitations": await browser.get("/organization/list-user-invitations"),
        "has-permission": await browser.post("/organization/has-permission", { organizationId: workspaceId, permissions: { member: ["delete"] } }),
        "invite-member": await browser.post("/organization/invite-member", { organizationId: workspaceId, email: `by-${role}@${domain}`, role: "admin" }),
        "update-member-role": await browser.post("/organization/update-member-role", { organizationId: workspaceId, memberId: target.memberId, role: "viewer" }),
        "remove-member": await browser.post("/organization/remove-member", { organizationId: workspaceId, memberIdOrEmail: target.memberId }),
        leave: await browser.post("/organization/leave", { organizationId: workspaceId }),
        "cancel-invitation": await browser.post("/organization/cancel-invitation", { invitationId }),
        "set-active": await browser.post("/organization/set-active", { organizationId: null }),
        create: await browser.post("/organization/create", { name: `Made by ${role}`, slug: `made-by-${role}-${workspaceId}` }),
        "check-slug": await browser.post("/organization/check-slug", { slug: "any" }),
        update: await browser.post("/organization/update", { organizationId: workspaceId, data: { name: `Renamed by ${role}` } }),
        delete: await browser.post("/organization/delete", { organizationId: workspaceId }),
        "list-sessions": await browser.get("/list-sessions"),
        "revoke-session": await browser.post("/revoke-session", { token }),
        "revoke-sessions": await browser.post("/revoke-sessions"),
        "revoke-other-sessions": await browser.post("/revoke-other-sessions"),
        "update-session": await browser.post("/update-session", { activeOrganizationId: null }),
        "get-access-token": await browser.post("/get-access-token", { providerId: "google" }),
        "refresh-token": await browser.post("/refresh-token", { providerId: "google" }),
        "account-info": await browser.get("/account-info"),
      }
      for (const [route, answer] of Object.entries(answers)) expect([role, route, answer.status, answer.body]).toEqual([role, route, 404, "Not Found"])
    }

    expect(await stored(workspaceId, people)).toEqual(before)
  })
})
