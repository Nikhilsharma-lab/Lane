import { isOffline } from "@/lib/connection-status"
import { changesListInPlace } from "@/lib/request-workspace"
import { showsSettingsInPlace } from "@/components/settings/settings-in-place"

/** Whether moving to `href` keeps this page: another site, the same address, or a change the page makes
 * itself (a Requests list view on "/", a Settings section on a Settings page, as showsSettingsInPlace says). */
function staysInPlace(href: string) {
  const here = location, url = new URL(href, here.href)
  return url.origin != here.origin || (url.pathname == here.pathname && url.search == here.search)
    || changesListInPlace(here.pathname, url.pathname + url.search + url.hash)
    || showsSettingsInPlace(url.pathname, here.pathname)
}

/**
 * #260, #269 (A127): offline, a move to another page would fail and Next.js would fall back to a full page load onto
 * the browser's "No internet" page, so Lane holds it and the page stays with the offline line. The one answer for
 * every way the frame moves: links and the router (src/components/shell/offline-guard.tsx), and the shared Request
 * navigation that ⌘K and Search open through (src/components/requests/request-navigation.ts). Browser-only.
 */
export const holdsOffline = (href: string) => isOffline() && !staysInPlace(href)

/** #329: offline, whether loading `href` as a whole new document would leave Lane for the browser's "No internet"
 * page: any Lane address, this one included (src/components/shell/offline-guard.tsx cancels such loads). */
export const loadsWholeLanePageOffline = (href: string) => isOffline() && new URL(href, location.href).origin === location.origin
