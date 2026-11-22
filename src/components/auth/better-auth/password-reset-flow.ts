import * as auth from "@/lib/auth-client"
import { CODE_MISSING, isWholeCode, NEW_PASSWORD_MISSING, PASSWORD_MIN_LENGTH } from "@/lib/auth-code-rules"
import { authErrorCopy, CODE_REFUSALS, eachCode, NEW_PASSWORD_REFUSALS } from "@/lib/auth-error-copy"
import { HOME } from "@/lib/auth-return-address"
import { emailAddressProblem } from "@/lib/email-address-rules"
import { signInPage } from "./auth-addresses"
import { createAuthFlowStore } from "./auth-flow-store"
import { createCodeSends } from "./code-sends"
import { createHumanCheck, withHumanCheck, type HumanCheck } from "./human-check"

/** The email and Send reset code, then the code and new password, then the saved password. */
export type PasswordResetStep = "request" | "reset" | "saved"
export type PasswordResetField = "email" | "code" | "password"
export type PasswordResetFieldErrors = Partial<Record<PasswordResetField, string>>
/** What the box under the fields offers beside its line: Sign up instead. */
export type PasswordResetOffer = "sign-up" | null
export type PasswordResetPending = "send" | "save" | null

export type PasswordResetState = {
  step: PasswordResetStep
  /** The typed email, kept across the steps. */
  email: string
  fieldErrors: PasswordResetFieldErrors
  alert: { message: string; offer: PasswordResetOffer } | null
  pending: PasswordResetPending
  /** When Send a new code is offered again (ms since the epoch); 0 before any code was sent. */
  nextSendAt: number
  /** Once saved: whether the sign-in with the new password went through. */
  signedIn: boolean
}

type Options = {
  /** An email to start with. */
  email?: string
  navigate: (path: string) => void
  humanCheck?: HumanCheck
  now?: () => number
}

/**
 * #378 (#376 "Forgot and reset"): the forgot and reset screen's state, made once per mount, beside today's Clerk
 * recovery flow. Two steps in one flow: the reset code is asked for, then saved with a new password, and the flow
 * signs in with it. Both calls need the human check. Neither the code nor the password is ever in its state: each is
 * passed to the call that sends it, and the screen drops them after.
 */
export function createPasswordResetFlow({ email = "", navigate, humanCheck = createHumanCheck(), now = Date.now }: Options) {
  const sends = createCodeSends(now)
  const flow = createAuthFlowStore<PasswordResetState>(
    { step: "request", email, fieldErrors: {}, alert: null, pending: null, nextSendAt: 0, signedIn: false },
    { fieldOf: { ...eachCode(CODE_REFUSALS, "code"), ...eachCode(NEW_PASSWORD_REFUSALS, "password") }, offerOf: { NO_ACCOUNT: "sign-up" } },
  )
  const { get, set, run, refuse } = flow
  const typedEmail = () => get().email.trim()

  async function send() {
    const answer = await withHumanCheck(humanCheck, (token) => auth.requestReset({ email: typedEmail() }, token))
    if (!answer.ok) return refuse(answer.code)
    sends.sent()
    set({ step: "reset", fieldErrors: {}, alert: null, nextSendAt: sends.nextSendAt() })
  }

  return {
    humanCheck,
    now,
    snapshot: get,
    subscribe: flow.subscribe,
    setEmail: flow.setEmail,
    clearFieldError: flow.clearFieldError,
    /** Send reset code. */
    requestCode: () =>
      run("send", async () => {
        if (get().step !== "request" || sends.waiting()) return
        const problem = emailAddressProblem(get().email)
        if (problem) return flow.refuseFields({ email: problem })
        await send()
      }),
    /** "Send a new code", from the reset step, once the wait is over. */
    resendCode: () =>
      run("send", async () => {
        if (get().step !== "reset" || sends.waiting()) return
        await send()
      }),
    /** Save new password, then sign in with it. Saving signs out every device (increment 3's server). */
    save: ({ code, password }: { code: string; password: string }) =>
      run("save", async () => {
        if (get().step !== "reset") return
        const fieldErrors: PasswordResetFieldErrors = {}
        if (!isWholeCode(code)) fieldErrors.code = CODE_MISSING
        if (!password) fieldErrors.password = NEW_PASSWORD_MISSING
        else if (password.length < PASSWORD_MIN_LENGTH) fieldErrors.password = authErrorCopy("PASSWORD_TOO_SHORT")
        if (Object.keys(fieldErrors).length) return flow.refuseFields(fieldErrors)
        const saved = await withHumanCheck(humanCheck, (token) => auth.resetPassword({ email: typedEmail(), code: code.trim(), password }, token))
        if (!saved.ok) return refuse(saved.code)
        const signedIn = await auth.signInWithPassword({ email: typedEmail(), password })
        set({ step: "saved", signedIn: signedIn.ok, fieldErrors: {}, alert: null })
      }),
    /** "Use a different email": back to the request, with the email kept. The resend wait stays. */
    useDifferentEmail() {
      if (get().pending || get().step !== "reset") return
      set({ step: "request", fieldErrors: {}, alert: null })
    },
    /** Continue, once signed in with the new password. */
    continueToLane() {
      if (get().step === "saved" && get().signedIn) navigate(HOME)
    },
    /** Sign in, once saved but the sign-in after it didn't go: the sign-in page, email kept. */
    goToSignIn() {
      navigate(signInPage(get().email))
    },
  }
}

export type PasswordResetFlow = ReturnType<typeof createPasswordResetFlow>
