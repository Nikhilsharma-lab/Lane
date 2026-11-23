import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AUTH_ERROR_COPY } from "@/lib/auth-error-copy"
import { answeredCodes, fakeAuthFetch, passedHumanCheck, TURNSTILE_TOKEN, type AuthFetchFake } from "@/test/auth-fetch-fake"
import { createPasswordResetFlow } from "./password-reset-flow"

const MEI = "mei@example.test"
const CODE = "482913"
const PASSWORD = "brand-new-pass"

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

/** The request step with Mei's email typed, and a check that passed. */
function forgot(options: { siteKey?: string | null } = {}) {
  const human = passedHumanCheck(options.siteKey)
  const flow = createPasswordResetFlow({ navigate, humanCheck: human.check, now: () => clock })
  flow.setEmail(MEI)
  return { flow, human }
}

/** The reset step: Mei's reset code sent, and the check passed again. */
async function resetting() {
  const made = forgot()
  await made.flow.requestCode()
  made.human.pass()
  return made
}

describe("asking for a reset code (#378)", () => {
  it("sends the request with the check's token, resets the check, and moves to the reset step", async () => {
    const { flow, human } = forgot()
    await flow.requestCode()
    expect(auth.to("/email-otp/request-password-reset")).toEqual([{
      path: "/email-otp/request-password-reset", method: "POST", body: { email: MEI }, captcha: TURNSTILE_TOKEN,
    }])
    expect(human.resets()).toBe(1)
    expect(flow.snapshot()).toMatchObject({ step: "reset", email: MEI, alert: null, nextSendAt: clock + 30_000 })
  })

  it("resets the check after a refused request too", async () => {
    auth.refuse("/email-otp/request-password-reset", 502, "CODE_NOT_SENT")
    const { flow, human } = forgot()
    await flow.requestCode()
    expect(human.resets()).toBe(1)
    expect(flow.snapshot().step).toBe("request")
  })

  it("says no Lane account uses the email, offers Sign up instead, and keeps the email", async () => {
    auth.refuse("/email-otp/request-password-reset", 400, "NO_ACCOUNT")
    const { flow } = forgot()
    await flow.requestCode()
    expect(flow.snapshot()).toMatchObject({ step: "request", email: MEI, alert: { message: "No Lane account uses this email.", offer: "sign-up" } })
  })

  it.each([
    [502, "CODE_NOT_SENT", "We couldn’t send the code right now. Sign in with your password or Google, or try again later."],
    [429, "TOO_MANY_CODES", "Too many codes sent to this email. Wait 10 minutes, then try again."],
    [429, "RATE_LIMITED", "Too many tries. Wait a minute, then try again."],
  ])("shows a %i %s request's line and leaves Send reset code usable", async (status, code, line) => {
    auth.refuse("/email-otp/request-password-reset", status, code)
    const { flow, human } = forgot()
    await flow.requestCode()
    expect(flow.snapshot()).toMatchObject({ step: "request", alert: { message: line, offer: null }, nextSendAt: 0 })
    human.pass()
    await flow.requestCode()
    expect(auth.to("/email-otp/request-password-reset")).toHaveLength(2)
  })

  it("asks for the check and sends nothing while it hasn't finished", async () => {
    const { flow, human } = forgot()
    human.check.receive(null)
    await flow.requestCode()
    expect(flow.snapshot().alert).toEqual({ message: "Finish the check that you’re human, then try again.", offer: null })
    expect(auth.requests).toEqual([])
  })

  it("says the check isn't set up and sends nothing without a site key", async () => {
    const { flow } = forgot({ siteKey: null })
    await flow.requestCode()
    expect(flow.snapshot().alert?.message).toBe(AUTH_ERROR_COPY.HUMAN_CHECK_NOT_SET_UP)
    expect(auth.requests).toEqual([])
  })

  // #290 D11: Lane's words on the field, not the browser's tooltip, and nothing sent.
  it("says an empty or badly formed email on the field and sends nothing", async () => {
    const flow = createPasswordResetFlow({ navigate, humanCheck: passedHumanCheck().check })
    await flow.requestCode()
    expect(flow.snapshot().fieldErrors).toEqual({ email: "Enter an email address." })
    flow.setEmail("mei@")
    await flow.requestCode()
    expect(flow.snapshot().fieldErrors).toEqual({ email: "Enter a valid email address." })
    expect(auth.requests).toEqual([])
  })

  it("starts with the email it was given", () => {
    expect(createPasswordResetFlow({ navigate, email: MEI }).snapshot().email).toBe(MEI)
  })
})

describe("saving a new password (#378)", () => {
  it("sends the code and new password with a fresh token, resets the check, then signs in with the new password", async () => {
    const { flow, human } = await resetting()
    human.pass("SECOND.TOKEN")
    await flow.save({ code: CODE, password: PASSWORD })
    expect(auth.requests.slice(1)).toEqual([
      { path: "/email-otp/reset-password", method: "POST", body: { email: MEI, otp: CODE, password: PASSWORD }, captcha: "SECOND.TOKEN" },
      { path: "/sign-in/email", method: "POST", body: { email: MEI, password: PASSWORD }, captcha: null },
    ])
    expect(human.resets()).toBe(2)
    expect(flow.snapshot()).toMatchObject({ step: "saved", signedIn: true, alert: null })
    expect(navigate).not.toHaveBeenCalled()
  })

  it("says the password saved but to sign in when the sign-in after it fails", async () => {
    auth.refuse("/sign-in/email", 429, "RATE_LIMITED")
    const { flow } = await resetting()
    await flow.save({ code: CODE, password: PASSWORD })
    expect(flow.snapshot()).toMatchObject({ step: "saved", signedIn: false, alert: null })
  })

  it("resets the check after a refused save too", async () => {
    auth.refuse("/email-otp/reset-password", 400, "INVALID_OTP")
    const { flow, human } = await resetting()
    await flow.save({ code: CODE, password: PASSWORD })
    expect(human.resets()).toBe(2)
    expect(auth.to("/sign-in/email")).toEqual([])
  })

  it.each([
    [400, "INVALID_OTP", "code", "That code isn’t right. Check the most recent email from Lane."],
    [400, "OTP_EXPIRED", "code", "That code has expired. Send a new one."],
    [403, "TOO_MANY_ATTEMPTS", "code", "That code has expired. Send a new one."],
    [400, "PASSWORD_COMPROMISED", "password", "This password has appeared in a data breach elsewhere. Choose a different one."],
    [400, "PASSWORD_TOO_SHORT", "password", "Use at least 8 characters."],
    [503, "PASSWORD_CHECK_UNAVAILABLE", "password", "We couldn’t check this password right now. Try again in a minute."],
  ])("puts a %i %s answer on the %s field", async (status, code, field, line) => {
    auth.refuse("/email-otp/reset-password", status, code)
    const { flow } = await resetting()
    await flow.save({ code: CODE, password: PASSWORD })
    expect(flow.snapshot()).toMatchObject({ step: "reset", fieldErrors: { [field]: line }, alert: null })
  })

  it("refuses a short code and a 7-character password on their fields, and sends nothing", async () => {
    const { flow } = await resetting()
    await flow.save({ code: "4829", password: "seven77" })
    expect(flow.snapshot().fieldErrors).toEqual({ code: "Enter the 6-digit code from the email.", password: "Use at least 8 characters." })
    expect(auth.to("/email-otp/reset-password")).toEqual([])
  })

  it("says an empty new password on its field", async () => {
    const { flow } = await resetting()
    await flow.save({ code: CODE, password: "" })
    expect(flow.snapshot().fieldErrors).toEqual({ password: "Enter a new password." })
  })

  it("asks for the check and sends nothing while it hasn't finished", async () => {
    const { flow, human } = await resetting()
    human.check.receive(null)
    await flow.save({ code: CODE, password: PASSWORD })
    expect(flow.snapshot().alert?.message).toBe("Finish the check that you’re human, then try again.")
    expect(auth.to("/email-otp/reset-password")).toEqual([])
  })

  it("sends a new reset code with a fresh token, only 30 s after the last send", async () => {
    const { flow, human } = await resetting()
    clock += 29_999
    await flow.resendCode()
    expect(auth.to("/email-otp/request-password-reset")).toHaveLength(1)
    clock += 1
    human.pass("SECOND.TOKEN")
    await flow.resendCode()
    expect(auth.to("/email-otp/request-password-reset").map((request) => request.captcha)).toEqual([TURNSTILE_TOKEN, "SECOND.TOKEN"])
    expect(flow.snapshot()).toMatchObject({ step: "reset", nextSendAt: clock + 30_000 })
  })

  it("goes back to the request with the email kept, and keeps the wait", async () => {
    const { flow, human } = await resetting()
    flow.useDifferentEmail()
    expect(flow.snapshot()).toMatchObject({ step: "request", email: MEI, alert: null })
    human.pass()
    await flow.requestCode()
    expect(auth.to("/email-otp/request-password-reset")).toHaveLength(1)
    expect(flow.snapshot().nextSendAt).toBe(clock + 30_000)
  })

  // #376 story 21: the wait is per address, so a corrected address gets its own code straight away.
  it("sends a corrected address its own reset code at once", async () => {
    const { flow, human } = await resetting()
    flow.useDifferentEmail()
    flow.setEmail("ada@example.test")
    expect(flow.snapshot().nextSendAt).toBe(0)
    human.pass()
    await flow.requestCode()
    expect(auth.to("/email-otp/request-password-reset").map((request) => request.body)).toEqual([{ email: MEI }, { email: "ada@example.test" }])
    expect(flow.snapshot()).toMatchObject({ step: "reset", email: "ada@example.test", nextSendAt: clock + 30_000 })
  })

  it("continues to Lane once signed in", async () => {
    const { flow } = await resetting()
    await flow.save({ code: CODE, password: PASSWORD })
    flow.continueToLane()
    expect(navigate).toHaveBeenCalledWith("/")
  })

  it("sends Sign in to the sign-in page with the email, when the sign-in after saving failed", async () => {
    auth.refuse("/sign-in/email", 401, "INVALID_EMAIL_OR_PASSWORD")
    const { flow } = await resetting()
    await flow.save({ code: CODE, password: PASSWORD })
    flow.goToSignIn()
    expect(navigate).toHaveBeenCalledWith(`/login?email=${encodeURIComponent(MEI)}`)
  })

  it.each([
    ["signs in", () => {}],
    ["fails to sign in", () => void auth.refuse("/sign-in/email", 401, "INVALID_EMAIL_OR_PASSWORD")],
  ])("holds neither code nor password once it %s", async (_outcome, answer) => {
    answer()
    const { flow } = await resetting()
    await flow.save({ code: CODE, password: PASSWORD })
    const held = JSON.stringify(flow.snapshot())
    expect(held).not.toContain(CODE)
    expect(held).not.toContain(PASSWORD)
  })
})
