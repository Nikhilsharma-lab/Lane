import { settle, type AuthAnswer } from "@/lib/auth-answer"
import { authErrorCopy } from "@/lib/auth-error-copy"
import { createExternalStore } from "@/lib/external-store"

export type WorkspaceNameState = { value: string; saved: string; busy: boolean; error: string | null }

/** Save is offered once the name, trimmed, is something new and not empty, and nothing is on its way. */
export function canSaveName({ value, saved, busy }: WorkspaceNameState): boolean {
  const next = value.trim()
  return !busy && next !== "" && next !== saved
}

/** The workspace name row's field (#381): what's typed, the name last saved, and a refused rename's line. */
export function createWorkspaceNameDraft(name: string) {
  const store = createExternalStore<WorkspaceNameState>({ value: name, saved: name, busy: false, error: null })
  return {
    get: store.get,
    subscribe: store.subscribe,
    type(value: string) {
      store.set({ ...store.get(), value, error: null })
    },
    /** Sends the trimmed name once; true when it was saved. */
    async save(rename: (name: string) => Promise<AuthAnswer>): Promise<boolean> {
      const state = store.get()
      if (!canSaveName(state)) return false
      const next = state.value.trim()
      store.set({ ...state, busy: true, error: null })
      const answer = await settle(() => rename(next))
      if (answer.ok) store.set({ value: next, saved: next, busy: false, error: null })
      else store.set({ ...store.get(), busy: false, error: authErrorCopy(answer.code) })
      return answer.ok
    },
  }
}
export type WorkspaceNameDraft = ReturnType<typeof createWorkspaceNameDraft>

export type ConfirmationState<T> = { open: boolean; target: T | undefined; busy: boolean; error: string | null; done: boolean }

/**
 * A red confirmation for a workspace change (#381: Leave, and Remove of a `target` person): open, then one request on
 * confirm. A refusal keeps it open with its code's line; success closes it and marks it `done`, until the next ask or
 * `forget`. It can't be closed, or turned to someone else, while the request is on its way. The target stays after
 * closing, so the dialog keeps its words as it leaves.
 */
export function createConfirmation<T = void>() {
  const store = createExternalStore<ConfirmationState<T>>({ open: false, target: undefined, busy: false, error: null, done: false })
  return {
    get: store.get,
    subscribe: store.subscribe,
    ask(target: T) {
      if (!store.get().busy) store.set({ open: true, target, busy: false, error: null, done: false })
    },
    dismiss() {
      if (!store.get().busy) store.set({ ...store.get(), open: false })
    },
    /** Stops counting the last success as done, once a later change has its own line to show. */
    forget() {
      if (store.get().done) store.set({ ...store.get(), done: false })
    },
    /** Sends `run` once; true when it succeeded. */
    async confirm(run: () => Promise<AuthAnswer>): Promise<boolean> {
      const state = store.get()
      if (!state.open || state.busy) return false
      store.set({ ...state, busy: true, error: null })
      const answer = await settle(run)
      store.set({ ...store.get(), open: !answer.ok, busy: false, error: answer.ok ? null : authErrorCopy(answer.code), done: answer.ok })
      return answer.ok
    },
  }
}
export type Confirmation<T = void> = ReturnType<typeof createConfirmation<T>>
