import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AUTH_ERROR_COPY } from "@/lib/auth-error-copy"
import { BETTER_AUTH_MESSAGE, fakeAuthFetch, passedHumanCheck, type AuthFetchFake } from "@/test/auth-fetch-fake"
import { buttonsIn, markupWords, withoutHidden } from "@/test/exposed-markup"
import { PasswordResetForm, type PasswordResetFormProps } from "./password-reset-form"
import { createPasswordResetFlow } from "./password-reset-flow"

vi.mock("./password-reset-flow", async (importActual) => ({
  ...(await importActual<typeof import("./password-reset-flow")>()),
  createPasswordResetFlow: vi.fn(),
}))
const actual = await vi.importActual<typeof import("./password-reset-flow")>("./password-reset-flow")

const MEI = "mei@example.test"
const CODE = "482913"
const PASSWORD = "brand-new-pass"
const navigate = vi.fn()
let auth: AuthFetchFake
let rendered: string[] = []

/** The flow the screen will pick up, made with the screen's own options, so the test can drive it before rendering. */
function mount(props: PasswordResetFormProps = {}, siteKey?: string | null) {
  const human = passedHumanCheck(siteKey)
  const flow = actual.createPasswordResetFlow({ email: props.email, navigate, humanCheck: human.check })
  vi.mocked(createPasswordResetFlow).mockReturnValue(flow)
  const render = () => {
    const html = renderToStaticMarkup(createElement(PasswordResetForm, props)).replace(/<!--.*?-->/g, "")
    rendered.push(html)
    return html
  }
  return { flow, human, render }
}
const input = (html: string, id: string) => new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html)?.[0] ?? ""

/** Mei's reset code sent, and the check passed again. */
async function resetting() {
  const mounted = mount({ email: MEI })
  await mounted.flow.requestCode()
  mounted.human.pass()
  return mounted
}

beforeEach(() => {
  auth = fakeAuthFetch()
  navigate.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe("the forgot-password step (#378)", () => {
  it("asks for the email with the human check and Send reset code", () => {
    const html = mount().render()
    const text = markupWords(withoutHidden(html))
    expect(text).toContain("Forgot your password?")
    expect(text).toContain("Enter the email you use for Lane. We’ll email you a code to reset it.")
    expect(input(html, "reset-email")).toMatch(/type="email"/)
    expect(input(html, "reset-email")).toMatch(/autoComplete="email"/)
    expect(html).toContain('data-turnstile=""')
    expect(html).toContain('noValidate=""')
    expect(buttonsIn(html).filter((button) => button.submit).map((button) => button.name)).toEqual(["Send reset code"])
  })

  it("says Remembered it? Sign in in the header and that saving signs out other devices in the footer", () => {
    const text = markupWords(mount().render())
    expect(text).toContain("Remembered it? Sign in")
    expect(text).toContain("Saving a new password signs you out on your other devices.")
  })

  it("says no Lane account uses the email, with Sign up instead keeping it", async () => {
    auth.refuse("/email-otp/request-password-reset", 400, "NO_ACCOUNT")
    const { flow, render } = mount({ email: MEI })
    await flow.requestCode()
    const html = render()
    expect(markupWords(html)).toContain("No Lane account uses this email. Sign up instead")
    expect(html).toContain(`href="/signup?email=${encodeURIComponent(MEI)}"`)
    expect(input(html, "reset-email")).toContain(`value="${MEI}"`)
  })

  it.each(["CODE_NOT_SENT", "TOO_MANY_CODES", "RATE_LIMITED"] as const)("shows %s's line", async (code) => {
    auth.refuse("/email-otp/request-password-reset", code === "CODE_NOT_SENT" ? 502 : 429, code)
    const { flow, render } = mount({ email: MEI })
    await flow.requestCode()
    expect(markupWords(render())).toContain(AUTH_ERROR_COPY[code])
  })

  it("reports a badly formed email on the field in Lane's words", async () => {
    const { flow, render } = mount({ email: "mei@" })
    await flow.requestCode()
    const html = render()
    expect(input(html, "reset-email")).toContain('aria-invalid="true"')
    expect(html).toContain("Enter a valid email address.")
  })

  it("keeps Send reset code off and says why without a site key", () => {
    const html = mount({}, null).render()
    expect(buttonsIn(html).find((button) => button.name === "Send reset code")?.disabled).toBe(true)
    expect(html).toContain(AUTH_ERROR_COPY.HUMAN_CHECK_NOT_SET_UP)
  })
})

describe("the reset step (#378)", () => {
  it("asks for the reset code and a new password, with the human check, Save new password, Send a new code and Use a different email", async () => {
    const { render } = await resetting()
    const html = render()
    const text = markupWords(withoutHidden(html))
    expect(text).toContain("Reset your password")
    expect(text).toContain(`Enter the code we sent to ${MEI} and choose a new password.`)
    expect(html).toContain('role="group" aria-label="Reset code"')
    expect(html.match(/autoComplete="one-time-code"/g)).toHaveLength(1)
    expect(input(html, "reset-new-password")).toMatch(/autoComplete="new-password"/)
    expect(text).toContain("Use at least 8 characters.")
    expect(html).toContain('data-turnstile=""')
    const buttons = buttonsIn(html)
    expect(buttons.filter((button) => button.submit).map((button) => button.name)).toEqual(["Save new password"])
    expect(buttons.find((button) => button.text.startsWith("Send a new code"))).toMatchObject({ name: "Send a new code", ariaDisabled: true })
    expect(buttons.map((button) => button.name)).toContain("Use a different email")
    expect(text).toContain("Remembered it? Sign in")
    expect(text).toContain("Saving a new password signs you out on your other devices.")
  })

  it.each(["INVALID_OTP", "OTP_EXPIRED"] as const)("puts %s's line on the code field", async (code) => {
    auth.refuse("/email-otp/reset-password", 400, code)
    const { flow, render } = await resetting()
    await flow.save({ code: CODE, password: PASSWORD })
    const html = render()
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(6)
    expect(html).toContain(AUTH_ERROR_COPY[code])
  })

  it("puts a breached password's line on the password field", async () => {
    auth.refuse("/email-otp/reset-password", 400, "PASSWORD_COMPROMISED")
    const { flow, render } = await resetting()
    await flow.save({ code: CODE, password: PASSWORD })
    expect(render()).toMatch(new RegExp(`id="reset-new-password-error"[^>]*role="alert"[^>]*>${AUTH_ERROR_COPY.PASSWORD_COMPROMISED}<`))
  })

  it("refuses a 7-character password on the field", async () => {
    const { flow, render } = await resetting()
    await flow.save({ code: CODE, password: "seven77" })
    const html = render()
    expect(input(html, "reset-new-password")).toContain('aria-invalid="true"')
    expect(html).toMatch(/id="reset-new-password-error"[^>]*role="alert"[^>]*>Use at least 8 characters\.</)
    expect(auth.to("/email-otp/reset-password")).toEqual([])
  })

  it("says Password saved, signed in here and signed out elsewhere, after a save and a sign-in", async () => {
    const { flow, render } = await resetting()
    await flow.save({ code: CODE, password: PASSWORD })
    const html = render()
    expect(markupWords(withoutHidden(html))).toContain("Password saved You’re signed in here, and signed out on your other devices.")
    expect(buttonsIn(html).map((button) => button.name)).toContain("Continue")
    expect(html).not.toContain('aria-label="Reset code"')
  })

  it("says Password saved, sign in with the new password, after a save and a failed sign-in", async () => {
    auth.refuse("/sign-in/email", 429, "RATE_LIMITED")
    const { flow, render } = await resetting()
    await flow.save({ code: CODE, password: PASSWORD })
    const html = render()
    expect(markupWords(withoutHidden(html))).toContain("Password saved Sign in with your new password.")
    expect(buttonsIn(html).map((button) => button.name)).toContain("Sign in")
    expect(markupWords(html)).not.toContain(AUTH_ERROR_COPY.RATE_LIMITED)
  })

  it("goes back to the request step with the email kept", async () => {
    const { flow, render } = await resetting()
    flow.useDifferentEmail()
    const html = render()
    expect(markupWords(html)).toContain("Forgot your password?")
    expect(input(html, "reset-email")).toContain(`value="${MEI}"`)
  })
})

// Runs last: every screen the tests above rendered.
describe("what the recovery screens never say (#378)", () => {
  it("shows no Better Auth message and never says owner", () => {
    expect(rendered.length).toBeGreaterThan(10)
    for (const html of rendered) {
      expect(html).not.toContain(BETTER_AUTH_MESSAGE)
      expect(markupWords(html)).not.toMatch(/owner/i)
    }
    rendered = []
  })
})
