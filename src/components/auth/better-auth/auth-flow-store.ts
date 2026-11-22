import { authErrorCopy, forCode, type AuthErrorCode } from "@/lib/auth-error-copy"
import { createExternalStore } from "@/lib/external-store"

/** What the sign-in, sign-up and reset flows' state holds besides their own steps. */
export type AuthFlowState = {
  /** The typed email, kept across the steps. */
  email: string
  fieldErrors: Partial<Record<string, string>>
  alert: { message: string; offer: string | null } | null
  pending: string | null
  /** When Send a new code is offered again (ms since the epoch); 0 when it's offered now. */
  nextSendAt: number
}

type Field<S extends AuthFlowState> = keyof S["fieldErrors"] & string
type Offer<S extends AuthFlowState> = NonNullable<NonNullable<S["alert"]>["offer"]>

/** Which refusals belong on a field, and which offer something beside the box's line, such as Sign up instead. */
export type Refusals<S extends AuthFlowState> = {
  fieldOf: Partial<Record<AuthErrorCode, Field<S>>>
  offerOf?: Partial<Record<AuthErrorCode, Offer<S>>>
}

/**
 * #377: the store and moves the sign-in, sign-up and reset flows share. The view reads `get` with
 * useSyncExternalStore. The state holds only what the screen shows: never a password or a code.
 */
export function createAuthFlowStore<S extends AuthFlowState>(initial: S, { fieldOf, offerOf = {} }: Refusals<S>) {
  const store = createExternalStore(initial)
  const set = (next: Partial<S>) => store.set({ ...store.get(), ...next })
  /** The shared keys, which every flow's state has. */
  const setShared = (next: Partial<AuthFlowState>) => set(next as Partial<S>)

  return {
    get: store.get,
    subscribe: store.subscribe,
    set,
    /** A refusal's line: on its field, otherwise in the box with what it offers. */
    refuse(code: string | undefined) {
      const field = forCode(fieldOf, code)
      const message = authErrorCopy(code)
      setShared(field ? { fieldErrors: { [field]: message }, alert: null } : { fieldErrors: {}, alert: { message, offer: forCode(offerOf, code) ?? null } })
    },
    /** Lines said before any request: on their fields, with the box cleared. */
    refuseFields(fieldErrors: Partial<Record<Field<S>, string>>) {
      setShared({ fieldErrors, alert: null })
    },
    /** Runs one call at a time; a press while one is answering does nothing. */
    async run(pending: NonNullable<S["pending"]>, call: () => Promise<void>) {
      if (store.get().pending) return
      setShared({ pending })
      try {
        await call()
      } finally {
        setShared({ pending: null })
      }
    },
    /** Typing in the email field clears what was said about it. */
    setEmail(email: string) {
      setShared({ email, fieldErrors: { ...store.get().fieldErrors, email: undefined } })
    },
    clearFieldError(field: Field<S>) {
      if (store.get().fieldErrors[field]) setShared({ fieldErrors: { ...store.get().fieldErrors, [field]: undefined } })
    },
  }
}
