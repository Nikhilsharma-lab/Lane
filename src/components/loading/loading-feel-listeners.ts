import { prefersReducedMotion } from "@/components/motion/reduced-motion";

/**
 * #262 (polish bar §5): how waiting feels, for the whole app, in one small listener set loaded by the
 * root layout through `<LoadingFeel />` once the page is up. Durations and eases come from theme.css.
 *
 * - Pressed: a plain click on a link to another page in Lane marks the link with `data-pressed`, and the
 *   nearest `[data-pressable]` around it (a row) too, until the address changes. globals.css paints
 *   `[data-pressable][data-pressed]` with the pressed wash. A placeholder waits 0.15s before it appears,
 *   so for that first moment the pressed row is the answer that Lane heard the click. A row or link
 *   opts in with `data-pressable`. Offline, nothing is marked: the move won't happen.
 * - Fade into the content: once a placeholder (`placeholder.tsx`) has been seen, whatever replaces it
 *   fades in over `--duration-standard`. A placeholder that never showed (a quick load) leaves its
 *   content alone. Nothing fades with motion turned off.
 */
if (typeof window !== "undefined" && typeof MutationObserver === "function") {
  const shown = new Set<Element>();
  let pressedAt = "";
  const clearPressed = () => {
    pressedAt = "";
    for (const element of document.querySelectorAll("[data-pressed]")) element.removeAttribute("data-pressed");
  };
  // Capture: rows and links may stop the click from bubbling.
  document.addEventListener("click", event => {
    const link = (event.target as Element).closest?.("a[href]:not([download]):not([target=_blank])");
    if (!(link instanceof HTMLAnchorElement) || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !navigator.onLine) return;
    if (link.origin !== location.origin || (link.pathname === location.pathname && link.search === location.search)) return;
    clearPressed();
    pressedAt = location.href;
    link.setAttribute("data-pressed", "");
    link.parentElement?.closest("[data-pressable]")?.setAttribute("data-pressed", "");
  }, true);
  addEventListener("popstate", clearPressed);
  document.addEventListener("animationstart", event => {
    const frame = event.target instanceof Element ? event.target.parentElement : null;
    if (frame?.hasAttribute("data-placeholder") && /placeholder-in/.test(event.animationName)) shown.add(frame);
  }, true);
  new MutationObserver(records => {
    if (pressedAt && location.href !== pressedAt) clearPressed();
    // React removes a placeholder and adds its content in one commit: once a seen one goes, what came with it fades in.
    let ended = false;
    for (const frame of shown) if (!frame.isConnected) { shown.delete(frame); ended = true; }
    if (!ended || prefersReducedMotion()) return;
    const style = getComputedStyle(document.documentElement);
    const timing = { duration: Number.parseFloat(style.getPropertyValue("--duration-standard")) || 0, easing: style.getPropertyValue("--ease-standard").trim() };
    for (const record of records) for (const node of record.addedNodes) if (node instanceof HTMLElement) node.animate([{ opacity: 0 }, { opacity: 1 }], timing);
  }).observe(document.documentElement, { childList: true, subtree: true });
}
