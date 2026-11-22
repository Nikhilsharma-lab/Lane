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

const EMPTY_NAME = "Enter your name."

export type ProfileAccountState = {
  name: { draft: string; saved: string; busy: boolean; error: string | null }
  status: string
}

/**
 * #380: what Settings → Profile's account section shows, made once per mount. It holds only what the screen shows,
 * never a password after its dialog is done with it. `callbacks` reads the view's latest props.
 */
export function createProfileAccount(initial: { name: string }, callbacks: () => ProfileAccountCallbacks) {
  let state: ProfileAccountState = {
    name: { draft: initial.name, saved: initial.name, busy: false, error: null },
    status: "",
  }
  const listeners = new Set<() => void>()
  const set = (next: Partial<ProfileAccountState>) => {
    state = { ...state, ...next }
    listeners.forEach(listener => listener())
  }
  const name = (next: Partial<ProfileAccountState["name"]>) => ({ ...state.name, ...next })

  return {
    snapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },

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
  }
}

export type ProfileAccount = ReturnType<typeof createProfileAccount>
