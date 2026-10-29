"use client"

import { useContext, useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react"
// The context next/navigation's useRouter reads. The .shared-runtime module is the one instance Next.js itself uses.
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime"
import { isOffline } from "@/lib/connection-status"
import { changesListInPlace } from "@/lib/request-workspace"

/** Whether moving to `href` keeps this page: another site, the same address, or a change the page makes
 * itself (a Requests list view on "/", a Settings section on a Settings page, as showsSettingsInPlace says). */
function staysInPlace(href: string) {
  const here = location, url = new URL(href, here.href)
  return url.origin != here.origin || (url.pathname == here.pathname && url.search == here.search)
    || changesListInPlace(here.pathname, url.pathname + url.search + url.hash)
    || (here.pathname.startsWith("/settings/") && (url.pathname == "/settings/profile" || url.pathname == here.pathname))
}

/** Offline, a move to another page would fail and Next.js would fall back to a full page load onto the browser's "No internet" page. */
const holds = (href: string) => isOffline() && !staysInPlace(href)

type Move = Event & { navigationType: string; destination: { url: string; sameDocument: boolean } }

/**
 * #260 (A21, A127, B28, C6, D3): keeps the signed-in app on screen while offline. The page stays put instead of
 * moving and the quiet "You're offline" line says why; back online, everything works as before. Nothing is
 * queued: a move held offline is simply not made.
 * - Links: a plain click on a link to another page is held before Next.js sees it.
 * - The router (every useRouter() below this point): push and replace to another page are held. Refresh has
 *   its one home in useServerRefresh (use-optimistic-action.ts), which skips it offline.
 * - Anything else that would load another Lane page in this tab offline is cancelled through the browser's
 *   Navigation API where it has one. Reloading stays the person's own choice.
 * It is on every page, so it stays small: the line (Arc alert and its words) is its own chunk, fetched once the
 * page is idle while the connection is still there, and shown only when the browser goes offline.
 */
export function OfflineGuard({ children }: { children: ReactNode }) {
  const router = useContext(AppRouterContext)
  const guarded = useMemo<AppRouterInstance | null>(() => router && {
    ...router,
    push: (href, options) => { if (!holds(href)) router.push(href, options) },
    replace: (href, options) => { if (!holds(href)) router.replace(href, options) },
  }, [router])
  const [Line, setLine] = useState<ComponentType | null>(null)

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element).closest?.("a[href]") as HTMLAnchorElement | null
      if (link && !(event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented || link.hasAttribute("download") || link.target && link.target != "_self") && holds(link.href)) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    const onNavigate = (event: Event) => {
      const move = event as Move
      if (move.cancelable && !move.destination.sameDocument && /push|replace/.test(move.navigationType) && holds(move.destination.url)) move.preventDefault()
    }
    const navigation = (window as { navigation?: EventTarget }).navigation
    // A line that couldn't load (offline from the start) loads once the connection is back.
    const load = () => { import("./offline-line").then(line => setLine(() => line.default), () => {}) }
    const idle = setTimeout(load, 1000)
    addEventListener("online", load)
    addEventListener("click", onClick, true)
    navigation?.addEventListener("navigate", onNavigate)
    return () => {
      clearTimeout(idle)
      removeEventListener("online", load)
      removeEventListener("click", onClick, true)
      navigation?.removeEventListener("navigate", onNavigate)
    }
  }, [])

  return <AppRouterContext.Provider value={guarded}>{children}{Line && <Line />}</AppRouterContext.Provider>
}
