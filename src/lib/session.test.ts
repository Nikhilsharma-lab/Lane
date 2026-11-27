/**
 * The session seam on Better Auth (#387, spec #383; the read itself is #374's). Sessions and workspaces are made
 * through Better Auth as the app makes them, on a local lane_test database; the seam gets the browser's cookies, and
 * the headers the proxy adds, as Next hands them to server code.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { queryCounter } from "@/db"
import { AuthBrowser, authRouteTestFile, doorChangeRole, doorData, doorRemove, fakeOutbound, switchOnAuthRoute, type Outbound } from "@/test/auth-route-browser"
import { RETURN_ADDRESS_HEADER } from "./auth-return-address"
import { readAccount, readSession, sendToSignIn } from "./session"

const { connection, signedIn, createWorkspace, join } = authRouteTestFile("session.test")
const SESSION_COOKIE = "better-auth.session_token"

let outbound: Outbound
beforeEach(() => {
  switchOnAuthRoute()
  outbound = fakeOutbound()
})

const read = (browser: AuthBrowser) => browser.action(() => readSession())

describe("the session read", () => {
  it("returns the person, their active workspace and their Lane role, in one query", async () => {
    const admin = await signedIn(outbound, "admin")
    const workspaceId = await createWorkspace(admin.browser)

    const { result, statements } = await queryCounter.measure(() => read(admin.browser))
    expect(result).toEqual({ userId: admin.userId, orgId: workspaceId, role: "admin" })
    expect(statements).toBe(1)
  })

  describe("is null", () => {
    it("without a session cookie, and without a query", async () => {
      const { result, statements } = await queryCounter.measure(() => read(new AuthBrowser()))
      expect(result).toBeNull()
      expect(statements).toBe(0)
    })

    it("when the cookie's signature has been tampered with", async () => {
      const { browser } = await signedIn(outbound, "tampered")
      const [token, signature] = decodeURIComponent(browser.cookies.get(SESSION_COOKIE)!).split(".")
      const forged = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`
      browser.cookies.set(SESSION_COOKIE, encodeURIComponent(`${token}.${forged}`))
      expect(await read(browser)).toBeNull()

      browser.cookies.set(SESSION_COOKIE, encodeURIComponent(token))
      expect(await read(browser)).toBeNull()
    })

    it("for a signed cookie whose session no longer exists", async () => {
      const { browser } = await signedIn(outbound, "signed-out")
      const cookie = browser.cookies.get(SESSION_COOKIE)!
      expect((await browser.post("/sign-out")).status).toBe(200)
      browser.cookies.set(SESSION_COOKIE, cookie)
      expect(await read(browser)).toBeNull()
    })

    it("once the session has expired", async () => {
      const { browser, userId } = await signedIn(outbound, "expired")
      await createWorkspace(browser)
      await connection`update session set expires_at = now() - interval '1 second' where user_id = ${userId}`
      expect(await read(browser)).toBeNull()
    })

    it("while the Better Auth server is switched off", async () => {
      const { browser } = await signedIn(outbound, "switched-off")
      vi.stubEnv("BETTER_AUTH_SECRET", "")
      expect(await read(browser)).toBeNull()
    })
  })

  describe("the workspace a session is in", () => {
    const setActive = async (userId: string, workspaceId: string | null) => {
      await connection`update session set active_organization_id = ${workspaceId} where user_id = ${userId}`
    }
    const setLastUsed = async (userId: string, workspaceId: string | null) => {
      await connection`update profiles set last_workspace_id = ${workspaceId} where id = ${userId}`
    }
    /** A person in three workspaces: Guest in the oldest, Viewer in the next, Admin in the newest; none active or last used. */
    async function inThreeWorkspaces(label: string) {
      const person = await signedIn(outbound, label)
      // Created newest first, so the order of the rows is not the order of the memberships.
      const [newest, middle, oldest] = [await createWorkspace(person.browser), await createWorkspace(person.browser), await createWorkspace(person.browser)]
      const joined = (workspaceId: string, role: string, at: string) =>
        connection`update member set role = ${role}, created_at = ${at} where user_id = ${person.userId} and organization_id = ${workspaceId}`
      await joined(oldest, "guest", "2026-01-01T00:00:00Z")
      await joined(middle, "viewer", "2026-02-01T00:00:00Z")
      await joined(newest, "admin", "2026-03-01T00:00:00Z")
      await setActive(person.userId, null)
      await setLastUsed(person.userId, null)
      const leave = (workspaceId: string) => connection`delete from member where user_id = ${person.userId} and organization_id = ${workspaceId}`
      return { ...person, oldest, middle, newest, leave }
    }

    it("is the active workspace before the last-used one", async () => {
      const { browser, userId, middle, newest } = await inThreeWorkspaces("active-first")
      await setActive(userId, newest)
      await setLastUsed(userId, middle)
      expect(await read(browser)).toEqual({ userId, orgId: newest, role: "admin" })
    })

    it("is the last-used workspace when none is active", async () => {
      const { browser, userId, middle } = await inThreeWorkspaces("last-used")
      await setLastUsed(userId, middle)
      expect(await read(browser)).toEqual({ userId, orgId: middle, role: "viewer" })
    })

    it("is the oldest membership when none is active or last used", async () => {
      const { browser, userId, oldest } = await inThreeWorkspaces("oldest")
      expect(await read(browser)).toEqual({ userId, orgId: oldest, role: "guest" })
    })

    it("is none, with no role, without a membership", async () => {
      const { browser, userId } = await signedIn(outbound, "no-workspace")
      expect(await read(browser)).toEqual({ userId, orgId: null, role: null })
    })

    it("skips an active workspace without a member row for the last-used one", async () => {
      const { browser, userId, middle, newest, leave } = await inThreeWorkspaces("active-left")
      await setActive(userId, newest)
      await setLastUsed(userId, middle)
      await leave(newest)
      expect(await read(browser)).toEqual({ userId, orgId: middle, role: "viewer" })
    })

    it("skips an active and a last-used workspace without member rows for the oldest membership", async () => {
      const { browser, userId, oldest, middle, newest, leave } = await inThreeWorkspaces("both-left")
      await setActive(userId, newest)
      await setLastUsed(userId, middle)
      await leave(newest)
      await leave(middle)
      expect(await read(browser)).toEqual({ userId, orgId: oldest, role: "guest" })
    })

    it("never uses someone else's membership in the active or last-used workspace", async () => {
      const owner = await inThreeWorkspaces("stranger-owner")
      const stranger = await signedIn(outbound, "stranger")
      await setActive(stranger.userId, owner.newest)
      await setLastUsed(stranger.userId, owner.middle)
      expect(await read(stranger.browser)).toEqual({ userId: stranger.userId, orgId: null, role: null })
    })

    it("is found in one query, whichever step answers", async () => {
      const { browser, userId, middle, newest, leave } = await inThreeWorkspaces("one-query")
      const statements = async () => (await queryCounter.measure(() => read(browser))).statements
      await setActive(userId, newest)
      await setLastUsed(userId, middle)
      expect(await statements()).toBe(1)
      await leave(newest)
      expect(await statements()).toBe(1)
      await leave(middle)
      expect(await statements()).toBe(1)
      await connection`delete from member where user_id = ${userId}`
      expect(await statements()).toBe(1)
    })
  })

  it("stops trusting the active workspace once the person is removed from it", async () => {
    const admin = await signedIn(outbound, "remover")
    const workspaceId = await createWorkspace(admin.browser)
    const removed = await join(outbound, admin.browser, "member")
    expect(await read(removed.browser)).toEqual({ userId: removed.userId, orgId: workspaceId, role: "member" })

    doorData(await doorRemove(admin.browser, { memberIdOrEmail: removed.memberId }))
    // Better Auth leaves the removed person's session pointing at the workspace.
    expect((await connection`select active_organization_id from session where user_id = ${removed.userId}`)[0].active_organization_id).toBe(workspaceId)
    expect(await read(removed.browser)).toEqual({ userId: removed.userId, orgId: null, role: null })
  })

  it("has no role for a member row whose role Lane doesn't know", async () => {
    const admin = await signedIn(outbound, "unknown-role")
    const workspaceId = await createWorkspace(admin.browser)
    await connection`update member set role = 'owner' where user_id = ${admin.userId}`
    expect(await read(admin.browser)).toEqual({ userId: admin.userId, orgId: workspaceId, role: null })
  })

  it("shows a role change on the next read", async () => {
    const admin = await signedIn(outbound, "changer")
    const workspaceId = await createWorkspace(admin.browser)
    const guest = await join(outbound, admin.browser, "guest")
    expect(await read(guest.browser)).toEqual({ userId: guest.userId, orgId: workspaceId, role: "guest" })

    doorData(await doorChangeRole(admin.browser, { memberId: guest.memberId, role: "viewer" }))
    expect(await read(guest.browser)).toEqual({ userId: guest.userId, orgId: workspaceId, role: "viewer" })
  })

  it("doesn't renew the session, even one old enough for Better Auth to renew", async () => {
    const { browser, userId } = await signedIn(outbound, "renewal")
    // Six days into seven, past Better Auth's one-day update age.
    await connection`update session set expires_at = date_trunc('second', now()) + interval '1 day' where user_id = ${userId}`
    const expiry = async () => (await connection`select expires_at, updated_at from session where user_id = ${userId}`)[0]
    const before = await expiry()

    expect(await read(browser)).toEqual({ userId, orgId: null, role: null })
    expect(await expiry()).toEqual(before)
  })

  it("reads the __Secure- cookie Better Auth sets when its URL is https", async () => {
    const admin = await signedIn(outbound, "secure")
    const workspaceId = await createWorkspace(admin.browser)
    const cookie = admin.browser.cookies.get(SESSION_COOKIE)!
    admin.browser.cookies.delete(SESSION_COOKIE)
    admin.browser.cookies.set(`__Secure-${SESSION_COOKIE}`, cookie)
    expect(await read(admin.browser)).toEqual({ userId: admin.userId, orgId: workspaceId, role: "admin" })
  })
})

describe("the signed-in account", () => {
  const account = (browser: AuthBrowser) => browser.action(() => readAccount())

  it("is the person's name and email from their profile, with no image", async () => {
    const { browser, person } = await signedIn(outbound, "account")
    expect(await account(browser)).toEqual({ name: person.name, email: person.email })
  })

  it("is null for anyone signed out", async () => {
    expect(await account(new AuthBrowser())).toBeNull()
  })
})

describe("sending a signed-out visitor to sign in", () => {
  async function sentTo(address?: string) {
    const headers: Record<string, string> = address === undefined ? {} : { [RETURN_ADDRESS_HEADER]: address }
    const error = await new AuthBrowser().action(() => sendToSignIn(), headers).catch((thrown: { digest: string }) => thrown)
    return error.digest.split(";")[2]
  }

  it("keeps the page they opened, with its query, as the return address", async () => {
    expect(await sentTo("/requests/LAN-7?view=board&item=1")).toBe("/login?redirect_url=%2Frequests%2FLAN-7%3Fview%3Dboard%26item%3D1")
  })

  it("needs no return address for Lane's home, or when the proxy named no page", async () => {
    expect(await sentTo("/")).toBe("/login")
    expect(await sentTo()).toBe("/login")
  })

  it.each(["https://x", "//x", "/\\x"])("never returns to another site: %s", async (address) => {
    expect(await sentTo(address)).toBe("/login")
  })
})
