"use client";

import { useEffect } from "react";
import { fontVariables } from "@/lib/fonts";
import buttonStyles from "@/components/arc/button/button.module.css";
import { PageStrip } from "@/components/shell/page-strip";
import { ThemeProvider } from "@/components/theme-provider";
import { reportClientError } from "@/lib/report-client-error";
import frame from "./app-frame.module.css";
import { SupportContact } from "./support-contact";
import "./globals.css";

// Last resort (plan item 1.12): this replaces the root layout when it throws, so it
// has to render <html> and <body> itself. Next only shows it in production; in
// development the overlay takes over. Nothing here depends on Clerk or the
// database, so it stays a plain button on the theme tokens. It does share the root
// layout's theme provider, so it paints in the saved light/dark setting (#94).
// The page strip imports only React and its CSS module (plan item 2.0); the shell
// hands it next/link with the trail through context. This file, the root error and
// not-found render the strip with no provider, and the root boundaries load with
// every route, so the strip must not import next/link: doing so measured +5.4 KB
// gzip on every route's first load, over the 2 KB client JS budget.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Lane could not render the root layout", { digest: error.digest, message: error.message });
    void reportClientError(error, { boundary: "root-layout", digest: error.digest });
  }, [error]);

  return (
    <html
      lang="en"
      data-visual-system="lane"
      data-ui-state-contract="semantic"
      suppressHydrationWarning
      className={`${fontVariables} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <main className={frame.page}>
            <PageStrip title="Lane unavailable" heading />
            {/* The alert names the failure itself; EmptyState would add motion to this bundle. */}
            <div className={frame.body} role="alert">
              <h2 className={frame.heading}>Lane can’t load right now</h2>
              <p className={frame.message}>Your data is safe. Reload the page.</p>
              <div className={frame.actions}>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md}`}
                >
                  Reload
                </button>
              </div>
              <SupportContact />
            </div>
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
