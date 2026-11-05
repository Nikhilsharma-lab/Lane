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
  endsUndo: "Once you record the release, you can’t undo Done.",
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

type Focusable = { focus(options?: FocusOptions): void }

/**
 * Where focus goes as the prompt closes: back to where it was when the prompt opened, else the Request title, else
 * the Request's row. The dialog hands focus back a moment after the prompt has left the page; a person who has
 * already moved focus on by then (Alt+T into the Marked Done toast, a click) keeps it there, so that toast stays
 * open and paused instead of losing focus and running out.
 */
export function promptCloseFocus({ active, body, opener, title, restoreRow }: {
  active: unknown
  body: unknown
  opener: (Focusable & { isConnected: boolean }) | null
  title: Focusable | null
  restoreRow: (() => void) | null
}) {
  if (active && active !== body) return
  if (opener?.isConnected) { opener.focus({ preventScroll: true }); return }
  if (title) { title.focus({ preventScroll: true }); return }
  restoreRow?.()
}
