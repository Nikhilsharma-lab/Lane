import { afterPageLoad } from "@/lib/after-page-load"

/**
 * #389 (#383 "Keeping sessions alive"): asks Better Auth for the session once per full page load, so it and its
 * cookie are renewed once they are more than a day old. The WorkspaceFrame starts it as it mounts; Lane's browser
 * auth client loads only once the page has loaded and is idle. Returns a cancel function, for an effect.
 */
export function requestSessionOnceUsable(): () => void {
  return afterPageLoad(() => { import("./session-keeper").then(keeper => keeper.keepSession()).catch(() => {}) })
}
