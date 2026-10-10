"use client";

import { useEffect } from "react";
import { DatabaseZap } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";

// Catches a throw in (app)/layout.tsx, most often getWorkspace() against a paused
// database (Supabase free tier auto-pauses; plan item 1.12). The root layout stays
// mounted, so ClerkProvider, the theme attributes and the fonts are still in place.
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
    <main className="flex min-h-dvh flex-1 flex-col bg-background px-4 py-6 font-sans text-foreground sm:px-6">
      <div className="my-auto" role="alert">
        <h1 className="sr-only">Database unavailable</h1>
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
