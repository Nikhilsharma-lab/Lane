import { authErrorCopy } from "@/lib/auth-error-copy"
import { createExternalStore } from "@/lib/external-store"

/**
 * #381: what a workspace row's callback answers, the shape Lane's browser auth client gives (#376): success, or a
 * failure with Better Auth's or Lane's error code, read with `authErrorCopy`. A callback that throws (the request
 * never answered) counts as a failure with no code, which gets the generic line.
 */
export type WorkspaceAnswer = { ok: true } | { ok: false; code?: string }

async function answerOf(run: () => Promise<WorkspaceAnswer>): Promise<WorkspaceAnswer> {
  try {
    return await run()
  } catch {
    return { ok: false }
  }
}

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
    async save(rename: (name: string) => Promise<WorkspaceAnswer>): Promise<boolean> {
      const state = store.get()
      if (!canSaveName(state)) return false
      const next = state.value.trim()
      store.set({ ...state, busy: true, error: null })
      const answer = await answerOf(() => rename(next))
      if (answer.ok) store.set({ value: next, saved: next, busy: false, error: null })
      else store.set({ ...store.get(), busy: false, error: authErrorCopy(answer.code) })
      return answer.ok
    },
  }
}
export type WorkspaceNameDraft = ReturnType<typeof createWorkspaceNameDraft>
