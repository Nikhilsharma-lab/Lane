import * as auth from "@/lib/auth-client"
import { CODE_LENGTH } from "@/lib/auth-code-rules"
import { authErrorCopy } from "@/lib/auth-error-copy"
import { safeReturnAddress } from "@/lib/auth-return-address"
import { emailAddressProblem } from "@/lib/email-address-rules"
import { signInPage } from "./auth-addresses"
import { createCodeSends } from "./code-sends"
import { createHumanCheck, withHumanCheck, type HumanCheck } from "./human-check"

/** Email and password, the screen asking for a sign-in code, and the code step. */
export type SignInStep = "password" | "code-request" | "code"
export type SignInField = "email" | "password" | "code"
export type SignInFieldErrors = Partial<Record<SignInField, string>>
/** What the box under the fields offers beside its line: Sign up instead, or the code path. */
export type SignInOffer = "sign-up" | "code" | null
export type SignInPending = "password" | "google" | "send" | "code" | null

export const PASSWORD_MISSING = "Enter your password."
// Proposed for Nikhil (#377): the prototype keeps Sign in disabled until six digits; Lane says it on the field instead.
export const CODE_MISSING = "Enter the 6-digit code from the email."

/** Codes whose words belong on a field rather than in the box under the fields. */
const FIELD_OF: Partial<Record<string, SignInField>> = {
  INVALID_EMAIL_OR_PASSWORD: "password",
  INVALID_OTP: "code",
  OTP_EXPIRED: "code",
  TOO_MANY_ATTEMPTS: "code",
}
const OFFER_OF: Partial<Record<string, SignInOffer>> = {
  NO_ACCOUNT: "sign-up",
  EMAIL_NOT_VERIFIED: "code",
}

export type SignInState = {
  step: SignInStep
  /** The typed email, kept across the steps. */
  email: string
  fieldErrors: SignInFieldErrors
  alert: { message: string; offer: SignInOffer } | null
  pending: SignInPending
  /** When Send a new code is offered again (ms since the epoch); 0 before any code was sent. */
  nextSendAt: number
}

type Options = {
  /** An email to start with, such as the invitation's. */
  email?: string
  /** Where to go after signing in; anything but a path within Lane becomes `/`. */
  returnTo?: string
  /** The `error` Google's redirect brought back to this screen. */
  errorCode?: string
  navigate: (path: string) => void
  humanCheck?: HumanCheck
  now?: () => number
}

/**
 * #377: the sign-in screen's state, made once per mount, as `createPasswordRecoveryFlow` is. It holds only what the
 * screen shows: never a password or a code. Every call goes through Lane's browser auth client, and every refusal
 * reads Lane's words from `authErrorCopy`.
 */
export function createSignInFlow({ email = "", returnTo, errorCode, navigate, humanCheck = createHumanCheck(), now = Date.now }: Options) {
  const destination = safeReturnAddress(returnTo)
  const sends = createCodeSends(now)
  let state: SignInState = {
    step: "password",
    email,
    fieldErrors: {},
    alert: errorCode ? { message: authErrorCopy(errorCode), offer: null } : null,
    pending: null,
    nextSendAt: 0,
  }
  const listeners = new Set<() => void>()
  const set = (next: Partial<SignInState>) => {
    state = { ...state, ...next }
    for (const listener of listeners) listener()
  }

  function refuse(code: string | undefined) {
    const field = code ? FIELD_OF[code] : undefined
    const message = authErrorCopy(code)
    set(field ? { fieldErrors: { [field]: message }, alert: null } : { fieldErrors: {}, alert: { message, offer: (code && OFFER_OF[code]) || null } })
  }

  /** Runs one call at a time; a press while one is answering does nothing. */
  async function run(pending: Exclude<SignInPending, null>, call: () => Promise<void>) {
    if (state.pending) return
    set({ pending })
    try {
      await call()
    } finally {
      set({ pending: null })
    }
  }

  /** The email's problem on its field, or null when it's an address. */
  function checkEmail(extra: SignInFieldErrors = {}) {
    const problem = emailAddressProblem(state.email)
    const fieldErrors = { ...(problem ? { email: problem } : {}), ...extra }
    if (!Object.keys(fieldErrors).length) return true
    set({ fieldErrors, alert: null })
    return false
  }

  async function send() {
    const answer = await withHumanCheck(humanCheck, (token) => auth.sendCode({ email: state.email.trim(), purpose: "sign-in" }, token))
    if (!answer.ok) return refuse(answer.code)
    sends.sent()
    set({ step: "code", fieldErrors: {}, alert: null, nextSendAt: sends.nextSendAt() })
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
    clearFieldError(field: SignInField) {
      if (state.fieldErrors[field]) set({ fieldErrors: { ...state.fieldErrors, [field]: undefined } })
    },
    signInWithPassword: ({ password }: { password: string }) =>
      run("password", async () => {
        if (!checkEmail(password ? {} : { password: PASSWORD_MISSING })) return
        const answer = await auth.signInWithPassword({ email: state.email.trim(), password })
        if (answer.ok) navigate(destination)
        else refuse(answer.code)
      }),
    continueWithGoogle: () =>
      run("google", async () => {
        set({ alert: null })
        // On success Better Auth's client sends the browser to Google; the page leaves.
        const answer = await auth.signInWithGoogle({ returnTo: destination, errorTo: signInPage(undefined, returnTo) })
        if (!answer.ok) refuse(answer.code)
      }),
    /** "Email me a sign-in code instead": the code request, with the email kept. */
    useCode() {
      if (state.pending) return
      set({ step: "code-request", fieldErrors: {}, alert: null })
    },
    /** "Use your password instead". */
    usePassword() {
      if (state.pending) return
      set({ step: "password", fieldErrors: {}, alert: null })
    },
    /** "Email me a code": needs the human check. */
    sendCode: () =>
      run("send", async () => {
        if (sends.waiting() || !checkEmail()) return
        await send()
      }),
    /** "Send a new code", from the code step, once the wait is over. */
    resendCode: () =>
      run("send", async () => {
        if (state.step !== "code" || sends.waiting()) return
        await send()
      }),
    signInWithCode: ({ code }: { code: string }) =>
      run("code", async () => {
        if (state.step !== "code") return
        const digits = code.trim()
        if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(digits)) return set({ fieldErrors: { code: CODE_MISSING }, alert: null })
        const answer = await auth.signInWithCode({ email: state.email.trim(), code: digits })
        if (answer.ok) navigate(destination)
        else refuse(answer.code)
      }),
    /** "Use a different email": back to the code request, with the email kept. The resend wait stays. */
    useDifferentEmail() {
      if (state.pending || state.step !== "code") return
      set({ step: "code-request", fieldErrors: {}, alert: null })
    },
  }
}

export type SignInFlow = ReturnType<typeof createSignInFlow>
