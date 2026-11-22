import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AUTH_ERROR_COPY } from "@/lib/auth-error-copy"
import { BETTER_AUTH_MESSAGE, fakeAuthFetch, passedHumanCheck, type AuthFetchFake } from "@/test/auth-fetch-fake"
import { buttonsIn, markupWords, withoutHidden } from "@/test/exposed-markup"
import { AuthForm, type AuthFormProps } from "./auth-form"
import { createSignInFlow } from "./sign-in-flow"

vi.mock("./sign-in-flow", async (importActual) => ({
  ...(await importActual<typeof import("./sign-in-flow")>()),
  createSignInFlow: vi.fn(),
}))
const actual = await vi.importActual<typeof import("./sign-in-flow")>("./sign-in-flow")

const MEI = "mei@example.test"
const navigate = vi.fn()
let auth: AuthFetchFake
let rendered: string[] = []

/**
 * The flow the form will pick up, created as the form would create it (the same options), so the test can drive it
 * the way a person would before rendering.
 */
function mount(props: Partial<AuthFormProps> = {}, siteKey?: string | null) {
  const human = passedHumanCheck(siteKey)
  const flow = actual.createSignInFlow({ email: props.email, returnTo: props.returnTo, errorCode: props.errorCode, navigate, humanCheck: human.check })
  vi.mocked(createSignInFlow).mockReturnValue(flow)
  const render = () => {
    const html = renderToStaticMarkup(createElement(AuthForm, { mode: "sign-in", ...props })).replace(/<!--.*?-->/g, "")
    rendered.push(html)
    return html
  }
  return { flow, human, render }
}
const input = (html: string, id: string) => new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html)?.[0] ?? ""

describe("the sign-in screen (#377, #346 layout A)", () => {
  beforeEach(() => {
    auth = fakeAuthFetch()
    navigate.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it("puts Continue with Google first, then email and password, with Forgot password? under the password", () => {
    const html = mount().render()
    const text = markupWords(withoutHidden(html))
    expect(text).toContain("Sign in to Lane")
    const order = ["Continue with Google", "or", "Email address", "Password", "Forgot password?", "Sign in", "Email me a sign-in code instead"]
    // Each phrase found after the one before it.
    let from = text.indexOf("Welcome back.")
    for (const phrase of order) {
      const at = text.indexOf(` ${phrase} `, from)
      expect(at, phrase).toBeGreaterThan(from)
      from = at
    }
    expect(html).toContain('href="/forgot-password"')
    expect(html).toContain('noValidate=""')
  })

  it("names its fields for password managers and focuses the first", () => {
    const html = mount().render()
    expect(input(html, "sign-in-email")).toMatch(/type="email"/)
    expect(input(html, "sign-in-email")).toMatch(/autoComplete="email"/)
    expect(input(html, "sign-in-password")).toMatch(/autoComplete="current-password"/)
  })

  it("starts with the email it was given, such as an invitation's", () => {
    expect(input(mount({ email: MEI }).render(), "sign-in-email")).toContain(`value="${MEI}"`)
  })

  // #376 story 48: either path ends back on the invitation.
  it("keeps the typed email and the return on the header's Create an account", () => {
    const { flow, render } = mount({ email: MEI, returnTo: "/invite/inv_1" })
    expect(render()).toContain(`href="/signup?email=${encodeURIComponent(MEI)}&amp;redirect_url=%2Finvite%2Finv_1"`)
    flow.setEmail("ada@example.test")
    expect(render()).toContain(`href="/signup?email=ada%40example.test&amp;redirect_url=%2Finvite%2Finv_1"`)
    expect(mount().render()).toContain('href="/signup"')
  })

  it("puts a wrong password's line on the password field", async () => {
    auth.refuse("/sign-in/email", 401, "INVALID_EMAIL_OR_PASSWORD")
    const { flow, render } = mount({ email: MEI })
    await flow.signInWithPassword({ password: "not-it" })
    const html = render()
    expect(input(html, "sign-in-password")).toMatch(/aria-invalid="true"[^>]*aria-describedby="sign-in-password-error"|aria-describedby="sign-in-password-error"[^>]*aria-invalid="true"/)
    expect(html).toMatch(/id="sign-in-password-error"[^>]*role="alert"[^>]*>That email and password don’t match. Try again, or email yourself a code.</)
  })

  it("reports an empty or badly formed email on the field in Lane's words", async () => {
    const { flow, render } = mount()
    flow.setEmail("mei@")
    await flow.signInWithPassword({ password: "right-one" })
    const html = render()
    expect(input(html, "sign-in-email")).toContain('aria-invalid="true"')
    expect(html).toContain("Enter a valid email address.")
  })

  it("shows Google's line when Google's error brought the person back", () => {
    expect(markupWords(mount({ errorCode: "access_denied" }).render())).toContain("Google sign-in didn’t finish. Try again, or use your email.")
  })

  it("offers the code path for an unconfirmed email", async () => {
    auth.refuse("/sign-in/email", 403, "EMAIL_NOT_VERIFIED")
    const { flow, render } = mount({ email: MEI })
    await flow.signInWithPassword({ password: "right-one" })
    const html = render()
    expect(markupWords(html)).toContain("This email isn’t confirmed yet. Email yourself a code to confirm it.")
    expect(buttonsIn(html).map((button) => button.name)).toContain("Email me a sign-in code")
  })

  it("shows the generic line when the fetch itself throws", async () => {
    auth.throwOn("/sign-in/email")
    const { flow, render } = mount({ email: MEI })
    await flow.signInWithPassword({ password: "right-one" })
    expect(markupWords(render())).toContain("Something went wrong. Try again.")
  })

  it("keeps password and Google sign-in on without a site key", () => {
    const buttons = buttonsIn(mount({}, null).render())
    for (const name of ["Continue with Google", "Sign in"]) {
      expect(buttons.find((button) => button.name === name)).toMatchObject({ disabled: false, ariaDisabled: false })
    }
  })
})

describe("the sign-in code screens (#377)", () => {
  beforeEach(() => {
    auth = fakeAuthFetch()
    navigate.mockReset()
  })
  afterEach(() => vi.unstubAllGlobals())

  it("asks for the email with the human check and Email me a code, and offers the password back", () => {
    const { flow, render } = mount({ email: MEI })
    flow.useCode()
    const html = render()
    const text = markupWords(withoutHidden(html))
    expect(text).toContain("Sign in with a code")
    expect(input(html, "sign-in-email")).toContain(`value="${MEI}"`)
    expect(html).toContain('data-turnstile=""')
    expect(buttonsIn(html).map((button) => button.name)).toEqual(expect.arrayContaining(["Email me a code", "Use your password instead"]))
  })

  it("keeps Email me a code off and says why without a site key", () => {
    const { flow, render } = mount({ email: MEI }, null)
    flow.useCode()
    const html = render()
    expect(buttonsIn(html).find((button) => button.name === "Email me a code")?.disabled).toBe(true)
    expect(html).toContain("We can’t run the check that you’re human, so this is off for now. Continue with Google instead, or try again later.")
  })

  it("asks to finish the check when there is no token yet", async () => {
    const { flow, human, render } = mount({ email: MEI })
    flow.useCode()
    human.check.receive(null)
    await flow.sendCode()
    expect(markupWords(render())).toContain("Finish the check that you’re human, then try again.")
    expect(auth.requests).toEqual([])
  })

  it("says no Lane account uses the email, with Sign up instead keeping it", async () => {
    auth.refuse("/email-otp/send-verification-otp", 400, "NO_ACCOUNT")
    const { flow, render } = mount({ email: MEI })
    flow.useCode()
    await flow.sendCode()
    const html = render()
    expect(markupWords(html)).toContain("No Lane account uses this email. Sign up instead")
    expect(html).toContain(`href="/signup?email=${encodeURIComponent(MEI)}"`)
    expect(input(html, "sign-in-email")).toContain(`value="${MEI}"`)
  })

  it.each(["CODE_NOT_SENT", "TOO_MANY_CODES", "RATE_LIMITED"] as const)("shows %s's line", async (code) => {
    auth.refuse("/email-otp/send-verification-otp", code === "CODE_NOT_SENT" ? 502 : 429, code)
    const { flow, render } = mount({ email: MEI })
    flow.useCode()
    await flow.sendCode()
    expect(markupWords(render())).toContain(AUTH_ERROR_COPY[code])
  })

  it("moves to the code step in sign-in mode, waiting 30 s to offer a new code", async () => {
    const { flow, render } = mount({ email: MEI })
    flow.useCode()
    await flow.sendCode()
    const html = render()
    const text = markupWords(html)
    expect(text).toContain("Check your email")
    expect(text).toContain(`Sent to ${MEI}. Check spam if it isn’t there within a minute.`)
    expect(html).toContain('aria-label="Sign-in code"')
    const resend = buttonsIn(html).find((button) => button.text.startsWith("Send a new code"))!
    expect(resend.text).toContain("Send a new code in 30s")
    expect(resend).toMatchObject({ name: "Send a new code", ariaDisabled: true })
  })

  it.each(["INVALID_OTP", "OTP_EXPIRED"] as const)("puts %s's line on the code field", async (code) => {
    auth.refuse("/sign-in/email-otp", 400, code)
    const { flow, render } = mount({ email: MEI })
    flow.useCode()
    await flow.sendCode()
    await flow.signInWithCode({ code: "000000" })
    const html = render()
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(6)
    expect(html).toContain(AUTH_ERROR_COPY[code])
  })

  it("goes back to the email step with the email kept", async () => {
    const { flow, render } = mount({ email: MEI })
    flow.useCode()
    await flow.sendCode()
    flow.useDifferentEmail()
    const html = render()
    expect(markupWords(html)).toContain("Sign in with a code")
    expect(input(html, "sign-in-email")).toContain(`value="${MEI}"`)
  })
})

// Runs last: every screen the tests above rendered.
describe("what the sign-in screens never say (#377)", () => {
  it("shows no Better Auth message and never says owner", () => {
    expect(rendered.length).toBeGreaterThan(10)
    for (const html of rendered) {
      expect(html).not.toContain(BETTER_AUTH_MESSAGE)
      expect(markupWords(html)).not.toMatch(/owner/i)
    }
    rendered = []
  })
})
