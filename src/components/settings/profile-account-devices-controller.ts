import { settle, type AuthAnswer } from "@/lib/auth-answer"
import { createExternalStore } from "@/lib/external-store"
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
  /** A refused sign-out, on the row it belongs to, with Try again when sending it again could help. */
  problem: { target: Target; line: string; retry?: () => void } | null
  /** Signed out here, so gone from the list before it's next read. */
  signedOut: readonly string[]
  /** Every other device was signed out here. */
  othersSignedOut: boolean
  status: string
}

/** #380: what the Signed-in devices group shows, made once per mount. `keepCallbacks` keeps the view's latest ones. */
export function createSignedInDevices(initial: SignedInDevicesCallbacks) {
  let current: SignedInDevicesCallbacks = initial
  const store = createExternalStore<SignedInDevicesState>({ busy: null, problem: null, signedOut: [], othersSignedOut: false, status: "" })
  const set = (next: Partial<SignedInDevicesState>) => store.set({ ...store.get(), ...next })

  /**
   * One sign-out. `gone` is what leaves the list once it's done; a refusal stays on its row with Try again. Answers
   * whether it was done.
   */
  async function run(target: Target, send: () => Promise<AuthAnswer>, gone: () => Partial<SignedInDevicesState>, success: string): Promise<boolean> {
    if (store.get().busy) return false
    set({ busy: target, problem: null, status: "" })
    const answer = await settle(send)
    if (answer.ok) set({ busy: null, ...gone(), status: success })
    else {
      // A device that is already signed out stays so, so sending it again can't help.
      const retry = answer.code === "DEVICE_NOT_FOUND" ? undefined : () => { void run(target, send, gone, success) }
      set({ busy: null, problem: { target, line: authErrorCopy(answer.code), retry } })
    }
    return answer.ok
  }

  return {
    snapshot: store.get,
    subscribe: store.subscribe,
    keepCallbacks(next: SignedInDevicesCallbacks) { current = next },

    signOut(device: SignedInDevice) {
      return run(device.id, () => current.onSignOutDevice(device), () => ({ signedOut: [...store.get().signedOut, device.id] }), `Signed out of ${deviceName(device)}.`)
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
