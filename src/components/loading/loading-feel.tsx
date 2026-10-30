"use client";

import { useEffect } from "react";
import { afterPageLoad } from "@/lib/after-page-load";

/**
 * #262 (polish bar §5): mounted once in the root layout. Loads the pressed state and the fade into
 * content (`loading-feel-listeners.ts`) after the page has loaded and is idle (after-page-load.ts), so they cost
 * no first-load script; both only matter from the first click or the first placeholder. Renders nothing.
 */
export function LoadingFeel() {
  useEffect(() => afterPageLoad(() => { void import("./loading-feel-listeners"); }), []);
  return null;
}
