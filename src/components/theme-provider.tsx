"use client";

import type { ReactNode } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// Lane's one light/dark setup, saved per browser. The root layout and the last-resort error page
// (global-error) both render this provider, so both get the same inline theme script: it marks <html>
// with the saved choice (or the device setting for "system") before the first paint.
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute={["class", "data-theme"]}
      defaultTheme="system"
      enableSystem
      enableColorScheme
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
