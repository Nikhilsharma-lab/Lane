import * as auth from "@/lib/auth-client"
import { CODE_LENGTH } from "@/lib/auth-code-rules"
import { authErrorCopy } from "@/lib/auth-error-copy"
import { HOME } from "@/lib/auth-return-address"
import { emailAddressProblem } from "@/lib/email-address-rules"
import { signInPage } from "./auth-addresses"
import { createCodeSends } from "./code-sends"
import { createHumanCheck, withHumanCheck, type HumanCheck } from "./human-check"
import { CODE_MISSING } from "./sign-in-flow"
import { PASSWORD_MIN_LENGTH } from "./sign-up-flow"

/** The email and Send reset code, then the code and new password, then the saved password. */
export type PasswordResetStep = "request" | "reset" | "saved"
export type PasswordResetField = "email" | "code" | "password"
export type PasswordResetFieldErrors = Partial<Record<PasswordResetField, string>>
/** What the box under the fields offers beside its line: Sign up instead. */
export type PasswordResetOffer = "sign-up" | null
export type PasswordResetPending = "send" | "save" | null

/** Today's recovery line for an empty new password (`password-recovery-flow.ts`). */
export const NEW_PASSWORD_MISSING = "Enter a new password."

/** Codes whose words belong on a field rather than in the box under the fields. */
const FIELD_OF: Partial<Record<string, PasswordResetField>> = {
  INVALID_OTP: "code",
  OTP_EXPIRED: "code",
  TOO_MANY_ATTEMPTS: "code",
  PASSWORD_TOO_SHORT: "password",
  PASSWORD_TOO_LONG: "password",
  PASSWORD_COMPROMISED: "password",
  PASSWORD_CHECK_UNAVAILABLE: "password",
}
const OFFER_OF: Partial<Record<string, PasswordResetOffer>> = {
  NO_ACCOUNT: "sign-up",
}

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
  let state: PasswordResetState = { step: "request", email, fieldErrors: {}, alert: null, pending: null, nextSendAt: 0, signedIn: false }
  const listeners = new Set<() => void>()
  const set = (next: Partial<PasswordResetState>) => {
    state = { ...state, ...next }
    for (const listener of listeners) listener()
  }

  function refuse(code: string | undefined) {
    const field = code ? FIELD_OF[code] : undefined
    const message = authErrorCopy(code)
    set(field ? { fieldErrors: { [field]: message }, alert: null } : { fieldErrors: {}, alert: { message, offer: (code && OFFER_OF[code]) || null } })
  }

  /** Runs one call at a time; a press while one is answering does nothing. */
  async function run(pending: Exclude<PasswordResetPending, null>, call: () => Promise<void>) {
    if (state.pending) return
    set({ pending })
    try {
      await call()
    } finally {
      set({ pending: null })
    }
  }

  async function send() {
    const answer = await withHumanCheck(humanCheck, (token) => auth.requestReset({ email: state.email.trim() }, token))
    if (!answer.ok) return refuse(answer.code)
    sends.sent()
    set({ step: "reset", fieldErrors: {}, alert: null, nextSendAt: sends.nextSendAt() })
  }

  return {
    humanCheck,
    now,
    snapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /** Typing in the email field clears what was said about it. */
    setEmail(next: string) {
      set({ email: next, fieldErrors: { ...state.fieldErrors, email: undefined } })
    },
    clearFieldError(field: PasswordResetField) {
      if (state.fieldErrors[field]) set({ fieldErrors: { ...state.fieldErrors, [field]: undefined } })
    },
    /** Send reset code. */
    requestCode: () =>
      run("send", async () => {
        if (state.step !== "request" || sends.waiting()) return
        const problem = emailAddressProblem(state.email)
        if (problem) return set({ fieldErrors: { email: problem }, alert: null })
        await send()
      }),
    /** "Send a new code", from the reset step, once the wait is over. */
    resendCode: () =>
      run("send", async () => {
        if (state.step !== "reset" || sends.waiting()) return
        await send()
      }),
    /** Save new password, then sign in with it. Saving signs out every device (increment 3's server). */
    save: ({ code, password }: { code: string; password: string }) =>
      run("save", async () => {
        if (state.step !== "reset") return
        const digits = code.trim()
        const fieldErrors: PasswordResetFieldErrors = {}
        if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(digits)) fieldErrors.code = CODE_MISSING
        if (!password) fieldErrors.password = NEW_PASSWORD_MISSING
        else if (password.length < PASSWORD_MIN_LENGTH) fieldErrors.password = authErrorCopy("PASSWORD_TOO_SHORT")
        if (Object.keys(fieldErrors).length) return set({ fieldErrors, alert: null })
        const saved = await withHumanCheck(humanCheck, (token) => auth.resetPassword({ email: state.email.trim(), code: digits, password }, token))
        if (!saved.ok) return refuse(saved.code)
        const signedIn = await auth.signInWithPassword({ email: state.email.trim(), password })
        set({ step: "saved", signedIn: signedIn.ok, fieldErrors: {}, alert: null })
      }),
    /** "Use a different email": back to the request, with the email kept. The resend wait stays. */
    useDifferentEmail() {
      if (state.pending || state.step !== "reset") return
      set({ step: "request", fieldErrors: {}, alert: null })
    },
    /** Continue, once signed in with the new password. */
    continueToLane() {
      if (state.step === "saved" && state.signedIn) navigate(HOME)
    },
    /** Sign in, once saved but the sign-in after it didn't go: the sign-in page, email kept. */
    goToSignIn() {
      navigate(signInPage(state.email))
    },
  }
}

export type PasswordResetFlow = ReturnType<typeof createPasswordResetFlow>
