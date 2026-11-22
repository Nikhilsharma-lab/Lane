/**
 * #374 (spec #369, seam 2): the dormant session read. Sessions and workspaces are made through `/api/auth/[...all]`
 * as the browser makes them, on a local lane_test database; the read gets the browser's cookies as Next hands them
 * to a page.
 */
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import postgres from "postgres"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { queryCounter } from "@/db"
import { AUTH_ORIGIN, AuthBrowser, fakeOutbound, signIn, signUpVerified, switchOnAuthRoute, type Outbound } from "@/test/auth-route-browser"
import { requireTestDatabase } from "@/test/test-database"
import { readBetterAuthSession } from "./better-auth-session"

requireTestDatabase(process.env.DATABASE_URL)
const connection = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, onnotice: () => {} })
const DOMAIN = "better-auth-session.test"
const SLUG_PREFIX = "better-auth-session-"
const SESSION_COOKIE = "better-auth.session_token"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
afterAll(async () => {
  await connection`delete from organizations where slug like ${SLUG_PREFIX + "%"}`
  await connection`delete from profiles where email like ${"%@" + DOMAIN}`
  await connection`delete from verification where identifier like ${"%@" + DOMAIN}`
  await connection.end()
})

let outbound: Outbound
beforeEach(() => {
  switchOnAuthRoute()
  outbound = fakeOutbound()
})

const person = (label: string) => ({ email: `${label}-${randomUUID().slice(0, 8)}@${DOMAIN}`, password: "lane-session-read-test-password", name: `Wren ${label}` })

/** A verified person, signed in, in their own browser. */
async function signedIn(label: string) {
  const someone = person(label)
  const browser = await signUpVerified(outbound, someone)
  const answer = await signIn(browser, someone)
  if (answer.status !== 200) throw new Error(`Sign-in answered ${answer.status}`)
  const userId = (answer.body as { user: { id: string } }).user.id
  return { browser, userId }
}

/** Creates a workspace from the browser. It becomes the browser's active workspace. */
async function createWorkspace(browser: AuthBrowser) {
  const answer = await browser.post("/organization/create", { name: "Wren's studio", slug: `${SLUG_PREFIX}${randomUUID().slice(0, 8)}` })
  if (answer.status !== 200) throw new Error(`Creating a workspace answered ${answer.status}: ${JSON.stringify(answer.body)}`)
  return (answer.body as { id: string }).id
}

/** A new person, invited by the Admin as `role` and accepted. The workspace becomes their active one. */
async function join(admin: AuthBrowser, role: string) {
  const joiner = await signedIn(role)
  const email = (await connection`select email from profiles where id = ${joiner.userId}`)[0].email as string
  const invited = await admin.post("/organization/invite-member", { email, role })
  if (invited.status !== 200) throw new Error(`Inviting answered ${invited.status}: ${JSON.stringify(invited.body)}`)
  const accepted = await joiner.browser.post("/organization/accept-invitation", { invitationId: (invited.body as { id: string }).id })
  if (accepted.status !== 200) throw new Error(`Accepting answered ${accepted.status}: ${JSON.stringify(accepted.body)}`)
  return { ...joiner, memberId: (accepted.body as { member: { id: string } }).member.id }
}

/** The browser's cookies as a page reads them from Next, parsed from the Cookie header it would send. */
const cookiesOf = (browser: AuthBrowser) =>
  new NextRequest(`${AUTH_ORIGIN}/requests`, { headers: { cookie: [...browser.cookies].map(([name, value]) => `${name}=${value}`).join("; ") } }).cookies

const read = (browser: AuthBrowser) => readBetterAuthSession(cookiesOf(browser))

describe("the dormant session read", () => {
  it("returns the person, their active workspace and their Lane role, in one query", async () => {
    const admin = await signedIn("admin")
    const workspaceId = await createWorkspace(admin.browser)

    const { result, statements } = await queryCounter.measure(() => read(admin.browser))
    expect(result).toEqual({ userId: admin.userId, orgId: workspaceId, role: "admin" })
    expect(statements).toBe(1)
  })

  describe("is null", () => {
    it("without a session cookie", async () => {
      expect(await read(new AuthBrowser())).toBeNull()
    })

    it("when the cookie's signature has been tampered with", async () => {
      const { browser } = await signedIn("tampered")
      const [token, signature] = decodeURIComponent(browser.cookies.get(SESSION_COOKIE)!).split(".")
      const forged = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`
      browser.cookies.set(SESSION_COOKIE, encodeURIComponent(`${token}.${forged}`))
      expect(await read(browser)).toBeNull()

      browser.cookies.set(SESSION_COOKIE, encodeURIComponent(token))
      expect(await read(browser)).toBeNull()
    })

    it("for a signed cookie whose session no longer exists", async () => {
      const { browser } = await signedIn("signed-out")
      const cookie = browser.cookies.get(SESSION_COOKIE)!
      expect((await browser.post("/sign-out")).status).toBe(200)
      browser.cookies.set(SESSION_COOKIE, cookie)
      expect(await read(browser)).toBeNull()
    })

    it("once the session has expired", async () => {
      const { browser, userId } = await signedIn("expired")
      await createWorkspace(browser)
      await connection`update session set expires_at = now() - interval '1 second' where user_id = ${userId}`
      expect(await read(browser)).toBeNull()
    })

    it("while the Better Auth server is switched off", async () => {
      const { browser } = await signedIn("switched-off")
      vi.stubEnv("BETTER_AUTH_SECRET", "")
      expect(await read(browser)).toBeNull()
    })
  })

  it("has no workspace or role before the person has an active workspace", async () => {
    const { browser, userId } = await signedIn("no-workspace")
    expect(await read(browser)).toEqual({ userId, orgId: null, role: null })
  })

  it("stops trusting the active workspace once the person is removed from it", async () => {
    const admin = await signedIn("remover")
    const workspaceId = await createWorkspace(admin.browser)
    const removed = await join(admin.browser, "member")
    expect(await read(removed.browser)).toEqual({ userId: removed.userId, orgId: workspaceId, role: "member" })

    expect((await admin.browser.post("/organization/remove-member", { memberIdOrEmail: removed.memberId })).status).toBe(200)
    // Better Auth leaves the removed person's session pointing at the workspace.
    expect((await connection`select active_organization_id from session where user_id = ${removed.userId}`)[0].active_organization_id).toBe(workspaceId)
    expect(await read(removed.browser)).toEqual({ userId: removed.userId, orgId: null, role: null })
  })

  it("has no role for a member row whose role Lane doesn't know", async () => {
    const admin = await signedIn("unknown-role")
    const workspaceId = await createWorkspace(admin.browser)
    await connection`update member set role = 'owner' where user_id = ${admin.userId}`
    expect(await read(admin.browser)).toEqual({ userId: admin.userId, orgId: workspaceId, role: null })
  })

  it("shows a role change on the next read", async () => {
    const admin = await signedIn("changer")
    const workspaceId = await createWorkspace(admin.browser)
    const guest = await join(admin.browser, "guest")
    expect(await read(guest.browser)).toEqual({ userId: guest.userId, orgId: workspaceId, role: "guest" })

    const changed = await admin.browser.post("/organization/update-member-role", { memberId: guest.memberId, role: "viewer" })
    expect(changed.status).toBe(200)
    expect(await read(guest.browser)).toEqual({ userId: guest.userId, orgId: workspaceId, role: "viewer" })
  })

  it("doesn't renew the session, even one old enough for Better Auth to renew", async () => {
    const { browser, userId } = await signedIn("renewal")
    // Six days into seven, past Better Auth's one-day update age.
    await connection`update session set expires_at = date_trunc('second', now()) + interval '1 day' where user_id = ${userId}`
    const expiry = async () => (await connection`select expires_at, updated_at from session where user_id = ${userId}`)[0]
    const before = await expiry()

    expect(await read(browser)).toEqual({ userId, orgId: null, role: null })
    expect(await expiry()).toEqual(before)
  })

  it("reads the __Secure- cookie Better Auth sets when its URL is https", async () => {
    const admin = await signedIn("secure")
    const workspaceId = await createWorkspace(admin.browser)
    const cookie = admin.browser.cookies.get(SESSION_COOKIE)!
    admin.browser.cookies.delete(SESSION_COOKIE)
    admin.browser.cookies.set(`__Secure-${SESSION_COOKIE}`, cookie)
    expect(await read(admin.browser)).toEqual({ userId: admin.userId, orgId: workspaceId, role: "admin" })
  })
})
