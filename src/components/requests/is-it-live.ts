/** The Request a successful Mark Done just moved: its id and the name its toasts use. */
export type IsItLiveRequest = { id: string; name: string }

/** That Mark Done's Undo: `reshow` brings its Marked Done toast back with Undo; `end` replaces it once a release is saved. */
export type IsItLiveUndo = { reshow: () => void; end: () => void }

/** What the prompt shows: the question, or the release form after "Yes, record release". */
export type IsItLiveView = { step: "ask" | "release"; request: IsItLiveRequest }

export type AskIsItLive = (request: IsItLiveRequest, undo: IsItLiveUndo) => void

/** The prompt's words, shared by the dialog and its tests (and #137's end-to-end journey). */
export const IS_IT_LIVE_COPY = {
  title: "Is it live?",
  question: (name: string) => `${name} is Done. Has the agreed audience received it?`,
  endsUndo: "Recording the release ends Undo Done for this Request.",
  yes: "Yes, record release",
  notYet: "Not yet",
  releaseTitle: "Record release",
} as const

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
  const record = () => { if (current) set({ ...current, view: { step: "release", request: current.view.request } }) }
  const notYet = () => {
    const answered = current
    set(null)
    answered?.undo.reshow()
  }
  const saved = () => {
    const answered = current
    set(null)
    answered?.undo.end()
  }
  return { ask, record, notYet, saved }
}
