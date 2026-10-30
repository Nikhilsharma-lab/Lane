/**
 * Build 2 speed fix: the one home for "load this later". Runs `run` once the page's `load` event has fired and the
 * browser is then first idle, never earlier. A lazy part fetched before `load` holds that event back; on a slow
 * phone that lasts until Next.js starts reading Request pages ahead, whose code files hold it back further (a first
 * visit to Impact was 2s slower). Browser-only, tiny: it is on every page.
 *
 * Returns a cancel function, for effects that unmount before it runs.
 */
export function afterPageLoad(run: () => void): () => void {
  let live = true
  const wait = () => { (window.requestIdleCallback ?? setTimeout)(() => { if (live) run() }) }
  if (document.readyState === "complete") wait()
  else addEventListener("load", wait, { once: true })
  return () => { live = false; removeEventListener("load", wait) }
}
