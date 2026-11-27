/**
 * #394 (spec #383, stories 43 to 52): Settings → Profile's account section through the real auth route, the session
 * seam and Lane's server door, on a local lane_test database. Each browser is a person's; a Server Action runs as them.
 */
import { randomUUID } from "node:crypto"
import { beforeEach, describe, expect, it } from "vitest"
import { authErrorCopy } from "@/lib/auth-error-copy"
import { loadSignInMethods } from "@/lib/data/sign-in-methods"
import { readAccount, readSession, readSignedInDevices } from "@/lib/session"
import { AuthBrowser, authRouteTestFile, codeOf, fakeOutbound, googleErrorOf, signIn, signInWithGoogle, switchOnAuthRoute, type Outbound, type TestPerson } from "@/test/auth-route-browser"
import { switchWorkspace } from "@/app/(app)/workspace-actions"
import { setFirstPassword, signOutDevice, signOutOtherDevices } from "./account-actions"

const { connection, person, signedIn, createWorkspace } = authRouteTestFile("account-actions.test")
const NEW_PASSWORD = "lane-a-new-password-1"
const PHONE = { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" }

let outbound: Outbound
beforeEach(() => {
  switchOnAuthRoute()
  outbound = fakeOutbound()
})

const isSignedIn = (browser: AuthBrowser) => browser.action(async () => (await readSession()) !== null)
const devicesOf = (browser: AuthBrowser) => browser.action(() => readSignedInDevices())
const tokensOf = async (userId: string) => (await connection`select token from session where user_id = ${userId}`).map((row) => row.token as string)

/** A person with a password, in their own workspace. */
async function withPassword(label: string) {
  const someone = await signedIn(outbound, label)
  return { ...someone, orgId: await createWorkspace(someone.browser) }
}

/** A person who only ever signed in with Google, in their own workspace. */
async function googleOnly(label: string) {
  const someone = person(label)
  const browser = new AuthBrowser()
  expect(googleErrorOf(await signInWithGoogle(browser, outbound, googleAccount(someone)))).toBeNull()
  const orgId = await createWorkspace(browser)
  const userId = (await browser.action(() => readSession()))!.userId
  return { person: someone, browser, userId, orgId }
}
const googleAccount = (someone: TestPerson) => ({ sub: `google-${randomUUID()}`, email: someone.email, email_verified: true, name: someone.name })

/** The person signed in again, in a second browser. */
async function anotherDevice(someone: TestPerson, headers: Record<string, string> = PHONE) {
  const browser = new AuthBrowser()
  expect((await browser.post("/sign-in/email", { email: someone.email, password: someone.password }, headers)).status).toBe(200)
  return browser
}

describe("the ways a person signs in", () => {
  it("are password only, Google only, or both", async () => {
    const password = await withPassword("password")
    const google = await googleOnly("google")
    const both = await withPassword("both")
    await signInWithGoogle(new AuthBrowser(), outbound, googleAccount(both.person))

    expect(await loadSignInMethods(password.userId)).toEqual({ password: true, google: false })
    expect(await loadSignInMethods(google.userId)).toEqual({ password: false, google: true })
    expect(await loadSignInMethods(both.userId)).toEqual({ password: true, google: true })
  })
})

describe("setting a first password", () => {
  it("lets a Google-only person set one, once, and sign in with it", async () => {
    const { browser, userId, orgId, person: someone } = await googleOnly("first")

    expect(await browser.action(() => setFirstPassword(NEW_PASSWORD, { orgId }))).toEqual({ ok: true })
    expect(await loadSignInMethods(userId)).toEqual({ password: true, google: true })
    expect((await signIn(new AuthBrowser(), { email: someone.email, password: NEW_PASSWORD })).status).toBe(200)

    expect(await browser.action(() => setFirstPassword("lane-a-second-password-2", { orgId }))).toEqual({ ok: false, code: "PASSWORD_ALREADY_SET" })
    expect((await signIn(new AuthBrowser(), { email: someone.email, password: NEW_PASSWORD })).status).toBe(200)
  })

  it("refuses someone who has one, and keeps theirs", async () => {
    const { browser, orgId, person: someone } = await withPassword("has-one")
    const refused = await browser.action(() => setFirstPassword(NEW_PASSWORD, { orgId }))
    expect(refused).toEqual({ ok: false, code: "PASSWORD_ALREADY_SET" })
    expect(authErrorCopy("PASSWORD_ALREADY_SET")).toBe("Your account already has a password. Reload the page to change it.")
    expect((await signIn(new AuthBrowser(), someone)).status).toBe(200)
  })

  it.each([
    ["too short", "short", "PASSWORD_TOO_SHORT"],
    ["too long", "x".repeat(129), "PASSWORD_TOO_LONG"],
  ])("refuses one that is %s", async (_why, password, code) => {
    const { browser, userId, orgId } = await googleOnly("length")
    expect(await browser.action(() => setFirstPassword(password, { orgId }))).toEqual({ ok: false, code })
    expect(await loadSignInMethods(userId)).toEqual({ password: false, google: true })
  })

  it("refuses a breached one, and writes nothing", async () => {
    const breached = "lane-breached-password-1"
    outbound.breached.add(breached)
    const { browser, userId, orgId, person: someone } = await googleOnly("breached")
    expect(await browser.action(() => setFirstPassword(breached, { orgId }))).toEqual({ ok: false, code: "PASSWORD_COMPROMISED" })
    expect(await loadSignInMethods(userId)).toEqual({ password: false, google: true })
    expect((await signIn(new AuthBrowser(), { email: someone.email, password: breached })).status).toBe(401)
    // Another one still works.
    expect(await browser.action(() => setFirstPassword(NEW_PASSWORD, { orgId }))).toEqual({ ok: true })
  })

  it.each([
    ["a 5xx", () => new Response("", { status: 503 })],
    ["a thrown fetch", () => Promise.reject(new TypeError("fetch failed"))],
    ["no answer at all", () => new Promise<never>(() => {})],
  ])("refuses any while Have I Been Pwned can't be reached (%s), and writes nothing", async (_outage, answer) => {
    const { browser, userId, orgId } = await googleOnly("hibp-down")
    outbound.hibp = answer
    const started = Date.now()
    expect(await browser.action(() => setFirstPassword(NEW_PASSWORD, { orgId }))).toEqual({ ok: false, code: "PASSWORD_CHECK_UNAVAILABLE" })
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(await loadSignInMethods(userId)).toEqual({ password: false, google: true })
  })

  it("needs the page's workspace to be the session's, and a session", async () => {
    const { browser, userId, orgId } = await googleOnly("guarded")
    const other = await withPassword("guarded-other")
    expect(await browser.action(() => setFirstPassword(NEW_PASSWORD, { orgId: other.orgId }))).toEqual({ ok: false, code: "WORKSPACE_NOT_OPEN" })
    expect(await new AuthBrowser().action(() => setFirstPassword(NEW_PASSWORD, { orgId }))).toEqual({ ok: false, code: "UNAUTHORIZED" })
    expect(await loadSignInMethods(userId)).toEqual({ password: false, google: true })
  })

  it("only ever sets the session's person's, whoever the caller names", async () => {
    const { browser, userId, orgId } = await googleOnly("own")
    const victim = await googleOnly("victim")
    const forged = setFirstPassword as unknown as (password: string, context: object) => ReturnType<typeof setFirstPassword>
    expect(await browser.action(() => forged(NEW_PASSWORD, { orgId, userId: victim.userId }))).toEqual({ ok: true })
    expect(await loadSignInMethods(userId)).toEqual({ password: true, google: true })
    expect(await loadSignInMethods(victim.userId)).toEqual({ password: false, google: true })
  })
})

describe("changing the password", () => {
  it("ends the other sessions with the box ticked, and keeps this one", async () => {
    const { browser, person: someone, orgId } = await withPassword("ticked")
    const phone = await anotherDevice(someone)
    expect((await browser.post("/change-password", { currentPassword: someone.password, newPassword: NEW_PASSWORD, revokeOtherSessions: true })).status).toBe(200)

    expect([await isSignedIn(browser), await isSignedIn(phone)]).toEqual([true, false])
    expect((await browser.action(() => readSession()))?.orgId).toBe(orgId)
    expect(await devicesOf(browser)).toHaveLength(1)
  })

  // Better Auth makes this device a new session, in no workspace, so on its own it opens the last-used one. The page
  // then opens its own again (account-callbacks.ts).
  it("opens the page's workspace again, though another device last used another one", async () => {
    const { browser, person: someone, orgId } = await withPassword("stays")
    const phone = await anotherDevice(someone)
    const elsewhere = await createWorkspace(phone)
    await phone.action(() => switchWorkspace(elsewhere))
    expect((await browser.post("/change-password", { currentPassword: someone.password, newPassword: NEW_PASSWORD, revokeOtherSessions: true })).status).toBe(200)

    expect(await browser.action(() => switchWorkspace(orgId))).toEqual({ ok: true })
    expect((await browser.action(() => readSession()))?.orgId).toBe(orgId)
  })

  it("keeps the other sessions with the box unticked", async () => {
    const { browser, person: someone } = await withPassword("unticked")
    const phone = await anotherDevice(someone)
    expect((await browser.post("/change-password", { currentPassword: someone.password, newPassword: NEW_PASSWORD, revokeOtherSessions: false })).status).toBe(200)
    expect([await isSignedIn(browser), await isSignedIn(phone)]).toEqual([true, true])
  })
})

describe("Google", () => {
  async function connect(browser: AuthBrowser, profile: Parameters<typeof signInWithGoogle>[2]) {
    outbound.google = profile
    const start = await browser.post("/link-social", { provider: "google", callbackURL: "/settings/profile", errorCallbackURL: "/settings/profile" })
    const state = new URL((start.body as { url: string }).url).searchParams.get("state")
    return browser.get(`/callback/google?code=lane-test-code&state=${state}`)
  }
  const googleRow = async (userId: string) => (await connection`select id from account where user_id = ${userId} and provider_id = 'google'`)[0]?.id as string
  const pathOf = (location: string | null) => new URL(location!, "http://localhost:3000").pathname

  it("connects and returns to Settings → Profile", async () => {
    const { browser, userId, person: someone } = await withPassword("connect")
    const back = await connect(browser, googleAccount(someone))
    expect([pathOf(back.location), googleErrorOf(back)]).toEqual(["/settings/profile", null])
    expect(await loadSignInMethods(userId)).toEqual({ password: true, google: true })
  })

  it("returns there with the error when the Google account has another email, and changes nothing", async () => {
    const { browser, userId } = await withPassword("mismatch")
    const back = await connect(browser, googleAccount(person("someone-else")))
    expect([pathOf(back.location), googleErrorOf(back)]).toEqual(["/settings/profile", "email_does_not_match"])
    expect(await loadSignInMethods(userId)).toEqual({ password: true, google: false })
  })

  it("can be disconnected with a password, and never as the only method", async () => {
    const both = await withPassword("disconnect")
    await connect(both.browser, googleAccount(both.person))
    expect((await both.browser.post("/unlink-account", { accountId: await googleRow(both.userId) })).status).toBe(200)
    expect(await loadSignInMethods(both.userId)).toEqual({ password: true, google: false })

    const only = await googleOnly("only")
    const refused = await only.browser.post("/unlink-account", { accountId: await googleRow(only.userId) })
    expect(codeOf(refused)).toBe("FAILED_TO_UNLINK_LAST_ACCOUNT")
    expect(authErrorCopy(codeOf(refused))).toBe("Google is your only sign-in method. Set a password before disconnecting it.")
    expect(await loadSignInMethods(only.userId)).toEqual({ password: false, google: true })
  })

  // Better Auth asks for a sign-in from the last day before it disconnects anything.
  it("can't be disconnected from a sign-in more than a day old, and says to sign in again", async () => {
    const { browser, userId, person: someone } = await withPassword("stale")
    await connect(browser, googleAccount(someone))
    await connection`update session set created_at = now() - interval '25 hours' where user_id = ${userId}`
    const refused = await browser.post("/unlink-account", { accountId: await googleRow(userId) })
    expect(codeOf(refused)).toBe("SESSION_NOT_FRESH")
    expect(authErrorCopy(codeOf(refused))).toBe("You signed in more than a day ago. Sign out and sign in again, then try this again.")
    expect(await loadSignInMethods(userId)).toEqual({ password: true, google: true })
  })
})

describe("renaming yourself", () => {
  it("shows in the next read of profiles", async () => {
    const { browser, userId } = await withPassword("rename")
    expect((await browser.post("/update-user", { name: "Wren Renamed" })).status).toBe(200)
    expect((await connection`select full_name from profiles where id = ${userId}`)[0].full_name).toBe("Wren Renamed")
    expect((await browser.action(() => readAccount()))?.name).toBe("Wren Renamed")
  })
})

describe("the signed-in devices read", () => {
  it("is the session's person's unexpired sessions, this device first, with no token or address", async () => {
    const { browser, userId, person: someone } = await withPassword("reader")
    await anotherDevice(someone)
    const expired = await anotherDevice(someone, { "user-agent": "Expired" })
    await connection`update session set expires_at = now() - interval '1 minute' where user_id = ${userId} and user_agent = 'Expired'`
    await withPassword("stranger")

    const devices = (await devicesOf(browser))!
    expect(devices.map(({ current, userAgent }) => [current, userAgent?.includes("iPhone") ?? false])).toEqual([[true, false], [false, true]])
    for (const device of devices) {
      expect(Object.keys(device).sort()).toEqual(["current", "id", "lastUsedAt", "signedInAt", "userAgent"])
      expect([device.signedInAt, device.lastUsedAt].every((at) => at instanceof Date)).toBe(true)
    }
    const sent = JSON.stringify(devices)
    for (const secret of [...(await tokensOf(userId)), browser.ip]) expect(sent).not.toContain(secret)
    expect(await devicesOf(expired)).toBeNull()
  })

  it("is nothing for a signed-out visitor or a forged cookie", async () => {
    expect(await devicesOf(new AuthBrowser())).toBeNull()
    const { userId } = await withPassword("forged")
    const forger = new AuthBrowser()
    forger.cookies.set("better-auth.session_token", `${(await tokensOf(userId))[0]}.${"A".repeat(43)}%3D`)
    expect(await devicesOf(forger)).toBeNull()
  })
})

describe("signing out devices", () => {
  it("ends one of the person's other sessions, by its id, and answers nothing else", async () => {
    const { browser, person: someone, orgId } = await withPassword("one")
    const phone = await anotherDevice(someone)
    const laptop = await anotherDevice(someone, { "user-agent": "Laptop" })
    const other = (await devicesOf(browser))!.find((device) => device.userAgent?.includes("iPhone"))!

    expect(await browser.action(() => signOutDevice(other.id, { orgId }))).toEqual({ ok: true })
    expect([await isSignedIn(browser), await isSignedIn(phone), await isSignedIn(laptop)]).toEqual([true, false, true])
    expect(await browser.action(() => signOutDevice(other.id, { orgId }))).toEqual({ ok: false, code: "DEVICE_NOT_FOUND" })
    expect(authErrorCopy("DEVICE_NOT_FOUND")).toBe("This device is already signed out. Reload the page to see where you’re signed in now.")
  })

  it("refuses another person's session id, and ends nothing", async () => {
    const { browser, orgId } = await withPassword("attacker")
    const victim = await withPassword("victim")
    const theirs = (await devicesOf(victim.browser))![0]
    for (const sent of [theirs.id, (await tokensOf(victim.userId))[0], randomUUID(), undefined, null, { id: theirs.id }])
      expect(await browser.action(() => signOutDevice(sent as string, { orgId }))).toEqual({ ok: false, code: "DEVICE_NOT_FOUND" })
    expect([await isSignedIn(browser), await isSignedIn(victim.browser)]).toEqual([true, true])
  })

  it("ends all the person's others and keeps this one, and no one else's", async () => {
    const { browser, person: someone, orgId } = await withPassword("others")
    const others = [await anotherDevice(someone), await anotherDevice(someone)]
    const stranger = await withPassword("others-stranger")
    expect(await browser.action(() => signOutOtherDevices({ orgId }))).toEqual({ ok: true })
    expect(await Promise.all([browser, ...others, stranger.browser].map(isSignedIn))).toEqual([true, false, false, true])
    expect(await devicesOf(browser)).toHaveLength(1)
  })

  it("needs the page's workspace to be the session's, and a session", async () => {
    const { browser, person: someone, orgId } = await withPassword("device-guard")
    const phone = await anotherDevice(someone)
    const elsewhere = await withPassword("device-guard-other")
    const phoneId = (await devicesOf(browser))!.find((device) => !device.current)!.id
    for (const refused of [() => signOutDevice(phoneId, { orgId: elsewhere.orgId }), () => signOutOtherDevices({ orgId: elsewhere.orgId })])
      expect(await browser.action(refused)).toEqual({ ok: false, code: "WORKSPACE_NOT_OPEN" })
    for (const refused of [() => signOutDevice(phoneId, { orgId }), () => signOutOtherDevices({ orgId })])
      expect(await new AuthBrowser().action(refused)).toEqual({ ok: false, code: "UNAUTHORIZED" })
    expect(await isSignedIn(phone)).toBe(true)
  })
})
