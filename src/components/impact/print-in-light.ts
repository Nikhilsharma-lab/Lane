/**
 * Paper is light (#209). Browsers leave page backgrounds out of print by default, so a dark theme would print light text
 * on white. While the print dialog (or save as PDF) is open, the page drops the theme's `dark` class and dark colour
 * scheme, and puts them back once printing ends. Returns the cleanup for an effect.
 */
export function printInLight(target: Window): () => void {
  const root = target.document.documentElement
  let saved: { scheme: string } | null = null
  const before = () => {
    if (saved || !root.classList.contains("dark")) return
    saved = { scheme: root.style.colorScheme }
    root.classList.remove("dark")
    root.style.colorScheme = "light"
  }
  const after = () => {
    if (!saved) return
    root.classList.add("dark")
    root.style.colorScheme = saved.scheme
    saved = null
  }
  target.addEventListener("beforeprint", before)
  target.addEventListener("afterprint", after)
  return () => {
    target.removeEventListener("beforeprint", before)
    target.removeEventListener("afterprint", after)
    after()
  }
}
