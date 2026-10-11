"use client";

import { useEffect } from "react";
import { fontVariables } from "@/lib/fonts";
import buttonStyles from "@/components/arc/button/button.module.css";
import { PageStrip } from "@/components/shell/page-strip";
import frame from "./app-frame.module.css";
import "@/components/arc/foundation.css";
import "./globals.css";
import "@/styles/lane-primitives.css";
import "@/styles/lane-arc-theme.css";

// Last resort (plan item 1.12): this replaces the root layout when it throws, so it
// has to render <html> and <body> itself. Next only shows it in production; in
// development the overlay takes over. Nothing here depends on Clerk, the theme
// provider or the database, so it stays a plain button on the foundation tokens.
// The page strip imports only React, next/link and its CSS module (plan item 2.0).
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Lane could not render the root layout", { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <html lang="en" data-visual-system="lane" data-ui-state-contract="semantic" className={`${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <main className={frame.page}>
          <PageStrip title="Lane unavailable" heading />
          {/* The alert names the failure itself; EmptyState would add motion to this bundle. */}
          <div className={frame.body} role="alert">
            <h2 className={frame.heading}>Lane can’t load right now</h2>
            <p className={frame.message}>Your data is safe. Reload the page, and if this keeps happening let us know.</p>
            <div className={frame.actions}>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md}`}
              >
                Reload
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
