"use client";

import type { ReactNode } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { TabColour } from "@/components/tab-colour";

// Lane's one light/dark setup, saved per browser. The root layout and the last-resort error page
// (global-error) both render this provider, so both get the same inline theme script: it marks <html>
// with the saved choice (or the device setting for "system") before the first paint. TabColour then
// points the browser tab colour at the same resolved theme.
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute={["class", "data-theme"]}
      defaultTheme="system"
      enableSystem
      enableColorScheme
      disableTransitionOnChange
    >
      <TabColour />
      {children}
    </NextThemesProvider>
  );
}
