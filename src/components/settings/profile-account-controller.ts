import { authErrorCopy } from "@/lib/auth-error-copy"

/** Every account callback answers success or an error code, which the view reads with `authErrorCopy`. */
export type AccountAnswer = { success: true } | { error?: string }

export type ProfileAccountCallbacks = {
  onSaveName: (name: string) => Promise<AccountAnswer>
  onChangePassword: (change: { currentPassword: string; newPassword: string; signOutOtherDevices: boolean }) => Promise<AccountAnswer>
  /** Increment 5 runs it as a Server Action (#346): Better Auth sets a first password only on the server. */
  onSetPassword: (newPassword: string) => Promise<AccountAnswer>
  onConnectGoogle: () => Promise<AccountAnswer>
  onDisconnectGoogle: () => Promise<AccountAnswer>
}

type Outcome = { ok: true } | { ok: false; code?: string }

/** Runs one callback. A thrown one (the network, an old tab) has no code, so it gets the generic line. */
export async function outcome(run: () => Promise<AccountAnswer>): Promise<Outcome> {
  try {
    const answer = await run()
    return "success" in answer && answer.success ? { ok: true } : { ok: false, code: "error" in answer ? answer.error : undefined }
  } catch {
    return { ok: false }
  }
}

/**
 * Lane's code for Google's redirect back to Settings after Connect Google (its `?error=`): a Google account with a
 * different email, or any other way the connection didn't finish. Either way nothing changed.
 */
export function googleConnectionCode(redirectError: string) {
  return redirectError === "email_does_not_match" ? "GOOGLE_EMAIL_DOES_NOT_MATCH" : "GOOGLE_NOT_CONNECTED"
}

const EMPTY_NAME = "Enter your name."
const EMPTY_CURRENT = "Enter your current password."
const EMPTY_NEW = "Enter a new password."

export type PasswordField = "current" | "new"
// The answers about the new password itself; the wrong current password is the other field's.
const NEW_PASSWORD_CODES = new Set(["PASSWORD_TOO_SHORT", "PASSWORD_TOO_LONG", "PASSWORD_COMPROMISED", "PASSWORD_CHECK_UNAVAILABLE"])
const fieldFor = (code: string | undefined): PasswordField | null =>
  code === "INVALID_PASSWORD" ? "current" : code && NEW_PASSWORD_CODES.has(code) ? "new" : null

/** A refused change's line, with Try again when sending it again could help. */
export type Problem = { line: string; retry?: () => void }

type PasswordState = {
  open: boolean
  /** Change needs the current password; set (Google only) has none. */
  mode: "change" | "set"
  current: string
  next: string
  /** Change only. Ticked by default, the safe choice (#346). */
  signOutOthers: boolean
  busy: boolean
  errors: Partial<Record<PasswordField, string>>
  error: string | null
}

export type ProfileAccountState = {
  name: { draft: string; saved: string; busy: boolean; error: string | null }
  password: PasswordState
  google: { busy: "connect" | "disconnect" | null; problem: Problem | null }
  status: string
}

const closedPassword = (mode: PasswordState["mode"]): PasswordState =>
  ({ open: false, mode, current: "", next: "", signOutOthers: true, busy: false, errors: {}, error: null })

/**
 * #380: what Settings → Profile's account section shows, made once per mount. It holds only what the screen shows,
 * never a password after its dialog is done with it. `googleError` is the `error` on Google's redirect back to
 * Settings, if there was one. `keepCallbacks` keeps the callbacks the view was last given.
 */
export function createProfileAccount(initial: ProfileAccountCallbacks & { name: string; googleError?: string }) {
  let current: ProfileAccountCallbacks = initial
  const callbacks = () => current
  let state: ProfileAccountState = {
    name: { draft: initial.name, saved: initial.name, busy: false, error: null },
    password: closedPassword("change"),
    google: { busy: null, problem: initial.googleError ? { line: authErrorCopy(googleConnectionCode(initial.googleError)) } : null },
    status: "",
  }
  const listeners = new Set<() => void>()
  const set = (next: Partial<ProfileAccountState>) => {
    state = { ...state, ...next }
    listeners.forEach(listener => listener())
  }
  const name = (next: Partial<ProfileAccountState["name"]>) => ({ ...state.name, ...next })
  const password = (next: Partial<PasswordState>) => ({ ...state.password, ...next })

  return {
    snapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    keepCallbacks(next: ProfileAccountCallbacks) { current = next },

    changeName(draft: string) {
      set({ name: name({ draft, error: null }) })
    },
    async saveName() {
      const draft = state.name.draft.trim()
      if (state.name.busy || draft === state.name.saved) return
      if (!draft) { set({ name: name({ error: EMPTY_NAME }) }); return }
      set({ name: name({ busy: true, error: null }), status: "" })
      const answer = await outcome(() => callbacks().onSaveName(draft))
      if (answer.ok) set({ name: name({ busy: false, draft, saved: draft }), status: "Name saved." })
      else set({ name: name({ busy: false, error: authErrorCopy(answer.code) }) })
    },

    /** Opens the password dialog empty, with Sign out of my other devices ticked. */
    openPassword(mode: PasswordState["mode"]) {
      set({ password: { ...closedPassword(mode), open: true }, status: "" })
    },
    /** Closes it and drops what was typed. */
    closePassword() {
      if (!state.password.busy) set({ password: closedPassword(state.password.mode) })
    },
    changeCurrentPassword(current: string) {
      set({ password: password({ current, errors: { ...state.password.errors, current: undefined }, error: null }) })
    },
    changeNewPassword(next: string) {
      set({ password: password({ next, errors: { ...state.password.errors, new: undefined }, error: null }) })
    },
    setSignOutOthers(signOutOthers: boolean) {
      set({ password: password({ signOutOthers }) })
    },
    /** Sends the change, or says what's missing. Answers the field a refusal belongs to, for focus. */
    async submitPassword(): Promise<PasswordField | null> {
      const { mode, current, next, signOutOthers, busy } = state.password
      if (busy) return null
      const errors: PasswordState["errors"] = {}
      if (mode === "change" && !current) errors.current = EMPTY_CURRENT
      if (!next) errors.new = EMPTY_NEW
      if (errors.current || errors.new) {
        set({ password: password({ errors, error: null }) })
        return errors.current ? "current" : "new"
      }
      set({ password: password({ busy: true, errors: {}, error: null }), status: "" })
      const answer = await outcome(() => mode === "change"
        ? callbacks().onChangePassword({ currentPassword: current, newPassword: next, signOutOtherDevices: signOutOthers })
        : callbacks().onSetPassword(next))
      if (answer.ok) {
        const status = mode === "set" ? "Password set." : signOutOthers ? "Password changed. Your other devices are signed out." : "Password changed."
        set({ password: closedPassword(mode), status })
        return null
      }
      const field = fieldFor(answer.code)
      const line = authErrorCopy(answer.code)
      set({ password: password({ busy: false, errors: field ? { [field]: line } : {}, error: field ? null : line }) })
      return field
    },

    /** Starts Google's connection; on success the page is on its way to Google, and comes back with its answer. */
    connectGoogle() {
      return google("connect", () => callbacks().onConnectGoogle(), "")
    },
    disconnectGoogle() {
      return google("disconnect", () => callbacks().onDisconnectGoogle(), "Google disconnected.")
    },
  }

  async function google(busy: "connect" | "disconnect", run: () => Promise<AccountAnswer>, success: string): Promise<void> {
    if (state.google.busy) return
    set({ google: { busy, problem: null }, status: "" })
    const answer = await outcome(run)
    if (answer.ok) { set({ google: { busy: null, problem: null }, status: success }); return }
    // The last sign-in method can't go, so sending it again can't help.
    const retry = answer.code === "FAILED_TO_UNLINK_LAST_ACCOUNT" ? undefined : () => { void google(busy, run, success) }
    set({ google: { busy: null, problem: { line: authErrorCopy(answer.code), retry } } })
  }
}

export type ProfileAccount = ReturnType<typeof createProfileAccount>
