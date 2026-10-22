"use client";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import tabColours from "@/app/theme-color.json";

// The root layout's theme-color meta tags follow the device setting, because they are rendered before
// Lane knows the saved Profile choice. Once next-themes resolves that choice, every tag takes its
// colour, so the browser tab matches Lane's theme whichever tag's media query matches (#96).
export function TabColour() {
  const { resolvedTheme } = useTheme();
  useEffect(() => {
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
      meta.content = tabColours[resolvedTheme];
    }
  }, [resolvedTheme]);
  return null;
}
