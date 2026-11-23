import * as auth from "@/lib/auth-client"
import { CODE_MISSING, isWholeCode, PASSWORD_MIN_LENGTH, PERSON_NAME_MISSING } from "@/lib/auth-code-rules"
import { authErrorCopy, CODE_REFUSALS, eachCode, NEW_PASSWORD_REFUSALS } from "@/lib/auth-error-copy"
import { HOME, safeReturnAddress } from "@/lib/auth-return-address"
import { emailAddressProblem } from "@/lib/email-address-rules"
import { signInPage, signUpPage } from "./auth-addresses"
import { createAuthFlowStore } from "./auth-flow-store"
import { createCodeSends } from "./code-sends"
import { createHumanCheck, withHumanCheck, type HumanCheck } from "./human-check"

/** Where a new account goes once signed in, unless it came from somewhere such as an invitation. */
export const ONBOARDING_URL = "/onboarding"

/** The details (name, email, password), the confirmation code, and the confirmed email whose sign-in didn't follow. */
export type SignUpStep = "details" | "code" | "confirmed"
export type SignUpField = "name" | "email" | "password" | "code"
export type SignUpFieldErrors = Partial<Record<SignUpField, string>>
/** What the box under the fields offers beside its line: Sign in instead. */
export type SignUpOffer = "sign-in" | null
export type SignUpPending = "sign-up" | "google" | "send" | "code" | null

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
 * #378: the sign-up screen's state, made once per mount. Its state holds only what the screen shows. The typed
 * password is kept in this closure from Create account until the sign-in after the email is confirmed, and dropped
 * then, whatever the answer.
 */
export function createSignUpFlow({ email = "", returnTo, errorCode, navigate, humanCheck = createHumanCheck(), now = Date.now }: Options) {
  const destination = signedUpDestination(returnTo)
  const sends = createCodeSends(now)
  /** The typed password, between Create account and the sign-in after confirming. Never in the state. */
  let password: string | null = null
  const flow = createAuthFlowStore<SignUpState>({
    step: "details",
    name: "",
    email,
    fieldErrors: {},
    alert: errorCode ? { message: authErrorCopy(errorCode), offer: null } : null,
    pending: null,
    nextSendAt: 0,
  }, {
    fieldOf: { ...eachCode(NEW_PASSWORD_REFUSALS, "password"), ...eachCode(CODE_REFUSALS, "code") },
    offerOf: { USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "sign-in" },
  })
  const { get, set, run, refuse } = flow
  const typedEmail = () => get().email.trim()

  async function sendConfirmation() {
    const answer = await withHumanCheck(humanCheck, (token) => auth.sendCode({ email: typedEmail(), purpose: "confirm" }, token))
    if (!answer.ok) return refuse(answer.code)
    sends.sent(typedEmail())
    set({ fieldErrors: {}, alert: null, nextSendAt: sends.nextSendAt(typedEmail()) })
  }

  return {
    humanCheck,
    now,
    snapshot: get,
    subscribe: flow.subscribe,
    setName(next: string) {
      set({ name: next, fieldErrors: { ...get().fieldErrors, name: undefined } })
    },
    setEmail: (next: string) => flow.setEmail(next, sends.nextSendAt(next)),
    clearFieldError: flow.clearFieldError,
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
        if (get().step !== "details") return
        const fieldErrors: SignUpFieldErrors = {}
        if (!get().name.trim()) fieldErrors.name = PERSON_NAME_MISSING
        const emailProblem = emailAddressProblem(get().email)
        if (emailProblem) fieldErrors.email = emailProblem
        if (typed.length < PASSWORD_MIN_LENGTH) fieldErrors.password = authErrorCopy("PASSWORD_TOO_SHORT")
        if (Object.keys(fieldErrors).length) return flow.refuseFields(fieldErrors)
        const answer = await withHumanCheck(humanCheck, (token) =>
          auth.signUp({ name: get().name.trim(), email: typedEmail(), password: typed }, token))
        if (answer.ok) {
          password = typed
          sends.sent(typedEmail())
          return set({ step: "code", fieldErrors: {}, alert: null, nextSendAt: sends.nextSendAt(typedEmail()) })
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
        if (get().step !== "code" || sends.waiting(typedEmail())) return
        await sendConfirmation()
      }),
    /** Confirm email, then sign in with the kept password. The password is dropped either way. */
    confirmEmail: ({ code }: { code: string }) =>
      run("code", async () => {
        if (get().step !== "code") return
        if (!isWholeCode(code)) return flow.refuseFields({ code: CODE_MISSING })
        const confirmed = await auth.confirmEmail({ email: typedEmail(), code: code.trim() })
        if (!confirmed.ok) return refuse(confirmed.code)
        const kept = password
        password = null
        const signedIn = kept !== null && (await auth.signInWithPassword({ email: typedEmail(), password: kept })).ok
        if (signedIn) navigate(destination)
        else set({ step: "confirmed", fieldErrors: {}, alert: null })
      }),
    /** Sign in, once the email is confirmed but the sign-in after it didn't go: the sign-in page, email kept. */
    goToSignIn() {
      navigate(signInPage(get().email, returnTo))
    },
    /** "Use a different email": back to the details, with the name and email kept. A new Create account follows. */
    useDifferentEmail() {
      if (get().pending || get().step !== "code") return
      password = null
      set({ step: "details", fieldErrors: {}, alert: null })
    },
  }
}

/** After signing up: the return address it was given, such as an invitation, or else Onboarding. */
function signedUpDestination(returnTo: string | undefined) {
  const address = safeReturnAddress(returnTo)
  return address === HOME ? ONBOARDING_URL : address
}

export type SignUpFlow = ReturnType<typeof createSignUpFlow>
