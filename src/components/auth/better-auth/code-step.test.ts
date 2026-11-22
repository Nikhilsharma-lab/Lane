import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { passedHumanCheck } from "@/test/auth-fetch-fake"
import { buttonsIn, markupWords, withoutHidden } from "@/test/exposed-markup"
import { CodeStep, type CodeStepProps } from "./code-step"

const step = (props: Partial<CodeStepProps> = {}) => renderToStaticMarkup(createElement(CodeStep, {
  purpose: "sign-in", email: "mei@example.test", code: "", onCodeChange: () => {}, resendIn: 0, coolingDown: false,
  pending: null, humanCheck: passedHumanCheck().check, onSubmit: () => {}, onResend: () => {}, onUseDifferentEmail: () => {},
  ...props,
}))
const resend = (html: string) => buttonsIn(html).find((button) => button.text.startsWith("Send a new code"))!

describe("the shared code step (#377)", () => {
  it.each([
    ["sign-in", "Sign-in code", "Sign in"],
    ["confirm", "Confirmation code", "Confirm email"],
    ["reset", "Reset code", "Save new password"],
  ] as const)("labels a %s code %s, with %s", (purpose, label, action) => {
    const html = step({ purpose })
    expect(html).toContain(`role="group" aria-label="${label}"`)
    expect(html).toContain(`aria-label="${label}, digit 1 of 6"`)
    expect(buttonsIn(html).filter((button) => button.submit).map((button) => button.name)).toEqual([action])
  })

  it("takes six digits, numeric, with the phone's one-time-code fill on the first box", () => {
    const html = step()
    expect(html.match(/inputMode="numeric"/g)).toHaveLength(6)
    expect(html.match(/autoComplete="one-time-code"/g)).toHaveLength(1)
    expect(html).toContain('noValidate=""')
  })

  it("says where the code went and how long it lasts: the server's 5 minutes", () => {
    const text = markupWords(step())
    expect(text).toContain("Sent to mei@example.test. Check spam if it isn’t there within a minute.")
    expect(text).toContain("The code works for 5 minutes.")
  })

  it("counts down to Send a new code on screen only: its name stays Send a new code", () => {
    const html = step({ resendIn: 30, coolingDown: true })
    expect(resend(html).text).toContain("Send a new code in 30s")
    expect(resend(html)).toMatchObject({ name: "Send a new code", ariaDisabled: true })
    expect(markupWords(withoutHidden(html))).not.toContain("in 30s")
  })

  it("offers Send a new code once the wait is over, and says so once", () => {
    const html = step({ resendIn: 0, coolingDown: true })
    expect(resend(html)).toMatchObject({ text: "Send a new code", ariaDisabled: false })
    expect(html).toContain(">You can send a new code now.<")
    expect(step({ resendIn: 12, coolingDown: true })).not.toContain("You can send a new code now.")
  })

  it("offers Use a different email", () => {
    expect(buttonsIn(step()).map((button) => button.name)).toContain("Use a different email")
  })

  it("puts the code's line on the code boxes", () => {
    const html = step({ error: "That code isn’t right. Check the most recent email from Lane." })
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(6)
    expect(html).toMatch(/role="alert"/)
    expect(html).toContain("That code isn’t right. Check the most recent email from Lane.")
  })

  it("keeps Send a new code off and says why when the human check isn't set up", () => {
    const html = step({ humanCheck: passedHumanCheck(null).check })
    expect(resend(html).ariaDisabled).toBe(true)
    expect(html).toContain("We can’t run the check that you’re human")
  })
})
