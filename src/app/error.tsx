"use client";

import { useEffect } from "react";
import { DatabaseZap } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { PageStrip } from "@/components/shell/page-strip";
import frame from "./app-frame.module.css";

// Catches a throw in (app)/layout.tsx, most often getWorkspace() against a paused
// database (Supabase free tier auto-pauses; plan item 1.12). The root layout stays
// mounted, so ClerkProvider, the theme attributes and the fonts are still in place.
// The (app) shell is not, so the page strip shows its title with no trail (plan item 2.0).
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Lane could not render the workspace", { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <main className={frame.page}>
      <PageStrip title="Database unavailable" heading />
      <div className={frame.body} role="alert">
        <EmptyState
          title="Lane can’t reach its database right now"
          description="Your data is safe. Try again in a minute, and if this keeps happening let us know."
          icon={<DatabaseZap aria-hidden="true" />}
          action={
            <>
              <Button variant="secondary" onClick={reset}>Try again</Button>
              <Button variant="ghost" onClick={() => window.location.reload()}>Reload</Button>
            </>
          }
        />
      </div>
    </main>
  );
}
