import { settle, type AuthAnswer } from "@/lib/auth-answer"
import { authErrorCopy } from "@/lib/auth-error-copy"
import { deviceName, type SignedInDevice } from "./signed-in-device-rules"

export type SignedInDevicesCallbacks = {
  onSignOutDevice: (device: SignedInDevice) => Promise<AuthAnswer>
  onSignOutOtherDevices: () => Promise<AuthAnswer>
  /** Loads the list again after it couldn't load. */
  onReloadDevices: () => void
}

/** "others": Sign out of all other devices. */
type Target = string | "others"

export type SignedInDevicesState = {
  busy: Target | null
  /** A refused sign-out, on the row it belongs to, with Try again. */
  problem: { target: Target; line: string; retry: () => void } | null
  /** Signed out here, so gone from the list before it's next read. */
  signedOut: readonly string[]
  /** Every other device was signed out here. */
  othersSignedOut: boolean
  status: string
}

/** #380: what the Signed-in devices group shows, made once per mount. `keepCallbacks` keeps the view's latest ones. */
export function createSignedInDevices(initial: SignedInDevicesCallbacks) {
  let current: SignedInDevicesCallbacks = initial
  let state: SignedInDevicesState = { busy: null, problem: null, signedOut: [], othersSignedOut: false, status: "" }
  const listeners = new Set<() => void>()
  const set = (next: Partial<SignedInDevicesState>) => {
    state = { ...state, ...next }
    listeners.forEach(listener => listener())
  }

  /** One sign-out. `gone` is what leaves the list once it's done; a refusal stays on its row with Try again. */
  async function run(target: Target, send: () => Promise<AuthAnswer>, gone: () => Partial<SignedInDevicesState>, success: string): Promise<void> {
    if (state.busy) return
    set({ busy: target, problem: null, status: "" })
    const answer = await settle(send)
    if (answer.ok) set({ busy: null, ...gone(), status: success })
    else set({ busy: null, problem: { target, line: authErrorCopy(answer.code), retry: () => { void run(target, send, gone, success) } } })
  }

  return {
    snapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    keepCallbacks(next: SignedInDevicesCallbacks) { current = next },

    signOut(device: SignedInDevice) {
      return run(device.id, () => current.onSignOutDevice(device), () => ({ signedOut: [...state.signedOut, device.id] }), `Signed out of ${deviceName(device)}.`)
    },
    signOutOthers() {
      return run("others", () => current.onSignOutOtherDevices(), () => ({ othersSignedOut: true }), "Signed out of your other devices.")
    },
    reload() {
      set({ problem: null, status: "" })
      current.onReloadDevices()
    },
  }
}

export type SignedInDevices = ReturnType<typeof createSignedInDevices>
