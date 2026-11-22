import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AUTH_ERROR_COPY } from "@/lib/auth-error-copy"
import { answeredCodes, fakeAuthFetch, passedHumanCheck, TURNSTILE_TOKEN, type AuthFetchFake } from "@/test/auth-fetch-fake"
import { createSignInFlow } from "./sign-in-flow"

const MEI = "mei@example.test"

// #376: every code these tests met has Lane's words in AUTH_ERROR_COPY.
afterAll(() => {
  expect(answeredCodes().length).toBeGreaterThan(5)
  expect(answeredCodes().filter((code) => !Object.hasOwn(AUTH_ERROR_COPY, code))).toEqual([])
})

describe("signing in with a password (#377)", () => {
  let auth: AuthFetchFake
  const navigate = vi.fn()
  beforeEach(() => {
    auth = fakeAuthFetch()
    navigate.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it("puts a wrong password's line on the password field, and stays", async () => {
    auth.refuse("/sign-in/email", 401, "INVALID_EMAIL_OR_PASSWORD")
    const flow = createSignInFlow({ navigate })
    flow.setEmail(MEI)
    await flow.signInWithPassword({ password: "not-it" })
    expect(flow.snapshot().fieldErrors).toEqual({ password: "That email and password don’t match. Try again, or email yourself a code." })
    expect(flow.snapshot().alert).toBeNull()
    expect(auth.to("/sign-in/email").map((request) => request.body)).toEqual([{ email: MEI, password: "not-it" }])
    expect(navigate).not.toHaveBeenCalled()
  })

  it("goes to the return address after a good password, with no human check asked", async () => {
    const flow = createSignInFlow({ navigate, returnTo: "/invite/inv_1" })
    flow.setEmail(` ${MEI} `)
    await flow.signInWithPassword({ password: "right-one" })
    expect(navigate).toHaveBeenCalledWith("/invite/inv_1")
    expect(auth.to("/sign-in/email")).toEqual([{ path: "/sign-in/email", method: "POST", body: { email: MEI, password: "right-one" }, captcha: null }])
  })

  it.each(["https://x", "//x", "/\\x", "javascript:alert(1)"])("goes to / after a good password when the return address is %s", async (returnTo) => {
    const flow = createSignInFlow({ navigate, returnTo })
    flow.setEmail(MEI)
    await flow.signInWithPassword({ password: "right-one" })
    expect(navigate).toHaveBeenCalledWith("/")
  })

  // #290 D11: Lane's words on the field, not the browser's tooltip, and nothing sent.
  it("says an empty or badly formed email and an empty password on their fields, and sends nothing", async () => {
    const flow = createSignInFlow({ navigate })
    await flow.signInWithPassword({ password: "" })
    expect(flow.snapshot().fieldErrors).toEqual({ email: "Enter an email address.", password: "Enter your password." })
    flow.setEmail("mei@")
    await flow.signInWithPassword({ password: "right-one" })
    expect(flow.snapshot().fieldErrors).toEqual({ email: "Enter a valid email address." })
    expect(auth.requests).toEqual([])
  })

  it("offers the code path for an unconfirmed email, with the email kept", async () => {
    auth.refuse("/sign-in/email", 403, "EMAIL_NOT_VERIFIED")
    const flow = createSignInFlow({ navigate })
    flow.setEmail(MEI)
    await flow.signInWithPassword({ password: "right-one" })
    expect(flow.snapshot().alert).toEqual({ message: "This email isn’t confirmed yet. Email yourself a code to confirm it.", offer: "code" })
    flow.useCode()
    expect(flow.snapshot()).toMatchObject({ step: "code-request", email: MEI, alert: null })
  })

  it("shows the generic line when the fetch itself throws", async () => {
    auth.throwOn("/sign-in/email")
    const flow = createSignInFlow({ navigate })
    flow.setEmail(MEI)
    await flow.signInWithPassword({ password: "right-one" })
    expect(flow.snapshot().alert).toEqual({ message: "Something went wrong. Try again.", offer: null })
  })

  it("sends one sign-in while one is answering", async () => {
    const flow = createSignInFlow({ navigate })
    flow.setEmail(MEI)
    const first = flow.signInWithPassword({ password: "right-one" })
    expect(flow.snapshot().pending).toBe("password")
    await flow.signInWithPassword({ password: "right-one" })
    await first
    expect(auth.to("/sign-in/email")).toHaveLength(1)
  })
})

describe("signing in with Google (#377)", () => {
  let auth: AuthFetchFake
  beforeEach(() => {
    auth = fakeAuthFetch()
  })
  afterEach(() => vi.unstubAllGlobals())

  it("shows Google's line when the screen opens with Google's error", () => {
    const flow = createSignInFlow({ navigate: vi.fn(), errorCode: "access_denied" })
    expect(flow.snapshot().alert).toEqual({ message: "Google sign-in didn’t finish. Try again, or use your email.", offer: null })
  })

  it("hands Better Auth the return address and an error address back to this screen, with no human check asked", async () => {
    const flow = createSignInFlow({ navigate: vi.fn(), returnTo: "/invite/inv_1" })
    await flow.continueWithGoogle()
    expect(auth.to("/sign-in/social")).toEqual([{
      path: "/sign-in/social", method: "POST", captcha: null,
      body: { provider: "google", callbackURL: "/invite/inv_1", errorCallbackURL: "/login?redirect_url=%2Finvite%2Finv_1" },
    }])
  })

  it("sends an unsafe return address to / both ways", async () => {
    const flow = createSignInFlow({ navigate: vi.fn(), returnTo: "//x" })
    await flow.continueWithGoogle()
    expect(auth.to("/sign-in/social")[0].body).toMatchObject({ callbackURL: "/", errorCallbackURL: "/login" })
  })

  it("shows the code's line when Better Auth refuses to start", async () => {
    auth.refuse("/sign-in/social", 429, "RATE_LIMITED")
    const flow = createSignInFlow({ navigate: vi.fn() })
    await flow.continueWithGoogle()
    expect(flow.snapshot().alert).toEqual({ message: "Too many tries. Wait a minute, then try again.", offer: null })
  })
})

describe("signing in with an emailed code (#377)", () => {
  let auth: AuthFetchFake
  let clock: number
  const navigate = vi.fn()
  beforeEach(() => {
    auth = fakeAuthFetch()
    clock = 1_000_000
    navigate.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  /** The code request for Mei, with a check that passed, through the "Email me a sign-in code instead" link. */
  function codeRequest(options: { siteKey?: string | null; returnTo?: string } = {}) {
    const human = passedHumanCheck(options.siteKey)
    const flow = createSignInFlow({ navigate, humanCheck: human.check, returnTo: options.returnTo, now: () => clock })
    flow.setEmail(MEI)
    flow.useCode()
    return { flow, human }
  }

  it("sends the code with the check's token, then resets the check and moves to the code step", async () => {
    const { flow, human } = codeRequest()
    await flow.sendCode()
    expect(auth.to("/email-otp/send-verification-otp")).toEqual([{
      path: "/email-otp/send-verification-otp", method: "POST", body: { email: MEI, type: "sign-in" }, captcha: TURNSTILE_TOKEN,
    }])
    expect(human.resets()).toBe(1)
    expect(human.check.token()).toBeNull()
    expect(flow.snapshot()).toMatchObject({ step: "code", email: MEI, alert: null, nextSendAt: clock + 30_000 })
  })

  it("resets the check after a refused send too", async () => {
    auth.refuse("/email-otp/send-verification-otp", 502, "CODE_NOT_SENT")
    const { flow, human } = codeRequest()
    await flow.sendCode()
    expect(human.resets()).toBe(1)
    expect(flow.snapshot().step).toBe("code-request")
  })

  it("says no Lane account uses the email, offers Sign up instead, and keeps the email", async () => {
    auth.refuse("/email-otp/send-verification-otp", 400, "NO_ACCOUNT")
    const { flow } = codeRequest()
    await flow.sendCode()
    expect(flow.snapshot()).toMatchObject({ step: "code-request", email: MEI, alert: { message: "No Lane account uses this email.", offer: "sign-up" } })
  })

  it.each([
    [502, "CODE_NOT_SENT", "We couldn’t send the code right now. Sign in with your password or Google, or try again later."],
    [429, "TOO_MANY_CODES", "Too many codes sent to this email. Wait 10 minutes, then try again."],
    [429, "RATE_LIMITED", "Too many tries. Wait a minute, then try again."],
  ])("shows a %i %s send's line and leaves Send usable", async (status, code, line) => {
    auth.refuse("/email-otp/send-verification-otp", status, code)
    const { flow, human } = codeRequest()
    await flow.sendCode()
    expect(flow.snapshot()).toMatchObject({ step: "code-request", alert: { message: line, offer: null }, nextSendAt: 0 })
    human.pass()
    await flow.sendCode()
    expect(auth.to("/email-otp/send-verification-otp")).toHaveLength(2)
  })

  it("asks for the check and sends nothing while the check hasn't finished", async () => {
    const { flow, human } = codeRequest()
    human.check.receive(null)
    await flow.sendCode()
    expect(flow.snapshot().alert).toEqual({ message: "Finish the check that you’re human, then try again.", offer: null })
    expect(auth.requests).toEqual([])
  })

  it("says the check isn't set up and sends nothing without a site key", async () => {
    const { flow } = codeRequest({ siteKey: null })
    await flow.sendCode()
    expect(flow.snapshot().alert?.message).toBe("We can’t run the check that you’re human, so this is off for now. Continue with Google instead, or try again later.")
    expect(auth.requests).toEqual([])
  })

  it("still signs in with a password and with Google without a site key", async () => {
    const flow = createSignInFlow({ navigate, humanCheck: passedHumanCheck(null).check })
    flow.setEmail(MEI)
    await flow.signInWithPassword({ password: "right-one" })
    await flow.continueWithGoogle()
    expect(auth.requests.map((request) => request.path)).toEqual(["/sign-in/email", "/sign-in/social"])
  })

  it("says a badly formed email on the field and sends nothing", async () => {
    const { flow } = codeRequest()
    flow.setEmail("mei")
    await flow.sendCode()
    expect(flow.snapshot().fieldErrors).toEqual({ email: "Enter a valid email address." })
    expect(auth.requests).toEqual([])
  })

  it("signs in with the code and goes to the return address", async () => {
    const { flow } = codeRequest({ returnTo: "/requests" })
    await flow.sendCode()
    await flow.signInWithCode({ code: "482913" })
    expect(auth.to("/sign-in/email-otp")).toEqual([{ path: "/sign-in/email-otp", method: "POST", body: { email: MEI, otp: "482913" }, captcha: null }])
    expect(navigate).toHaveBeenCalledWith("/requests")
  })

  it.each([
    ["INVALID_OTP", "That code isn’t right. Check the most recent email from Lane."],
    ["OTP_EXPIRED", "That code has expired. Send a new one."],
  ])("puts %s's line on the code field", async (code, line) => {
    auth.refuse("/sign-in/email-otp", 400, code)
    const { flow } = codeRequest()
    await flow.sendCode()
    await flow.signInWithCode({ code: "000000" })
    expect(flow.snapshot()).toMatchObject({ step: "code", fieldErrors: { code: line }, alert: null })
    expect(navigate).not.toHaveBeenCalled()
  })

  it("says a short code on the field and sends nothing", async () => {
    const { flow } = codeRequest()
    await flow.sendCode()
    await flow.signInWithCode({ code: "4829" })
    expect(flow.snapshot().fieldErrors).toEqual({ code: "Enter the 6-digit code from the email." })
    expect(auth.to("/sign-in/email-otp")).toEqual([])
  })

  it("offers Send a new code only 30 s after the last send, with a fresh token each time", async () => {
    const { flow, human } = codeRequest()
    await flow.sendCode()
    human.pass("SECOND.TOKEN")
    clock += 29_999
    await flow.resendCode()
    expect(auth.to("/email-otp/send-verification-otp")).toHaveLength(1)
    clock += 1
    await flow.resendCode()
    expect(auth.to("/email-otp/send-verification-otp").map((request) => request.captcha)).toEqual([TURNSTILE_TOKEN, "SECOND.TOKEN"])
    expect(human.resets()).toBe(2)
    expect(flow.snapshot().nextSendAt).toBe(clock + 30_000)
  })

  it("goes back to the email with it kept, and keeps the wait", async () => {
    const { flow, human } = codeRequest()
    await flow.sendCode()
    flow.useDifferentEmail()
    expect(flow.snapshot()).toMatchObject({ step: "code-request", email: MEI })
    human.pass()
    await flow.sendCode()
    expect(auth.to("/email-otp/send-verification-otp")).toHaveLength(1)
  })

  it("goes back to the password with the email kept", () => {
    const { flow } = codeRequest()
    flow.usePassword()
    expect(flow.snapshot()).toMatchObject({ step: "password", email: MEI })
  })

  it("keeps no code in its state", async () => {
    const { flow } = codeRequest()
    await flow.sendCode()
    await flow.signInWithCode({ code: "482913" })
    expect(JSON.stringify(flow.snapshot())).not.toContain("482913")
  })
})
