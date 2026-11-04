/** What a phone panel's history entry needs from the browser; the tests pass a stand-in tab. */
export type PopupEntryEnvironment = {
  history: { readonly state: unknown; pushState(state: unknown, unused: string): void; replaceState(state: unknown, unused: string): void; back(): void }
  onPopState(listener: () => void): () => void
  defer(task: () => void): void
  navigatedWithin(ms: number): boolean
}

/**
 * #263: while a phone panel is open the page gains one history entry, so the phone's Back closes the panel instead of
 * leaving the page; closing it any other way takes that entry back off. `hold` runs as the panel opens and returns
 * its release, for the close.
 */
export function createPopupEntry(marker: string, { history, onPopState, defer, navigatedWithin }: PopupEntryEnvironment) {
  const ours = () => (history.state as { lanePopup?: string } | null)?.lanePopup === marker
  let runs = 0
  let page: unknown = null
  return function hold(onBack: () => void) {
    const run = ++runs
    // A hold straight after the last one's release (React's Strict Mode runs effects twice; a remount) finds that
    // release's entry still on top, waiting to be taken off: it keeps it rather than pushing a second one.
    if (!ours()) {
      page = history.state
      history.pushState({ lanePopup: marker }, "")
    }
    const stop = onPopState(() => {
      if (ours()) return
      // Back was pressed: hold the place again until the popup really closes (it may ask first), then close it.
      history.pushState({ lanePopup: marker }, "")
      onBack()
    })
    return () => {
      stop()
      // A close that also moves to another page (Delete Request, a link) must not step back: that would undo the
      // move before Next.js records it. The entry becomes the page's own again, so Back from the new page returns
      // here as it would without the panel. Otherwise an entry still on top goes.
      if (navigatedWithin(1000)) { if (ours()) history.replaceState(page, ""); return }
      // Held again since (see above), the entry stays.
      defer(() => { if (runs === run && ours() && !navigatedWithin(1000)) history.back() })
    }
  }
}
