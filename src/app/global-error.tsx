"use client";

import { useEffect } from "react";
import { fontVariables } from "@/lib/fonts";
import "@/components/arc/foundation.css";
import "./globals.css";
import "@/styles/lane-primitives.css";
import "@/styles/lane-arc-theme.css";

// Last resort (plan item 1.12): this replaces the root layout when it throws, so it
// has to render <html> and <body> itself. Next only shows it in production; in
// development the overlay takes over. Nothing here depends on Clerk, the theme
// provider or the database, so it stays a plain button on the foundation tokens.
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
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        <main className="flex min-h-dvh flex-1 flex-col items-center justify-center px-4 py-6 text-center sm:px-6">
          <div role="alert" className="flex w-full max-w-sm flex-col items-center">
            <h1 className="text-base font-medium">Lane can’t load right now</h1>
            <p className="mt-2 text-sm text-muted-foreground">Your data is safe. Reload the page, and if this keeps happening let us know.</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex min-h-(--control-height-md) items-center justify-center rounded-(--radius-control) border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Reload
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
