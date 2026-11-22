/**
 * #371 (spec #369): `/api/auth/[...all]`, Better Auth's dormant route. While BETTER_AUTH_SECRET is unset it answers
 * 404 and builds nothing. With the secret set inside the test, Requests built as the browser sends them go to the
 * route's GET and POST on a local lane_test database, and only outbound HTTP is faked.
 */
import { randomUUID } from "node:crypto"
import postgres from "postgres"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { queryCounter } from "@/db"
import {
  AuthBrowser,
  HIBP_RANGE_URL,
  TURNSTILE_SITEVERIFY_URL,
  TURNSTILE_TOKEN,
  codesMet,
  fakeOutbound,
  signIn,
  signInWithGoogle,
  signUp,
  signUpVerified,
  switchOnAuthRoute,
  type Outbound,
} from "@/test/auth-route-browser"
import { requireTestDatabase } from "@/test/test-database"

requireTestDatabase(process.env.DATABASE_URL)
const connection = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, onnotice: () => {} })
/** Every error code these tests met, so the last test can check each one has Lane's words. */
const codes = codesMet()
const codeOf = codes.codeOf
const DOMAIN = "auth-route.test"

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
afterAll(async () => {
  await connection`delete from profiles where email like ${"%@" + DOMAIN}`
  await connection`delete from verification where identifier like ${"%@" + DOMAIN}`
  await connection.end()
})

const route = () => import("./route")
const person = (label: string) => ({ email: `${label}-${randomUUID().slice(0, 8)}@${DOMAIN}`, password: "lane-route-test-password", name: "Rae Route" })
const profileOf = async (email: string) => (await connection`select id, full_name, email_verified, role, image from profiles where email = ${email}`)[0]

describe("the auth route while dormant", () => {
  for (const [label, secret] of [["unset", undefined], ["blank", "  "]] as const)
    it(`answers 404 to GET and POST and runs no query with the secret ${label}`, async () => {
      vi.stubEnv("BETTER_AUTH_SECRET", secret)
      const { GET, POST } = await route()
      const { result, statements } = await queryCounter.measure(async () => [
        await GET(new Request("http://localhost:3000/api/auth/get-session")),
        await POST(new Request("http://localhost:3000/api/auth/sign-up/email", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })),
      ])
      expect(result.map((response) => response.status)).toEqual([404, 404])
      expect(statements).toBe(0)
    })
})

describe("the auth route switched on", () => {
  let outbound: Outbound
  beforeEach(() => {
    switchOnAuthRoute()
    outbound = fakeOutbound()
  })

  describe("sign-up by password", () => {
    it("creates an unverified profile labelled Designer and emails exactly one verification code", async () => {
      const rae = person("sign-up")
      const answer = await signUp({ ...rae, role: "pm", plan: "pro" } as typeof rae)
      expect(answer.status).toBe(200)
      expect(await profileOf(rae.email)).toMatchObject({ full_name: "Rae Route", email_verified: false, role: "designer", image: null })
      const emails = outbound.emailsTo(rae.email)
      expect(emails).toHaveLength(1)
      expect(emails[0].subject).toBe("Your Lane verification code")
      expect(emails[0].text).toMatch(/\b\d{6}\b/)
    })

    it("refuses password sign-in until the emailed code is verified, then signs in", async () => {
      const rae = person("verify")
      const browser = new AuthBrowser()
      await signUp(rae, browser)
      const early = await signIn(browser, rae)
      expect([early.status, codeOf(early)]).toEqual([403, "EMAIL_NOT_VERIFIED"])
      expect(browser.cookies.size).toBe(0)

      const verified = await browser.post("/email-otp/verify-email", { email: rae.email, otp: outbound.codeFor(rae.email) })
      expect(verified.status).toBe(200)
      expect(await profileOf(rae.email)).toMatchObject({ email_verified: true })
      const signedIn = await signIn(browser, rae)
      expect(signedIn.status).toBe(200)
      const session = await browser.get("/get-session")
      expect(session.body).toMatchObject({ user: { email: rae.email } })
    })

    it("refuses a wrong password", async () => {
      const rae = person("wrong-password")
      const browser = await signUpVerified(outbound, rae)
      const answer = await signIn(browser, { ...rae, password: "not-the-password" })
      expect([answer.status, codeOf(answer)]).toEqual([401, "INVALID_EMAIL_OR_PASSWORD"])
    })

    it("refuses a 7-character password and a breached one, sending only a 5-character hash prefix to the range API", async () => {
      const short = person("short")
      const tooShort = await signUp({ ...short, password: "seven77" })
      expect([tooShort.status, codeOf(tooShort)]).toEqual([400, "PASSWORD_TOO_SHORT"])

      const breached = person("breached")
      outbound.breached.add(breached.password)
      const answer = await signUp(breached)
      expect([answer.status, codeOf(answer)]).toEqual([400, "PASSWORD_COMPROMISED"])
      for (const email of [short.email, breached.email]) expect(await profileOf(email)).toBeUndefined()
      expect(outbound.emails()).toEqual([])

      const ranges = outbound.callsTo(HIBP_RANGE_URL)
      expect(ranges).toHaveLength(1)
      expect(ranges[0].url).toMatch(/\/range\/[0-9A-F]{5}$/)
      expect(ranges[0].url).not.toContain(breached.password)
      expect(ranges[0].body).toBe("")
    })

    it("refuses an email a Lane account already uses, whatever its case, and sends nothing", async () => {
      const rae = person("taken")
      await signUpVerified(outbound, rae)
      const again = await signUp({ ...rae, email: rae.email.toUpperCase(), password: "another-route-password" })
      expect([again.status, codeOf(again)]).toEqual([422, "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"])
      expect(outbound.emailsTo(rae.email)).toHaveLength(1)
    })
  })

  describe("Turnstile", () => {
    it("refuses sign-up without a token, before anything is created or checked", async () => {
      const rae = person("no-turnstile")
      const answer = await signUp(rae, new AuthBrowser(undefined, false))
      expect([answer.status, codeOf(answer)]).toEqual([400, "MISSING_RESPONSE"])
      expect(await profileOf(rae.email)).toBeUndefined()
      expect(outbound.calls).toEqual([])
    })

    it("checks the sign-up token with Turnstile, and refuses one Turnstile rejects", async () => {
      const rae = person("turnstile-rejects")
      const browser = new AuthBrowser()
      outbound.turnstile = () => Response.json({ success: false, "error-codes": ["invalid-input-response"] })
      const answer = await signUp(rae, browser)
      expect([answer.status, codeOf(answer)]).toEqual([403, "VERIFICATION_FAILED"])
      expect(JSON.parse(outbound.callsTo(TURNSTILE_SITEVERIFY_URL)[0].body)).toMatchObject({ response: TURNSTILE_TOKEN, remoteip: browser.ip })
      expect(await profileOf(rae.email)).toBeUndefined()
    })

    it("isn't asked for on verification submission or password sign-in", async () => {
      const rae = person("no-turnstile-after")
      const browser = new AuthBrowser()
      await signUp(rae, browser)
      browser.turnstile = false
      const before = outbound.callsTo(TURNSTILE_SITEVERIFY_URL).length
      expect((await browser.post("/email-otp/verify-email", { email: rae.email, otp: outbound.codeFor(rae.email) })).status).toBe(200)
      expect((await signIn(browser, rae)).status).toBe(200)
      expect(outbound.callsTo(TURNSTILE_SITEVERIFY_URL)).toHaveLength(before)
    })
  })

  describe("Google", () => {
    const google = (email: string, emailVerified: boolean) => ({
      sub: `google-${randomUUID()}`,
      email,
      email_verified: emailVerified,
      name: "Gia Google",
      picture: "https://lh3.googleusercontent.com/a/lane-test-photo",
    })
    const accountsOf = async (email: string) =>
      (await connection`select a.provider_id from account a join profiles p on p.id = a.user_id where p.email = ${email} order by a.provider_id`).map((row) => row.provider_id)

    it("creates one profile without Google's picture on a first sign-in, with no Turnstile token", async () => {
      const gia = person("google-first")
      const browser = new AuthBrowser(undefined, false)
      const answer = await signInWithGoogle(browser, outbound, google(gia.email, true))
      expect([answer.status, answer.location]).toEqual([302, "/"])
      expect(await connection`select full_name, email_verified, image, role from profiles where email = ${gia.email}`).toEqual([
        { full_name: "Gia Google", email_verified: true, image: null, role: "designer" },
      ])
      expect(await accountsOf(gia.email)).toEqual(["google"])
      expect(outbound.callsTo(TURNSTILE_SITEVERIFY_URL)).toEqual([])
      expect((await browser.get("/get-session")).body).toMatchObject({ user: { email: gia.email, image: null } })
    })

    it("links a verified Google email to the existing password account: one profile, two accounts", async () => {
      const rae = person("google-link")
      await signUpVerified(outbound, rae)
      const answer = await signInWithGoogle(new AuthBrowser(undefined, false), outbound, google(rae.email, true))
      expect([answer.status, answer.location]).toEqual([302, "/"])
      expect(await connection`select count(*)::int as profiles from profiles where email = ${rae.email}`).toEqual([{ profiles: 1 }])
      expect(await accountsOf(rae.email)).toEqual(["credential", "google"])
      expect(await profileOf(rae.email)).toMatchObject({ image: null })
    })

    it("doesn't link an email Google hasn't verified, and signs no one in", async () => {
      const rae = person("google-unverified")
      await signUpVerified(outbound, rae)
      const browser = new AuthBrowser(undefined, false)
      const answer = await signInWithGoogle(browser, outbound, google(rae.email, false))
      expect(answer.status).toBe(302)
      expect(new URL(answer.location!, "http://localhost:3000").searchParams.get("error")).toBe("account_not_linked")
      expect(await accountsOf(rae.email)).toEqual(["credential"])
      expect((await browser.get("/get-session")).body).toBeNull()
    })
  })

  it("never stores a picture someone sets with /update-user", async () => {
    const rae = person("update-image")
    const browser = await signUpVerified(outbound, rae)
    await signIn(browser, rae)
    const answer = await browser.post("/update-user", { image: "https://example.test/self-set-photo.png", name: "Rae Renamed" })
    expect(answer.status).toBe(200)
    expect(await profileOf(rae.email)).toMatchObject({ full_name: "Rae Renamed", image: null })
  })

  it("keeps rate-limit counters in the rate_limit table, keyed by the IP Vercel forwards", async () => {
    const browser = new AuthBrowser()
    await signUp(person("rate-limit"), browser)
    expect(await connection`select count from rate_limit where key = ${`${browser.ip}|/sign-up/email`}`).toEqual([{ count: 1 }])
  })

  // Runs last: vitest runs a file's tests in order.
  it("has Lane's own words for every error code these tests met, none of them the generic line", () => {
    expect(codes.met.size).toBeGreaterThanOrEqual(7)
    expect(codes.withoutLaneWords()).toEqual([])
  })
})
