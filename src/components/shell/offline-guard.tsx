"use client"

import { useContext, useEffect, useMemo, type ReactNode } from "react"
// The context next/navigation's useRouter reads. The .shared-runtime module is the one instance Next.js itself uses.
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime"
import { Alert } from "@/components/arc/alert/alert"
import { isOffline, useOffline } from "@/lib/connection-status"
import { OFFLINE_LINE } from "@/lib/failure-messages"
import { changesListInPlace } from "@/lib/request-workspace"
import styles from "./offline-guard.module.css"

/** Whether moving to `url` keeps this page: another site, the same address, or a change the page makes
 * itself (a Requests list view on "/", a Settings section on a Settings page, as showsSettingsInPlace says). */
function staysInPlace(url: URL) {
  const here = window.location
  if (url.origin !== here.origin) return true
  if (url.pathname === here.pathname && url.search === here.search) return true
  const href = `${url.pathname}${url.search}${url.hash}`
  return changesListInPlace(here.pathname, href)
    || (here.pathname.startsWith("/settings/") && (url.pathname === "/settings/profile" || url.pathname === here.pathname))
}

/** Offline, a move to another page would fail and Next.js would fall back to a full page load onto the browser's "No internet" page. */
const holdsMove = (href: string) => isOffline() && !staysInPlace(new URL(href, window.location.href))

type NavigateEventLike = Event & { cancelable: boolean; navigationType: string; destination: { url: string; sameDocument: boolean } }

/**
 * #260 (A21, A127, B28, C6, D3): keeps the signed-in app on screen while offline. The page stays put
 * instead of moving and the quiet "You're offline" line says why; back online, everything works as
 * before. Nothing is queued: a move held offline is simply not made.
 * - Links: a plain click on a link to another page is held before Next.js sees it.
 * - The router (every useRouter() below this point): push and replace to another page are held.
 *   Refresh has its one home in useServerRefresh (use-optimistic-action.ts), which skips it offline.
 * - Anything else that would load another Lane page in this tab offline is cancelled through the
 *   browser's Navigation API where it has one. Reloading stays the person's own choice.
 */
export function OfflineGuard({ children }: { children: ReactNode }) {
  const router = useContext(AppRouterContext)
  const guarded = useMemo<AppRouterInstance | null>(() => router && {
    ...router,
    push: (href, options) => { if (!holdsMove(href)) router.push(href, options) },
    replace: (href, options) => { if (!holdsMove(href)) router.replace(href, options) },
  }, [router])

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!isOffline() || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== "_self") || link.hasAttribute("download")) return
      if (staysInPlace(new URL(link.href))) return
      event.preventDefault()
      event.stopPropagation()
    }
    const onNavigate = (event: Event) => {
      const move = event as NavigateEventLike
      if (!isOffline() || !move.cancelable || move.destination.sameDocument || move.navigationType === "reload" || move.navigationType === "traverse") return
      if (new URL(move.destination.url).origin === window.location.origin) move.preventDefault()
    }
    const navigation = (window as Window & { navigation?: EventTarget }).navigation
    document.addEventListener("click", onClick, true)
    navigation?.addEventListener("navigate", onNavigate)
    return () => {
      document.removeEventListener("click", onClick, true)
      navigation?.removeEventListener("navigate", onNavigate)
    }
  }, [])

  return <AppRouterContext.Provider value={guarded}>{children}<OfflineLine /></AppRouterContext.Provider>
}

/** The app frame's one quiet line while offline (Arc `alert`, compact). */
function OfflineLine() {
  const offline = useOffline()
  return <div className={styles.line}><Alert open={offline} tone="warning" title={OFFLINE_LINE} className={styles.alert} /></div>
}
