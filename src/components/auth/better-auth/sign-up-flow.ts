import * as auth from "@/lib/auth-client"
import { CODE_LENGTH } from "@/lib/auth-code-rules"
import { authErrorCopy } from "@/lib/auth-error-copy"
import { safeReturnAddress } from "@/lib/auth-return-address"
import { emailAddressProblem } from "@/lib/email-address-rules"
import { signInPage, signUpPage } from "./auth-addresses"
import { createCodeSends } from "./code-sends"
import { createHumanCheck, withHumanCheck, type HumanCheck } from "./human-check"
import { CODE_MISSING } from "./sign-in-flow"

/** Where a new account goes once signed in, unless it came from somewhere such as an invitation. */
export const ONBOARDING_URL = "/onboarding"

/** The details (name, email, password), the confirmation code, and the confirmed email whose sign-in didn't follow. */
export type SignUpStep = "details" | "code" | "confirmed"
export type SignUpField = "name" | "email" | "password" | "code"
export type SignUpFieldErrors = Partial<Record<SignUpField, string>>
/** What the box under the fields offers beside its line: Sign in instead. */
export type SignUpOffer = "sign-in" | null
export type SignUpPending = "sign-up" | "google" | "send" | "code" | null

/** Better Auth's shortest password on Lane's server (increment 3), said before any request. */
export const PASSWORD_MIN_LENGTH = 8
// Proposed for Nikhil (#378): the prototype's client-side line (auth-prototype.tsx:234), not in #346's ERR table.
export const NAME_MISSING = "Enter your name."

/** Codes whose words belong on a field rather than in the box under the fields. */
const FIELD_OF: Partial<Record<string, SignUpField>> = {
  PASSWORD_TOO_SHORT: "password",
  PASSWORD_TOO_LONG: "password",
  PASSWORD_COMPROMISED: "password",
  PASSWORD_CHECK_UNAVAILABLE: "password",
  INVALID_OTP: "code",
  OTP_EXPIRED: "code",
  TOO_MANY_ATTEMPTS: "code",
}
const OFFER_OF: Partial<Record<string, SignUpOffer>> = {
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "sign-in",
}

export type SignUpState = {
  step: SignUpStep
  name: string
  email: string
  fieldErrors: SignUpFieldErrors
  alert: { message: string; offer: SignUpOffer } | null
  pending: SignUpPending
  /** When Send a new code is offered again (ms since the epoch); 0 when it's offered now. */
  nextSendAt: number
}

type Options = {
  /** An email to start with, such as the invitation's. */
  email?: string
  /** Where to go once signed in; without a path within Lane, Onboarding. */
  returnTo?: string
  /** The `error` Google's redirect brought back to this screen. */
  errorCode?: string
  navigate: (path: string) => void
  humanCheck?: HumanCheck
  now?: () => number
}

/**
 * #378: the sign-up screen's state, made once per mount, as `createSignInFlow` is. Its state holds only what the
 * screen shows. The typed password is kept in this closure from Create account until the sign-in after the email is
 * confirmed, and dropped then, whatever the answer.
 */
export function createSignUpFlow({ email = "", returnTo, errorCode, navigate, humanCheck = createHumanCheck(), now = Date.now }: Options) {
  const destination = signedUpDestination(returnTo)
  const sends = createCodeSends(now)
  /** The typed password, between Create account and the sign-in after confirming. Never in `state`. */
  let password: string | null = null
  let state: SignUpState = {
    step: "details",
    name: "",
    email,
    fieldErrors: {},
    alert: errorCode ? { message: authErrorCopy(errorCode), offer: null } : null,
    pending: null,
    nextSendAt: 0,
  }
  const listeners = new Set<() => void>()
  const set = (next: Partial<SignUpState>) => {
    state = { ...state, ...next }
    for (const listener of listeners) listener()
  }

  function refuse(code: string | undefined) {
    const field = code ? FIELD_OF[code] : undefined
    const message = authErrorCopy(code)
    set(field ? { fieldErrors: { [field]: message }, alert: null } : { fieldErrors: {}, alert: { message, offer: (code && OFFER_OF[code]) || null } })
  }

  async function sendConfirmation() {
    const answer = await withHumanCheck(humanCheck, (token) => auth.sendCode({ email: state.email.trim(), purpose: "confirm" }, token))
    if (!answer.ok) return refuse(answer.code)
    sends.sent()
    set({ fieldErrors: {}, alert: null, nextSendAt: sends.nextSendAt() })
  }

  /** Runs one call at a time; a press while one is answering does nothing. */
  async function run(pending: Exclude<SignUpPending, null>, call: () => Promise<void>) {
    if (state.pending) return
    set({ pending })
    try {
      await call()
    } finally {
      set({ pending: null })
    }
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
    setName(next: string) {
      set({ name: next, fieldErrors: { ...state.fieldErrors, name: undefined } })
    },
    setEmail(next: string) {
      set({ email: next, fieldErrors: { ...state.fieldErrors, email: undefined } })
    },
    /** Create account: needs the human check. */
    clearFieldError(field: SignUpField) {
      if (state.fieldErrors[field]) set({ fieldErrors: { ...state.fieldErrors, [field]: undefined } })
    },
    /** Whether the typed password is still in memory: only between Create account and the sign-in after confirming. */
    holdsPassword: () => password !== null,
    continueWithGoogle: () =>
      run("google", async () => {
        set({ alert: null })
        // On success Better Auth's client sends the browser to Google; the page leaves.
        const answer = await auth.signInWithGoogle({ returnTo: destination, errorTo: signUpPage(undefined, returnTo) })
        if (!answer.ok) refuse(answer.code)
      }),
    /** Create account: needs the human check. */
    signUp: ({ password: typed }: { password: string }) =>
      run("sign-up", async () => {
        if (state.step !== "details") return
        const fieldErrors: SignUpFieldErrors = {}
        if (!state.name.trim()) fieldErrors.name = NAME_MISSING
        const emailProblem = emailAddressProblem(state.email)
        if (emailProblem) fieldErrors.email = emailProblem
        if (typed.length < PASSWORD_MIN_LENGTH) fieldErrors.password = authErrorCopy("PASSWORD_TOO_SHORT")
        if (Object.keys(fieldErrors).length) return set({ fieldErrors, alert: null })
        const answer = await withHumanCheck(humanCheck, (token) =>
          auth.signUp({ name: state.name.trim(), email: state.email.trim(), password: typed }, token))
        if (answer.ok) {
          password = typed
          sends.sent()
          return set({ step: "code", fieldErrors: {}, alert: null, nextSendAt: sends.nextSendAt() })
        }
        // The account exists, unconfirmed: a second sign-up would be refused, so Send a new code is the way on.
        if (answer.code === "SIGN_UP_CODE_NOT_SENT") {
          password = typed
          return set({ step: "code", fieldErrors: {}, alert: { message: authErrorCopy(answer.code), offer: null }, nextSendAt: 0 })
        }
        refuse(answer.code)
      }),
    /** "Send a new code": a confirmation code, with a fresh token, once the wait is over. */
    resendCode: () =>
      run("send", async () => {
        if (state.step !== "code" || sends.waiting()) return
        await sendConfirmation()
      }),
    /** Confirm email, then sign in with the kept password. The password is dropped either way. */
    confirmEmail: ({ code }: { code: string }) =>
      run("code", async () => {
        if (state.step !== "code") return
        const digits = code.trim()
        if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(digits)) return set({ fieldErrors: { code: CODE_MISSING }, alert: null })
        const confirmed = await auth.confirmEmail({ email: state.email.trim(), code: digits })
        if (!confirmed.ok) return refuse(confirmed.code)
        const kept = password
        password = null
        const signedIn = kept !== null && (await auth.signInWithPassword({ email: state.email.trim(), password: kept })).ok
        if (signedIn) navigate(destination)
        else set({ step: "confirmed", fieldErrors: {}, alert: null })
      }),
    /** Sign in, once the email is confirmed but the sign-in after it didn't go: the sign-in page, email kept. */
    goToSignIn() {
      navigate(signInPage(state.email, returnTo))
    },
    /** "Use a different email": back to the details, with the name and email kept. A new Create account follows. */
    useDifferentEmail() {
      if (state.pending || state.step !== "code") return
      password = null
      set({ step: "details", fieldErrors: {}, alert: null })
    },
  }
}

/** After signing up: the return address it was given, such as an invitation, or else Onboarding. */
function signedUpDestination(returnTo: string | undefined) {
  const address = safeReturnAddress(returnTo)
  return address === "/" ? ONBOARDING_URL : address
}

export type SignUpFlow = ReturnType<typeof createSignUpFlow>
