"use client";

import { useEffect } from "react";
import { DatabaseZap } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { AuthShell } from "@/components/auth/auth-shell";

// Same pattern as src/app/error.tsx for the auth group (plan item 1.12): onboarding and
// the sign-in tasks read the database, which can be paused on the free tier. The auth
// shell keeps the Lane mark and the link back to sign in.
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Lane could not render the sign-in flow", { digest: error.digest, message: error.message });
  }, [error]);

  return (
    <AuthShell>
      <div role="alert">
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
    </AuthShell>
  );
}
