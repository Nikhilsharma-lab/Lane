"use client"

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react"
import { inViewOrder, sameViewName, type SavedView } from "@/lib/saved-view-nav"

/**
 * #276: a person's saved views as the sidebar's "Your views" and the Requests list both show them: the server's views
 * with this tab's changes on top. A save, rename, update or delete shows in both in the same moment and goes back if
 * the server refuses it. A change the server accepted stays on top until the server's views next arrive, which is
 * the page the change revalidated (or a later one), so nothing flickers back meanwhile. The server actions are unchanged.
 */
export type SavedViewsChange = (views: SavedView[]) => SavedView[]
type Pending = { token: number; change: SavedViewsChange; accepted: boolean }

export type SavedViewsStore = {
  views: SavedView[]
  /** Shows the change at once; the token settles it. */
  begin: (change: SavedViewsChange) => number
  /** The server accepted it; `change` replaces it until the server's views arrive (a save, with the saved view's id). */
  accept: (token: number, change?: SavedViewsChange) => void
  /** The server refused it: it goes. */
  rollback: (token: number) => void
}

let unsaved = 0
/** A stand-in id for a view saved in this tab, until the server answers with its own. */
export const unsavedViewId = () => `pending-view-${++unsaved}`

/** Adds a view in place of any with its id or (names are unique per person) its name: a save the server's views already
 * show keeps the id the list holds until the save is answered. */
export const withView = (view: SavedView): SavedViewsChange => views =>
  [...views.filter(item => item.id !== view.id && !sameViewName(item.name, view.name)), view]

/** A view's new name. */
export const renamedView = (id: string, name: string): SavedViewsChange => views => views.map(item => item.id === id ? { ...item, name } : item)

/** The server's views with this tab's changes on top, in the server's order (by name), so a new or renamed view never jumps when the server's arrive. */
export const shownViews = (server: SavedView[], changes: SavedViewsChange[]) =>
  changes.length ? inViewOrder(changes.reduce((shown, change) => change(shown), server)) : server

const SavedViewsContext = createContext<SavedViewsStore | null>(null)
SavedViewsContext.displayName = "SavedViews"

/** In the workspace frame, above the sidebar and every page, fed the (app) layout's views. */
export function SavedViewsProvider({ views: server, children }: { views: SavedView[]; children: ReactNode }) {
  const [pending, setPending] = useState<Pending[]>([])
  // The server's views arrived again: every change it accepted before is in them now.
  const [seen, setSeen] = useState(server)
  if (seen !== server) {
    setSeen(server)
    if (pending.some(item => item.accepted)) setPending(pending.filter(item => !item.accepted))
  }
  const tokens = useRef(0)
  const begin = useCallback((change: SavedViewsChange) => {
    const token = ++tokens.current
    setPending(current => [...current, { token, change, accepted: false }])
    return token
  }, [])
  const accept = useCallback((token: number, change?: SavedViewsChange) =>
    setPending(current => current.map(item => item.token === token ? { token, change: change ?? item.change, accepted: true } : item)), [])
  const rollback = useCallback((token: number) => setPending(current => current.filter(item => item.token !== token)), [])

  const views = useMemo(() => shownViews(server, pending.map(item => item.change)), [server, pending])
  const store = useMemo(() => ({ views, begin, accept, rollback }), [views, begin, accept, rollback])
  return <SavedViewsContext.Provider value={store}>{children}</SavedViewsContext.Provider>
}

/** The saved views as shown now; `fallback` (the page's own) where no frame provides them, as in static renders. */
export function useShownSavedViews(fallback: SavedView[]): SavedView[] {
  return useContext(SavedViewsContext)?.views ?? fallback
}

export function useSavedViewsStore() {
  return useContext(SavedViewsContext)
}
