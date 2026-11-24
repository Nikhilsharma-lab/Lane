import * as auth from "@/lib/auth-client"
import { CODE_MISSING, isWholeCode } from "@/lib/auth-code-rules"
import { CODE_REFUSALS, eachCode, GOOGLE_FAILED } from "@/lib/auth-error-copy"
import { safeReturnAddress } from "@/lib/auth-return-address"
import { emailAddressProblem } from "@/lib/email-address-rules"
import { signInPage } from "./auth-addresses"
import { createAuthFlowStore } from "./auth-flow-store"
import { createCodeSends } from "./code-sends"
import { createHumanCheck, withHumanCheck, type HumanCheck } from "./human-check"

/** Email and password, the screen asking for a sign-in code, and the code step. */
export type SignInStep = "password" | "code-request" | "code"
/** Where the screen opens: email and password, or straight at the code request. */
export type SignInStart = Extract<SignInStep, "password" | "code-request">
export type SignInField = "email" | "password" | "code"
export type SignInFieldErrors = Partial<Record<SignInField, string>>
/** What the box under the fields offers beside its line: Sign up instead, or the code path. */
export type SignInOffer = "sign-up" | "code" | null
export type SignInPending = "password" | "google" | "send" | "code" | null

export const PASSWORD_MISSING = "Enter your password."

export type SignInState = {
  step: SignInStep
  /** The typed email, kept across the steps. */
  email: string
  fieldErrors: SignInFieldErrors
  alert: { message: string; offer: SignInOffer } | null
  pending: SignInPending
  /** When the typed email may be sent a code again (ms since the epoch); 0 when it may now. */
  nextSendAt: number
}

type Options = {
  /** An email to start with, such as the invitation's. */
  email?: string
  /** Where to go after signing in; anything but a path within Lane becomes `/`. */
  returnTo?: string
  /** The `error` Google's redirect brought back to this screen. Only Google's redirect puts one here, so any code gets its line. */
  errorCode?: string
  /** Where the screen opens; email and password unless told otherwise. */
  start?: SignInStart
  navigate: (path: string) => void
  humanCheck?: HumanCheck
  now?: () => number
}

/**
 * #377: the sign-in screen's state, made once per mount. It holds only what the screen shows: never a password or a
 * code. Every call goes through Lane's browser auth client, and every refusal reads Lane's words from
 * `authErrorCopy`.
 */
export function createSignInFlow({ email = "", returnTo, errorCode, start = "password", navigate, humanCheck = createHumanCheck(), now = Date.now }: Options) {
  const destination = safeReturnAddress(returnTo)
  const sends = createCodeSends(now)
  const flow = createAuthFlowStore<SignInState>({
    step: start,
    email,
    fieldErrors: {},
    alert: errorCode ? { message: GOOGLE_FAILED, offer: null } : null,
    pending: null,
    nextSendAt: 0,
  }, {
    fieldOf: { INVALID_EMAIL_OR_PASSWORD: "password", ...eachCode(CODE_REFUSALS, "code") },
    offerOf: { NO_ACCOUNT: "sign-up", EMAIL_NOT_VERIFIED: "code" },
  })
  const { get, set, run, refuse } = flow
  const typedEmail = () => get().email.trim()

  /** The email's problem on its field, or null when it's an address. */
  function checkEmail(extra: SignInFieldErrors = {}) {
    const problem = emailAddressProblem(get().email)
    const fieldErrors = { ...(problem ? { email: problem } : {}), ...extra }
    if (!Object.keys(fieldErrors).length) return true
    flow.refuseFields(fieldErrors)
    return false
  }

  async function send() {
    const answer = await withHumanCheck(humanCheck, (token) => auth.sendCode({ email: typedEmail(), purpose: "sign-in" }, token))
    if (!answer.ok) return refuse(answer.code)
    sends.sent(typedEmail())
    set({ step: "code", fieldErrors: {}, alert: null, nextSendAt: sends.nextSendAt(typedEmail()) })
  }

  return {
    humanCheck,
    now,
    snapshot: get,
    subscribe: flow.subscribe,
    /** Typing an email shows that address's own wait: a corrected address may be sent a code at once. */
    setEmail: (next: string) => flow.setEmail(next, sends.nextSendAt(next)),
    clearFieldError: flow.clearFieldError,
    signInWithPassword: ({ password }: { password: string }) =>
      run("password", async () => {
        if (!checkEmail(password ? {} : { password: PASSWORD_MISSING })) return
        const answer = await auth.signInWithPassword({ email: typedEmail(), password })
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
      if (get().pending) return
      set({ step: "code-request", fieldErrors: {}, alert: null })
    },
    /** "Use your password instead". */
    usePassword() {
      if (get().pending) return
      set({ step: "password", fieldErrors: {}, alert: null })
    },
    /** "Email me a code": needs the human check. */
    sendCode: () =>
      run("send", async () => {
        if (sends.waiting(typedEmail()) || !checkEmail()) return
        await send()
      }),
    /** "Send a new code", from the code step, once the wait is over. */
    resendCode: () =>
      run("send", async () => {
        if (get().step !== "code" || sends.waiting(typedEmail())) return
        await send()
      }),
    signInWithCode: ({ code }: { code: string }) =>
      run("code", async () => {
        if (get().step !== "code") return
        if (!isWholeCode(code)) return flow.refuseFields({ code: CODE_MISSING })
        const answer = await auth.signInWithCode({ email: typedEmail(), code: code.trim() })
        if (answer.ok) navigate(destination)
        else refuse(answer.code)
      }),
    /** "Use a different email": back to the code request, with the email kept. That address's wait stays. */
    useDifferentEmail() {
      if (get().pending || get().step !== "code") return
      set({ step: "code-request", fieldErrors: {}, alert: null })
    },
  }
}

export type SignInFlow = ReturnType<typeof createSignInFlow>
