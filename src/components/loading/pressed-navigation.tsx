"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * #262 (polish bar §5): what was clicked shows as pressed until the next page arrives. A placeholder
 * waits 0.15s before it appears, so for that first moment the pressed row or link is the answer that
 * Lane heard the click.
 *
 * Mounted once in the signed-in shell. A plain click on a link to another page inside Lane marks the
 * link with `data-pressed`, and the nearest `[data-pressable]` around it (a row) too; globals.css paints
 * `[data-pressable][data-pressed]` with the pressed wash. The marks clear when the address changes.
 * A row or link opts in with `data-pressable`.
 */
export function PressedNavigation() {
  const pathname = usePathname();
  const search = useSearchParams()?.toString();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      clearPressed();
      anchor.setAttribute("data-pressed", "");
      anchor.parentElement?.closest("[data-pressable]")?.setAttribute("data-pressed", "");
    };
    // Capture: rows and links may stop the click from bubbling.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // The next page is here (or the move was cancelled with Back): nothing stays pressed.
  useEffect(() => { clearPressed(); }, [pathname, search]);
  useEffect(() => {
    window.addEventListener("popstate", clearPressed);
    return () => window.removeEventListener("popstate", clearPressed);
  }, []);
  return null;
}

function clearPressed() {
  for (const element of document.querySelectorAll("[data-pressed]")) element.removeAttribute("data-pressed");
}
