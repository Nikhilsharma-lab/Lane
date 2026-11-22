import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AUTH_ERROR_COPY } from "@/lib/auth-error-copy"
import { BETTER_AUTH_MESSAGE, fakeAuthFetch, passedHumanCheck, type AuthFetchFake } from "@/test/auth-fetch-fake"
import { buttonsIn, markupWords, withoutHidden } from "@/test/exposed-markup"
import { AuthForm, type AuthFormProps } from "./auth-form"
import { createSignUpFlow } from "./sign-up-flow"

vi.mock("./sign-up-flow", async (importActual) => ({
  ...(await importActual<typeof import("./sign-up-flow")>()),
  createSignUpFlow: vi.fn(),
}))
const actual = await vi.importActual<typeof import("./sign-up-flow")>("./sign-up-flow")

const MEI = "mei@example.test"
const PASSWORD = "long-enough-1"
const navigate = vi.fn()
let auth: AuthFetchFake
let rendered: string[] = []

/** The flow the form will pick up, made with the form's own options, so the test can drive it before rendering. */
function mount(props: Partial<AuthFormProps> = {}, siteKey?: string | null) {
  const human = passedHumanCheck(siteKey)
  const flow = actual.createSignUpFlow({ email: props.email, returnTo: props.returnTo, errorCode: props.errorCode, navigate, humanCheck: human.check })
  vi.mocked(createSignUpFlow).mockReturnValue(flow)
  const render = () => {
    const html = renderToStaticMarkup(createElement(AuthForm, { mode: "sign-up", ...props })).replace(/<!--.*?-->/g, "")
    rendered.push(html)
    return html
  }
  return { flow, human, render }
}
const input = (html: string, id: string) => new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html)?.[0] ?? ""

/** Mei's details typed and Create account pressed. */
async function created(props: Partial<AuthFormProps> = {}) {
  const mounted = mount({ email: MEI, ...props })
  mounted.flow.setName("Mei Lin")
  await mounted.flow.signUp({ password: PASSWORD })
  return mounted
}

beforeEach(() => {
  auth = fakeAuthFetch()
  navigate.mockReset()
})
afterEach(() => vi.unstubAllGlobals())

describe("the sign-up screen (#378, #346 layout A)", () => {
  it("puts Google first, then name, email, password, the human check and Create account", () => {
    const html = mount().render()
    const text = markupWords(withoutHidden(html))
    expect(text).toContain("Create your Lane account")
    const order = ["Continue with Google", "or", "Your name", "Email address", "Choose a password", "Use at least 8 characters.", "Create account"]
    let from = text.indexOf("Free during the pilot. You’ll confirm your email with a code.")
    expect(from).toBeGreaterThan(-1)
    for (const phrase of order) {
      const at = text.indexOf(` ${phrase} `, from)
      expect(at, phrase).toBeGreaterThan(from)
      from = at
    }
    expect(html.indexOf('data-turnstile=""')).toBeLessThan(html.indexOf(">Create account<"))
    expect(html).toContain('noValidate=""')
    expect(text).toContain("Have an account? Sign in")
    expect(text).toContain("Create or join a workspace after confirming your email.")
  })

  it("names its fields for password managers and focuses the first", () => {
    const html = mount().render()
    expect(input(html, "sign-up-name")).toMatch(/autoComplete="name"/)
    expect(input(html, "sign-up-email")).toMatch(/type="email"/)
    expect(input(html, "sign-up-email")).toMatch(/autoComplete="email"/)
    expect(input(html, "sign-up-password")).toMatch(/autoComplete="new-password"/)
    expect(html.match(/<input[^>]*autofocus/gi)?.length ?? 0).toBeLessThanOrEqual(1)
  })

  it("says the password rule under the password before any submit", () => {
    const html = mount().render()
    expect(html).toMatch(/id="sign-up-password"[^]*Use at least 8 characters\./)
    expect(html).not.toContain('role="alert"')
  })

  it("starts with the email it was given, such as an invitation's", () => {
    expect(input(mount({ email: MEI }).render(), "sign-up-email")).toContain(`value="${MEI}"`)
  })

  it("refuses a 7-character password on the field", async () => {
    const { flow, render } = mount({ email: MEI })
    flow.setName("Mei Lin")
    await flow.signUp({ password: "seven77" })
    const html = render()
    expect(input(html, "sign-up-password")).toContain('aria-invalid="true"')
    expect(html).toMatch(/id="sign-up-password-error"[^>]*role="alert"[^>]*>Use at least 8 characters\.</)
    expect(auth.requests).toEqual([])
  })

  it("reports an empty name and a badly formed email on their fields in Lane's words", async () => {
    const { flow, render } = mount()
    flow.setEmail("mei@")
    await flow.signUp({ password: PASSWORD })
    const html = render()
    expect(input(html, "sign-up-name")).toContain('aria-invalid="true"')
    expect(input(html, "sign-up-email")).toContain('aria-invalid="true"')
    expect(markupWords(html)).toContain("Enter your name.")
    expect(markupWords(html)).toContain("Enter a valid email address.")
  })

  it.each(["PASSWORD_COMPROMISED", "PASSWORD_CHECK_UNAVAILABLE"] as const)("puts %s's line on the password field", async (code) => {
    auth.refuse("/sign-up/email", code === "PASSWORD_COMPROMISED" ? 400 : 503, code)
    const { render } = await created()
    expect(render()).toMatch(new RegExp(`id="sign-up-password-error"[^>]*role="alert"[^>]*>${AUTH_ERROR_COPY[code]}<`))
  })

  it("says an account already uses the email, with Sign in instead, keeping the email", async () => {
    auth.refuse("/sign-up/email", 422, "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL")
    const { render } = await created({ returnTo: "/invite/inv_1" })
    const html = render()
    expect(markupWords(html)).toContain("A Lane account already uses this email. Sign in instead")
    expect(html).toContain(`href="/login?email=${encodeURIComponent(MEI)}&amp;redirect_url=%2Finvite%2Finv_1"`)
    expect(input(html, "sign-up-email")).toContain(`value="${MEI}"`)
  })

  it("asks to finish the check when there is no token yet", async () => {
    const { flow, human, render } = mount({ email: MEI })
    flow.setName("Mei Lin")
    human.check.receive(null)
    await flow.signUp({ password: PASSWORD })
    expect(markupWords(render())).toContain("Finish the check that you’re human, then try again.")
    expect(auth.requests).toEqual([])
  })

  it("keeps Create account off and says why without a site key, while Google stays on", () => {
    const html = mount({}, null).render()
    const buttons = buttonsIn(html)
    expect(buttons.find((button) => button.name === "Create account")?.disabled).toBe(true)
    expect(buttons.find((button) => button.name === "Continue with Google")).toMatchObject({ disabled: false, ariaDisabled: false })
    expect(html).toContain(AUTH_ERROR_COPY.HUMAN_CHECK_NOT_SET_UP)
  })

  it("shows Google's line when Google's error brought the person back", () => {
    expect(markupWords(mount({ errorCode: "access_denied" }).render())).toContain("Google sign-in didn’t finish. Try again, or use your email.")
  })
})

describe("the sign-up confirmation (#378)", () => {
  it("moves to the code step as Confirmation code, with Confirm email", async () => {
    const { render } = await created()
    const html = render()
    const text = markupWords(withoutHidden(html))
    expect(text).toContain("Confirm your email")
    expect(text).toContain(`Enter the 6-digit code we sent to ${MEI} to finish creating your account.`)
    expect(html).toContain('role="group" aria-label="Confirmation code"')
    expect(buttonsIn(html).filter((button) => button.submit).map((button) => button.name)).toEqual(["Confirm email"])
    expect(buttonsIn(html).find((button) => button.text.startsWith("Send a new code"))).toMatchObject({ name: "Send a new code", ariaDisabled: true })
  })

  it("lands on the code step with the couldn't-send line and Send a new code ready", async () => {
    auth.refuse("/sign-up/email", 502, "SIGN_UP_CODE_NOT_SENT")
    const { render } = await created()
    const html = render()
    expect(markupWords(html)).toContain("We couldn’t send the code right now. Try again in a few minutes.")
    expect(html).toContain('aria-label="Confirmation code"')
    expect(buttonsIn(html).find((button) => button.text === "Send a new code")).toMatchObject({ ariaDisabled: false })
  })

  it.each(["INVALID_OTP", "OTP_EXPIRED"] as const)("puts %s's line on the code field", async (code) => {
    auth.refuse("/email-otp/verify-email", 400, code)
    const { flow, render } = await created()
    await flow.confirmEmail({ code: "000000" })
    const html = render()
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(6)
    expect(html).toContain(AUTH_ERROR_COPY[code])
  })

  it("says Email confirmed. Sign in to continue. with Sign in when the sign-in after it fails", async () => {
    auth.refuse("/sign-in/email", 429, "RATE_LIMITED")
    const { flow, render } = await created({ returnTo: "/invite/inv_1" })
    await flow.confirmEmail({ code: "482913" })
    const html = render()
    expect(markupWords(withoutHidden(html))).toContain("Email confirmed Sign in to continue.")
    expect(buttonsIn(html).map((button) => button.name)).toContain("Sign in")
    expect(markupWords(html)).not.toContain(AUTH_ERROR_COPY.RATE_LIMITED)
    expect(html).not.toContain('aria-label="Confirmation code"')
  })

  it("goes back to the details with the email kept", async () => {
    const { flow, render } = await created()
    flow.useDifferentEmail()
    const html = render()
    expect(markupWords(html)).toContain("Create your Lane account")
    expect(input(html, "sign-up-email")).toContain(`value="${MEI}"`)
  })
})

// Runs last: every screen the tests above rendered.
describe("what the sign-up screens never say (#378)", () => {
  it("shows no Better Auth message and never says owner", () => {
    expect(rendered.length).toBeGreaterThan(10)
    for (const html of rendered) {
      expect(html).not.toContain(BETTER_AUTH_MESSAGE)
      expect(markupWords(html)).not.toMatch(/owner/i)
    }
    rendered = []
  })
})
