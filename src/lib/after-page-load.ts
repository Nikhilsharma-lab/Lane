/**
 * Build 2 speed fix: the one home for "load this later". Runs `run` once the page's `load` event has fired and the
 * browser is then first idle, never earlier. A lazy part fetched before `load` holds that event back; on a slow
 * phone that lasts until Next.js starts reading Request pages ahead, whose code files hold it back further (a first
 * visit to Impact was 2s slower). Browser-only, tiny: it is on every page.
 *
 * Returns a cancel function, for effects that unmount before it runs.
 */
export function afterPageLoad(run: () => void): () => void {
  let cancelled = false
  let idleHandle: number | null = null
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null
  const fire = () => { if (!cancelled) run() }
  const whenIdle = () => {
    if (cancelled) return
    if (typeof window.requestIdleCallback === "function") idleHandle = window.requestIdleCallback(fire)
    else timeoutHandle = setTimeout(fire, 1)
  }
  if (document.readyState === "complete") whenIdle()
  else window.addEventListener("load", whenIdle, { once: true })
  return () => {
    cancelled = true
    window.removeEventListener("load", whenIdle)
    if (idleHandle !== null) window.cancelIdleCallback?.(idleHandle)
    if (timeoutHandle !== null) clearTimeout(timeoutHandle)
  }
}
