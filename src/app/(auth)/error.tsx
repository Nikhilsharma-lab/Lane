"use client";

import { useEffect } from "react";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { AuthShell } from "@/components/auth/auth-shell";
import { reportClientError } from "@/lib/report-client-error";
import { SupportContact } from "../support-contact";

// Same pattern as src/app/error.tsx for the auth group (plan item 1.12). The auth shell keeps the Lane mark and the
// link back to sign in. #271 (A120): it reports what went wrong. D36 (#290): a Clerk, code or database failure can
// land here, so it names no cause, and its one Try again reloads the page's data and resets the boundary (`retry`).
export default function AuthError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("Lane could not render the sign-in flow", { digest: error.digest, message: error.message });
    void reportClientError(error, { boundary: "sign-in", digest: error.digest });
  }, [error]);

  return (
    <AuthShell>
      <div role="alert">
        <h1 className="sr-only">Page unavailable</h1>
        <EmptyState
          title="Lane can’t load this page right now"
          description="Your data is safe. Try again in a minute."
          icon={<CircleAlert aria-hidden="true" />}
          action={<Button variant="secondary" onClick={retry}>Try again</Button>}
        />
        <SupportContact />
      </div>
    </AuthShell>
  );
}
