/** What a phone panel's history entry needs from the browser; the tests pass a stand-in tab. */
export type PopupEntryEnvironment = {
  history: { readonly state: unknown; pushState(state: unknown, unused: string): void; replaceState(state: unknown, unused: string): void; back(): void }
  onPopState(listener: () => void): () => void
  defer(task: () => void): void
  navigatedWithin(ms: number): boolean
  /** The tab's current address. */
  address(): string
}

/**
 * #263: while a phone panel is open the page gains one history entry, so the phone's Back closes the panel instead of
 * leaving the page; closing it any other way takes that entry back off. `hold` runs as the panel opens and returns
 * its release, for the close.
 */
type Entry = { page: unknown; pushedAt: string | null; waiting: { kept: boolean } | null }
// Per panel, by its mark (React's useId: the same for a panel remounted in the same place), so a remount finds the
// entry the panel it replaces left.
const entries = new Map<string, Entry>()

export function createPopupEntry(marker: string, { history, onPopState, defer, navigatedWithin, address }: PopupEntryEnvironment) {
  const ours = () => (history.state as { lanePopup?: string } | null)?.lanePopup === marker
  const entry = entries.get(marker) ?? { page: null, pushedAt: null, waiting: null }
  entries.set(marker, entry)
  // The entry is still on top: it carries the mark, or (Next.js rewrites the state of the entry a navigation commits
  // to, dropping the mark) the tab is still at the address the entry was pushed at.
  const onTop = () => ours() || address() === entry.pushedAt

  return function hold(onBack: () => void) {
    // A release still waiting to step back: a hold that comes first (React's Strict Mode runs effects twice; a
    // remount) keeps the entry instead. A second entry left Back doing nothing once, and the late step back closed
    // the open panel ("Is it live?" on a phone).
    if (entry.waiting) {
      entry.waiting.kept = true
      entry.waiting = null
    } else {
      entry.page = history.state
      entry.pushedAt = address()
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
      if (navigatedWithin(1000)) { if (onTop()) history.replaceState(entry.page, ""); return }
      const release = { kept: false }
      entry.waiting = release
      defer(() => {
        if (entry.waiting === release) entry.waiting = null
        if (!release.kept && onTop() && !navigatedWithin(1000)) history.back()
      })
    }
  }
}
