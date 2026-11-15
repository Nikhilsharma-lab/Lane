import type { AskIsItLive, IsItLiveUndo, IsItLiveView } from "./is-it-live"

/**
 * #135: "Is it live?" after a successful single-Request Mark Done, apart from its dialog (IsItLiveProvider).
 * `show` receives what to show, or null once answered. "Not yet" (or closing the prompt) leaves the Request
 * at Done and brings back its Marked Done toast, so Undo Done keeps working as before; a saved release ends
 * Undo Done, as the server already refuses it then. A newer Mark Done replaces an unanswered prompt; the older
 * Request keeps its own toast.
 */
export function createIsItLive(show: (view: IsItLiveView | null) => void) {
  let current: { view: IsItLiveView; undo: IsItLiveUndo } | null = null
  const set = (next: typeof current) => { current = next; show(next && next.view) }

  const ask: AskIsItLive = (request, undo) => set({ view: { step: "ask", request }, undo })
  return {
    ask,
    get record() {
      const asked = current
      return () => {
        if (!asked || current !== asked) return
        asked.view = { step: "release", request: asked.view.request }
        show(asked.view)
      }
    },
    get notYet() {
      const answered = current
      return () => {
        if (current === answered) set(null)
        answered?.undo.reshow()
      }
    },
    // The rendered Release form retains its operation even after Escape or a newer prompt.
    get saved() {
      const answered = current
      return () => {
        if (current === answered) set(null)
        answered?.undo.end()
      }
    },
  }
}

export type IsItLivePrompt = ReturnType<typeof createIsItLive>
