/**
 * #372 (spec #369): email codes and password reset through `/api/auth/[...all]`, with Lane's three guards: no code
 * for an address without a Lane account, at most 3 codes per address in any 10 minutes, and a send that fails
 * answers Lane's couldn't-send code. Requests go to the route as the browser sends them, on a local lane_test
 * database, and only outbound HTTP is faked.
 */
import { createHash, randomUUID } from "node:crypto"
import postgres from "postgres"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { authErrorCopy } from "@/lib/auth-error-copy"
import { RESEND_EMAILS_URL } from "@/lib/messenger"
import {
  AuthBrowser,
  TURNSTILE_SITEVERIFY_URL,
  codesMet,
  fakeOutbound,
  freshIp,
  signIn,
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
const DOMAIN = "auth-codes.test"

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

const person = (label: string) => ({ email: `${label}-${randomUUID().slice(0, 8)}@${DOMAIN}`, password: "lane-codes-test-password", name: "Cody Codes" })
const profilesWith = async (email: string) => (await connection`select count(*)::int as n from profiles where email = ${email}`)[0].n as number

/** Each call from a new IP, so Better Auth's own per-IP limits (3 a minute on these paths) stay out of the way. */
const from = (browser: AuthBrowser) => {
  browser.ip = freshIp()
  return browser
}
const askForSignInCode = (browser: AuthBrowser, email: string) => from(browser).post("/email-otp/send-verification-otp", { email, type: "sign-in" })
const askForResetCode = (browser: AuthBrowser, email: string) => from(browser).post("/email-otp/request-password-reset", { email })
const signInWithCode = (browser: AuthBrowser, email: string, otp: string) => from(browser).post("/sign-in/email-otp", { email, otp })

describe("email codes through the auth route", () => {
  let outbound: Outbound
  beforeEach(() => {
    switchOnAuthRoute()
    outbound = fakeOutbound()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  describe("sign-in by code", () => {
    it("signs an existing, verified person in once, and refuses the same code again", async () => {
      const cody = person("sign-in-once")
      await signUpVerified(outbound, cody)
      const browser = new AuthBrowser()
      const asked = await askForSignInCode(browser, cody.email)
      expect([asked.status, asked.body]).toEqual([200, { success: true }])
      const email = outbound.emailsTo(cody.email).at(-1)!
      expect(email.subject).toBe("Your Lane sign-in code")

      const code = outbound.codeFor(cody.email)
      const signedIn = await signInWithCode(browser, cody.email, code)
      expect(signedIn.status).toBe(200)
      expect((await browser.get("/get-session")).body).toMatchObject({ user: { email: cody.email } })

      const again = await signInWithCode(new AuthBrowser(), cody.email, code)
      expect([again.status, codeOf(again)]).toEqual([400, "INVALID_OTP"])
    })

    it("keeps only a hash of the emailed code, which still signs in", async () => {
      const cody = person("hashed")
      await signUpVerified(outbound, cody)
      const browser = new AuthBrowser()
      await askForSignInCode(browser, cody.email)
      const code = outbound.codeFor(cody.email)
      const [row] = await connection`select value from verification where identifier = ${`sign-in-otp-${cody.email}`}`
      expect(row.value).not.toContain(code)
      expect((await signInWithCode(browser, cody.email, code)).status).toBe(200)
    })

    it("burns a code after 3 wrong attempts, so the right one is refused afterwards", async () => {
      const cody = person("burnt")
      await signUpVerified(outbound, cody)
      const browser = new AuthBrowser()
      await askForSignInCode(browser, cody.email)
      const code = outbound.codeFor(cody.email)
      const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, "0")
      for (let attempt = 0; attempt < 3; attempt++) {
        const answer = await signInWithCode(browser, cody.email, wrong)
        expect([answer.status, codeOf(answer)]).toEqual([400, "INVALID_OTP"])
      }
      const right = await signInWithCode(browser, cody.email, code)
      expect([right.status, codeOf(right)]).toEqual([403, "TOO_MANY_ATTEMPTS"])
      expect(browser.cookies.size).toBe(0)
    })

    it("refuses an expired code", async () => {
      const cody = person("expired")
      await signUpVerified(outbound, cody)
      const browser = new AuthBrowser()
      await askForSignInCode(browser, cody.email)
      await connection`update verification set expires_at = now() - interval '1 second' where identifier = ${`sign-in-otp-${cody.email}`}`
      const answer = await signInWithCode(browser, cody.email, outbound.codeFor(cody.email))
      expect([answer.status, codeOf(answer)]).toEqual([400, "OTP_EXPIRED"])
    })

    it("never creates an account, even when someone submits a code for an address with no profile", async () => {
      const nobody = person("no-account")
      const answer = await signInWithCode(new AuthBrowser(), nobody.email, "123456")
      expect([answer.status, codeOf(answer)]).toEqual([400, "INVALID_OTP"])
      expect(await profilesWith(nobody.email)).toBe(0)
    })
  })

  describe("an address with no Lane account", () => {
    it("gets NO_ACCOUNT for a sign-in code and for a reset code, nothing reaches Resend, and no profile is made", async () => {
      const nobody = person("unknown")
      const browser = new AuthBrowser()
      for (const answer of [await askForSignInCode(browser, nobody.email), await askForResetCode(browser, nobody.email.toUpperCase())])
        expect([answer.status, codeOf(answer)]).toEqual([400, "NO_ACCOUNT"])
      expect(outbound.emails()).toEqual([])
      expect(await profilesWith(nobody.email)).toBe(0)
    })
  })

  describe("password reset by code", () => {
    const resetWith = (browser: AuthBrowser, email: string, otp: string, password: string) => from(browser).post("/email-otp/reset-password", { email, otp, password })
    const sessionsOf = async (email: string) =>
      (await connection`select count(*)::int as n from session s join profiles p on p.id = s.user_id where p.email = ${email}`)[0].n as number

    it("sets a new password that then signs in, and signs the person out everywhere else", async () => {
      const cody = person("reset")
      const laptop = await signUpVerified(outbound, cody)
      expect((await signIn(laptop, cody)).status).toBe(200)
      const phone = new AuthBrowser()
      expect((await signIn(phone, cody)).status).toBe(200)
      expect(await sessionsOf(cody.email)).toBe(2)

      const browser = new AuthBrowser()
      expect((await askForResetCode(browser, cody.email)).status).toBe(200)
      expect(outbound.emailsTo(cody.email).at(-1)!.subject).toBe("Your Lane password reset code")
      const newPassword = "a-brand-new-lane-password"
      const reset = await resetWith(browser, cody.email, outbound.codeFor(cody.email), newPassword)
      expect(reset.status).toBe(200)

      expect(await sessionsOf(cody.email)).toBe(0)
      for (const device of [laptop, phone]) expect((await device.get("/get-session")).body).toBeNull()
      const old = await signIn(from(new AuthBrowser()), cody)
      expect([old.status, codeOf(old)]).toEqual([401, "INVALID_EMAIL_OR_PASSWORD"])
      expect((await signIn(new AuthBrowser(), { ...cody, password: newPassword })).status).toBe(200)
    })

    it("refuses a breached and a 7-character new password, as at sign-up, and keeps the old one", async () => {
      const cody = person("reset-refused")
      await signUpVerified(outbound, cody)
      const browser = new AuthBrowser()
      await askForResetCode(browser, cody.email)
      const code = outbound.codeFor(cody.email)
      const short = await resetWith(browser, cody.email, code, "seven77")
      expect([short.status, codeOf(short)]).toEqual([400, "PASSWORD_TOO_SHORT"])
      outbound.breached.add("a-breached-lane-password")
      const breached = await resetWith(browser, cody.email, code, "a-breached-lane-password")
      expect([breached.status, codeOf(breached)]).toEqual([400, "PASSWORD_COMPROMISED"])
      expect((await signIn(new AuthBrowser(), cody)).status).toBe(200)
    })

    it("refuses the reset with PASSWORD_CHECK_UNAVAILABLE while Have I Been Pwned can't be reached, keeping the old password and the code", async () => {
      const cody = person("reset-hibp-down")
      await signUpVerified(outbound, cody)
      const browser = new AuthBrowser()
      await askForResetCode(browser, cody.email)
      const code = outbound.codeFor(cody.email)
      outbound.hibp = () => new Response("", { status: 503 })
      const down = await resetWith(browser, cody.email, code, "a-brand-new-lane-password")
      outbound.hibp = () => Promise.reject(new TypeError("fetch failed"))
      const unreachable = await resetWith(browser, cody.email, code, "a-brand-new-lane-password")
      outbound.hibp = () => new Promise<Response>(() => {})
      const started = Date.now()
      const hung = await resetWith(browser, cody.email, code, "a-brand-new-lane-password")
      expect(Date.now() - started).toBeLessThan(5_000)
      for (const answer of [down, unreachable, hung]) expect([answer.status, codeOf(answer)]).toEqual([503, "PASSWORD_CHECK_UNAVAILABLE"])
      expect((await signIn(new AuthBrowser(), cody)).status).toBe(200)

      outbound.hibp = undefined
      expect((await resetWith(browser, cody.email, code, "a-brand-new-lane-password")).status).toBe(200)
    })
  })

  describe("Turnstile", () => {
    it("is required on every code send and on the reset submission", async () => {
      const cody = person("turnstile")
      await signUpVerified(outbound, cody)
      const browser = new AuthBrowser(undefined, false)
      const answers = [
        ...(await Promise.all(
          (["email-verification", "sign-in", "forget-password"] as const).map((type) => from(browser).post("/email-otp/send-verification-otp", { email: cody.email, type })),
        )),
        await askForResetCode(browser, cody.email),
        await from(browser).post("/email-otp/reset-password", { email: cody.email, otp: "123456", password: "a-brand-new-lane-password" }),
      ]
      for (const answer of answers) expect([answer.status, codeOf(answer)]).toEqual([400, "MISSING_RESPONSE"])
      expect(outbound.emailsTo(cody.email)).toHaveLength(1)
    })

    it("isn't asked for when signing in with a code", async () => {
      const cody = person("turnstile-sign-in")
      await signUpVerified(outbound, cody)
      const browser = new AuthBrowser()
      await askForSignInCode(browser, cody.email)
      browser.turnstile = false
      const turnstileChecks = outbound.callsTo(TURNSTILE_SITEVERIFY_URL).length
      expect((await signInWithCode(browser, cody.email, outbound.codeFor(cody.email))).status).toBe(200)
      expect(outbound.callsTo(TURNSTILE_SITEVERIFY_URL)).toHaveLength(turnstileChecks)
    })
  })

  describe("a code that couldn't be sent", () => {
    const timedOut = () => Promise.reject(Object.assign(new Error("The operation timed out."), { name: "TimeoutError" }))
    const failures: [string, () => Response | Promise<Response>][] = [
      ["a Resend 4xx", () => new Response("{}", { status: 422 })],
      ["a Resend 5xx", () => new Response("{}", { status: 503 })],
      ["a thrown fetch", () => Promise.reject(new TypeError("fetch failed"))],
      ["a timeout", timedOut],
    ]
    const resendBodies = () => outbound.callsTo(RESEND_EMAILS_URL).map((call) => JSON.parse(call.body) as { to: string[]; text: string })
    /** Every console.error line so far, for checking nothing that signs someone in was logged. */
    const errorLines = () => vi.mocked(console.error).mock.calls.map((args) => args.map(String).join(" "))

    for (const [label, answer] of failures)
      it(`answers CODE_NOT_SENT on ${label}, and logs neither the address nor the code`, async () => {
        const cody = person("not-sent")
        await signUpVerified(outbound, cody)
        outbound.resend = answer
        const asked = await askForSignInCode(new AuthBrowser(), cody.email)
        expect([asked.status, codeOf(asked)]).toEqual([502, "CODE_NOT_SENT"])
        const code = resendBodies().at(-1)!.text.match(/\b(\d{6})\b/)![1]
        expect(errorLines().some((line) => line.includes("[auth-email]"))).toBe(true)
        for (const line of errorLines()) {
          expect(line).not.toContain(cody.email.split("@")[0])
          expect(line).not.toContain(code)
        }
      })

    it("answers SIGN_UP_CODE_NOT_SENT for a sign-up whose verification code didn't go, keeping the new account", async () => {
      const cody = person("sign-up-not-sent")
      outbound.resend = () => new Response("{}", { status: 503 })
      const answer = await signUp(cody)
      expect([answer.status, codeOf(answer)]).toEqual([502, "SIGN_UP_CODE_NOT_SENT"])
      // An unverified account can't sign in by password, so it isn't offered.
      expect(authErrorCopy(codeOf(answer))).toBe("We couldn’t send the code right now. Try again in a few minutes.")
      expect(await profilesWith(cody.email)).toBe(1)

      // So does asking for the verification code again.
      const again = await from(new AuthBrowser()).post("/email-otp/send-verification-otp", { email: cody.email, type: "email-verification" })
      expect([again.status, codeOf(again)]).toEqual([502, "SIGN_UP_CODE_NOT_SENT"])
    })

    it("answers CODE_NOT_SENT for a reset code that didn't go", async () => {
      const cody = person("reset-not-sent")
      await signUpVerified(outbound, cody)
      outbound.resend = () => Promise.reject(new TypeError("fetch failed"))
      const answer = await askForResetCode(new AuthBrowser(), cody.email)
      expect([answer.status, codeOf(answer)]).toEqual([502, "CODE_NOT_SENT"])
    })

    it("gives two requests in flight together their own answers, one failing and one sending", async () => {
      const [failing, sending] = [person("concurrent-fails"), person("concurrent-sends")]
      for (const who of [failing, sending]) await signUpVerified(outbound, who)
      // Neither send is answered until both have reached Resend, so the two requests overlap.
      let arrived = 0
      let bothArrived!: () => void
      const together = new Promise<void>((resolve) => (bothArrived = resolve))
      outbound.resend = async (call) => {
        if (++arrived === 2) bothArrived()
        await together
        const to = (JSON.parse(call.body) as { to: string[] }).to
        return to.includes(failing.email) ? new Response("{}", { status: 503 }) : Response.json({ id: `email_${randomUUID()}` })
      }
      const [failed, sent] = await Promise.all([askForSignInCode(new AuthBrowser(), failing.email), askForSignInCode(new AuthBrowser(), sending.email)])
      expect([failed.status, codeOf(failed)]).toEqual([502, "CODE_NOT_SENT"])
      expect([sent.status, sent.body]).toEqual([200, { success: true }])
    })
  })

  describe("at most 3 codes per address in any 10 minutes", () => {
    const sha256 = (text: string) => createHash("sha256").update(text).digest("hex")
    const counterRows = (email: string) => connection`select key, last_request from rate_limit where key like ${`lane-codes:${sha256(email.toLowerCase())}%`}`
    const ageCounter = (email: string, seconds: number) =>
      connection`update rate_limit set last_request = last_request - ${seconds * 1000} where key like ${`lane-codes:${sha256(email.toLowerCase())}%`}`

    /** Signs up (the verification code is the first of the address's codes), then asks for 2 more. */
    async function threeCodesSent(cody: ReturnType<typeof person>) {
      const browser = await signUpVerified(outbound, cody)
      expect((await from(browser).post("/email-otp/send-verification-otp", { email: cody.email, type: "email-verification" })).status).toBe(200)
      expect((await askForSignInCode(browser, cody.email)).status).toBe(200)
      expect(outbound.emailsTo(cody.email)).toHaveLength(3)
      return browser
    }

    it("refuses a fourth code with TOO_MANY_CODES, across IPs and across verification, sign-in and reset codes", async () => {
      const cody = person("limit")
      const browser = await threeCodesSent(cody)
      const fourth = await askForResetCode(browser, cody.email)
      expect([fourth.status, codeOf(fourth)]).toEqual([429, "TOO_MANY_CODES"])
      const fifth = await askForSignInCode(new AuthBrowser(), cody.email.toUpperCase())
      expect([fifth.status, codeOf(fifth)]).toEqual([429, "TOO_MANY_CODES"])
      expect(outbound.emailsTo(cody.email)).toHaveLength(3)

      const other = person("limit-other")
      await signUpVerified(outbound, other)
      expect((await askForSignInCode(new AuthBrowser(), other.email)).status).toBe(200)
    })

    it("keeps the counter under a hash of the address, never the address", async () => {
      const cody = person("limit-key")
      await threeCodesSent(cody)
      const keys = (await connection`select key from rate_limit`).map((row) => row.key as string)
      expect(keys.filter((key) => key.toLowerCase().includes(cody.email.split("@")[0]))).toEqual([])
      expect(await counterRows(cody.email)).toHaveLength(3)
    })

    it("still counts codes up to 10 minutes old when Better Auth clears its own expired counters", async () => {
      const cody = person("limit-prune")
      const browser = await threeCodesSent(cody)
      await ageCounter(cody.email, 9 * 60)
      // An IP counter past its window makes Better Auth delete every counter older than its longest window.
      const ip = freshIp()
      await connection`insert into rate_limit (id, key, count, last_request) values (${randomUUID()}, ${`${ip}|/sign-in/email`}, 3, ${Date.now() - 11_000})`
      browser.ip = ip
      await signIn(browser, cody)
      expect(await connection`select 1 from rate_limit where key = ${`${ip}|/sign-in/email`} and count = 1`).toHaveLength(1)

      const fourth = await askForSignInCode(browser, cody.email)
      expect([fourth.status, codeOf(fourth)]).toEqual([429, "TOO_MANY_CODES"])
    })

    it("sends again once the oldest code is more than 10 minutes old", async () => {
      const cody = person("limit-window")
      const browser = await threeCodesSent(cody)
      await connection`update rate_limit set last_request = last_request - ${10 * 60 * 1000 + 1000}
        where key = (select key from rate_limit where key like ${`lane-codes:${sha256(cody.email)}%`} order by last_request limit 1)`
      expect((await askForSignInCode(browser, cody.email)).status).toBe(200)
      const next = await askForSignInCode(browser, cody.email)
      expect([next.status, codeOf(next)]).toEqual([429, "TOO_MANY_CODES"])
    })

    it("doesn't count a request refused before the limit: no account yet, or no Turnstile token", async () => {
      const cody = person("limit-uncounted")
      const browser = new AuthBrowser()
      for (let ask = 0; ask < 3; ask++) expect(codeOf(await askForSignInCode(browser, cody.email))).toBe("NO_ACCOUNT")
      await signUpVerified(outbound, cody)
      browser.turnstile = false
      for (let ask = 0; ask < 3; ask++) expect(codeOf(await askForSignInCode(browser, cody.email))).toBe("MISSING_RESPONSE")
      browser.turnstile = true
      for (let ask = 0; ask < 2; ask++) expect((await askForSignInCode(browser, cody.email)).status).toBe(200)
      expect(codeOf(await askForSignInCode(browser, cody.email))).toBe("TOO_MANY_CODES")
    })
  })

  // Runs last: vitest runs a file's tests in order.
  it("has Lane's own words for every error code these tests met, none of them the generic line", () => {
    expect(codes.met.size).toBeGreaterThanOrEqual(8)
    expect(codes.withoutLaneWords()).toEqual([])
  })
})
