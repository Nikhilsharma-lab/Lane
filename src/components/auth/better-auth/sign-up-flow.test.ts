import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AUTH_ERROR_COPY } from "@/lib/auth-error-copy"
import { answeredCodes, fakeAuthFetch, passedHumanCheck, TURNSTILE_TOKEN, type AuthFetchFake } from "@/test/auth-fetch-fake"
import { createSignUpFlow } from "./sign-up-flow"

const MEI = "mei@example.test"
const PASSWORD = "long-enough-1"

// #376: every code these tests met has Lane's words in AUTH_ERROR_COPY.
afterAll(() => {
  expect(answeredCodes().length).toBeGreaterThan(5)
  expect(answeredCodes().filter((code) => !Object.hasOwn(AUTH_ERROR_COPY, code))).toEqual([])
})

let auth: AuthFetchFake
let clock: number
const navigate = vi.fn()
beforeEach(() => {
  auth = fakeAuthFetch()
  clock = 1_000_000
  navigate.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

/** The sign-up screen with Mei's name and email typed, and a check that passed. */
function signUp(options: { siteKey?: string | null; returnTo?: string } = {}) {
  const human = passedHumanCheck(options.siteKey)
  const flow = createSignUpFlow({ navigate, humanCheck: human.check, returnTo: options.returnTo, now: () => clock })
  flow.setName("Mei Lin")
  flow.setEmail(MEI)
  return { flow, human }
}

describe("creating an account (#378)", () => {
  it("refuses a 7-character password on the field and sends nothing", async () => {
    const { flow } = signUp()
    await flow.signUp({ password: "seven77" })
    expect(flow.snapshot().fieldErrors).toEqual({ password: "Use at least 8 characters." })
    expect(auth.requests).toEqual([])
  })

  it("sends the sign-up with the check's token, resets the check, and moves to the confirmation code", async () => {
    const { flow, human } = signUp()
    flow.setEmail(` ${MEI} `)
    await flow.signUp({ password: PASSWORD })
    expect(auth.to("/sign-up/email")).toEqual([{
      path: "/sign-up/email", method: "POST", body: { name: "Mei Lin", email: MEI, password: PASSWORD }, captcha: TURNSTILE_TOKEN,
    }])
    expect(human.resets()).toBe(1)
    expect(flow.snapshot()).toMatchObject({ step: "code", email: ` ${MEI} `, alert: null, fieldErrors: {}, nextSendAt: clock + 30_000 })
  })

  it("resets the check after a refused sign-up too", async () => {
    auth.refuse("/sign-up/email", 400, "PASSWORD_COMPROMISED")
    const { flow, human } = signUp()
    await flow.signUp({ password: PASSWORD })
    expect(human.resets()).toBe(1)
    expect(flow.snapshot().step).toBe("details")
  })

  it("asks for the check and sends nothing while it hasn't finished", async () => {
    const { flow, human } = signUp()
    human.check.receive(null)
    await flow.signUp({ password: PASSWORD })
    expect(flow.snapshot().alert).toEqual({ message: "Finish the check that you’re human, then try again.", offer: null })
    expect(auth.requests).toEqual([])
  })

  it.each([
    [400, "PASSWORD_COMPROMISED", "This password has appeared in a data breach elsewhere. Choose a different one."],
    [503, "PASSWORD_CHECK_UNAVAILABLE", "We couldn’t check this password right now. Try again in a minute."],
    [400, "PASSWORD_TOO_SHORT", "Use at least 8 characters."],
  ])("puts a %i %s answer on the password field", async (status, code, line) => {
    auth.refuse("/sign-up/email", status, code)
    const { flow } = signUp()
    await flow.signUp({ password: PASSWORD })
    expect(flow.snapshot()).toMatchObject({ step: "details", fieldErrors: { password: line }, alert: null })
  })

  it("says an account already uses the email, offers Sign in instead, and keeps the email", async () => {
    auth.refuse("/sign-up/email", 422, "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL")
    const { flow } = signUp()
    await flow.signUp({ password: PASSWORD })
    expect(flow.snapshot()).toMatchObject({
      step: "details", email: MEI, fieldErrors: {}, alert: { message: "A Lane account already uses this email.", offer: "sign-in" },
    })
  })

  it.each([
    [429, "TOO_MANY_CODES"],
    [429, "RATE_LIMITED"],
    [503, "HUMAN_CHECK_UNAVAILABLE"],
  ])("shows a %i %s answer in the box", async (status, code) => {
    auth.refuse("/sign-up/email", status, code)
    const { flow } = signUp()
    await flow.signUp({ password: PASSWORD })
    expect(flow.snapshot()).toMatchObject({ step: "details", alert: { message: AUTH_ERROR_COPY[code as keyof typeof AUTH_ERROR_COPY], offer: null } })
  })

  // #290 D11: Lane's words on the field, not the browser's tooltip, and nothing sent.
  it.each([["n".repeat(101), "Use at most 100 characters."], ["Mei\u2028Lin", "Use one line of plain text."]])("says on the field why a name can't be used, and sends nothing: %j", async (name, line) => {
    const { flow } = signUp()
    flow.setName(name)
    await flow.signUp({ password: PASSWORD })
    expect(flow.snapshot().fieldErrors).toEqual({ name: line })
    expect(auth.requests).toEqual([])
  })

  it("says an empty name, an empty or badly formed email and an empty password on their fields", async () => {
    const flow = createSignUpFlow({ navigate, humanCheck: passedHumanCheck().check })
    await flow.signUp({ password: "" })
    expect(flow.snapshot().fieldErrors).toEqual({ name: "Enter your name.", email: "Enter an email address.", password: "Use at least 8 characters." })
    flow.setName("Mei Lin")
    flow.setEmail("mei@")
    await flow.signUp({ password: PASSWORD })
    expect(flow.snapshot().fieldErrors).toEqual({ email: "Enter a valid email address." })
    expect(auth.requests).toEqual([])
  })

  it("says the check isn't set up and sends nothing without a site key", async () => {
    const { flow } = signUp({ siteKey: null })
    await flow.signUp({ password: PASSWORD })
    expect(flow.snapshot().alert?.message).toBe(AUTH_ERROR_COPY.HUMAN_CHECK_NOT_SET_UP)
    expect(auth.requests).toEqual([])
  })

  it("sends one sign-up while one is answering", async () => {
    const { flow } = signUp()
    const first = flow.signUp({ password: PASSWORD })
    expect(flow.snapshot().pending).toBe("sign-up")
    await flow.signUp({ password: PASSWORD })
    await first
    expect(auth.to("/sign-up/email")).toHaveLength(1)
  })
})

describe("confirming the email (#378)", () => {
  /** Mei's account made, with the confirmation code sent. */
  async function confirming(options: { returnTo?: string } = {}) {
    const made = signUp(options)
    await made.flow.signUp({ password: PASSWORD })
    made.human.pass()
    return made
  }

  it("lands on the code step with the couldn't-send line and Send a new code offered now", async () => {
    auth.refuse("/sign-up/email", 502, "SIGN_UP_CODE_NOT_SENT")
    const { flow } = signUp()
    await flow.signUp({ password: PASSWORD })
    expect(flow.snapshot()).toMatchObject({
      step: "code", email: MEI, nextSendAt: 0, alert: { message: "We couldn’t send the code right now. Try again in a few minutes.", offer: null },
    })
  })

  it("sends a new confirmation code with a fresh token, never a second sign-up", async () => {
    auth.refuse("/sign-up/email", 502, "SIGN_UP_CODE_NOT_SENT")
    const { flow, human } = signUp()
    await flow.signUp({ password: PASSWORD })
    human.pass("SECOND.TOKEN")
    await flow.resendCode()
    expect(auth.requests.map((request) => request.path)).toEqual(["/sign-up/email", "/email-otp/send-verification-otp"])
    expect(auth.to("/email-otp/send-verification-otp")).toEqual([{
      path: "/email-otp/send-verification-otp", method: "POST", body: { email: MEI, type: "email-verification" }, captcha: "SECOND.TOKEN",
    }])
    expect(human.resets()).toBe(2)
    expect(flow.snapshot()).toMatchObject({ step: "code", alert: null, nextSendAt: clock + 30_000 })
  })

  it("offers Send a new code only 30 s after the last send", async () => {
    const { flow } = await confirming()
    clock += 29_999
    await flow.resendCode()
    expect(auth.to("/email-otp/send-verification-otp")).toHaveLength(0)
    clock += 1
    await flow.resendCode()
    expect(auth.to("/email-otp/send-verification-otp")).toHaveLength(1)
  })

  it("shows a resend's couldn't-send line and leaves Send usable", async () => {
    const { flow, human } = await confirming()
    clock += 30_000
    auth.refuse("/email-otp/send-verification-otp", 502, "SIGN_UP_CODE_NOT_SENT")
    await flow.resendCode()
    expect(flow.snapshot().alert?.message).toBe(AUTH_ERROR_COPY.SIGN_UP_CODE_NOT_SENT)
    human.pass()
    await flow.resendCode()
    expect(auth.to("/email-otp/send-verification-otp")).toHaveLength(2)
  })

  it("confirms the code, which signs in with no password sent again, and goes to Onboarding", async () => {
    const { flow } = await confirming()
    await flow.confirmEmail({ code: "482913" })
    expect(auth.requests.slice(1)).toEqual([
      { path: "/email-otp/verify-email", method: "POST", body: { email: MEI, otp: "482913" }, captcha: null },
    ])
    expect(navigate).toHaveBeenCalledWith("/onboarding")
  })

  it("goes to the return address it was given instead, such as the invitation", async () => {
    const { flow } = await confirming({ returnTo: "/invite/inv_1" })
    await flow.confirmEmail({ code: "482913" })
    expect(navigate).toHaveBeenCalledWith("/invite/inv_1")
  })

  it.each(["//x", "https://x"])("goes to Onboarding when the return address is %s", async (returnTo) => {
    const { flow } = await confirming({ returnTo })
    await flow.confirmEmail({ code: "482913" })
    expect(navigate).toHaveBeenCalledWith("/onboarding")
  })

  /** Better Auth's answer to a right code when no session came with it. */
  const withoutSession = { status: true, token: null, user: { id: "user_1", email: MEI } }

  it("moves to the confirmed step, offering Sign in with the email kept, when the answer carries no session", async () => {
    auth.succeed("/email-otp/verify-email", withoutSession)
    const { flow } = await confirming()
    await flow.confirmEmail({ code: "482913" })
    expect(flow.snapshot()).toMatchObject({ step: "confirmed", email: MEI, alert: null })
    expect(auth.to("/sign-in/email")).toEqual([])
    expect(navigate).not.toHaveBeenCalled()
  })

  it("sends Sign in to the sign-in page with the email and the return address", async () => {
    auth.succeed("/email-otp/verify-email", withoutSession)
    const { flow } = await confirming({ returnTo: "/invite/inv_1" })
    await flow.confirmEmail({ code: "482913" })
    flow.goToSignIn()
    expect(navigate).toHaveBeenCalledWith(`/login?email=${encodeURIComponent(MEI)}&redirect_url=%2Finvite%2Finv_1`)
  })

  it.each([
    ["INVALID_OTP", "That code isn’t right. Check the most recent email from Lane."],
    ["OTP_EXPIRED", "That code has expired. Send a new one."],
    ["TOO_MANY_ATTEMPTS", "That code has expired. Send a new one."],
  ])("puts %s's line on the code field, and still goes on after a right code", async (code, line) => {
    auth.refuse("/email-otp/verify-email", code === "TOO_MANY_ATTEMPTS" ? 403 : 400, code)
    const { flow } = await confirming()
    await flow.confirmEmail({ code: "000000" })
    expect(flow.snapshot()).toMatchObject({ step: "code", fieldErrors: { code: line }, alert: null })
    expect(navigate).not.toHaveBeenCalled()
    await flow.confirmEmail({ code: "482913" })
    expect(navigate).toHaveBeenCalledWith("/onboarding")
  })

  it("says a short code on the field and sends nothing", async () => {
    const { flow } = await confirming()
    await flow.confirmEmail({ code: "4829" })
    expect(flow.snapshot().fieldErrors).toEqual({ code: "Enter the 6-digit code from the email." })
    expect(auth.to("/email-otp/verify-email")).toEqual([])
  })

  it.each([
    ["taken", () => {}],
    ["taken with its code unsent", () => void auth.refuse("/sign-up/email", 502, "SIGN_UP_CODE_NOT_SENT")],
    ["refused", () => void auth.refuse("/sign-up/email", 422, "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL")],
  ])("keeps the typed password nowhere once the sign-up is %s: not in its state, not in a later request", async (_outcome, answer) => {
    answer()
    const { flow, human } = signUp()
    const states: unknown[] = []
    flow.subscribe(() => states.push(flow.snapshot()))
    await flow.signUp({ password: PASSWORD })
    human.pass()
    clock += 30_000
    await flow.resendCode()
    await flow.confirmEmail({ code: "482913" })
    expect(states.length).toBeGreaterThan(0)
    expect(JSON.stringify(states)).not.toContain(PASSWORD)
    expect(JSON.stringify(auth.requests.slice(1))).not.toContain(PASSWORD)
  })

  it("goes back to the details with the name and email kept", async () => {
    const { flow } = await confirming()
    flow.useDifferentEmail()
    expect(flow.snapshot()).toMatchObject({ step: "details", email: MEI, name: "Mei Lin", alert: null })
  })
})

describe("signing up with Google (#378)", () => {
  it("hands Better Auth the return address, and an error address back to sign-up, with no human check asked", async () => {
    const flow = createSignUpFlow({ navigate, humanCheck: passedHumanCheck(null).check, returnTo: "/invite/inv_1" })
    await flow.continueWithGoogle()
    expect(auth.to("/sign-in/social")).toEqual([{
      path: "/sign-in/social", method: "POST", captcha: null,
      body: { provider: "google", callbackURL: "/invite/inv_1", errorCallbackURL: "/signup?redirect_url=%2Finvite%2Finv_1" },
    }])
  })

  it("goes to Onboarding with no return address, and shows the code's line when Better Auth refuses to start", async () => {
    auth.refuse("/sign-in/social", 429, "RATE_LIMITED")
    const flow = createSignUpFlow({ navigate })
    await flow.continueWithGoogle()
    expect(flow.snapshot().alert).toEqual({ message: "Too many tries. Wait a minute, then try again.", offer: null })
    expect(auth.to("/sign-in/social")[0].body).toMatchObject({ callbackURL: "/onboarding", errorCallbackURL: "/signup" })
  })
})
